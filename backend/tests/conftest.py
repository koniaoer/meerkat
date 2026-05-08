import os
import sys
import pytest
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base, get_db
from models import ModelConfig, DingTalkConfig, Alert, User, NotificationChannel, RemediationAction
from main import app

# ── 统一测试数据库 ─────────────────────────────────────────────
# 所有测试文件共享同一个 StaticPool 内存数据库，避免跨文件隔离问题
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # 保证所有连接共享同一个内存库
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# 建表
Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def _clean_db():
    """全局: 每个测试前后都清空所有表数据+去重缓存，防止跨文件泄露"""
    from alert_dedup import alert_dedup
    alert_dedup.clear()
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()
    yield
    alert_dedup.clear()
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()


@pytest.fixture
def sample_model_config():
    """示例 AI 模型配置"""
    return {
        "provider_name": "DeepSeek",
        "api_key": "sk-tes...7890",
        "base_url": "https://api.deepseek.com/v1",
        "model_name": "deepseek-chat",
        "is_active": True,
    }


@pytest.fixture
def sample_dingtalk_config():
    """示例钉钉配置"""
    return {
        "webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=***",
        "secret": "SECtest123",
        "is_active": True,
    }


@pytest.fixture
def sample_alert_data():
    """示例 Prometheus 告警数据"""
    return {
        "status": "firing",
        "labels": {
            "alertname": "HighMemoryUsage",
            "severity": "warning",
            "instance": "node-01:9100",
            "job": "node_exporter",
        },
        "annotations": {
            "summary": "Node node-01 memory usage above 90%",
            "description": "Memory usage is currently at 92.5%",
        },
        "startsAt": "2026-05-08T10:00:00Z",
        "endsAt": "0001-01-01T00:00:00Z",
        "generatorURL": "http://prometheus:9090/graph",
        "fingerprint": "abc123def456",
    }
