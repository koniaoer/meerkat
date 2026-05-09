"""
Alert routing engine — match alerts to notification channels based on rules.

Logic:
- Get all active routing rules ordered by priority ASC
- For each rule, check if alert labels AND severity match
- First matching rule wins → return its channel_ids
- If no rule matches → return None (use all active channels as default)
"""
import json
from typing import List, Optional
from sqlalchemy.orm import Session
import models
from logger import logger


def _match_labels(rule_labels: dict, alert_labels: dict) -> bool:
    """All key-value pairs in rule_labels must exist in alert_labels (AND logic)."""
    if not rule_labels:
        return True  # empty match = match all
    for key, value in rule_labels.items():
        if alert_labels.get(key) != value:
            return False
    return True


def _match_severity(rule_severity: str, alert_severity: str) -> bool:
    """Check if alert severity is in the rule's comma-separated severity list."""
    if not rule_severity:
        return True  # empty = match all severities
    allowed = [s.strip().lower() for s in rule_severity.split(",") if s.strip()]
    return alert_severity.lower() in allowed


def route_alert(alert_labels: dict, alert_severity: str, db: Session) -> Optional[List[int]]:
    """
    Route an alert to the appropriate notification channels.
    Returns list of channel IDs, or None if no rule matches (use default all channels).
    """
    rules = db.query(models.AlertRoutingRule).filter(
        models.AlertRoutingRule.is_active == True
    ).order_by(models.AlertRoutingRule.priority.asc()).all()

    for rule in rules:
        try:
            rule_labels = rule.get_match_labels()
            if _match_labels(rule_labels, alert_labels) and _match_severity(rule.match_severity, alert_severity):
                channel_ids = rule.get_channel_ids()
                logger.info("Alert routed by rule '%s' (id=%d) to channels %s", rule.name, rule.id, channel_ids)
                return channel_ids
        except Exception as e:
            logger.error("Error evaluating routing rule id=%d: %s", rule.id, e)
            continue

    logger.info("No routing rule matched, using default channels")
    return None
