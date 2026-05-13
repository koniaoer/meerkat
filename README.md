# Meerkat 🦝

<p align="center">
  <strong>AI运维助手</strong><br>
  AI 驱动 · 多渠道通知 · 暗黑模式 · RBAC 权限控制
</p>

---

## 🌟 核心特性

- **AI 智能分析** — 接收 Prometheus Alertmanager Webhook 告警，调用大语言模型自动分析故障摘要、根因推断与修复建议
- **多渠道通知** — 支持钉钉、企业微信、Slack、Email、自定义 Webhook，每种渠道支持预存测试
- **AI 自动修复** — 告警触发后自动执行预定义修复脚本（Remediation Actions），支持人工审批
- **多模型切换** — 兼容 OpenAI 协议，支持 DeepSeek / Claude / Azure OpenAI 等模型，一键切换
- **RBAC 权限** — admin / operator / viewer 三级角色，JWT 认证
- **暗黑模式** — 深海蓝 + 洛天依蓝(#66CCFF)主题，一键切换
- **容器化部署** — Docker Compose 一键启动，PostgreSQL 持久化存储

## 🛠️ 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Python 3.11, FastAPI, SQLAlchemy, PostgreSQL |
| 前端 | React 18, TypeScript, Ant Design 5, Vite |
| AI | OpenAI SDK (兼容协议) |
| 基础设施 | Docker, Docker Compose, Nginx |
| 监控 | Prometheus, Alertmanager |

## 🚀 快速开始

### 前置条件

- Docker & Docker Compose
- (可选) 需要监控的 Prometheus + Alertmanager 环境

### 1. 克隆项目

```bash
git clone https://github.com/koniaoer/meerkat.git
cd meerkat
```

### 2. 启动服务

```bash
docker compose up --build -d
```

首次启动会自动：
- 创建 PostgreSQL 数据库
- 运行数据库迁移（自动建表）
- 创建默认管理员账号 `admin / admin@123`

### 3. 访问服务

| 服务 | 地址 |
|------|------|
| 管理后台 | http://localhost:3000 |
| API 文档 (Swagger) | http://localhost:8000/docs |
| API 文档 (ReDoc) | http://localhost:8000/redoc |

### 4. 登录

默认管理员账号：
```
用户名: admin
密码: admin@123
```

> ⚠️ 首次登录后请及时修改密码！

## ⚙️ 配置指南

### 1. 配置 AI 模型

1. 登录后台 → 进入 **AI Models** 页面
2. 点击 **Add Model**，填写：
   - **Provider**: 模型提供商（如 DeepSeek）
   - **Model Name**: 模型标识（如 `deepseek-chat`）
   - **Base URL**: API 端点（如 `https://api.deepseek.com/v1`）
   - **API Key**: 你的 API 密钥
3. 勾选 **Set as Active** → 保存

### 2. 配置通知渠道

1. 进入 **通知渠道** 页面
2. 点击 **新增渠道**
3. 选择渠道类型（钉钉 / 企业微信 / Slack / Email / Webhook）
4. 填写对应配置参数
5. 点击 **测试推送** 验证连通性 → 保存

#### 钉钉机器人配置示例

```json
{
  "webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
  "secret": "SECxxx"
}
```

#### 企业微信机器人配置示例

```json
{
  "webhook_url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
}
```

#### Email 配置示例

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

### 3. 配置 Alertmanager Webhook

修改 `alertmanager.yml`，将告警转发至 Meerkat：

```yaml
route:
  receiver: 'meerkat-webhook'

receivers:
- name: 'meerkat-webhook'
  webhook_configs:
  - url: 'http://<MEERKAT_HOST>:8000/api/v1/alerts'
    send_resolved: true
```

### 4. 配置自动修复 (Remediation Actions)

1. 进入 **自动修复** 页面
2. 创建修复动作：
   - **名称**: 如 `restart-service`
   - **描述**: 如 `重启异常服务`
   - **配置**: JSON 格式的执行指令
   - **自动审批**: 开启后无需人工确认

## 🏗️ 离线部署（无外网环境）

适用于目标服务器无法访问外网的情况：

```bash
# 1. 本地构建镜像
docker compose build

# 2. 导出镜像
docker save meerkat-backend:latest meerkat-frontend:latest | gzip > meerkat-images.tar.gz

# 3. 传输到目标服务器
scp meerkat-images.tar.gz root@<TARGET>:/tmp/

# 4. 目标服务器加载镜像
ssh root@<TARGET> 'docker load < /tmp/meerkat-images.tar.gz'

# 5. 目标服务器启动（需要先同步项目文件）
ssh root@<TARGET> 'cd /opt/meerkat && docker compose up -d'
```

> 如目标服务器已有服务占用 3000/8000/5432 端口，需修改 `docker-compose.yml` 中的端口映射。

## 📂 项目结构

```
meerkat/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 应用入口 + 路由定义
│   ├── models.py               # SQLAlchemy 数据模型
│   ├── schemas.py              # Pydantic 请求/响应模式
│   ├── database.py             # 数据库连接配置
│   ├── auth.py                 # JWT 认证 & RBAC
│   ├── crud.py                 # 数据库 CRUD 操作
│   ├── ai_service.py           # AI 模型调用逻辑
│   ├── action_executor.py      # 自动修复执行器
│   ├── alert_dedup.py          # 告警去重
│   ├── notification/           # 通知渠道模块
│   │   ├── base.py             # 通知基类
│   │   ├── manager.py          # 通知管理器
│   │   ├── dingtalk.py         # 钉钉通知
│   │   ├── wechat.py           # 企业微信通知
│   │   ├── slack.py            # Slack 通知
│   │   ├── email_channel.py    # Email 通知
│   │   └── webhook.py          # 自定义 Webhook
│   ├── tests/                  # 后端测试
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── App.tsx             # 主布局（侧边栏 + 路由）
│   │   ├── main.tsx            # 入口（主题 + 国际化）
│   │   ├── pages/              # 页面组件
│   │   │   ├── Dashboard.tsx   # 告警仪表盘
│   │   │   ├── Overview.tsx    # 概览页
│   │   │   ├── Login.tsx       # 登录页
│   │   │   ├── AlertDetail.tsx # 告警详情
│   │   │   ├── NotificationChannels.tsx  # 通知渠道管理
│   │   │   ├── RemediationActions.tsx    # 自动修复管理
│   │   │   ├── UserManagement.tsx        # 用户管理 (admin)
│   │   │   └── ModelConfig.tsx           # AI 模型配置
│   │   └── services/
│   │       ├── api.ts          # Axios API 封装
│   │       ├── i18n.tsx        # 中英文国际化
│   │       └── theme.tsx       # 主题切换（亮/暗）
│   ├── nginx.conf              # Nginx 配置（API 代理）
│   ├── Dockerfile
│   └── package.json
├── prometheus/                 # Prometheus 配置（示例）
│   ├── prometheus.yml
│   └── rules/demo.yml
├── alertmanager/               # Alertmanager 配置（示例）
│   └── alertmanager.yml
├── docker-compose.yml          # Docker Compose 编排
└── README.md
```

## 🔑 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/login` | 登录获取 JWT |
| GET | `/api/v1/auth/me` | 获取当前用户信息 |
| POST | `/api/v1/auth/register` | 注册新用户 |
| GET | `/api/v1/alerts` | 获取告警列表 |
| GET | `/api/v1/alerts/stats` | 获取告警统计 |
| POST | `/api/v1/alerts` | 接收 Alertmanager Webhook |
| GET | `/api/v1/notification-channels` | 获取通知渠道列表 |
| POST | `/api/v1/notification-channels` | 创建通知渠道 |
| POST | `/api/v1/notification-channels/test` | 测试推送（预存前） |
| POST | `/api/v1/notification-channels/{id}/test` | 测试推送（已保存） |
| GET | `/api/v1/model-configs` | 获取 AI 模型列表 |
| POST | `/api/v1/model-configs` | 创建 AI 模型配置 |
| GET | `/api/v1/remediation-actions` | 获取修复动作列表 |
| POST | `/api/v1/remediation-actions/{id}/execute` | 执行修复动作 |
| GET | `/api/v1/users` | 获取用户列表 (admin) |

> 完整 API 文档请访问 Swagger UI: `http://localhost:8000/docs`

## 🎨 主题定制

Meerkat 使用洛天依蓝 (#66CCFF) 作为主色调：

| 模式 | 主色 | 背景 |
|------|------|------|
| 亮色 | `#66CCFF` | `#f0f5fa` |
| 暗黑 | `#4DB8E8` | `#0d1b2a` → `#112240` |

主题配置位于 `frontend/src/main.tsx`，修改 `token` 中的颜色值即可自定义。

## 🔐 安全说明

- 所有 API（登录/注册除外）需要 JWT Bearer Token 认证
- 通知渠道的密钥使用 Fernet 对称加密存储
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

## 📄 开源协议

[MIT License](LICENSE)
