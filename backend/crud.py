from sqlalchemy.orm import Session
import models, schemas

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

def create_alert(db: Session, alert: schemas.AlertCreate, analysis_result: str = None):
    db_alert = models.Alert(**alert.model_dump(), analysis_result=analysis_result)
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert

def get_alerts(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Alert).order_by(models.Alert.created_at.desc()).offset(skip).limit(limit).all()

# DingTalk Config CRUD
def get_dingtalk_configs(db: Session):
    return db.query(models.DingTalkConfig).all()

def create_dingtalk_config(db: Session, config: schemas.DingTalkConfigCreate):
    db_config = models.DingTalkConfig(**config.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

def update_dingtalk_config(db: Session, config_id: int, config: schemas.DingTalkConfigCreate):
    db_config = db.query(models.DingTalkConfig).filter(models.DingTalkConfig.id == config_id).first()
    if db_config:
        for key, value in config.model_dump().items():
            setattr(db_config, key, value)
        db.commit()
        db.refresh(db_config)
    return db_config

def delete_dingtalk_config(db: Session, config_id: int):
    db_config = db.query(models.DingTalkConfig).filter(models.DingTalkConfig.id == config_id).first()
    if db_config:
        db.delete(db_config)
        db.commit()
    return db_config

def get_active_dingtalk_config(db: Session):
    return db.query(models.DingTalkConfig).filter(models.DingTalkConfig.is_active == True).first()
