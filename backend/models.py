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
    analysis_summary = Column(String, nullable=True)
    analysis_root_cause = Column(String, nullable=True)
    analysis_suggestion = Column(String, nullable=True)
    analysis_severity = Column(String, nullable=True)
    raw_data = Column(Text)  # Store full JSON as string
    fingerprint = Column(String, index=True, nullable=True)  # alert dedup key
    resolved_at = Column(DateTime, nullable=True)  # when alert was resolved
    acknowledged = Column(Boolean, default=False)  # whether acknowledged
    acknowledged_by = Column(String, nullable=True)  # who acknowledged
    acknowledged_at = Column(DateTime, nullable=True)  # when acknowledged
    silenced_until = Column(DateTime, nullable=True)  # silence deadline
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class NotificationChannel(Base):
    __tablename__ = "notification_channels"
    id = Column(Integer, primary_key=True, index=True)
    channel_type = Column(String)  # dingtalk/wechat/slack/email/webhook
    name = Column(String)
    config = Column(Text)  # JSON string with channel-specific config
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class RemediationAction(Base):
    __tablename__ = "remediation_actions"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, index=True)  # Reference to the alert
    action_type = Column(String)  # shell/http/webhook/script
    name = Column(String)  # Human-readable name
    description = Column(String)  # What this action does
    config = Column(Text)  # JSON string with action-specific config
    risk_level = Column(String, default="medium")  # low/medium/high
    status = Column(String, default="pending")  # pending/approved/executing/completed/failed/rejected/timeout
    result = Column(Text, nullable=True)  # JSON string with execution result
    auto_approved = Column(Boolean, default=False)
    approved_by = Column(String, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
