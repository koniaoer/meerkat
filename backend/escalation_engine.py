"""
Escalation engine — auto-escalate unacknowledged alerts.

Flow:
1. When a firing alert arrives and matches an escalation policy, create an EscalationEvent
2. A background task periodically checks active events
3. If wait_minutes elapsed without acknowledgement → escalate to next level
4. Each escalation level notifies specific channels/users
5. Alert acknowledgement or resolution stops the escalation
"""

import json
from datetime import datetime, timedelta
from logger import logger


def match_escalation_policy(labels: dict, severity: str, policies: list) -> object | None:
    """Find the first active escalation policy matching the alert."""
    for policy in policies:
        if not policy.is_active:
            continue
        # Check severity match
        if policy.match_severity:
            allowed = [s.strip() for s in policy.match_severity.split(",")]
            if severity not in allowed:
                continue
        # Check label match
        try:
            match_labels = json.loads(policy.match_labels) if policy.match_labels else {}
        except (json.JSONDecodeError, TypeError):
            match_labels = {}
        if match_labels:
            matched = all(labels.get(k) == v for k, v in match_labels.items())
            if not matched:
                continue
        return policy
    return None


def get_escalation_rules(policy) -> list:
    """Parse policy.rules JSON into list of dicts."""
    try:
        rules = json.loads(policy.rules) if policy.rules else []
        return sorted(rules, key=lambda r: r.get("level", 0))
    except (json.JSONDecodeError, TypeError):
        return []


def should_escalate(event, policy, now: datetime = None) -> dict | None:
    """
    Check if an escalation event should advance to the next level.
    Returns the next level rule dict, or None if no escalation needed.
    """
    now = now or datetime.utcnow()
    rules = get_escalation_rules(policy)
    if not rules:
        return None

    next_level = event.current_level + 1
    # Find rule for next level
    next_rule = None
    for r in rules:
        if r.get("level") == next_level:
            next_rule = r
            break

    if not next_rule:
        # No more levels — check if repeat is configured
        if policy.repeat_interval_minutes > 0:
            last = event.last_escalated_at or event.created_at
            if now >= last + timedelta(minutes=policy.repeat_interval_minutes):
                # Repeat the last level
                last_rule = rules[-1] if rules else None
                return last_rule
        return None

    # Check if wait_minutes has elapsed since last escalation or event creation
    wait = next_rule.get("wait_minutes", 5)
    reference_time = event.last_escalated_at or event.created_at
    if now >= reference_time + timedelta(minutes=wait):
        return next_rule

    return None


async def run_escalation_check(db, notification_manager, channel_map_func):
    """
    Background task: check all active escalation events and escalate if needed.
    Called periodically (every 30 seconds).
    """
    import crud, models

    events = crud.get_active_escalation_events(db)
    if not events:
        return

    policies = crud.get_active_escalation_policies(db)
    policy_map = {p.id: p for p in policies}

    now = datetime.utcnow()
    for event in events:
        # Check if alert is still firing and not acknowledged
        alert = db.query(models.Alert).filter(models.Alert.id == event.alert_id).first()
        if not alert:
            crud.update_escalation_event(db, event.id, status="expired")
            continue
        if alert.acknowledged or alert.status == "resolved":
            crud.update_escalation_event(db, event.id, status="acknowledged" if alert.acknowledged else "resolved")
            continue

        # Find matching policy
        policy = policy_map.get(event.policy_id) if event.policy_id else None
        if not policy:
            continue

        next_rule = should_escalate(event, policy, now)
        if not next_rule:
            continue

        # Escalate!
        logger.info("Escalating alert %d to level %d", event.alert_id, next_rule["level"])
        crud.update_escalation_event(
            db, event.id,
            current_level=next_rule["level"],
            last_escalated_at=now,
        )

        # Build escalation message
        escalation_msg = {
            "summary": f"⚠️ 升级通知 (Level {next_rule['level']}): {alert.alert_name}",
            "description": f"告警 {alert.alert_name} 已超过 {next_rule.get('wait_minutes', 5)} 分钟未被确认，已升级至 Level {next_rule['level']}。",
            "labels": json.loads(alert.raw_data).get("labels", {}) if alert.raw_data else {},
        }

        # Notify via specified channels
        channel_ids = next_rule.get("channel_ids", [])
        channel_list = channel_map_func(channel_ids)
        if channel_list:
            try:
                await notification_manager.dispatch(escalation_msg, {
                    "summary": escalation_msg["summary"],
                    "root_cause": "",
                    "suggestion": "请立即处理该告警",
                    "severity": alert.severity,
                }, channel_list)
            except Exception as e:
                logger.error("Escalation notification failed: %s", e)

        # Also notify specific users if specified
        user_ids = next_rule.get("user_ids", [])
        for uid in user_ids:
            user = db.query(models.User).filter(models.User.id == uid).first()
            if user:
                logger.info("Escalation alert for user: %s (%s)", user.username, user.display_name)

        crud.create_audit_log(db, action="alert.escalated", resource_type="alert",
                              resource_id=alert.id,
                              detail=json.dumps({"level": next_rule["level"], "policy_id": policy.id}, ensure_ascii=False))
