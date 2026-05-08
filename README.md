# Meerkat 🦝

Meerkat 是一个智能 Prometheus 告警分析助手。它通过接收 Prometheus Alertmanager 的 Webhook 告警，调用大语言模型（LLM）进行深度分析，并提供直观的管理后台。

## 🌟 核心特性

- **AI 智能分析**：自动解析告警上下文，提供故障摘要、根本原因推断及修复建议。
- **多模型支持**：兼容 OpenAI 协议，支持 OpenAI, DeepSeek, Claude, Azure OpenAI 等多种模型。
- **动态配置**：通过 Web 界面实时管理 AI 模型配置（API Key、Base URL 等），支持一键切换活跃模型。
- **告警追踪**：完整的告警历史记录与 AI 分析报告查看。
- **容器化部署**：支持 Docker Compose 一键启动，简化环境搭建。

## 🛠️ 技术栈

- **后端**: Python 3.11, FastAPI, SQLAlchemy (SQLite)
- **前端**: React 18, TypeScript, Ant Design 5, Vite
- **基础设施**: Docker, Docker Compose

## 🚀 快速开始

### 方式一：使用 Docker Compose (推荐)

1. **克隆项目**:
   ```bash
   git clone <your-repo-url>
   cd Meerkat
   ```

2. **启动服务**:
   ```bash
   docker-compose up --build
   ```

3. **访问服务**:
   - **管理后台**: [http://localhost:3000](http://localhost:3000)
   - **API 文档 (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 方式二：本地开发环境

#### 后端启动
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows 使用 venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### 前端启动
```bash
cd frontend
npm install
npm run dev
```
访问 [http://localhost:3000](http://localhost:3000)

## ⚙️ 配置指南

### 1. 配置 AI 模型
1. 登录 Meerkat 管理后台。
2. 进入 **AI Models** 页面。
3. 点击 **Add Model**，填写模型信息：
   - **Provider**: 模型提供商名称 (如 DeepSeek)。
   - **Model Name**: 模型标识符 (如 deepseek-chat)。
   - **Base URL**: API 端点 (如 https://api.deepseek.com/v1)。
   - **API Key**: 您的 API 密钥。
4. 勾选 **Set as Active** 并保存。

### 2. 配置 Prometheus Alertmanager
修改您的 `alertmanager.yml`，将告警转发至 Meerkat：

```yaml
receivers:
- name: 'meerkat-webhook'
  webhook_configs:
  - url: 'http://<MEERKAT_IP>:8000/api/v1/alerts'
    send_resolved: true

route:
  receiver: 'meerkat-webhook'
```

## 📂 项目结构

```text
Meerkat/
├── backend/            # FastAPI 后端
│   ├── main.py         # 入口文件
│   ├── models.py       # 数据库模型
│   ├── ai_service.py   # AI 调用逻辑
│   └── ...
├── frontend/           # React 前端
│   ├── src/pages/      # 页面组件
│   ├── src/services/   # API 请求封装
│   └── ...
├── docker-compose.yml  # 容器定义
└── README.md           # 项目文档
```

## 📄 开源协议
[MIT License](LICENSE)
