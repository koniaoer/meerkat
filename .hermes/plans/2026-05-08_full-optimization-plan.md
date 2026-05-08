# Meerkat 全面优化实施计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 完成8项核心优化，让Meerkat从Demo级升级为生产级告警分析系统

**Architecture:** 后端FastAPI+SQLAlchemy，前端React+AntDesign5。优化策略：先模型→再服务→再接口→再前端→最后基础设施

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, asyncio, JWT(python-jose), bcrypt, redis-like in-memory cache

---

## Task 1: 数据模型扩展

**Objective:** 为所有优化功能添加必要的数据库字段和新模型

**Files:**
- Modify: `backend/models.py` — Alert表加字段，新增User/NotificationChannel/SilenceRule模型
- Modify: `backend/schemas.py` — 新增/更新Pydantic schema
- Modify: `backend/crud.py` — 新增CRUD操作

**Step 1: 扩展Alert模型，添加字段:**
- `fingerprint` (String, index) — 告警指纹，用于去重
- `resolved_at` (DateTime, nullable) — 恢复时间
- `acknowledged` (Boolean, default=False) — 是否已确认
- `acknowledged_by` (String, nullable) — 确认人
- `acknowledged_at` (DateTime, nullable) — 确认时间
- `silenced_until` (DateTime, nullable) — 静默截止时间

**Step 2: 新增User模型:**
- `id`, `username`, `hashed_password`, `is_active`, `created_at`

**Step 3: 新增NotificationChannel模型:**
- `id`, `channel_type` (dingtalk/wechat/slack/email/webhook), `name`, `config` (JSON Text), `is_active`

**Step 4: 更新schemas.py，新增对应的Create/Response schema，更新Alert schema加新字段

**Step 5: 更新crud.py，新增:**
- `get_alert_by_fingerprint()`
- `acknowledge_alert()`, `silence_alert()`, `resolve_alert()`
- `get_alert_stats()` — 按严重程度统计
- User CRUD: create_user, get_user_by_username, authenticate_user
- NotificationChannel CRUD
- `get_alerts_with_filters()` — 支持status/severity/acknowledged筛选

**Step 6: 运行测试确保没有破坏已有功能**

---

## Task 2: 告警去重 + AI限流 + AI缓存

**Objective:** 防止告警风暴，同一fingerprint在窗口期内复用AI分析结果

**Files:**
- Create: `backend/alert_dedup.py` — 告警去重+AI缓存逻辑
- Modify: `backend/main.py` — 集成去重逻辑到receive_alert

**Step 1: 创建alert_dedup.py:**
- `AlertDeduplicator` 类，内存缓存(LRU dict)
- `is_duplicate(fingerprint, window_minutes=5)` — 窗口期内同fingerprint返回True
- `get_cached_analysis(fingerprint)` — 获取缓存的AI分析结果
- `cache_analysis(fingerprint, analysis)` — 缓存AI分析结果
- `AIRateLimiter` 类，asyncio.Semaphore实现并发限制(默认3)
- `ai_semaphore` 全局实例

**Step 2: 修改main.py的receive_alert:**
- 从alert.labels计算fingerprint（用alertname+severity+instance组合）
- 先查数据库是否已有同fingerprint的firing告警(5分钟内)
- 如果是重复告警，复用AI分析结果，不调AI，只存库+推送
- AI调用包裹在rate limiter semaphore中
- 收到resolved时调用resolve_alert标记

---

## Task 3: 告警恢复处理

**Objective:** 正确处理Alertmanager的resolved状态

**Files:**
- Modify: `backend/main.py` — receive_alert处理resolved
- Modify: `backend/crud.py` — resolve_alert逻辑
- Modify: `backend/dingtalk_service.py` — 恢复通知

**Step 1: 修改receive_alert，判断alert.status:**
- `firing`: 正常流程（去重→AI分析→存库→推送）
- `resolved`: 查找同fingerprint的firing告警，标记resolved_at，发恢复通知

**Step 2: 修改钉钉推送，恢复通知用不同模板（绿色✅标记）**

---

## Task 4: 告警确认/静默功能

**Objective:** 运维可以确认告警和设置静默期

**Files:**
- Modify: `backend/main.py` — 新增API端点
- Modify: `backend/schemas.py` — 新增请求schema

**Step 1: 新增API端点:**
- `PUT /api/v1/alerts/{alert_id}/acknowledge` — 确认告警
- `PUT /api/v1/alerts/{alert_id}/silence` — 静默告警(body: duration_minutes)
- `GET /api/v1/alerts/stats` — 告警统计(firing/resolved/各级别数量)
- `GET /api/v1/alerts` 增加查询参数: status, severity, acknowledged

**Step 2: 修改receive_alert，如果告警在静默期内，跳过钉钉推送**

---

## Task 5: 多通知渠道

**Objective:** 支持企业微信、Slack、邮件、通用Webhook

**Files:**
- Create: `backend/notification/` 目录
- Create: `backend/notification/base.py` — 通知渠道抽象基类
- Create: `backend/notification/dingtalk.py` — 重构钉钉
- Create: `backend/notification/wechat.py` — 企业微信
- Create: `backend/notification/slack.py` — Slack
- Create: `backend/notification/email_channel.py` — 邮件
- Create: `backend/notification/webhook.py` — 通用Webhook
- Create: `backend/notification/manager.py` — 通知管理器，并发推送多渠道
- Modify: `backend/main.py` — 新增渠道配置CRUD端点，修改receive_alert用manager

**Step 1: 创建notification/base.py:**
```python
from abc import ABC, abstractmethod
class NotificationChannel(ABC):
    @abstractmethod
    async def send(self, alert_data: dict, analysis: dict, config: dict): ...
    @abstractmethod
    async def test_connection(self, config: dict) -> bool: ...
```

**Step 2: 重构dingtalk_service.py为notification/dingtalk.py，实现基类**

**Step 3: 实现wechat.py（企业微信Webhook，类似钉钉）**

**Step 4: 实现slack.py（Slack Incoming Webhook）**

**Step 5: 实现email_channel.py（SMTP，用aiosmtplib）**

**Step 6: 实现webhook.py（通用HTTP POST）**

**Step 7: 实现manager.py:**
- `NotificationManager` — 管理所有活跃渠道
- `async dispatch(alert_data, analysis)` — 并发推送所有活跃渠道
- `async test_channel(channel_id)` — 测试指定渠道

**Step 8: 修改main.py:**
- 新增 `/api/v1/notification-channels` CRUD端点
- 修改receive_alert使用NotificationManager
- 保留旧钉钉端点做兼容

---

## Task 6: API鉴权 + API Key加密存储

**Objective:** JWT登录认证 + 敏感字段加密

**Files:**
- Create: `backend/auth.py` — JWT工具+密码哈希
- Modify: `backend/main.py` — 登录端点+依赖注入
- Modify: `backend/models.py` — User模型(Task 1已加)
- Modify: `backend/database.py` — 加密工具

**Step 1: 创建auth.py:**
- `hash_password(password)` → bcrypt
- `verify_password(plain, hashed)` → bcrypt
- `create_access_token(data, expires_delta)` → python-jose JWT
- `get_current_user` 依赖注入
- `SECRET_KEY` 从环境变量读取，默认生成

**Step 2: 新增API端点:**
- `POST /api/v1/auth/register` — 注册(首次注册无需认证，之后需admin)
- `POST /api/v1/auth/login` — 登录返回JWT
- `GET /api/v1/auth/me` — 当前用户信息

**Step 3: 给所有/api/v1/*端点加认证依赖(除了/auth/login和/auth/register，以及/api/v1/alerts POST)**

**Step 4: API Key加密存储 — 在ModelConfig和NotificationChannel保存时，用Fernet对称加密api_key/secret等字段**

**Step 5: requirements.txt加依赖: python-jose[cryptography], passlib[bcrypt], cryptography, aiosmtplib**

---

## Task 7: 前端告警看板增强

**Objective:** 告警详情页、统计图表、筛选器、确认/静默操作

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx` — 筛选+统计+操作
- Create: `frontend/src/pages/AlertDetail.tsx` — 告警详情页
- Create: `frontend/src/pages/NotificationChannels.tsx` — 通知渠道管理页
- Create: `frontend/src/pages/Login.tsx` — 登录页
- Modify: `frontend/src/App.tsx` — 新增路由+菜单+认证守卫
- Modify: `frontend/src/services/api.ts` — 新增API调用
- Modify: `frontend/src/services/i18n.tsx` — 新增翻译

**Step 1: 扩展api.ts，添加所有新端点调用函数**

**Step 2: 重写Dashboard.tsx:**
- 顶部统计卡片(今日告警/firing/resolved/各级别占比)
- 筛选栏(status/severity/acknowledged下拉选择)
- 表格增加操作列(确认/静默按钮)
- 点击行跳转详情页

**Step 3: 创建AlertDetail.tsx:**
- 告警基本信息卡片
- AI分析结果卡片(summary/root_cause/suggestion分开展示)
- 确认/静默操作按钮
- 历史同fingerprint告警列表

**Step 4: 创建NotificationChannels.tsx:**
- 渠道列表+新增/编辑/删除
- 支持选择渠道类型(dingtalk/wechat/slack/email/webhook)
- 每种类型显示不同配置表单
- 测试连接按钮

**Step 5: 创建Login.tsx:**
- 用户名密码登录表单
- JWT存localStorage
- axios拦截器自动带token

**Step 6: 修改App.tsx:**
- 添加路由: /alerts/:id, /notification-channels, /login
- 菜单加通知渠道
- 认证守卫(未登录跳转/login)

**Step 7: 更新i18n.tsx翻译**

---

## Task 8: 数据库升级 SQLite → PostgreSQL

**Objective:** 支持并发写入，适配生产环境

**Files:**
- Modify: `backend/database.py` — 支持PostgreSQL连接
- Modify: `backend/requirements.txt` — 加psycopg2-binary或asyncpg
- Modify: `docker-compose.yml` — 加postgres服务
- Modify: `backend/Dockerfile` — 更新依赖

**Step 1: 修改database.py:**
- 从DATABASE_URL环境变量读取连接串
- 默认仍用SQLite(开发)，生产用PostgreSQL
- 兼容两种数据库

**Step 2: 更新requirements.txt加psycopg2-binary**

**Step 3: 修改docker-compose.yml:**
- 添加postgres服务(镜像: postgres:16-alpine)
- 环境变量: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
- backend加depends_on postgres
- backend加DATABASE_URL环境变量
- postgres数据卷持久化

**Step 4: 更新Dockerfile确保安装psycopg2依赖**

**Step 5: 添加数据迁移脚本(简单版: 自动create_all)**

---

## 执行顺序

```
Phase 1 (并行): Task 1 (模型) + Task 5部分(通知渠道后端) + Task 6部分(auth模块)
Phase 2 (依赖Phase 1): Task 2 (去重) + Task 3 (恢复) + Task 4 (确认/静默)
Phase 3 (依赖Phase 2): Task 5完成(通知管理器集成) + Task 6完成(鉴权集成)
Phase 4 (依赖Phase 3): Task 7 (前端全面升级)
Phase 5 (最后): Task 8 (PostgreSQL迁移)
```
