# Meerkat 项目优化计划

> **For Hermes:** 使用 subagent-driven-development 按任务顺序执行。

**目标:** 将 Meerkat 从"能跑的雏形"升级为"有工程质量的系统"

**架构:** 不重构，只加固。保持现有文件结构，在关键点做针对性增强。

**原则:** TDD、小步提交、每个改动都验证

---

### Task 1: 初始化 Git 仓库 & 项目卫生

**客观:** 建立版本管理，清理仓库垃圾文件

**文件:**
- 创建: `/usr/local/meerkat/.gitignore` (根目录)
- 删除: `/usr/local/meerkat/backend/sql_app.db` (从 git 跟踪中移除)
- 创建: `/usr/local/meerkat/backend/data/.gitkeep`

**步骤:**
1. 写 `.gitignore` 覆盖 backend + frontend + root:
   ```
   __pycache__/
   *.py[cod]
   *.db
   venv/
   .venv/
   .env
   node_modules/
   dist/
   data/*.db
   ```
2. 确保 `backend/sql_app.db` 不被跟踪
3. `git init && git add -A && git commit -m "chore: init meerkat repository"`

---

### Task 2: AI 分析结果改为结构化 JSON 输出

**客观:** AI 返回 JSON 格式（故障摘要、根因、修复步骤、影响范围），前端直接渲染

**文件:**
- 修改: `backend/ai_service.py`
- 修改: `backend/models.py`
- 修改: `backend/schemas.py`
- 创建: `backend/tests/test_ai_service.py`

**修改详情:**

`ai_service.py` 的 prompt 改为要求 JSON 输出，解析后返回结构化 dict:

```python
async def analyze_alert_with_ai(alert_data: dict, config: ModelConfig) -> dict:
    prompt = """你是一名资深SRE工程师。分析以下Prometheus告警，返回严格的JSON格式（不要markdown代码块）：
{
    "summary": "故障摘要（一句话）",
    "severity_analysis": "对告警级别的评估",
    "root_cause": "推断的根因（列出1-3个可能）",
    "impact": "影响范围评估",
    "troubleshooting_steps": ["步骤1", "步骤2", "步骤3"],
    "recommended_actions": ["建议操作1", "建议操作2"]
}

Alert Data:
{json_data}
"""
    ...
    # 解析 response 为 JSON
    try:
        result = json.loads(response.choices[0].message.content)
        return result
    except:
        return {"summary": response.choices[0].message.content, ...}
```

`schemas.py` 的 Alert 增加 analysis 字段结构支持。

---

### Task 3: 日志系统替换 print

**客观:** 所有 `print()` 替换为 Python logging

**文件:**
- 创建: `backend/logger.py`
- 修改: `backend/dingtalk_service.py`
- 修改: `backend/ai_service.py`

**内容:**
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger('meerkat')
```

---

### Task 4: CORS 和 AI 参数可配置化

**客观:** CORS origins、AI temperature 通过环境变量配置

**文件:**
- 修改: `backend/main.py` (CORS 读环境变量)
- 修改: `backend/ai_service.py` (temperature 读环境变量)

**细节:**
```python
# main.py
import os
allow_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# ai_service.py
temperature = float(os.getenv("AI_TEMPERATURE", "0.3"))
```

---

### Task 5: 搭建测试框架 + 核心测试

**客观:** pytest 环境 + 5 个核心测试覆盖关键路径

**文件:**
- 创建: `backend/tests/__init__.py`
- 创建: `backend/tests/conftest.py`
- 创建: `backend/tests/test_ai_service.py`
- 创建: `backend/tests/test_crud.py`
- 创建: `backend/tests/test_api.py`

**测试范围:**
1. AI service prompt 构建逻辑（mock OpenAI）
2. CRUD 数据库操作
3. API 端点响应
4. DingTalk 签名生成
5. Alert 接收流程

---

### Task 6: CI/CD GitHub Actions

**客观:** 每次 push 自动跑测试 + lint

**文件:**
- 创建: `.github/workflows/ci.yml`

**内容:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r backend/requirements.txt
      - run: pip install pytest httpx pytest-asyncio
      - run: pytest backend/tests/ -v
```

---

### Task 7: 一键开发环境 Makefile

**客观:** `make dev` 一键启动，`make test` 一键测试

**文件:**
- 创建: `Makefile`

---

## 执行顺序

```
Task 1 (Git init) → Task 5 (测试框架) → Task 2 (AI JSON) → Task 3 (日志)
→ Task 4 (可配置) → Task 6 (CI/CD) → Task 7 (Makefile)
```

**关键原则:** 先搭测试框架再改代码，保证每个改动都有测试守护。
