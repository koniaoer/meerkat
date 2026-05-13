<div align="center">

# 🦝 Meerkat

**AI 智能运维平台** · Intelligent Operations Platform

[![CI](https://github.com/koniaoer/meerkat/actions/workflows/ci.yml/badge.svg)](https://github.com/koniaoer/meerkat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Ant Design 5](https://img.shields.io/badge/Ant_Design-5-0170FE?logo=antdesign&logoColor=white)](https://ant.design/)

<p align="center">
  <img src="https://img.shields.io/badge/AI_Analysis-DeepSeek%20%7C%20Claude%20%7C%20OpenAI-66CCFF?style=flat-square" alt="AI Models" />
  <img src="https://img.shields.io/badge/Notifications-DingTalk%20%7C%20WeChat%20%7C%20Slack%20%7C%20Email-52C41A?style=flat-square" alt="Channels" />
  <img src="https://img.shields.io/badge/Theme-Dark_%E2%97%BC_Light-66CCFF?style=flat-square" alt="Theme" />
  <img src="https://img.shields.io/badge/Auth-RBAC_JWT-FA8C16?style=flat-square" alt="Auth" />
</p>

Meerkat 是一款 AI 驱动的智能运维告警分析平台，接收 Prometheus Alertmanager 告警，自动分析根因、生成修复建议、触发自动化修复，并通过多渠道实时通知。

[🚀 快速开始](#-快速开始) · [⚙️ 配置](#️-配置指南) · [📂 项目结构](#-项目结构) · [🔌 API](#-api-概览) · [🤝 贡献](#-贡献)

</div>

---

## ✨ 功能特性

<table>
<tr>
<td width="50%">

### 🧠 AI 智能分析
- 接收 Alertmanager Webhook 告警
- 调用 LLM 自动生成故障摘要
- 根因推断与修复建议
- 支持告警重新分析
- 兼容 OpenAI 协议多模型切换

</td>
<td width="50%">

### 🔔 多渠道通知
- 钉钉机器人（加签验证）
- 企业微信机器人
- Slack Webhook
- SMTP Email
- 自定义 Webhook
- 每种渠道支持预存测试

</td>
</tr>
<tr>
<td width="50%">

### 🔧 自动修复
- 预定义修复模板（命令/脚本/HTTP）
- 自动/人工审批双模式
- 告警触发自动执行修复动作
- 修复结果追踪

</td>
<td width="50%">

### 📊 监控仪表盘
- Prometheus 数据源管理
- Grafana 风格 Dashboard
- 实时指标查询与可视化
- 健康状态阈值检测
- 网格/列表/表格多视图

</td>
</tr>
<tr>
<td width="50%">

### 💬 ChatOps
- 自然语言交互式运维
- AI 根据告警上下文回答
- 快捷命令（统计/值班/搜索）
- 会话管理与历史记录

</td>
<td width="50%">

### 🛡️ 企业级特性
- RBAC 三级权限（admin/operator/viewer）
- JWT 认证 + 密钥 Fernet 加密
- 告警去重与静默
- 告警路由规则
- 升级策略（Escalation）
- 操作审计日志

</td>
</tr>
</table>

## 🛠️ 技术栈

| 层级 | 技术 |
|:----:|:-----|
| **后端** | Python 3.11 · FastAPI · SQLAlchemy · PostgreSQL · Fernet |
| **前端** | React 18 · TypeScript · Ant Design 5 · Vite · ECharts |
| **AI** | OpenAI SDK (兼容协议) · DeepSeek / Claude / Azure OpenAI |
| **运维** | Docker · Docker Compose · Nginx · Prometheus · Alertmanager |

## 🚀 快速开始

### 前置条件

- Docker & Docker Compose
- （可选）Prometheus + Alertmanager 监控环境

### 1️⃣ 克隆项目

```bash
git clone https://github.com/koniaoer/meerkat.git
cd meerkat
```

### 2️⃣ 一键启动

```bash
docker compose up --build -d
```

首次启动自动完成：
- ✅ 创建 PostgreSQL 数据库
- ✅ 运行数据库迁移（自动建表）
- ✅ 创建默认管理员 `admin / admin@123`

### 3️⃣ 访问服务

| 服务 | 地址 |
|:----:|:----:|
| 🖥️ 管理后台 | http://localhost:3000 |
| 📖 Swagger API 文档 | http://localhost:8000/docs |
| 📖 ReDoc API 文档 | http://localhost:8000/redoc |

> ⚠️ 首次登录后请及时修改默认密码！

## ⚙️ 配置指南

### 配置 AI 模型

1. 登录后台 → **AI Models** 页面
2. 点击 **Add Model**，填写：
   - **Provider**: `deepseek` / `openai` / `azure` / `anthropic` 等
   - **Model Name**: 如 `deepseek-chat`
   - **Base URL**: 如 `https://api.deepseek.com/v1`
   - **API Key**: 你的密钥
3. 勾选 **Set as Active** → 保存

### 配置通知渠道

1. 进入 **通知渠道** 页面 → **新增渠道**
2. 选择类型 → 填写配置 → **测试推送** → 保存

<details>
<summary>📋 渠道配置示例</summary>

**钉钉机器人**
```json
{
  "webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=***",
  "secret": "SEC***"
}
```

**企业微信机器人**
```json
{
  "webhook_url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=***"
}
```

**Email**
```json
{
  "smtp_host": "smtp.example.com",
  "smtp_port": 465,
  "smtp_user": "alert@example.com",
  "smtp_password": "your-password",
  "from_addr": "alert@example.com",
  "to_addrs": "oncall@example.com",
  "use_tls": true
}
```

**Slack**
```json
{
  "webhook_url": "https://hooks.slack.com/services/***"
}
```

</details>

### 配置 Alertmanager Webhook

```yaml
# alertmanager.yml
route:
  receiver: 'meerkat-webhook'

receivers:
- name: 'meerkat-webhook'
  webhook_configs:
  - url: 'http://<MEERKAT_HOST>:8000/api/v1/alerts'
    send_resolved: true
```

### 配置自动修复

1. 进入 **自动修复模板** 页面 → 创建模板
2. 定义匹配规则（告警名/标签/关键词）
3. 配置修复动作（命令/脚本/HTTP 请求）
4. 选择审批模式（自动/人工）

## 📂 项目结构

```
meerkat/
├── backend/                        # FastAPI 后端
│   ├── main.py                     # 应用入口 + 全部路由
│   ├── models.py                   # SQLAlchemy 数据模型
│   ├── schemas.py                  # Pydantic 请求/响应模式
│   ├── database.py                 # 数据库连接配置
│   ├── auth.py                     # JWT 认证 & RBAC
│   ├── crud.py                     # 数据库 CRUD 操作
│   ├── ai_service.py               # AI 模型调用逻辑
│   ├── action_executor.py          # 自动修复执行器
│   ├── alert_dedup.py              # 告警去重引擎
│   ├── alert_router.py             # 告警路由分发
│   ├── alert_suppressor.py         # 告警静默
│   ├── chatops_engine.py           # ChatOps 对话引擎
│   ├── escalation_engine.py        # 升级策略引擎
│   ├── remediation_recommender.py  # 修复推荐器
│   ├── dingtalk_service.py         # 钉钉服务
│   ├── notification/               # 通知渠道模块
│   │   ├── base.py                 # 通知基类
│   │   ├── manager.py              # 通知管理器
│   │   ├── dingtalk.py             # 钉钉
│   │   ├── wechat.py               # 企业微信
│   │   ├── slack.py                # Slack
│   │   ├── email_channel.py        # Email
│   │   └── webhook.py              # 自定义 Webhook
│   ├── tests/                      # 后端测试
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                       # React 前端
│   ├── src/
│   │   ├── App.tsx                 # 主布局（侧边栏 + 路由）
│   │   ├── main.tsx                # 入口（主题 + 国际化）
│   │   ├── index.css               # 全局样式 + 动画
│   │   ├── pages/
│   │   │   ├── Overview.tsx        # 概览页
│   │   │   ├── Dashboard.tsx       # 告警仪表盘
│   │   │   ├── MonitorDashboard.tsx# 监控仪表盘
│   │   │   ├── AlertDetail.tsx     # 告警详情
│   │   │   ├── AlertRules.tsx      # 告警规则
│   │   │   ├── ModelConfig.tsx     # AI 模型配置
│   │   │   ├── NotificationChannels.tsx  # 通知渠道
│   │   │   ├── RemediationActions.tsx    # 自动修复
│   │   │   ├── RemediationTemplates.tsx  # 修复模板
│   │   │   ├── ChatOps.tsx         # ChatOps 对话
│   │   │   ├── KnowledgeBase.tsx   # 知识库
│   │   │   ├── OnCallSchedule.tsx  # 值班排班
│   │   │   ├── EscalationPolicy.tsx# 升级策略
│   │   │   ├── AuditLog.tsx        # 审计日志
│   │   │   ├── UserManagement.tsx  # 用户管理
│   │   │   └── Login.tsx           # 登录页
│   │   └── services/
│   │       ├── api.ts              # Axios API 封装
│   │       ├── i18n.tsx            # 中英文国际化
│   │       └── theme.tsx           # 主题切换（亮/暗）
│   ├── nginx.conf                  # Nginx 配置
│   ├── Dockerfile
│   └── package.json
├── prometheus/                     # Prometheus 示例配置
├── alertmanager/                   # Alertmanager 示例配置
├── docker-compose.yml              # 容器编排
└── README.md
```

## 🔌 API 概览

### 认证

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `POST` | `/api/v1/auth/login` | 登录获取 JWT |
| `POST` | `/api/v1/auth/register` | 注册新用户 |
| `GET` | `/api/v1/auth/me` | 获取当前用户信息 |

### 告警

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `POST` | `/api/v1/alerts` | 接收 Alertmanager Webhook |
| `GET` | `/api/v1/alerts` | 获取告警列表 |
| `GET` | `/api/v1/alerts/{id}` | 获取告警详情 |
| `PUT` | `/api/v1/alerts/{id}/acknowledge` | 确认告警 |
| `PUT` | `/api/v1/alerts/{id}/silence` | 静默告警 |
| `DELETE` | `/api/v1/alerts/{id}` | 删除告警 |
| `POST` | `/api/v1/alerts/batch-delete` | 批量删除 |
| `POST` | `/api/v1/alerts/{id}/reanalyze` | 重新分析 |
| `GET` | `/api/v1/alerts/stats` | 告警统计 |
| `GET` | `/api/v1/dashboard/stats` | 仪表盘统计 |

### 通知渠道

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `GET` | `/api/v1/notification-channels` | 获取渠道列表 |
| `POST` | `/api/v1/notification-channels` | 创建渠道 |
| `PUT` | `/api/v1/notification-channels/{id}` | 更新渠道 |
| `DELETE` | `/api/v1/notification-channels/{id}` | 删除渠道 |
| `POST` | `/api/v1/notification-channels/test` | 预存测试 |
| `POST` | `/api/v1/notification-channels/{id}/test` | 已保存测试 |

### AI 模型

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `GET` | `/api/v1/model-configs` | 获取模型列表 |
| `POST` | `/api/v1/model-configs` | 创建模型配置 |
| `PUT` | `/api/v1/model-configs/{id}` | 更新模型 |
| `DELETE` | `/api/v1/model-configs/{id}` | 删除模型 |
| `GET` | `/api/v1/model-configs/active` | 获取当前激活模型 |
| `POST` | `/api/v1/model-configs/test` | 测试模型连通性 |

### 自动修复

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `GET` | `/api/v1/remediation-actions` | 修复动作列表 |
| `PUT` | `/api/v1/remediation-actions/{id}/approve` | 审批修复 |
| `POST` | `/api/v1/remediation-actions/{id}/execute` | 执行修复 |
| `DELETE` | `/api/v1/remediation-actions/{id}` | 删除修复 |

### 修复模板

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `GET` | `/api/v1/remediation-templates` | 模板列表 |
| `POST` | `/api/v1/remediation-templates` | 创建模板 |
| `PUT` | `/api/v1/remediation-templates/{id}` | 更新模板 |
| `DELETE` | `/api/v1/remediation-templates/{id}` | 删除模板 |
| `POST` | `/api/v1/remediation-templates/{id}/apply/{alert_id}` | 应用模板 |

### ChatOps

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `POST` | `/api/v1/chat` | 发送消息 |
| `GET` | `/api/v1/chat/{session_id}` | 获取会话历史 |
| `GET` | `/api/v1/chat-sessions` | 获取会话列表 |
| `DELETE` | `/api/v1/chat-sessions/{id}` | 删除会话 |

### 监控

| 方法 | 路径 | 说明 |
|:----:|:-----|:-----|
| `GET` | `/api/v1/datasources` | 数据源列表 |
| `POST` | `/api/v1/datasources` | 创建数据源 |
| `POST` | `/api/v1/datasources/{id}/test` | 测试连通性 |
| `GET` | `/api/v1/prometheus/query` | PromQL 即时查询 |
| `GET` | `/api/v1/prometheus/query_range` | PromQL 范围查询 |
| `GET` | `/api/v1/monitor-dashboards` | 仪表盘列表 |
| `POST` | `/api/v1/monitor-dashboards` | 创建仪表盘 |

> 📖 完整 API 文档请访问 Swagger UI: `http://localhost:8000/docs`

## 🏗️ 离线部署

适用于无外网的目标服务器：

```bash
# 1. 本地构建镜像
docker compose build

# 2. 导出镜像
docker save meerkat-backend:latest meerkat-frontend:latest | gzip > meerkat-images.tar.gz

# 3. 传输到目标服务器
scp meerkat-images.tar.gz root@<TARGET>:/tmp/

# 4. 目标服务器加载并启动
ssh root@<TARGET> 'docker load < /tmp/meerkat-images.tar.gz'
ssh root@<TARGET> 'cd /opt/meerkat && docker compose up -d'
```

> 如端口冲突，修改 `docker-compose.yml` 中的端口映射（如 `3001:80`、`8001:8000`、`5433:5432`）。

## 🎨 主题定制

Meerkat 使用 **洛天依蓝** (#66CCFF) 作为主色调，深海蓝暗色模式：

| 模式 | 主色 | 页面背景 | 容器背景 |
|:----:|:----:|:--------:|:--------:|
| ☀️ 亮色 | `#66CCFF` | `#f0f5fa` | `#ffffff` |
| 🌙 暗色 | `#4DB8E8` | `#0d1b2a` | `#112240` |

修改 `frontend/src/main.tsx` 中 `token` 颜色值即可自定义主题。

## 🔐 安全说明

- 所有 API（登录/注册除外）需 JWT Bearer Token 认证
- 通知渠道密钥使用 **Fernet 对称加密** 存储
- 加密密钥通过环境变量 `ENCRYPTION_KEY` 注入，**请勿提交到版本库**
- 默认 JWT 密钥仅用于开发，生产环境请更换 `JWT_SECRET_KEY`

## 🧪 本地开发

### 后端

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 运行测试

```bash
cd backend
pytest tests/ -v
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交改动 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

## 📄 开源协议

[MIT License](LICENSE)

---

<div align="center">

**Meerkat** · AI 智能运维平台 · [GitHub](https://github.com/koniaoer/meerkat)

</div>
