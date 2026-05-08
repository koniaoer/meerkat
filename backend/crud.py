from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import models, schemas
from logger import logger

def get_model_config(db: Session, config_id: int):
    return db.query(models.ModelConfig).filter(models.ModelConfig.id == config_id).first()

def get_model_configs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.ModelConfig).offset(skip).limit(limit).all()

def create_model_config(db: Session, config: schemas.ModelConfigCreate):
    # If this one is set to active, deactivate others
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
        logger.warning("Model config not found for update: id=%d", config_id)
        return None
    
    if config.is_active:
        db.query(models.ModelConfig).filter(models.ModelConfig.id != config_id).update({models.ModelConfig.is_active: False})
    
    for key, value in config.model_dump().items():
        setattr(db_config, key, value)
    
    db.commit()
    db.refresh(db_config)
    logger.info("Updated model config: id=%d", config_id)
    return db_config

def delete_model_config(db: Session, config_id: int):
    db_config = get_model_config(db, config_id)
    if db_config:
        db.delete(db_config)
        db.commit()
        logger.info("Deleted model config: id=%d", config_id)
    else:
        logger.warning("Model config not found for deletion: id=%d", config_id)
    return db_config

def get_active_model_config(db: Session):
    return db.query(models.ModelConfig).filter(models.ModelConfig.is_active == True).first()

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
    """Find a firing alert with same fingerprint (for dedup/resolved handling)"""
    return db.query(models.Alert).filter(
        models.Alert.fingerprint == fingerprint,
        models.Alert.status == "firing"
    ).first()

def resolve_alert(db: Session, alert_id: int):
    """Mark alert as resolved"""
    db_alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if db_alert:
        db_alert.status = "resolved"
        db_alert.resolved_at = datetime.utcnow()
        db.commit()
        db.refresh(db_alert)
    return db_alert

def acknowledge_alert(db: Session, alert_id: int, acknowledged_by: str):
    """Acknowledge an alert"""
    db_alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if db_alert:
        db_alert.acknowledged = True
        db_alert.acknowledged_by = acknowledged_by
        db_alert.acknowledged_at = datetime.utcnow()
        db.commit()
        db.refresh(db_alert)
    return db_alert

def silence_alert(db: Session, alert_id: int, duration_minutes: int):
    """Silence an alert for given duration"""
    db_alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if db_alert:
        db_alert.silenced_until = datetime.utcnow() + timedelta(minutes=duration_minutes)
        db.commit()
        db.refresh(db_alert)
    return db_alert

def get_alert_stats(db: Session):
    """Get alert statistics"""
    alerts = db.query(models.Alert).all()
    return {
        "total": len(alerts),
        "firing": len([a for a in alerts if a.status == "firing"]),
        "resolved": len([a for a in alerts if a.status == "resolved"]),
        "acknowledged": len([a for a in alerts if a.acknowledged]),
        "by_severity": {s: len([a for a in alerts if a.severity == s]) for s in set(a.severity for a in alerts)}
    }

def get_alerts_with_filters(db: Session, status: str = None, severity: str = None, acknowledged: bool = None, skip: int = 0, limit: int = 100):
    """Get alerts with filters"""
    query = db.query(models.Alert)
    if status:
        query = query.filter(models.Alert.status == status)
    if severity:
        query = query.filter(models.Alert.severity == severity)
    if acknowledged is not None:
        query = query.filter(models.Alert.acknowledged == acknowledged)
    return query.order_by(models.Alert.created_at.desc()).offset(skip).limit(limit).all()

# User CRUD
def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def create_user(db: Session, username: str, hashed_password: str):
    db_user = models.User(username=username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# NotificationChannel CRUD
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

# DingTalk Config CRUD
def get_dingtalk_configs(db: Session):
    return db.query(models.DingTalkConfig).all()

def create_dingtalk_config(db: Session, config: schemas.DingTalkConfigCreate):
    db_config = models.DingTalkConfig(**config.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    logger.info("Created DingTalk config: id=%d", db_config.id)
    return db_config

def update_dingtalk_config(db: Session, config_id: int, config: schemas.DingTalkConfigCreate):
    db_config = db.query(models.DingTalkConfig).filter(models.DingTalkConfig.id == config_id).first()
    if db_config:
        for key, value in config.model_dump().items():
            setattr(db_config, key, value)
        db.commit()
        db.refresh(db_config)
        logger.info("Updated DingTalk config: id=%d", config_id)
    else:
        logger.warning("DingTalk config not found for update: id=%d", config_id)
    return db_config

def delete_dingtalk_config(db: Session, config_id: int):
    db_config = db.query(models.DingTalkConfig).filter(models.DingTalkConfig.id == config_id).first()
    if db_config:
        db.delete(db_config)
        db.commit()
        logger.info("Deleted DingTalk config: id=%d", config_id)
    else:
        logger.warning("DingTalk config not found for deletion: id=%d", config_id)
    return db_config

def get_active_dingtalk_config(db: Session):
    return db.query(models.DingTalkConfig).filter(models.DingTalkConfig.is_active == True).first()
