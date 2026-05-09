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
    alerts = db.query(models.Alert).all()
    return {
        "total": len(alerts),
        "firing": len([a for a in alerts if a.status == "firing"]),
        "resolved": len([a for a in alerts if a.status == "resolved"]),
        "acknowledged": len([a for a in alerts if a.acknowledged]),
        "by_severity": {s: len([a for a in alerts if a.severity == s]) for s in set(a.severity for a in alerts)}
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
