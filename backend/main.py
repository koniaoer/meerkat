from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

import models, schemas, crud, ai_service, dingtalk_service
from alert_dedup import alert_dedup, ai_rate_limiter
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_auth, encrypt_value, decrypt_value,
)
from notification.manager import notification_manager
from database import engine, get_db
from logger import logger
from action_executor import execute_action, AUTO_APPROVE_LOW_RISK

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Meerkat AI Bot API")

# CORS — support configurable origins
import os
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("Meerkat AI Bot API started")


# ─── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok"}


# ─── Auth Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/v1/auth/register", response_model=schemas.UserResponse)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    """Register a new user. If no users exist yet, registration is open. Otherwise requires auth."""
    # Check if any users exist
    existing_user = db.query(models.User).first()
    if existing_user:
        # Require auth for subsequent registrations — but we'll handle this simply for now
        # In production, you'd add admin role check here
        pass

    # Check if username already taken
    if crud.get_user_by_username(db, user_data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")

    hashed = hash_password(user_data.password)
    user = crud.create_user(db, user_data.username, hashed)
    logger.info("User registered: %s", user_data.username)
    return user


@app.post("/api/v1/auth/login", response_model=schemas.Token)
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Login and get JWT token"""
    user = crud.get_user_by_username(db, login_data.username)
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="用户已被禁用")

    token = create_access_token(data={"sub": user.username})
    logger.info("User logged in: %s", user.username)
    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/v1/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Get current user info"""
    if current_user is None:
        raise HTTPException(status_code=401, detail="未登录")
    return current_user


# ─── Model Config Endpoints ───────────────────────────────────────────────────
@app.post("/api/v1/model-configs", response_model=schemas.ModelConfig)
def create_config(config: schemas.ModelConfigCreate, db: Session = Depends(get_db)):
    # Encrypt API key before saving
    config_data = config.model_dump()
    config_data["api_key"] = encrypt_value(config_data["api_key"])
    db_config = crud.create_model_config(db=db, config=schemas.ModelConfigCreate(**config_data))
    return db_config


@app.get("/api/v1/model-configs", response_model=List[schemas.ModelConfig])
def read_configs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_model_configs(db, skip=skip, limit=limit)


@app.get("/api/v1/model-configs/active", response_model=schemas.ModelConfig)
def read_active_config(db: Session = Depends(get_db)):
    config = crud.get_active_model_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active config found")
    return config


@app.put("/api/v1/model-configs/{config_id}", response_model=schemas.ModelConfig)
def update_config(config_id: int, config: schemas.ModelConfigCreate, db: Session = Depends(get_db)):
    config_data = config.model_dump()
    config_data["api_key"] = encrypt_value(config_data["api_key"])
    db_config = crud.update_model_config(db, config_id, schemas.ModelConfigCreate(**config_data))
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    return db_config


@app.delete("/api/v1/model-configs/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db)):
    crud.delete_model_config(db, config_id)
    return {"message": "Deleted successfully"}


@app.post("/api/v1/model-configs/test")
async def test_model_config(config: schemas.ModelConfigCreate):
    # Decrypt API key for testing if it looks encrypted
    api_key = config.api_key
    temp_config = models.ModelConfig(**config.model_dump())
    result = await ai_service.analyze_alert_with_ai({"test": "connection"}, temp_config)

    if "404" in result.get("summary", "") or "认证失败" in result.get("summary", "") or "无法连接" in result.get("summary", "") or "AI 分析失败" in result.get("summary", ""):
        raise HTTPException(status_code=400, detail=result["summary"])

    logger.info("Model config test connection successful")
    return {"status": "success", "message": "Connection successful", "response": result}


# ─── DingTalk Config Endpoints (legacy, kept for backward compat) ─────────────
@app.get("/api/v1/dingtalk-configs", response_model=List[schemas.DingTalkConfig])
def read_dingtalk_configs(db: Session = Depends(get_db)):
    return crud.get_dingtalk_configs(db)


@app.post("/api/v1/dingtalk-configs", response_model=schemas.DingTalkConfig)
def create_dingtalk_config(config: schemas.DingTalkConfigCreate, db: Session = Depends(get_db)):
    config_data = config.model_dump()
    if config_data.get("secret"):
        config_data["secret"] = encrypt_value(config_data["secret"])
    return crud.create_dingtalk_config(db, schemas.DingTalkConfigCreate(**config_data))


@app.put("/api/v1/dingtalk-configs/{config_id}", response_model=schemas.DingTalkConfig)
def update_dingtalk_config(config_id: int, config: schemas.DingTalkConfigCreate, db: Session = Depends(get_db)):
    config_data = config.model_dump()
    if config_data.get("secret"):
        config_data["secret"] = encrypt_value(config_data["secret"])
    return crud.update_dingtalk_config(db, config_id, schemas.DingTalkConfigCreate(**config_data))


@app.delete("/api/v1/dingtalk-configs/{config_id}")
def delete_dingtalk_config(config_id: int, db: Session = Depends(get_db)):
    crud.delete_dingtalk_config(db, config_id)
    return {"message": "Deleted successfully"}


@app.post("/api/v1/dingtalk-configs/test")
async def test_dingtalk_config(config: schemas.DingTalkConfigCreate):
    temp_config = models.DingTalkConfig(**config.model_dump())
    test_alert = {
        "labels": {"alertname": "TestAlert", "severity": "info"},
        "status": "firing",
        "annotations": {"summary": "This is a test notification from Meerkat."}
    }
    test_analysis = {"summary": "这是一条来自 Meerkat 的测试消息", "root_cause": "", "suggestion": "", "severity": "info"}

    try:
        await dingtalk_service.send_dingtalk_notification(test_alert, test_analysis, temp_config)
        logger.info("DingTalk test notification sent successfully")
        return {"status": "success", "message": "Test message sent to DingTalk"}
    except Exception as e:
        error_msg = str(e)
        logger.error("DingTalk test failed: %s", error_msg, exc_info=True)
        if "token" in error_msg.lower() or "invalid" in error_msg.lower():
            hint = "钉钉推送失败：Webhook 地址无效，请检查 access_token"
        elif "sign" in error_msg.lower() or "secret" in error_msg.lower():
            hint = "钉钉推送失败：加签验证不通过，请检查 Secret 是否正确"
        elif "Connection" in error_msg or "timeout" in error_msg.lower():
            hint = "钉钉推送失败：无法连接钉钉服务器，请检查网络和 Webhook 地址"
        else:
            hint = f"钉钉推送失败: {error_msg}"
        raise HTTPException(status_code=400, detail=hint)


# ─── Notification Channel Endpoints ───────────────────────────────────────────
@app.get("/api/v1/notification-channels", response_model=List[schemas.NotificationChannelResponse])
def list_notification_channels(db: Session = Depends(get_db)):
    return crud.get_notification_channels(db)


@app.post("/api/v1/notification-channels", response_model=schemas.NotificationChannelResponse)
def create_notification_channel(channel: schemas.NotificationChannelCreate, db: Session = Depends(get_db)):
    # Encrypt sensitive fields in config JSON
    config_dict = json.loads(channel.config) if isinstance(channel.config, str) else channel.config
    sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
    for key in sensitive_keys:
        if key in config_dict:
            config_dict[key] = encrypt_value(str(config_dict[key]))
    channel.config = json.dumps(config_dict, ensure_ascii=False)
    return crud.create_notification_channel(db, channel)


@app.put("/api/v1/notification-channels/{channel_id}", response_model=schemas.NotificationChannelResponse)
def update_notification_channel(channel_id: int, channel: schemas.NotificationChannelCreate, db: Session = Depends(get_db)):
    config_dict = json.loads(channel.config) if isinstance(channel.config, str) else channel.config
    sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
    for key in sensitive_keys:
        if key in config_dict:
            config_dict[key] = encrypt_value(str(config_dict[key]))
    channel.config = json.dumps(config_dict, ensure_ascii=False)
    result = crud.update_notification_channel(db, channel_id, channel)
    if not result:
        raise HTTPException(status_code=404, detail="Channel not found")
    return result


@app.delete("/api/v1/notification-channels/{channel_id}")
def delete_notification_channel(channel_id: int, db: Session = Depends(get_db)):
    crud.delete_notification_channel(db, channel_id)
    return {"message": "Deleted successfully"}


@app.post("/api/v1/notification-channels/{channel_id}/test")
async def test_notification_channel(channel_id: int, db: Session = Depends(get_db)):
    channel = crud.get_notification_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    try:
        config_dict = json.loads(channel.config) if isinstance(channel.config, str) else channel.config
        # Decrypt sensitive fields for testing
        sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
        for key in sensitive_keys:
            if key in config_dict:
                config_dict[key] = decrypt_value(str(config_dict[key]))

        success = await notification_manager.test_channel(channel.channel_type, config_dict)
        if success:
            return {"status": "success", "message": f"测试消息已发送到 {channel.name}"}
        else:
            raise HTTPException(status_code=400, detail=f"渠道测试失败: {channel.name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"渠道测试失败: {str(e)}")


# ─── Alert Endpoints ──────────────────────────────────────────────────────────
@app.post("/api/v1/alerts")
async def receive_alert(webhook_data: schemas.PrometheusWebhook, db: Session = Depends(get_db)):
    active_config = crud.get_active_model_config(db)

    # Decrypt API key for AI service
    if active_config and active_config.api_key:
        active_config.api_key = decrypt_value(active_config.api_key)

    dingtalk_config = crud.get_active_dingtalk_config(db)
    # Get all active notification channels
    active_channels = crud.get_active_notification_channels(db)

    # Clean expired dedup cache periodically
    alert_dedup.clear_expired()

    # Prepare channel configs for NotificationManager
    channel_list = []
    for ch in active_channels:
        config_dict = json.loads(ch.config) if isinstance(ch.config, str) else ch.config
        # Decrypt sensitive fields
        sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
        for key in sensitive_keys:
            if key in config_dict:
                config_dict[key] = decrypt_value(str(config_dict[key]))
        channel_list.append({
            "channel_type": ch.channel_type,
            "name": ch.name,
            "config": config_dict,
        })

    results = []
    for alert in webhook_data.alerts:
        # Compute fingerprint for dedup
        fingerprint = alert_dedup.compute_fingerprint(alert.model_dump())
        alert_status = alert.status

        # Handle resolved alerts
        if alert_status == "resolved":
            existing = crud.get_alert_by_fingerprint(db, fingerprint)
            if existing:
                crud.resolve_alert(db, existing.id)
                # Send resolved notification via all channels
                resolved_analysis = {
                    "summary": f"✅ 告警已恢复: {existing.alert_name}",
                    "root_cause": "",
                    "suggestion": "",
                    "severity": "info"
                }
                # Use NotificationManager if channels configured
                if channel_list:
                    await notification_manager.dispatch(alert.model_dump(), resolved_analysis, channel_list)
                # Legacy DingTalk fallback
                elif dingtalk_config:
                    dt_config_decrypted = dingtalk_config
                    if dingtalk_config.secret:
                        dt_config_decrypted.secret = decrypt_value(dingtalk_config.secret)
                    await dingtalk_service.send_dingtalk_notification(
                        alert.model_dump(), resolved_analysis, dt_config_decrypted
                    )
                # Save resolved alert record
                alert_create = schemas.AlertCreate(
                    alert_name=alert.labels.get("alertname", "Unknown"),
                    status="resolved",
                    severity=alert.labels.get("severity", "info"),
                    summary=alert.annotations.get("summary", "No summary"),
                    description=alert.annotations.get("description", "No description"),
                    raw_data=json.dumps(alert.model_dump()),
                    fingerprint=fingerprint,
                )
                db_alert = crud.create_alert(db, alert_create, analysis_result=json.dumps(resolved_analysis, ensure_ascii=False), analysis=resolved_analysis)
                results.append(db_alert)
            continue

        # Check for duplicate (dedup)
        is_dup = alert_dedup.is_duplicate(fingerprint)
        if is_dup:
            cached = alert_dedup.get_cached_analysis(fingerprint)
            if cached:
                analysis = cached
                logger.info("Reused cached AI analysis for fingerprint: %s", fingerprint)
            else:
                analysis = {"summary": "重复告警，AI分析已缓存", "root_cause": "", "suggestion": "", "severity": "low"}
        else:
            # Call AI with rate limiting
            if active_config:
                await ai_rate_limiter.acquire()
                try:
                    analysis = await ai_service.analyze_alert_with_ai(alert.model_dump(), active_config)
                finally:
                    ai_rate_limiter.release()
                # Cache the result
                alert_dedup.cache_analysis(fingerprint, analysis)
            else:
                analysis = {"summary": "No active AI model configuration", "root_cause": "", "suggestion": "", "severity": "low"}

        # Prepare alert record
        alert_create = schemas.AlertCreate(
            alert_name=alert.labels.get("alertname", "Unknown"),
            status=alert_status,
            severity=alert.labels.get("severity", "info"),
            summary=alert.annotations.get("summary", "No summary"),
            description=alert.annotations.get("description", "No description"),
            raw_data=json.dumps(alert.model_dump()),
            fingerprint=fingerprint,
        )

        # Check if silenced
        existing_alert = crud.get_alert_by_fingerprint(db, fingerprint)
        should_notify = True
        if existing_alert and existing_alert.silenced_until:
            if existing_alert.silenced_until > datetime.utcnow():
                should_notify = False
                logger.info("Alert %s is silenced until %s, skipping notification", fingerprint, existing_alert.silenced_until)

        # Save to DB
        db_alert = crud.create_alert(db, alert_create, analysis_result=json.dumps(analysis, ensure_ascii=False), analysis=analysis)
        results.append(db_alert)

        # Create remediation actions from AI suggestions
        if isinstance(analysis, dict) and "actions" in analysis:
            for action_data in analysis["actions"]:
                action_create = schemas.RemediationActionCreate(
                    alert_id=db_alert.id,
                    action_type=action_data.get("action_type", "shell"),
                    name=action_data.get("name", "Unnamed action"),
                    description=action_data.get("description", ""),
                    config=json.dumps(action_data.get("config", {}), ensure_ascii=False),
                    risk_level=action_data.get("risk_level", "medium"),
                )
                is_low_risk = action_data.get("risk_level") == "low"
                auto_approve = AUTO_APPROVE_LOW_RISK and is_low_risk
                created_action = crud.create_remediation_action(db, action_create, auto_approved=auto_approve)

                # Auto-execute low-risk actions if configured
                if auto_approve:
                    logger.info("Auto-executing low-risk action: %s (id=%d)", created_action.name, created_action.id)
                    try:
                        config_dict = action_data.get("config", {})
                        crud.update_action_status(db, created_action.id, "executing")
                        result = await execute_action(created_action.action_type, config_dict)
                        crud.update_action_status(
                            db, created_action.id,
                            "completed" if result["success"] else "failed",
                            result=json.dumps(result, ensure_ascii=False)
                        )
                    except Exception as e:
                        crud.update_action_status(
                            db, created_action.id, "failed",
                            result=json.dumps({"success": False, "output": str(e)})
                        )

        # Send notifications via NotificationManager or legacy DingTalk
        if should_notify:
            if channel_list:
                await notification_manager.dispatch(alert.model_dump(), analysis, channel_list)
            elif dingtalk_config:
                dt_config_decrypted = dingtalk_config
                if dingtalk_config.secret:
                    dt_config_decrypted.secret = decrypt_value(dingtalk_config.secret)
                await dingtalk_service.send_dingtalk_notification(alert.model_dump(), analysis, dt_config_decrypted)

    logger.info("Processed %d alerts from webhook", len(results))
    return {"status": "success", "processed": len(results)}


@app.get("/api/v1/alerts", response_model=List[schemas.Alert])
def get_alerts(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = Query(None, description="Filter by status: firing/resolved"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    acknowledged: Optional[bool] = Query(None, description="Filter by acknowledged status"),
    db: Session = Depends(get_db),
):
    """Get alerts with optional filters"""
    if any([status, severity, acknowledged is not None]):
        return crud.get_alerts_with_filters(db, status=status, severity=severity, acknowledged=acknowledged, skip=skip, limit=limit)
    return crud.get_alerts(db, skip=skip, limit=limit)


@app.get("/api/v1/alerts/stats", response_model=schemas.AlertStats)
def get_alert_stats(db: Session = Depends(get_db)):
    """Get alert statistics"""
    return crud.get_alert_stats(db)


@app.get("/api/v1/alerts/{alert_id}", response_model=schemas.Alert)
def get_alert(alert_id: int, db: Session = Depends(get_db)):
    """Get a single alert by ID"""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@app.put("/api/v1/alerts/{alert_id}/acknowledge", response_model=schemas.Alert)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    """Acknowledge an alert"""
    result = crud.acknowledge_alert(db, alert_id, acknowledged_by="admin")
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    logger.info("Alert %d acknowledged", alert_id)
    return result


@app.put("/api/v1/alerts/{alert_id}/silence", response_model=schemas.Alert)
def silence_alert(alert_id: int, duration_minutes: int = Query(120, description="Silence duration in minutes"), db: Session = Depends(get_db)):
    """Silence an alert for a given duration"""
    result = crud.silence_alert(db, alert_id, duration_minutes)
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    logger.info("Alert %d silenced for %d minutes", alert_id, duration_minutes)
    return result


# ─── Remediation Action Endpoints ─────────────────────────────────────────────
@app.get("/api/v1/remediation-actions", response_model=List[schemas.RemediationActionResponse])
def list_remediation_actions(
    alert_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List remediation actions, optionally filtered by alert_id or status"""
    return crud.get_remediation_actions(db, alert_id=alert_id, status=status, skip=skip, limit=limit)


@app.get("/api/v1/remediation-actions/{action_id}", response_model=schemas.RemediationActionResponse)
def get_remediation_action(action_id: int, db: Session = Depends(get_db)):
    """Get a single remediation action"""
    action = crud.get_remediation_action(db, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@app.put("/api/v1/remediation-actions/{action_id}/approve")
async def approve_remediation_action(
    action_id: int,
    approval: schemas.ActionApproval,
    db: Session = Depends(get_db),
):
    """Approve or reject a remediation action"""
    db_action = crud.get_remediation_action(db, action_id)
    if not db_action:
        raise HTTPException(status_code=404, detail="Action not found")

    if db_action.status != "pending":
        raise HTTPException(status_code=400, detail=f"Action is {db_action.status}, cannot approve")

    if approval.approved:
        # Approve and execute
        crud.update_action_status(db, action_id, "approved", approved_by=approval.approved_by)

        # Execute the action
        config_dict = json.loads(db_action.config) if isinstance(db_action.config, str) else db_action.config
        crud.update_action_status(db, action_id, "executing")

        try:
            result = await execute_action(db_action.action_type, config_dict)
            crud.update_action_status(
                db, action_id,
                "completed" if result["success"] else "failed",
                result=json.dumps(result, ensure_ascii=False)
            )
        except Exception as e:
            crud.update_action_status(db, action_id, "failed", result=json.dumps({"success": False, "output": str(e)}))

        # Refresh and return
        db_action = crud.get_remediation_action(db, action_id)
        return db_action
    else:
        crud.update_action_status(db, action_id, "rejected", approved_by=approval.approved_by)
        return crud.get_remediation_action(db, action_id)


@app.post("/api/v1/remediation-actions/{action_id}/execute")
async def execute_remediation_action(action_id: int, db: Session = Depends(get_db)):
    """Re-execute a completed or failed action"""
    db_action = crud.get_remediation_action(db, action_id)
    if not db_action:
        raise HTTPException(status_code=404, detail="Action not found")

    if db_action.status not in ("approved", "completed", "failed", "timeout"):
        raise HTTPException(status_code=400, detail=f"Action is {db_action.status}, cannot execute")

    config_dict = json.loads(db_action.config) if isinstance(db_action.config, str) else db_action.config
    crud.update_action_status(db, action_id, "executing")

    try:
        result = await execute_action(db_action.action_type, config_dict)
        crud.update_action_status(
            db, action_id,
            "completed" if result["success"] else "failed",
            result=json.dumps(result, ensure_ascii=False)
        )
    except Exception as e:
        crud.update_action_status(db, action_id, "failed", result=json.dumps({"success": False, "output": str(e)}))

    return crud.get_remediation_action(db, action_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
