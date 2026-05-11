from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

import models, schemas, crud, ai_service
from alert_dedup import alert_dedup, ai_rate_limiter
from alert_router import route_alert
from alert_suppressor import should_suppress
from escalation_engine import match_escalation_policy, run_escalation_check
from remediation_recommender import recommend_remediations
from chatops_engine import handle_chatops
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_auth, encrypt_value, decrypt_value,
    require_role,
)
from notification.manager import notification_manager
from database import engine, get_db
from logger import logger
from action_executor import execute_action, AUTO_APPROVE_LOW_RISK

models.Base.metadata.create_all(bind=engine)

# Lifespan: init admin user on startup (skipped when SKIP_ADMIN_INIT=1 for tests)
@asynccontextmanager
async def lifespan(app):
    if os.environ.get("SKIP_ADMIN_INIT") != "1":
        db_gen = get_db()
        db = next(db_gen)
        try:
            if crud.count_users(db) == 0:
                admin_username = os.environ.get("ADMIN_USERNAME", "admin")
                admin_password = os.environ.get("ADMIN_PASSWORD", "admin@123")
                existing = crud.get_user_by_username(db, admin_username)
                if not existing:
                    hashed = hash_password(admin_password)
                    user = models.User(username=admin_username, hashed_password=hashed, role="admin", is_active=True, display_name="管理员")
                    db.add(user)
                    db.commit()
                    logger.info("Initialized admin user: %s", admin_username)
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass

        # Migrate legacy DingTalk configs to notification channels
        try:
            from models import DingTalkConfig, NotificationChannel
            legacy_configs = db.query(DingTalkConfig).all()
            for lc in legacy_configs:
                existing = db.query(NotificationChannel).filter(NotificationChannel.name == f"DingTalk-{lc.id}").first()
                if not existing:
                    config_dict = {"webhook_url": lc.webhook_url}
                    if lc.secret:
                        config_dict["secret"] = lc.secret  # already encrypted
                    channel = NotificationChannel(
                        name=f"DingTalk-{lc.id}",
                        channel_type="dingtalk",
                        config=json.dumps(config_dict, ensure_ascii=False),
                        is_active=lc.is_active,
                    )
                    db.add(channel)
            if legacy_configs:
                db.commit()
                logger.info("Migrated %d DingTalk configs to notification channels", len(legacy_configs))
        except Exception as e:
            logger.warning("DingTalk migration skipped: %s", e)

        # Initialize default remediation templates
        try:
            crud.init_default_templates(db)
        except Exception as e:
            logger.warning("Template init skipped: %s", e)

    # ─── Background escalation checker ────────────────────────────────────
    import asyncio

    async def escalation_loop():
        while True:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                db_gen = get_db()
                db = next(db_gen)
                try:
                    def get_channels_by_ids(channel_ids):
                        return [channel_map[cid] for cid in channel_ids if cid in channel_map]
                    # Rebuild channel_map from DB
                    active_channels = crud.get_active_notification_channels(db)
                    global channel_map
                    channel_map = {}
                    for ch in active_channels:
                        config_dict = json.loads(ch.config) if isinstance(ch.config, str) else ch.config
                        sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
                        for key in sensitive_keys:
                            if key in config_dict:
                                config_dict[key] = decrypt_value(str(config_dict[key]))
                        channel_map[ch.id] = {"channel_type": ch.channel_type, "name": ch.name, "config": config_dict}
                    await run_escalation_check(db, notification_manager, get_channels_by_ids)
                except Exception as e:
                    logger.error("Escalation check error: %s", e)
                finally:
                    try:
                        next(db_gen)
                    except StopIteration:
                        pass
            except asyncio.CancelledError:
                break

    task = asyncio.create_task(escalation_loop())
    yield
    task.cancel()
    # ─── End background task ───────────────────────────────────────────────

app = FastAPI(title="Meerkat AI Bot API", lifespan=lifespan)

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
    """Register first user (open when no users exist). After that, use admin user management."""
    # Only allow registration when no users exist (first-time setup)
    if crud.count_users(db) > 0:
        raise HTTPException(status_code=403, detail="已有用户存在，请使用管理员账号创建用户")
    
    if crud.get_user_by_username(db, user_data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    hashed = hash_password(user_data.password)
    user = crud.create_user(db, user_data.username, hashed)
    # First user is always admin
    user.role = "admin"
    user.display_name = "管理员"
    db.commit()
    db.refresh(user)
    logger.info("First user registered as admin: %s", user_data.username)
    return user


@app.post("/api/v1/auth/login")
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Login and get JWT token"""
    user = crud.get_user_by_username(db, login_data.username)
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="用户已被禁用")

    token = create_access_token(data={"sub": user.username, "role": user.role})
    logger.info("User logged in: %s (role=%s)", user.username, user.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "display_name": user.display_name,
    }


@app.get("/api/v1/auth/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Get current user info"""
    if current_user is None:
        raise HTTPException(status_code=401, detail="未登录")
    return current_user


# ─── User Management Endpoints (Admin Only) ──────────────────────────────────
@app.get("/api/v1/users", response_model=List[schemas.UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    """List all users (admin only)"""
    return crud.get_users(db, skip=skip, limit=limit)


@app.post("/api/v1/users", response_model=schemas.UserResponse)
def create_user(
    user_data: schemas.UserCreateByAdmin,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    """Create a new user (admin only)"""
    if crud.get_user_by_username(db, user_data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    if user_data.role not in ("admin", "operator", "viewer"):
        raise HTTPException(status_code=400, detail="无效的角色，可选: admin, operator, viewer")
    
    hashed = hash_password(user_data.password)
    user = crud.create_user(db, user_data.username, hashed)
    user.role = user_data.role
    user.display_name = user_data.display_name
    db.commit()
    db.refresh(user)
    logger.info("Admin %s created user: %s (role=%s)", current_user.username, user_data.username, user_data.role)
    return user


@app.put("/api/v1/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    """Update a user (admin only)"""
    db_user = crud.get_user_by_id(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # Prevent admin from deactivating themselves
    if db_user.id == current_user.id and user_data.is_active is False:
        raise HTTPException(status_code=400, detail="不能禁用自己的账号")
    
    # Prevent admin from demoting themselves
    if db_user.id == current_user.id and user_data.role and user_data.role != "admin":
        raise HTTPException(status_code=400, detail="不能降低自己的角色等级")
    
    updates = {}
    if user_data.display_name is not None:
        updates["display_name"] = user_data.display_name
    if user_data.role is not None:
        if user_data.role not in ("admin", "operator", "viewer"):
            raise HTTPException(status_code=400, detail="无效的角色")
        updates["role"] = user_data.role
    if user_data.is_active is not None:
        updates["is_active"] = user_data.is_active
    if user_data.password is not None:
        updates["hashed_password"] = hash_password(user_data.password)
    
    result = crud.update_user(db, user_id, updates)
    logger.info("Admin %s updated user id=%d: %s", current_user.username, user_id, list(updates.keys()))
    return result


@app.delete("/api/v1/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    """Delete a user (admin only)"""
    db_user = crud.get_user_by_id(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    
    crud.delete_user(db, user_id)
    logger.info("Admin %s deleted user: %s", current_user.username, db_user.username)
    return {"message": "用户已删除"}


# ─── Model Config Endpoints ───────────────────────────────────────────────────
@app.post("/api/v1/model-configs", response_model=schemas.ModelConfig)
def create_config(config: schemas.ModelConfigCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    # Encrypt API key before saving
    config_data = config.model_dump()
    config_data["api_key"] = encrypt_value(config_data["api_key"])
    db_config = crud.create_model_config(db=db, config=schemas.ModelConfigCreate(**config_data))
    return db_config

@app.get("/api/v1/model-configs", response_model=List[schemas.ModelConfig])
def read_configs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    configs = crud.get_model_configs(db, skip=skip, limit=limit)
    for c in configs:
        if c.api_key:
            try: c.api_key = decrypt_value(c.api_key)
            except: pass
    return configs


@app.get("/api/v1/model-configs/active", response_model=schemas.ModelConfig)
def read_active_config(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    config = crud.get_active_model_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active config found")
    if config.api_key:
        try: config.api_key = decrypt_value(config.api_key)
        except: pass
    return config

@app.put("/api/v1/model-configs/{config_id}", response_model=schemas.ModelConfig)
def update_config(config_id: int, config: schemas.ModelConfigCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    config_data = config.model_dump()
    # If api_key is masked (contains ***), keep the existing encrypted value
    if config_data["api_key"] and "****" in config_data["api_key"]:
        existing = crud.get_model_config(db, config_id)
        if existing and existing.api_key:
            config_data["api_key"] = existing.api_key
        else:
            raise HTTPException(status_code=400, detail="Cannot update: no existing API key found")
    elif config_data["api_key"]:
        config_data["api_key"] = encrypt_value(config_data["api_key"])
    db_config = crud.update_model_config(db, config_id, schemas.ModelConfigCreate(**config_data))
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    # Return decrypted api_key
    if db_config.api_key:
        try: db_config.api_key = decrypt_value(db_config.api_key)
        except: pass
    return db_config


@app.delete("/api/v1/model-configs/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
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




# ─── Notification Channel Endpoints ───────────────────────────────────────────
@app.get("/api/v1/notification-channels", response_model=List[schemas.NotificationChannelResponse])
def list_notification_channels(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    channels = crud.get_notification_channels(db)
    for ch in channels:
        if ch.config:
            try:
                config_dict = json.loads(ch.config) if isinstance(ch.config, str) else ch.config
                sensitive_keys = ["api_key", "secret", "password", "smtp_password", "token", "webhook_secret"]
                for key in sensitive_keys:
                    if key in config_dict and config_dict[key]:
                        try: config_dict[key] = decrypt_value(str(config_dict[key]))
                        except: pass
                ch.config = json.dumps(config_dict, ensure_ascii=False)
            except: pass
    return channels


@app.post("/api/v1/notification-channels", response_model=schemas.NotificationChannelResponse)
def create_notification_channel(channel: schemas.NotificationChannelCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    # Encrypt sensitive fields in config JSON
    config_dict = json.loads(channel.config) if isinstance(channel.config, str) else channel.config
    sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
    for key in sensitive_keys:
        if key in config_dict:
            config_dict[key] = encrypt_value(str(config_dict[key]))
    channel.config = json.dumps(config_dict, ensure_ascii=False)
    return crud.create_notification_channel(db, channel)


@app.put("/api/v1/notification-channels/{channel_id}", response_model=schemas.NotificationChannelResponse)
def update_notification_channel(channel_id: int, channel: schemas.NotificationChannelCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    config_dict = json.loads(channel.config) if isinstance(channel.config, str) else channel.config
    sensitive_keys = ["api_key", "secret", "password", "smtp_password", "token", "webhook_secret"]
    # Get existing config for masked value preservation
    existing = crud.get_notification_channel(db, channel_id)
    existing_config = {}
    if existing and existing.config:
        try: existing_config = json.loads(existing.config) if isinstance(existing.config, str) else existing.config
        except: pass
    for key in sensitive_keys:
        if key in config_dict and config_dict[key]:
            val = str(config_dict[key])
            if "*" in val:
                # Masked value — keep existing encrypted one
                if key in existing_config:
                    config_dict[key] = existing_config[key]
            else:
                config_dict[key] = encrypt_value(val)
    channel.config = json.dumps(config_dict, ensure_ascii=False)
    result = crud.update_notification_channel(db, channel_id, channel)
    if not result:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Return with decrypted sensitive values
    if result.config:
        try:
            rd = json.loads(result.config) if isinstance(result.config, str) else result.config
            for key in sensitive_keys:
                if key in rd and rd[key]:
                    try: rd[key] = decrypt_value(str(rd[key]))
                    except: pass
            result.config = json.dumps(rd, ensure_ascii=False)
        except: pass
    return result


@app.delete("/api/v1/notification-channels/{channel_id}")
def delete_notification_channel(channel_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    crud.delete_notification_channel(db, channel_id)
    return {"message": "Deleted successfully"}


@app.post("/api/v1/notification-channels/test")
async def test_notification_channel_config(channel: schemas.NotificationChannelCreate, _user: models.User = Depends(get_current_user)):
    """Test a notification channel config before saving"""
    try:
        config_dict = json.loads(channel.config) if isinstance(channel.config, str) else channel.config
        # Do NOT decrypt here — the frontend sends plaintext values for new channels
        success = await notification_manager.test_channel(channel.channel_type, config_dict)
        if success:
            return {"status": "success", "message": f"测试消息已发送到 {channel.name}"}
        else:
            raise HTTPException(status_code=400, detail=f"渠道测试失败: {channel.name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"渠道测试失败: {str(e)}")


@app.post("/api/v1/notification-channels/{channel_id}/test")
async def test_notification_channel(channel_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
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
    logger.info("Received webhook: receiver=%s status=%s alerts=%d", webhook_data.receiver, webhook_data.status, len(webhook_data.alerts))
    active_config = crud.get_active_model_config(db)

    # Decrypt API key for AI service
    if active_config and active_config.api_key:
        active_config.api_key = decrypt_value(active_config.api_key)

    # Get all active notification channels
    active_channels = crud.get_active_notification_channels(db)

    # Build channel lookup: id -> channel dict (with decrypted config)
    channel_map = {}
    for ch in active_channels:
        config_dict = json.loads(ch.config) if isinstance(ch.config, str) else ch.config
        sensitive_keys = ["api_key", "secret", "password", "smtp_password"]
        for key in sensitive_keys:
            if key in config_dict:
                config_dict[key] = decrypt_value(str(config_dict[key]))
        channel_map[ch.id] = {
            "channel_type": ch.channel_type,
            "name": ch.name,
            "config": config_dict,
        }

    # Clean expired dedup cache periodically
    alert_dedup.clear_expired()

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
                # Send resolved notification via all active channels
                resolved_analysis = {
                    "summary": f"✅ 告警已恢复: {existing.alert_name}",
                    "root_cause": "",
                    "suggestion": "",
                    "severity": "info"
                }
                # Use NotificationManager if channels configured
                all_channels = list(channel_map.values())
                if all_channels:
                    await notification_manager.dispatch(alert.model_dump(), resolved_analysis, all_channels)
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

        # ─── Suppression check ────────────────────────────────────────
        alert_labels = alert.labels
        alert_sev = alert.labels.get("severity", "info")
        suppressed, suppress_reason = should_suppress(alert_labels, alert_sev, fingerprint, db)

        if suppressed:
            logger.info("Alert %s suppressed: %s", fingerprint, suppress_reason)
            # Still save to DB but skip AI and notification
            alert_create = schemas.AlertCreate(
                alert_name=alert.labels.get("alertname", "Unknown"),
                status=alert_status,
                severity=alert_sev,
                summary=alert.annotations.get("summary", "No summary"),
                description=alert.annotations.get("description", "No description"),
                raw_data=json.dumps(alert.model_dump()),
                fingerprint=fingerprint,
            )
            analysis = {"summary": f"已抑制: {suppress_reason}", "root_cause": "", "suggestion": "", "severity": "info"}
            db_alert = crud.create_alert(db, alert_create, analysis_result=json.dumps(analysis, ensure_ascii=False), analysis=analysis)
            crud.create_audit_log(db, action="alert.suppressed", resource_type="alert", resource_id=db_alert.id,
                                  detail=json.dumps({"fingerprint": fingerprint, "reason": suppress_reason}, ensure_ascii=False))
            results.append(db_alert)
            continue
        # ─── End suppression check ────────────────────────────────────

        if is_dup:
            cached = alert_dedup.get_cached_analysis(fingerprint)
            if cached:
                analysis = cached
                logger.info("Reused cached AI analysis for fingerprint: %s", fingerprint)
            else:
                analysis = {"summary": "重复告警，AI分析已缓存", "root_cause": "", "suggestion": "", "severity": "low"}
        else:
            # Call AI with rate limiting + timeout
            if active_config:
                await ai_rate_limiter.acquire()
                try:
                    import asyncio
                    analysis = await asyncio.wait_for(
                        ai_service.analyze_alert_with_ai(alert.model_dump(), active_config),
                        timeout=15.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("AI analysis timed out for alert %s, using fallback", alert.labels.get("alertname", "unknown"))
                    analysis = {"summary": "AI 分析超时，请稍后重试", "root_cause": "", "suggestion": "", "severity": "low"}
                except Exception as e:
                    logger.warning("AI analysis failed for alert %s: %s", alert.labels.get("alertname", "unknown"), e)
                    analysis = {"summary": f"AI 分析失败: {str(e)[:80]}", "root_cause": "", "suggestion": "", "severity": "low"}
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

        # ─── Template-based remediation recommendations ───────────────────────
        if alert_status == "firing" and db_alert:
            try:
                template_actions = await recommend_remediations(db, db_alert, analysis, ai_service)
                if template_actions:
                    logger.info("Recommended %d remediation actions for alert %d", len(template_actions), db_alert.id)
            except Exception as e:
                logger.warning("Template recommendation failed: %s", e)
        # ─── End template recommendations ────────────────────────────────────

        # Send notifications via NotificationManager (with routing)
        if should_notify:
            # ─── Routing: match alert to target channels ─────────────
            routed_ids = route_alert(alert.labels, alert.labels.get("severity", "info"), db)
            if routed_ids is not None:
                # Use routed channels
                channel_list = [channel_map[cid] for cid in routed_ids if cid in channel_map]
            else:
                # No routing rule matched — use all active channels (default)
                channel_list = list(channel_map.values())
            # ─── End routing ──────────────────────────────────────────

            if channel_list:
                # Add on-call user info to notification context
                oncall_user = crud.get_current_oncall_user(db)
                oncall_info = ""
                if oncall_user:
                    oncall_info = f"\n\n👤 当前值班: {oncall_user.display_name or oncall_user.username}"
                    analysis_with_oncall = dict(analysis) if isinstance(analysis, dict) else {"summary": str(analysis)}
                    analysis_with_oncall["oncall"] = oncall_info
                else:
                    analysis_with_oncall = analysis
                await notification_manager.dispatch(alert.model_dump(), analysis_with_oncall, channel_list)

            # ─── Escalation: create event if policy matches ──────────────
            escalation_policies = crud.get_active_escalation_policies(db)
            matched_policy = match_escalation_policy(alert.labels, alert.labels.get("severity", "info"), escalation_policies)
            if matched_policy and alert_status == "firing":
                crud.create_escalation_event(db, alert_id=db_alert.id, policy_id=matched_policy.id)
                logger.info("Created escalation event for alert %d (policy: %s)", db_alert.id, matched_policy.name)
            # ─── End escalation ───────────────────────────────────────────

    logger.info("Processed %d alerts from webhook", len(results))
    return {"status": "success", "processed": len(results)}


@app.get("/api/v1/alerts", response_model=List[schemas.Alert])
def get_alerts(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = Query(None, description="Filter by status: firing/resolved"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    acknowledged: Optional[bool] = Query(None, description="Filter by acknowledged status"),
    db: Session = Depends(get_db), _user: models.User = Depends(get_current_user),
):
    """Get alerts with optional filters"""
    if any([status, severity, acknowledged is not None]):
        return crud.get_alerts_with_filters(db, status=status, severity=severity, acknowledged=acknowledged, skip=skip, limit=limit)
    return crud.get_alerts(db, skip=skip, limit=limit)


@app.get("/api/v1/alerts/stats", response_model=schemas.AlertStats)
def get_alert_stats(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """Get alert statistics"""
    return crud.get_alert_stats(db)

@app.get("/api/v1/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """Get full dashboard statistics including all subsystems"""
    return crud.get_dashboard_stats(db)


@app.get("/api/v1/alerts/{alert_id}", response_model=schemas.Alert)
def get_alert(alert_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """Get a single alert by ID"""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@app.put("/api/v1/alerts/{alert_id}/acknowledge", response_model=schemas.Alert)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    """Acknowledge an alert"""
    result = crud.acknowledge_alert(db, alert_id, acknowledged_by=_user.username)
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="alert.acknowledge", resource_type="alert", resource_id=alert_id)
    # Stop escalation for this alert
    for ev in crud.get_active_escalation_events(db):
        if ev.alert_id == alert_id:
            crud.update_escalation_event(db, ev.id, status="acknowledged")
    logger.info("Alert %d acknowledged", alert_id)
    return result


@app.put("/api/v1/alerts/{alert_id}/silence", response_model=schemas.Alert)
def silence_alert(alert_id: int, duration_minutes: int = Query(120, description="Silence duration in minutes"), db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    """Silence an alert for a given duration"""
    result = crud.silence_alert(db, alert_id, duration_minutes)
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="alert.silence", resource_type="alert", resource_id=alert_id,
                          detail=json.dumps({"duration_minutes": duration_minutes}))
    logger.info("Alert %d silenced for %d minutes", alert_id, duration_minutes)
    return result


# ─── Remediation Action Endpoints ─────────────────────────────────────────────
@app.get("/api/v1/remediation-actions", response_model=List[schemas.RemediationActionResponse])
def list_remediation_actions(
    alert_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db), _user: models.User = Depends(get_current_user),
):
    """List remediation actions, optionally filtered by alert_id or status"""
    return crud.get_remediation_actions(db, alert_id=alert_id, status=status, skip=skip, limit=limit)


@app.get("/api/v1/remediation-actions/{action_id}", response_model=schemas.RemediationActionResponse)
def get_remediation_action(action_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """Get a single remediation action"""
    action = crud.get_remediation_action(db, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return action


@app.put("/api/v1/remediation-actions/{action_id}/approve")
async def approve_remediation_action(
    action_id: int,
    approval: schemas.ActionApproval,
    db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator")),
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
async def execute_remediation_action(action_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
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


# ─── Routing Rule Endpoints ────────────────────────────────────────────────
@app.get("/api/v1/routing-rules", response_model=List[schemas.RoutingRuleResponse])
def list_routing_rules(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_routing_rules(db)

@app.post("/api/v1/routing-rules", response_model=schemas.RoutingRuleResponse)
def create_routing_rule(rule: schemas.RoutingRuleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    db_rule = crud.create_routing_rule(db, rule)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="routing_rule.create", resource_type="routing_rule", resource_id=db_rule.id,
                          detail=json.dumps({"name": rule.name}, ensure_ascii=False))
    return db_rule

@app.put("/api/v1/routing-rules/{rule_id}", response_model=schemas.RoutingRuleResponse)
def update_routing_rule(rule_id: int, rule: schemas.RoutingRuleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    db_rule = crud.update_routing_rule(db, rule_id, rule)
    if not db_rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="routing_rule.update", resource_type="routing_rule", resource_id=rule_id)
    return db_rule

@app.delete("/api/v1/routing-rules/{rule_id}")
def delete_routing_rule(rule_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    db_rule = crud.delete_routing_rule(db, rule_id)
    if not db_rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="routing_rule.delete", resource_type="routing_rule", resource_id=rule_id)
    return {"status": "deleted"}

# ─── Suppression Rule Endpoints ────────────────────────────────────────────
@app.get("/api/v1/suppression-rules", response_model=List[schemas.SuppressionRuleResponse])
def list_suppression_rules(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_suppression_rules(db)

@app.post("/api/v1/suppression-rules", response_model=schemas.SuppressionRuleResponse)
def create_suppression_rule(rule: schemas.SuppressionRuleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    db_rule = crud.create_suppression_rule(db, rule)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="suppression_rule.create", resource_type="suppression_rule", resource_id=db_rule.id,
                          detail=json.dumps({"name": rule.name}, ensure_ascii=False))
    return db_rule

@app.put("/api/v1/suppression-rules/{rule_id}", response_model=schemas.SuppressionRuleResponse)
def update_suppression_rule(rule_id: int, rule: schemas.SuppressionRuleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    db_rule = crud.update_suppression_rule(db, rule_id, rule)
    if not db_rule:
        raise HTTPException(status_code=404, detail="Suppression rule not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="suppression_rule.update", resource_type="suppression_rule", resource_id=rule_id)
    return db_rule

@app.delete("/api/v1/suppression-rules/{rule_id}")
def delete_suppression_rule(rule_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    db_rule = crud.delete_suppression_rule(db, rule_id)
    if not db_rule:
        raise HTTPException(status_code=404, detail="Suppression rule not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="suppression_rule.delete", resource_type="suppression_rule", resource_id=rule_id)
    return {"status": "deleted"}

# ─── Audit Log Endpoints ───────────────────────────────────────────────────
@app.get("/api/v1/audit-logs", response_model=List[schemas.AuditLogResponse])
def list_audit_logs(
    skip: int = 0, limit: int = 100,
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    db: Session = Depends(get_db), _user: models.User = Depends(require_role("admin")),
):
    return crud.get_audit_logs(db, skip=skip, limit=limit, action=action, resource_type=resource_type)

# ─── On-Call Schedule Endpoints ────────────────────────────────────────────
@app.get("/api/v1/oncall-schedules", response_model=List[schemas.OnCallScheduleResponse])
def list_oncall_schedules(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_oncall_schedules(db)

@app.post("/api/v1/oncall-schedules", response_model=schemas.OnCallScheduleResponse)
def create_oncall_schedule(schedule: schemas.OnCallScheduleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.create_oncall_schedule(db, schedule)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="oncall.create", resource_type="oncall_schedule", resource_id=result.get("id", result.id),
                          detail=json.dumps({"name": schedule.name}, ensure_ascii=False))
    return result

@app.put("/api/v1/oncall-schedules/{schedule_id}", response_model=schemas.OnCallScheduleResponse)
def update_oncall_schedule(schedule_id: int, schedule: schemas.OnCallScheduleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.update_oncall_schedule(db, schedule_id, schedule)
    if not result:
        raise HTTPException(status_code=404, detail="Schedule not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="oncall.update", resource_type="oncall_schedule", resource_id=schedule_id)
    return result

@app.delete("/api/v1/oncall-schedules/{schedule_id}")
def delete_oncall_schedule(schedule_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.delete_oncall_schedule(db, schedule_id)
    if not result:
        raise HTTPException(status_code=404, detail="Schedule not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="oncall.delete", resource_type="oncall_schedule", resource_id=schedule_id)
    return {"status": "deleted"}

@app.get("/api/v1/oncall-current")
def get_current_oncall(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    user = crud.get_current_oncall_user(db)
    if user:
        return {"user_id": user.id, "username": user.username, "display_name": user.display_name}
    return {"user_id": None, "username": None, "display_name": None}

# ─── Escalation Policy Endpoints ───────────────────────────────────────────
@app.get("/api/v1/escalation-policies", response_model=List[schemas.EscalationPolicyResponse])
def list_escalation_policies(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_escalation_policies(db)

@app.post("/api/v1/escalation-policies", response_model=schemas.EscalationPolicyResponse)
def create_escalation_policy(policy: schemas.EscalationPolicyCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.create_escalation_policy(db, policy)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="escalation.create", resource_type="escalation_policy", resource_id=result.id,
                          detail=json.dumps({"name": policy.name}, ensure_ascii=False))
    return result

@app.put("/api/v1/escalation-policies/{policy_id}", response_model=schemas.EscalationPolicyResponse)
def update_escalation_policy(policy_id: int, policy: schemas.EscalationPolicyCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.update_escalation_policy(db, policy_id, policy)
    if not result:
        raise HTTPException(status_code=404, detail="Escalation policy not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="escalation.update", resource_type="escalation_policy", resource_id=policy_id)
    return result

@app.delete("/api/v1/escalation-policies/{policy_id}")
def delete_escalation_policy(policy_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.delete_escalation_policy(db, policy_id)
    if not result:
        raise HTTPException(status_code=404, detail="Escalation policy not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="escalation.delete", resource_type="escalation_policy", resource_id=policy_id)
    return {"status": "deleted"}

# ─── Escalation Event Endpoints ────────────────────────────────────────────
@app.get("/api/v1/escalation-events", response_model=List[schemas.EscalationEventResponse])
def list_escalation_events(status: Optional[str] = Query(None), db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_escalation_events(db, status=status)

# ─── Remediation Template Endpoints ────────────────────────────────────────
@app.get("/api/v1/remediation-templates", response_model=List[schemas.RemediationTemplateResponse])
def list_remediation_templates(category: Optional[str] = Query(None), db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_remediation_templates(db, category=category)

@app.get("/api/v1/remediation-templates/{template_id}", response_model=schemas.RemediationTemplateResponse)
def get_remediation_template(template_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    tmpl = crud.get_remediation_template(db, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl

@app.post("/api/v1/remediation-templates", response_model=schemas.RemediationTemplateResponse)
def create_remediation_template(template: schemas.RemediationTemplateCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.create_remediation_template(db, template)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="template.create", resource_type="remediation_template", resource_id=result.id,
                          detail=json.dumps({"name": template.name}, ensure_ascii=False))
    return result

@app.put("/api/v1/remediation-templates/{template_id}", response_model=schemas.RemediationTemplateResponse)
def update_remediation_template(template_id: int, template: schemas.RemediationTemplateCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.update_remediation_template(db, template_id, template)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="template.update", resource_type="remediation_template", resource_id=template_id)
    return result

@app.delete("/api/v1/remediation-templates/{template_id}")
def delete_remediation_template(template_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.delete_remediation_template(db, template_id)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="template.delete", resource_type="remediation_template", resource_id=template_id)
    return {"status": "deleted"}

@app.post("/api/v1/remediation-templates/{template_id}/apply/{alert_id}", response_model=schemas.RemediationActionResponse)
def apply_template_to_alert(template_id: int, alert_id: int, params: Optional[dict] = None, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    """Manually apply a template to an alert, filling placeholders."""
    tmpl = crud.get_remediation_template(db, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    from remediation_recommender import fill_template
    raw = json.loads(alert.raw_data) if alert.raw_data else {}
    labels = raw.get("labels", {})
    context = {
        "service_name": labels.get("service", labels.get("job", "")),
        "namespace": labels.get("namespace", "default"),
        "app_name": labels.get("app", ""),
        "deployment_name": labels.get("deployment", ""),
        "instance": labels.get("instance", ""),
        **(params or {}),
    }
    filled_config = fill_template(tmpl.config_template, context)
    action_create = schemas.RemediationActionCreate(
        alert_id=alert_id, action_type=tmpl.action_type,
        name=f"[模板] {tmpl.name}", description=tmpl.description or "",
        config=filled_config, risk_level=tmpl.risk_level,
    )
    auto_approved = not tmpl.requires_approval
    result = crud.create_remediation_action(db, action_create, auto_approved=auto_approved)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="template.apply", resource_type="remediation_template", resource_id=template_id,
                          detail=json.dumps({"alert_id": alert_id}, ensure_ascii=False))
    return result

# ─── Knowledge Article Endpoints ───────────────────────────────────────────
@app.get("/api/v1/knowledge", response_model=List[schemas.KnowledgeArticleResponse])
def list_knowledge_articles(category: Optional[str] = Query(None), search: Optional[str] = Query(None), alert_name: Optional[str] = Query(None), db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_knowledge_articles(db, category=category, search=search, alert_name=alert_name)

@app.get("/api/v1/knowledge/{article_id}", response_model=schemas.KnowledgeArticleResponse)
def get_knowledge_article(article_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    article = crud.get_knowledge_article(db, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    crud.increment_article_view(db, article_id)
    return article

@app.post("/api/v1/knowledge", response_model=schemas.KnowledgeArticleResponse)
def create_knowledge_article(article: schemas.KnowledgeArticleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.create_knowledge_article(db, article, author=_user.username)
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="knowledge.create", resource_type="knowledge_article", resource_id=result.id)
    return result

@app.put("/api/v1/knowledge/{article_id}", response_model=schemas.KnowledgeArticleResponse)
def update_knowledge_article(article_id: int, article: schemas.KnowledgeArticleCreate, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.update_knowledge_article(db, article_id, article)
    if not result:
        raise HTTPException(status_code=404, detail="Article not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="knowledge.update", resource_type="knowledge_article", resource_id=article_id)
    return result

@app.delete("/api/v1/knowledge/{article_id}")
def delete_knowledge_article(article_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_role("operator"))):
    result = crud.delete_knowledge_article(db, article_id)
    if not result:
        raise HTTPException(status_code=404, detail="Article not found")
    crud.create_audit_log(db, username=_user.username, user_id=_user.id,
                          action="knowledge.delete", resource_type="knowledge_article", resource_id=article_id)
    return {"status": "deleted"}

@app.post("/api/v1/knowledge/{article_id}/helpful")
def mark_article_helpful(article_id: int, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    crud.mark_article_helpful(db, article_id)
    return {"status": "ok"}

# ─── ChatOps Endpoints ─────────────────────────────────────────────────────
@app.post("/api/v1/chat", response_model=schemas.ChatResponse)
async def chat_endpoint(req: schemas.ChatRequest, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    """ChatOps endpoint — natural language alert operations + AI chat."""
    return await handle_chatops(db, req.message, session_id=req.session_id, alert_id=req.alert_id, user=_user)

@app.get("/api/v1/chat/{session_id}", response_model=List[schemas.ChatResponse])
def get_chat_history(session_id: str, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    return crud.get_chat_history(db, session_id)

@app.get("/api/v1/chat-sessions")
def list_chat_sessions(db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    from chatops_engine import get_chat_sessions
    return get_chat_sessions(db)

@app.delete("/api/v1/chat-sessions/{session_id}")
def delete_chat_session(session_id: str, db: Session = Depends(get_db), _user: models.User = Depends(get_current_user)):
    db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).delete()
    db.commit()
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
