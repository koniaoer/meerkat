from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from datetime import datetime
from database import Base

class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider_name = Column(String, index=True)
    api_key = Column(String)
    base_url = Column(String)
    model_name = Column(String)
    is_active = Column(Boolean, default=False)

class DingTalkConfig(Base):
    __tablename__ = "dingtalk_configs"

    id = Column(Integer, primary_key=True, index=True)
    webhook_url = Column(String)
    secret = Column(String, nullable=True) # 用于加签
    is_active = Column(Boolean, default=True)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_name = Column(String, index=True)
    status = Column(String)
    severity = Column(String)
    summary = Column(Text)
    description = Column(Text)
    analysis_result = Column(Text, nullable=True)
    raw_data = Column(Text)  # Store full JSON as string
    created_at = Column(DateTime, default=datetime.utcnow)
