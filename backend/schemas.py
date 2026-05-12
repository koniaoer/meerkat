from pydantic import BaseModel, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

class ModelConfigBase(BaseModel):
    provider_name: str
    api_key: str
    base_url: str
    model_name: str
    is_active: bool = False

class ModelConfigCreate(ModelConfigBase):
    pass

class ModelConfig(ModelConfigBase):
    id: int
    class Config:
        from_attributes = True

class DingTalkConfigBase(BaseModel):
    webhook_url: str
    secret: Optional[str] = None
    is_active: bool = True

class DingTalkConfigCreate(DingTalkConfigBase):
    pass

class DingTalkConfig(DingTalkConfigBase):
    id: int
    class Config:
        from_attributes = True

class AlertBase(BaseModel):
    alert_name: str
    status: str
    severity: str
    summary: str
    description: str
    raw_data: str

class AlertCreate(AlertBase):
    fingerprint: Optional[str] = None

class Alert(AlertBase):
    id: int
    analysis_result: Optional[str] = None
    analysis_summary: Optional[str] = None
    analysis_root_cause: Optional[str] = None
    analysis_suggestion: Optional[str] = None
    analysis_severity: Optional[str] = None
    analysis_error: Optional[str] = None
    fingerprint: Optional[str] = None
    resolved_at: Optional[datetime] = None
    acknowledged: Optional[bool] = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    silenced_until: Optional[datetime] = None
    created_at: datetime
    class Config:
        from_attributes = True

class AlertUpdate(BaseModel):
    acknowledged: Optional[bool] = None
    acknowledged_by: Optional[str] = None
    silenced_until: Optional[datetime] = None

class AlertStats(BaseModel):
    total: int
    firing: int
    resolved: int
    acknowledged: int
    by_severity: Dict[str, int]
    by_status: Dict[str, int] = {}
    by_alert_name: Dict[str, int] = {}
    recent_24h: int = 0
    avg_resolution_minutes: Optional[float] = None

class DashboardStats(BaseModel):
    alert_stats: AlertStats
    channel_count: int = 0
    template_count: int = 0
    active_escalations: int = 0
    oncall_user: Optional[str] = None
    remediation_stats: Dict[str, int] = {}
    alert_trend: List[Dict[str, Any]] = []

class PrometheusAlert(BaseModel):
    status: str
    labels: Dict[str, str] = {}
    annotations: Dict[str, str] = {}
    startsAt: Optional[str] = None
    endsAt: Optional[str] = None
    generatorURL: Optional[str] = None
    fingerprint: Optional[str] = None

class PrometheusWebhook(BaseModel):
    receiver: Optional[str] = None
    status: str
    alerts: List[PrometheusAlert]
    groupLabels: Dict[str, str] = {}
    commonLabels: Dict[str, str] = {}
    commonAnnotations: Dict[str, str] = {}
    externalURL: Optional[str] = None
    version: Optional[str] = None
    groupKey: Optional[str] = None
    truncatedAlerts: int = 0

class UserCreate(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    display_name: Optional[str] = None
    role: str = "viewer"
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserCreateByAdmin(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    role: str = "viewer"

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "viewer"
    username: str = ""
    display_name: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class NotificationChannelCreate(BaseModel):
    channel_type: str
    name: str
    config: str | dict = "{}"
    is_active: bool = True

    @model_validator(mode='before')
    @classmethod
    def ensure_config_str(cls, values):
        if isinstance(values.get('config'), dict):
            values['config'] = json.dumps(values['config'], ensure_ascii=False)
        return values

class NotificationChannelResponse(BaseModel):
    id: int
    channel_type: str
    name: str
    config: str
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class RemediationActionCreate(BaseModel):
    alert_id: int
    action_type: str
    name: str
    description: str
    config: str
    risk_level: str = "medium"

class RemediationActionResponse(BaseModel):
    id: int
    alert_id: int
    action_type: str
    name: str
    description: str
    config: str
    risk_level: str
    status: str
    result: Optional[str] = None
    auto_approved: bool = False
    approved_by: Optional[str] = None
    executed_at: Optional[datetime] = None
    created_at: datetime
    class Config:
        from_attributes = True

class ActionApproval(BaseModel):
    approved: bool
    approved_by: str = "admin"

# ─── Routing Rule ─────────────────────────────────────────────────────────
class RoutingRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    priority: int = 0
    match_labels: str = "{}"
    match_severity: Optional[str] = None
    channel_ids: str = "[]"

class RoutingRuleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_active: bool
    priority: int
    match_labels: str
    match_severity: Optional[str] = None
    channel_ids: str
    created_at: datetime
    class Config:
        from_attributes = True

# ─── Suppression Rule ──────────────────────────────────────────────────────
class SuppressionRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    match_labels: str = "{}"
    match_severity: Optional[str] = None
    suppression_type: str = "label"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    frequency_minutes: Optional[int] = None

class SuppressionRuleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_active: bool
    match_labels: str
    match_severity: Optional[str] = None
    suppression_type: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    frequency_minutes: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

# ─── Audit Log ─────────────────────────────────────────────────────────────
class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    detail: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

# ─── On-Call Schedule ──────────────────────────────────────────────────────
class OnCallShiftCreate(BaseModel):
    user_id: int
    start_time: datetime
    end_time: datetime

class OnCallShiftResponse(BaseModel):
    id: int
    schedule_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    created_at: datetime
    class Config:
        from_attributes = True

class OnCallScheduleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    rotation_type: str = "daily"
    is_active: bool = True
    shifts: List[OnCallShiftCreate] = []

class OnCallScheduleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    rotation_type: str
    is_active: bool
    shifts: List[OnCallShiftResponse] = []
    created_at: datetime
    class Config:
        from_attributes = True

# ─── Escalation Policy ─────────────────────────────────────────────────────
class EscalationLevelRule(BaseModel):
    level: int
    wait_minutes: int
    channel_ids: List[int] = []
    user_ids: List[int] = []

class EscalationPolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    rules: str = "[]"  # JSON array of EscalationLevelRule
    match_labels: str = "{}"
    match_severity: Optional[str] = None
    repeat_interval_minutes: int = 0
    is_active: bool = True

class EscalationPolicyResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    rules: str
    match_labels: str
    match_severity: Optional[str] = None
    repeat_interval_minutes: int
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class EscalationEventResponse(BaseModel):
    id: int
    alert_id: int
    policy_id: Optional[int] = None
    current_level: int
    last_escalated_at: Optional[datetime] = None
    status: str
    created_at: datetime
    class Config:
        from_attributes = True

# ─── Remediation Template ──────────────────────────────────────────────────
class RemediationTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "general"
    action_type: str = "shell"
    config_template: str = "{}"
    match_labels: str = "{}"
    match_severity: Optional[str] = None
    match_keywords: Optional[str] = None
    risk_level: str = "medium"
    requires_approval: bool = True
    is_active: bool = True

class RemediationTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    category: str
    action_type: str
    config_template: str
    match_labels: str
    match_severity: Optional[str] = None
    match_keywords: Optional[str] = None
    risk_level: str
    requires_approval: bool
    usage_count: int
    success_rate: str
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

# ─── Knowledge Article ─────────────────────────────────────────────────────
class KnowledgeArticleCreate(BaseModel):
    title: str
    content: str
    category: str = "general"
    tags: Optional[str] = None
    alert_name: Optional[str] = None
    severity: Optional[str] = None
    is_published: bool = True

class KnowledgeArticleResponse(BaseModel):
    id: int
    title: str
    content: str
    category: str
    tags: Optional[str] = None
    alert_name: Optional[str] = None
    severity: Optional[str] = None
    author: Optional[str] = None
    view_count: int
    helpful_count: int
    is_published: bool
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# ─── ChatOps ───────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    alert_id: Optional[int] = None

class ChatResponse(BaseModel):
    session_id: str
    role: str
    content: str
    action_taken: Optional[str] = None
    alert_id: Optional[int] = None
    created_at: datetime
    class Config:
        from_attributes = True

class BatchDeleteRequest(BaseModel):
    ids: list[int] = []

# Prometheus DataSource
class PrometheusDataSourceCreate(BaseModel):
    name: str
    url: str
    is_default: bool = False
    headers: Optional[str] = None

class PrometheusDataSourceResponse(BaseModel):
    id: int
    name: str
    url: str
    is_default: bool
    headers: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# Monitor Dashboard
class PanelConfig(BaseModel):
    id: str
    title: str
    query: str
    unit: Optional[str] = None
    type: str = "line"  # line / stat / gauge / table / bargauge
    queryMode: Optional[str] = None  # 'range' (default) or 'instant'
    grid: dict = {"x": 0, "y": 0, "w": 12, "h": 4}
    legend: Optional[str] = None
    thresholds: Optional[list] = None
    section: Optional[str] = None  # Row section grouping
    targetsInfo: Optional[list] = None  # For table panels: per-target info

    class Config:
        from_attributes = True

class MonitorDashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    datasource_id: Optional[int] = None
    panels: list[PanelConfig] = []
    refresh_interval: int = 30
    time_range: str = "1h"

class MonitorDashboardResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    datasource_id: Optional[int] = None
    panels: list[PanelConfig] = []
    refresh_interval: int = 30
    time_range: str = "1h"
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
