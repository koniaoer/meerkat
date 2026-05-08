from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

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
    pass

class Alert(AlertBase):
    id: int
    analysis_result: Optional[str] = None
    analysis_summary: Optional[str] = None
    analysis_root_cause: Optional[str] = None
    analysis_suggestion: Optional[str] = None
    analysis_severity: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Prometheus Alertmanager structure
class PrometheusAlert(BaseModel):
    status: str
    labels: Dict[str, str]
    annotations: Dict[str, str]
    startsAt: str
    endsAt: str
    generatorURL: str
    fingerprint: str

class PrometheusWebhook(BaseModel):
    receiver: str
    status: str
    alerts: List[PrometheusAlert]
    groupLabels: Dict[str, str]
    commonLabels: Dict[str, str]
    commonAnnotations: Dict[str, str]
    externalURL: str
    version: str
    groupKey: str
    truncatedAlerts: int = 0
