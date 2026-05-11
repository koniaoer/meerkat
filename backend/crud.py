from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json
import models, schemas
from logger import logger

# ─── Model Config ──────────────────────────────────────────────────────────

def get_model_config(db: Session, config_id: int):
    return db.query(models.ModelConfig).filter(models.ModelConfig.id == config_id).first()

def get_model_configs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.ModelConfig).offset(skip).limit(limit).all()

def create_model_config(db: Session, config: schemas.ModelConfigCreate):
    if config.is_active:
        db.query(models.ModelConfig).update({models.ModelConfig.is_active: False})
    db_config = models.ModelConfig(**config.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    logger.info("Created model config: id=%d, model=%s", db_config.id, db_config.model_name)
    return db_config

def update_model_config(db: Session, config_id: int, config: schemas.ModelConfigCreate):
    db_config = get_model_config(db, config_id)
    if not db_config:
        return None
    if config.is_active:
        db.query(models.ModelConfig).filter(models.ModelConfig.id != config_id).update({models.ModelConfig.is_active: False})
    for key, value in config.model_dump().items():
        setattr(db_config, key, value)
    db.commit()
    db.refresh(db_config)
    return db_config

def delete_model_config(db: Session, config_id: int):
    db_config = get_model_config(db, config_id)
    if db_config:
        db.delete(db_config)
        db.commit()
    return db_config

def get_active_model_config(db: Session):
    return db.query(models.ModelConfig).filter(models.ModelConfig.is_active == True).first()

# ─── Alert ─────────────────────────────────────────────────────────────────

def create_alert(db: Session, alert: schemas.AlertCreate, analysis_result: str = None, analysis: dict = None):
    db_alert = models.Alert(
        **alert.model_dump(),
        analysis_result=analysis_result,
        analysis_summary=analysis.get("summary") if analysis else None,
        analysis_root_cause=analysis.get("root_cause") if analysis else None,
        analysis_suggestion=analysis.get("suggestion") if analysis else None,
        analysis_severity=analysis.get("severity") if analysis else None,
        analysis_error=analysis.get("error") if analysis else None,
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    logger.info("Created alert record: id=%d, name=%s", db_alert.id, alert.alert_name)
    return db_alert

def get_alerts(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Alert).order_by(models.Alert.created_at.desc()).offset(skip).limit(limit).all()

def get_alert_by_fingerprint(db: Session, fingerprint: str):
    return db.query(models.Alert).filter(
        models.Alert.fingerprint == fingerprint,
        models.Alert.status == "firing"
    ).first()

def resolve_alert(db: Session, alert_id: int):
    db_alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if db_alert:
        db_alert.status = "resolved"
        db_alert.resolved_at = datetime.utcnow()
        db.commit()
        db.refresh(db_alert)
    return db_alert

def acknowledge_alert(db: Session, alert_id: int, acknowledged_by: str):
    db_alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if db_alert:
        db_alert.acknowledged = True
        db_alert.acknowledged_by = acknowledged_by
        db_alert.acknowledged_at = datetime.utcnow()
        db.commit()
        db.refresh(db_alert)
    return db_alert

def silence_alert(db: Session, alert_id: int, duration_minutes: int):
    db_alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if db_alert:
        db_alert.silenced_until = datetime.utcnow() + timedelta(minutes=duration_minutes)
        db.commit()
        db.refresh(db_alert)
    return db_alert

def get_alert_stats(db: Session):
    from datetime import timedelta
    alerts = db.query(models.Alert).all()
    now = datetime.utcnow()
    recent_24h = len([a for a in alerts if a.created_at and a.created_at > now - timedelta(hours=24)])
    # Calculate average resolution time
    resolved_alerts = [a for a in alerts if a.status == "resolved" and a.created_at and a.updated_at]
    avg_resolution = None
    if resolved_alerts:
        total_min = sum((a.updated_at - a.created_at).total_seconds() / 60 for a in resolved_alerts)
        avg_resolution = round(total_min / len(resolved_alerts), 1)
    # Top alert names
    name_counts: dict = {}
    for a in alerts:
        name = a.alert_name or "unknown"
        name_counts[name] = name_counts.get(name, 0) + 1
    by_name = dict(sorted(name_counts.items(), key=lambda x: x[1], reverse=True)[:10])
    return {
        "total": len(alerts),
        "firing": len([a for a in alerts if a.status == "firing"]),
        "resolved": len([a for a in alerts if a.status == "resolved"]),
        "acknowledged": len([a for a in alerts if a.acknowledged]),
        "by_severity": {s: len([a for a in alerts if a.severity == s]) for s in set(a.severity for a in alerts)},
        "by_status": {"firing": len([a for a in alerts if a.status == "firing"]), "resolved": len([a for a in alerts if a.status == "resolved"])},
        "by_alert_name": by_name,
        "recent_24h": recent_24h,
        "avg_resolution_minutes": avg_resolution,
    }

def get_dashboard_stats(db: Session):
    """Full dashboard stats including all subsystems."""
    alert_stats = get_alert_stats(db)
    channel_count = db.query(models.NotificationChannel).filter(models.NotificationChannel.is_active == True).count()
    template_count = db.query(models.RemediationTemplate).filter(models.RemediationTemplate.is_active == True).count()
    active_escalations = db.query(models.EscalationEvent).filter(models.EscalationEvent.status == "active").count()
    # Current on-call
    oncall_user = None
    now = datetime.utcnow()
    shifts = db.query(models.OnCallShift).filter(models.OnCallShift.start_time <= now, models.OnCallShift.end_time >= now).all()
    if shifts:
        user = db.query(models.User).filter(models.User.id == shifts[0].user_id).first()
        if user:
            oncall_user = user.display_name or user.username
    # Remediation stats
    total_actions = db.query(models.RemediationAction).count()
    completed_actions = db.query(models.RemediationAction).filter(models.RemediationAction.status == "completed").count()
    failed_actions = db.query(models.RemediationAction).filter(models.RemediationAction.status == "failed").count()
    pending_actions = db.query(models.RemediationAction).filter(models.RemediationAction.status == "pending").count()
    # Alert trend (last 7 days)
    from collections import defaultdict
    trend = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime("%m-%d")
        day_start = now - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        count = len([a for a in db.query(models.Alert).all() if a.created_at and day_start <= a.created_at < day_end])
        resolved_count = len([a for a in db.query(models.Alert).filter(models.Alert.status == "resolved").all() if a.updated_at and day_start <= a.updated_at < day_end])
        trend.append({"date": day, "total": count, "resolved": resolved_count})
    return {
        "alert_stats": alert_stats,
        "channel_count": channel_count,
        "template_count": template_count,
        "active_escalations": active_escalations,
        "oncall_user": oncall_user,
        "remediation_stats": {"total": total_actions, "completed": completed_actions, "failed": failed_actions, "pending": pending_actions},
        "alert_trend": trend,
    }

def get_alerts_with_filters(db: Session, status: str = None, severity: str = None, acknowledged: bool = None, skip: int = 0, limit: int = 100):
    query = db.query(models.Alert)
    if status:
        query = query.filter(models.Alert.status == status)
    if severity:
        query = query.filter(models.Alert.severity == severity)
    if acknowledged is not None:
        query = query.filter(models.Alert.acknowledged == acknowledged)
    return query.order_by(models.Alert.created_at.desc()).offset(skip).limit(limit).all()

# ─── User ──────────────────────────────────────────────────────────────────

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def create_user(db: Session, username: str, hashed_password: str):
    db_user = models.User(username=username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def get_user_by_id(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def update_user(db: Session, user_id: int, updates: dict):
    db_user = get_user_by_id(db, user_id)
    if not db_user:
        return None
    for key, value in updates.items():
        if value is not None:
            setattr(db_user, key, value)
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int):
    db_user = get_user_by_id(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user

def count_users(db: Session):
    return db.query(models.User).count()

# ─── Notification Channel ──────────────────────────────────────────────────

def get_notification_channels(db: Session):
    return db.query(models.NotificationChannel).all()

def get_active_notification_channels(db: Session):
    return db.query(models.NotificationChannel).filter(models.NotificationChannel.is_active == True).all()

def get_notification_channel(db: Session, channel_id: int):
    return db.query(models.NotificationChannel).filter(models.NotificationChannel.id == channel_id).first()

def create_notification_channel(db: Session, channel: schemas.NotificationChannelCreate):
    db_channel = models.NotificationChannel(**channel.model_dump())
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)
    return db_channel

def update_notification_channel(db: Session, channel_id: int, channel: schemas.NotificationChannelCreate):
    db_channel = get_notification_channel(db, channel_id)
    if db_channel:
        for key, value in channel.model_dump().items():
            setattr(db_channel, key, value)
        db.commit()
        db.refresh(db_channel)
    return db_channel

def delete_notification_channel(db: Session, channel_id: int):
    db_channel = get_notification_channel(db, channel_id)
    if db_channel:
        db.delete(db_channel)
        db.commit()

# ─── Remediation Action ────────────────────────────────────────────────────

def create_remediation_action(db: Session, action: schemas.RemediationActionCreate, auto_approved: bool = False):
    db_action = models.RemediationAction(
        **action.model_dump(),
        status="approved" if auto_approved else "pending",
        auto_approved=auto_approved,
    )
    db.add(db_action)
    db.commit()
    db.refresh(db_action)
    logger.info("Created remediation action: id=%d, type=%s, name=%s", db_action.id, action.action_type, action.name)
    return db_action

def get_remediation_actions(db: Session, alert_id: int = None, status: str = None, skip: int = 0, limit: int = 100):
    query = db.query(models.RemediationAction)
    if alert_id:
        query = query.filter(models.RemediationAction.alert_id == alert_id)
    if status:
        query = query.filter(models.RemediationAction.status == status)
    return query.order_by(models.RemediationAction.created_at.desc()).offset(skip).limit(limit).all()

def get_remediation_action(db: Session, action_id: int):
    return db.query(models.RemediationAction).filter(models.RemediationAction.id == action_id).first()

def update_action_status(db: Session, action_id: int, status: str, result: str = None, approved_by: str = None):
    db_action = get_remediation_action(db, action_id)
    if not db_action:
        return None
    db_action.status = status
    if result is not None:
        db_action.result = result
    if approved_by is not None:
        db_action.approved_by = approved_by
    if status == "executing":
        db_action.executed_at = datetime.utcnow()
    db.commit()
    db.refresh(db_action)
    return db_action

# ─── Routing Rule ──────────────────────────────────────────────────────────

def get_routing_rules(db: Session):
    return db.query(models.AlertRoutingRule).order_by(models.AlertRoutingRule.priority.asc(), models.AlertRoutingRule.created_at.desc()).all()

def get_routing_rule(db: Session, rule_id: int):
    return db.query(models.AlertRoutingRule).filter(models.AlertRoutingRule.id == rule_id).first()

def create_routing_rule(db: Session, rule: schemas.RoutingRuleCreate):
    db_rule = models.AlertRoutingRule(**rule.model_dump())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    logger.info("Created routing rule: id=%d, name=%s", db_rule.id, rule.name)
    return db_rule

def update_routing_rule(db: Session, rule_id: int, rule: schemas.RoutingRuleCreate):
    db_rule = get_routing_rule(db, rule_id)
    if not db_rule:
        return None
    for key, value in rule.model_dump().items():
        setattr(db_rule, key, value)
    db.commit()
    db.refresh(db_rule)
    return db_rule

def delete_routing_rule(db: Session, rule_id: int):
    db_rule = get_routing_rule(db, rule_id)
    if db_rule:
        db.delete(db_rule)
        db.commit()
    return db_rule

def get_active_routing_rules(db: Session):
    return db.query(models.AlertRoutingRule).filter(
        models.AlertRoutingRule.is_active == True
    ).order_by(models.AlertRoutingRule.priority.asc()).all()

# ─── Suppression Rule ──────────────────────────────────────────────────────

def get_suppression_rules(db: Session):
    return db.query(models.AlertSuppressionRule).order_by(models.AlertSuppressionRule.created_at.desc()).all()

def get_suppression_rule(db: Session, rule_id: int):
    return db.query(models.AlertSuppressionRule).filter(models.AlertSuppressionRule.id == rule_id).first()

def create_suppression_rule(db: Session, rule: schemas.SuppressionRuleCreate):
    db_rule = models.AlertSuppressionRule(**rule.model_dump())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    logger.info("Created suppression rule: id=%d, name=%s", db_rule.id, rule.name)
    return db_rule

def update_suppression_rule(db: Session, rule_id: int, rule: schemas.SuppressionRuleCreate):
    db_rule = get_suppression_rule(db, rule_id)
    if not db_rule:
        return None
    for key, value in rule.model_dump().items():
        setattr(db_rule, key, value)
    db.commit()
    db.refresh(db_rule)
    return db_rule

def delete_suppression_rule(db: Session, rule_id: int):
    db_rule = get_suppression_rule(db, rule_id)
    if db_rule:
        db.delete(db_rule)
        db.commit()
    return db_rule

def get_active_suppression_rules(db: Session):
    return db.query(models.AlertSuppressionRule).filter(
        models.AlertSuppressionRule.is_active == True
    ).all()

# ─── Audit Log ─────────────────────────────────────────────────────────────

def create_audit_log(db: Session, username: str = None, user_id: int = None,
                     action: str = "", resource_type: str = "",
                     resource_id: int = None, detail: str = None,
                     ip_address: str = None):
    db_log = models.AuditLog(
        user_id=user_id, username=username, action=action,
        resource_type=resource_type, resource_id=resource_id,
        detail=detail, ip_address=ip_address,
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def get_audit_logs(db: Session, skip: int = 0, limit: int = 100,
                   action: str = None, resource_type: str = None):
    query = db.query(models.AuditLog)
    if action:
        query = query.filter(models.AuditLog.action == action)
    if resource_type:
        query = query.filter(models.AuditLog.resource_type == resource_type)
    return query.order_by(models.AuditLog.created_at.desc()).offset(skip).limit(limit).all()

# ─── On-Call Schedule ──────────────────────────────────────────────────────

def get_oncall_schedules(db: Session):
    schedules = db.query(models.OnCallSchedule).all()
    result = []
    for s in schedules:
        shifts = db.query(models.OnCallShift).filter(models.OnCallShift.schedule_id == s.id).all()
        s_dict = {c.name: getattr(s, c.name) for c in s.__table__.columns}
        s_dict['shifts'] = shifts
        result.append(s_dict)
    return result

def create_oncall_schedule(db: Session, data: schemas.OnCallScheduleCreate):
    db_schedule = models.OnCallSchedule(
        name=data.name, description=data.description,
        rotation_type=data.rotation_type, is_active=data.is_active,
    )
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    for shift in data.shifts:
        db_shift = models.OnCallShift(
            schedule_id=db_schedule.id, user_id=shift.user_id,
            start_time=shift.start_time, end_time=shift.end_time,
        )
        db.add(db_shift)
    db.commit()
    db.refresh(db_schedule)
    return get_oncall_schedules(db)[0] if get_oncall_schedules(db) else db_schedule

def update_oncall_schedule(db: Session, schedule_id: int, data: schemas.OnCallScheduleCreate):
    db_schedule = db.query(models.OnCallSchedule).filter(models.OnCallSchedule.id == schedule_id).first()
    if not db_schedule:
        return None
    db_schedule.name = data.name
    db_schedule.description = data.description
    db_schedule.rotation_type = data.rotation_type
    db_schedule.is_active = data.is_active
    # Replace shifts
    db.query(models.OnCallShift).filter(models.OnCallShift.schedule_id == schedule_id).delete()
    for shift in data.shifts:
        db_shift = models.OnCallShift(
            schedule_id=schedule_id, user_id=shift.user_id,
            start_time=shift.start_time, end_time=shift.end_time,
        )
        db.add(db_shift)
    db.commit()
    schedules = get_oncall_schedules(db)
    return next((s for s in schedules if s['id'] == schedule_id), None)

def delete_oncall_schedule(db: Session, schedule_id: int):
    db_schedule = db.query(models.OnCallSchedule).filter(models.OnCallSchedule.id == schedule_id).first()
    if not db_schedule:
        return None
    db.query(models.OnCallShift).filter(models.OnCallShift.schedule_id == schedule_id).delete()
    db.delete(db_schedule)
    db.commit()
    return db_schedule

def get_current_oncall_user(db: Session):
    """Get the user who is currently on call."""
    now = datetime.utcnow()
    shift = db.query(models.OnCallShift).filter(
        models.OnCallShift.start_time <= now,
        models.OnCallShift.end_time >= now,
    ).first()
    if not shift:
        return None
    return db.query(models.User).filter(models.User.id == shift.user_id).first()

# ─── Escalation Policy ─────────────────────────────────────────────────────

def get_escalation_policies(db: Session):
    return db.query(models.EscalationPolicy).all()

def create_escalation_policy(db: Session, data: schemas.EscalationPolicyCreate):
    db_policy = models.EscalationPolicy(**data.model_dump())
    db.add(db_policy)
    db.commit()
    db.refresh(db_policy)
    return db_policy

def update_escalation_policy(db: Session, policy_id: int, data: schemas.EscalationPolicyCreate):
    db_policy = db.query(models.EscalationPolicy).filter(models.EscalationPolicy.id == policy_id).first()
    if not db_policy:
        return None
    for k, v in data.model_dump().items():
        setattr(db_policy, k, v)
    db.commit()
    db.refresh(db_policy)
    return db_policy

def delete_escalation_policy(db: Session, policy_id: int):
    db_policy = db.query(models.EscalationPolicy).filter(models.EscalationPolicy.id == policy_id).first()
    if not db_policy:
        return None
    db.delete(db_policy)
    db.commit()
    return db_policy

def get_active_escalation_policies(db: Session):
    return db.query(models.EscalationPolicy).filter(models.EscalationPolicy.is_active == True).all()

# ─── Escalation Event ──────────────────────────────────────────────────────

def create_escalation_event(db: Session, alert_id: int, policy_id: int = None):
    db_event = models.EscalationEvent(alert_id=alert_id, policy_id=policy_id)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

def get_escalation_events(db: Session, status: str = None):
    query = db.query(models.EscalationEvent)
    if status:
        query = query.filter(models.EscalationEvent.status == status)
    return query.order_by(models.EscalationEvent.created_at.desc()).all()

def update_escalation_event(db: Session, event_id: int, **kwargs):
    db_event = db.query(models.EscalationEvent).filter(models.EscalationEvent.id == event_id).first()
    if not db_event:
        return None
    for k, v in kwargs.items():
        setattr(db_event, k, v)
    db.commit()
    db.refresh(db_event)
    return db_event

def get_active_escalation_events(db: Session):
    return db.query(models.EscalationEvent).filter(models.EscalationEvent.status == "active").all()

# ─── Remediation Template ──────────────────────────────────────────────────

def get_remediation_templates(db: Session, category: str = None):
    query = db.query(models.RemediationTemplate)
    if category:
        query = query.filter(models.RemediationTemplate.category == category)
    return query.order_by(models.RemediationTemplate.category, models.RemediationTemplate.name).all()

def get_remediation_template(db: Session, template_id: int):
    return db.query(models.RemediationTemplate).filter(models.RemediationTemplate.id == template_id).first()

def create_remediation_template(db: Session, data: schemas.RemediationTemplateCreate):
    db_template = models.RemediationTemplate(**data.model_dump())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

def update_remediation_template(db: Session, template_id: int, data: schemas.RemediationTemplateCreate):
    db_template = db.query(models.RemediationTemplate).filter(models.RemediationTemplate.id == template_id).first()
    if not db_template:
        return None
    for k, v in data.model_dump().items():
        setattr(db_template, k, v)
    db.commit()
    db.refresh(db_template)
    return db_template

def delete_remediation_template(db: Session, template_id: int):
    db_template = db.query(models.RemediationTemplate).filter(models.RemediationTemplate.id == template_id).first()
    if not db_template:
        return None
    db.delete(db_template)
    db.commit()
    return db_template

def increment_template_usage(db: Session, template_id: int, success: bool):
    """Update template usage count and success rate."""
    db_template = db.query(models.RemediationTemplate).filter(models.RemediationTemplate.id == template_id).first()
    if not db_template:
        return
    db_template.usage_count = (db_template.usage_count or 0) + 1
    # Parse current success rate
    try:
        parts = db_template.success_rate.split("/")
        completed = int(parts[0]) + (1 if success else 0)
        total = int(parts[1]) + 1
    except (ValueError, IndexError):
        completed = 1 if success else 0
        total = 1
    db_template.success_rate = f"{completed}/{total}"
    db.commit()

def find_matching_templates(db: Session, labels: dict, severity: str, alert_name: str, summary: str):
    """Find templates that auto-match the given alert."""
    templates = db.query(models.RemediationTemplate).filter(
        models.RemediationTemplate.is_active == True
    ).all()
    matched = []
    for tmpl in templates:
        score = 0
        # Check label match
        try:
            match_labels = json.loads(tmpl.match_labels) if tmpl.match_labels else {}
        except:
            match_labels = {}
        if match_labels:
            if all(labels.get(k) == v for k, v in match_labels.items()):
                score += 10
            else:
                continue  # Label mismatch = skip
        # Check severity match
        if tmpl.match_severity:
            allowed = [s.strip() for s in tmpl.match_severity.split(",")]
            if severity in allowed:
                score += 5
            elif match_labels:
                continue  # Has label match but severity mismatch — still include but lower priority
        # Check keyword match
        if tmpl.match_keywords:
            keywords = [k.strip().lower() for k in tmpl.match_keywords.split(",")]
            text = f"{alert_name} {summary}".lower()
            matched_keywords = [k for k in keywords if k in text]
            score += len(matched_keywords) * 3
            if not matched_keywords and not match_labels:
                continue  # Only keyword match and nothing matched — skip
        if score > 0:
            matched.append((score, tmpl))
    matched.sort(key=lambda x: x[0], reverse=True)
    return [tmpl for _, tmpl in matched]

def init_default_templates(db: Session):
    """Seed default remediation templates if none exist."""
    if db.query(models.RemediationTemplate).count() > 0:
        return
    defaults = [
        {"name": "重启服务", "description": "通过 systemctl 重启指定服务", "category": "restart",
         "action_type": "shell", "config_template": json.dumps({"command": "systemctl restart {{service_name}}"}, ensure_ascii=False),
         "match_keywords": "服务不可用,service down,connection refused,服务异常",
         "risk_level": "medium", "requires_approval": True},
        {"name": "清理磁盘空间", "description": "清理 Docker 和系统临时文件释放磁盘空间", "category": "disk",
         "action_type": "shell", "config_template": json.dumps({"command": "docker system prune -f && rm -rf /tmp/*"}, ensure_ascii=False),
         "match_labels": json.dumps({"alertname": "DiskUsageHigh"}, ensure_ascii=False),
         "match_keywords": "disk,disk full,磁盘,空间不足",
         "risk_level": "medium", "requires_approval": True},
        {"name": "清理日志文件", "description": "截断大于 100M 的日志文件", "category": "disk",
         "action_type": "shell", "config_template": json.dumps({"command": "find /var/log -name '*.log' -size +100M -exec truncate -s 0 {} \\;"}, ensure_ascii=False),
         "match_keywords": "disk,磁盘,log,日志过大",
         "risk_level": "low", "requires_approval": False},
        {"name": "重启 Pod", "description": "重启 Kubernetes 中指定命名空间的 Pod", "category": "restart",
         "action_type": "shell", "config_template": json.dumps({"command": "kubectl delete pod -n {{namespace}} -l app={{app_name}}"}, ensure_ascii=False),
         "match_keywords": "pod,pod crashloopbackoff,kubernetes,pod error",
         "risk_level": "medium", "requires_approval": True},
        {"name": "扩容 Deployment", "description": "增加 K8s Deployment 副本数", "category": "service",
         "action_type": "shell", "config_template": json.dumps({"command": "kubectl scale deployment {{deployment_name}} -n {{namespace}} --replicas={{replicas}}"}, ensure_ascii=False),
         "match_keywords": "高负载,high load,CPU,OOM,内存",
         "risk_level": "high", "requires_approval": True},
        {"name": "HTTP 健康检查", "description": "对目标 URL 发送 GET 请求检查状态", "category": "network",
         "action_type": "http", "config_template": json.dumps({"url": "{{health_url}}", "method": "GET"}, ensure_ascii=False),
         "match_keywords": "HTTP,502,503,504,timeout",
         "risk_level": "low", "requires_approval": False},
        {"name": "重启 Nginx", "description": "reload Nginx 配置", "category": "service",
         "action_type": "shell", "config_template": json.dumps({"command": "nginx -s reload"}, ensure_ascii=False),
         "match_labels": json.dumps({"job": "nginx"}, ensure_ascii=False),
         "match_keywords": "nginx,502,503",
         "risk_level": "low", "requires_approval": False},
        {"name": "清理 Redis 缓存", "description": "清除 Redis 指定 key 的缓存", "category": "service",
         "action_type": "shell", "config_template": json.dumps({"command": "redis-cli DEL {{key_pattern}}"}, ensure_ascii=False),
         "match_keywords": "redis,缓存,cache",
         "risk_level": "medium", "requires_approval": True},
    ]
    for d in defaults:
        tmpl = models.RemediationTemplate(**d)
        db.add(tmpl)
    db.commit()
    logger.info("Initialized %d default remediation templates", len(defaults))

# ─── Knowledge Article ──────────────────────────────────────────────────────

def get_knowledge_articles(db: Session, category: str = None, search: str = None, alert_name: str = None):
    query = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.is_published == True)
    if category:
        query = query.filter(models.KnowledgeArticle.category == category)
    if alert_name:
        query = query.filter(models.KnowledgeArticle.alert_name == alert_name)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (models.KnowledgeArticle.title.ilike(search_term)) |
            (models.KnowledgeArticle.content.ilike(search_term)) |
            (models.KnowledgeArticle.tags.ilike(search_term))
        )
    return query.order_by(models.KnowledgeArticle.updated_at.desc()).limit(50).all()

def get_knowledge_article(db: Session, article_id: int):
    return db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()

def create_knowledge_article(db: Session, data: schemas.KnowledgeArticleCreate, author: str = None):
    article = models.KnowledgeArticle(**data.model_dump(), author=author)
    db.add(article)
    db.commit()
    db.refresh(article)
    return article

def update_knowledge_article(db: Session, article_id: int, data: schemas.KnowledgeArticleCreate):
    article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not article:
        return None
    for k, v in data.model_dump().items():
        setattr(article, k, v)
    article.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(article)
    return article

def delete_knowledge_article(db: Session, article_id: int):
    article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not article:
        return None
    db.delete(article)
    db.commit()
    return article

def increment_article_view(db: Session, article_id: int):
    article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if article:
        article.view_count = (article.view_count or 0) + 1
        db.commit()

def mark_article_helpful(db: Session, article_id: int):
    article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if article:
        article.helpful_count = (article.helpful_count or 0) + 1
        db.commit()

def find_articles_for_alert(db: Session, alert_name: str, severity: str = None):
    """Find knowledge articles relevant to a given alert."""
    query = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.is_published == True)
    # Direct match by alert_name
    direct = query.filter(models.KnowledgeArticle.alert_name == alert_name).all()
    # Keyword search in title/content
    search_term = f"%{alert_name}%"
    related = query.filter(
        (models.KnowledgeArticle.title.ilike(search_term)) |
        (models.KnowledgeArticle.content.ilike(search_term))
    ).limit(5).all()
    # Merge and dedup
    seen = {a.id for a in direct}
    results = list(direct)
    for a in related:
        if a.id not in seen:
            results.append(a)
            seen.add(a.id)
    return results

# ─── Chat Messages ──────────────────────────────────────────────────────────

def get_chat_history(db: Session, session_id: str, limit: int = 20):
    return db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == session_id
    ).order_by(models.ChatMessage.created_at.desc()).limit(limit).all()[::-1]

def save_chat_message(db: Session, session_id: str, role: str, content: str,
                      action_taken: str = None, alert_id: int = None):
    msg = models.ChatMessage(session_id=session_id, role=role, content=content,
                             action_taken=action_taken, alert_id=alert_id)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
