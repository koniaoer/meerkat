from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from datetime import datetime
from database import Base
import json

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
    secret = Column(String, nullable=True)
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
    analysis_error = Column(String, nullable=True)
    raw_data = Column(Text)
    fingerprint = Column(String, index=True, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    silenced_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    display_name = Column(String, nullable=True)
    role = Column(String, default="viewer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class NotificationChannel(Base):
    __tablename__ = "notification_channels"
    id = Column(Integer, primary_key=True, index=True)
    channel_type = Column(String)
    name = Column(String)
    config = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class RemediationAction(Base):
    __tablename__ = "remediation_actions"
    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, index=True)
    action_type = Column(String)
    name = Column(String)
    description = Column(String)
    config = Column(Text)
    risk_level = Column(String, default="medium")
    status = Column(String, default="pending")
    result = Column(Text, nullable=True)
    auto_approved = Column(Boolean, default=False)
    approved_by = Column(String, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AlertRoutingRule(Base):
    __tablename__ = "alert_routing_rules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=0)
    match_labels = Column(Text, default="{}")
    match_severity = Column(String, nullable=True)
    channel_ids = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)

    def get_match_labels(self) -> dict:
        try:
            return json.loads(self.match_labels) if self.match_labels else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def get_channel_ids(self) -> list:
        try:
            return json.loads(self.channel_ids) if self.channel_ids else []
        except (json.JSONDecodeError, TypeError):
            return []

class AlertSuppressionRule(Base):
    __tablename__ = "alert_suppression_rules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    match_labels = Column(Text, default="{}")
    match_severity = Column(String, nullable=True)
    suppression_type = Column(String, default="label")
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    frequency_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def get_match_labels(self) -> dict:
        try:
            return json.loads(self.match_labels) if self.match_labels else {}
        except (json.JSONDecodeError, TypeError):
            return {}

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=True)
    action = Column(String)
    resource_type = Column(String)
    resource_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class OnCallSchedule(Base):
    __tablename__ = "oncall_schedules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    rotation_type = Column(String, default="daily")  # daily/weekly/custom
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class OnCallShift(Base):
    __tablename__ = "oncall_shifts"
    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, index=True)
    user_id = Column(Integer, index=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

class EscalationPolicy(Base):
    __tablename__ = "escalation_policies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    rules = Column(Text, default="[]")  # JSON: [{"level":1,"wait_minutes":5,"channel_ids":[1],"user_ids":[1]}]
    match_labels = Column(Text, default="{}")
    match_severity = Column(String, nullable=True)
    repeat_interval_minutes = Column(Integer, default=0)  # 0=no repeat
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class EscalationEvent(Base):
    __tablename__ = "escalation_events"
    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, index=True)
    policy_id = Column(Integer, nullable=True)
    current_level = Column(Integer, default=0)
    last_escalated_at = Column(DateTime, nullable=True)
    status = Column(String, default="active")  # active/acknowledged/resolved/expired
    created_at = Column(DateTime, default=datetime.utcnow)

class RemediationTemplate(Base):
    __tablename__ = "remediation_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    category = Column(String, default="general")  # restart/disk/network/service/custom
    action_type = Column(String, default="shell")  # shell/http/webhook/script
    config_template = Column(Text, default="{}")  # JSON with {{placeholder}} variables
    match_labels = Column(Text, default="{}")  # Auto-match: labels that trigger this template
    match_severity = Column(String, nullable=True)  # Auto-match: severity filter
    match_keywords = Column(String, nullable=True)  # Auto-match: keywords in alert name/summary
    risk_level = Column(String, default="medium")
    requires_approval = Column(Boolean, default=True)  # True=always need approval, False=auto-execute
    usage_count = Column(Integer, default=0)  # Track how many times used
    success_rate = Column(String, default="0")  # "completed/total" e.g. "8/10"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class KnowledgeArticle(Base):
    __tablename__ = "knowledge_articles"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    content = Column(Text)
    category = Column(String, default="general")  # runbook/troubleshoot/faq/postmortem/general
    tags = Column(String, nullable=True)  # comma-separated tags for search
    alert_name = Column(String, nullable=True)  # linked alert name for auto-suggest
    severity = Column(String, nullable=True)  # applicable severity
    author = Column(String, nullable=True)
    view_count = Column(Integer, default=0)
    helpful_count = Column(Integer, default=0)
    is_published = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    role = Column(String)  # user/assistant/system
    content = Column(Text)
    action_taken = Column(String, nullable=True)  # JSON: any action executed
    alert_id = Column(Integer, nullable=True)  # linked alert
    created_at = Column(DateTime, default=datetime.utcnow)
