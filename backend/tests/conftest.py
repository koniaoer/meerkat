import os
import sys
import pytest
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Skip admin auto-init during tests — each test manages its own users
os.environ["SKIP_ADMIN_INIT"] = "1"

from database import Base, get_db
from models import ModelConfig, DingTalkConfig, Alert, User, NotificationChannel, RemediationAction
from main import app

# ── 统一测试数据库 ─────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
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


def _clean_all_tables():
    """清空所有表+去重缓存"""
    from alert_dedup import alert_dedup
    alert_dedup.clear()
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()


@pytest.fixture(autouse=True)
def _clean_db():
    """全局: 每个测试前清空所有表数据，测试后也清"""
    _clean_all_tables()
    yield
    _clean_all_tables()


def _create_user_with_token(username: str, role: str):
    """Helper: create user directly in DB and return auth headers"""
    from auth import hash_password, create_access_token
    db = TestSessionLocal()
    user = User(username=username, hashed_password=hash_password("testpass"), role=role, is_active=True, display_name=f"Test {role.title()}")
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": user.username, "role": user.role})
    db.close()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_auth_headers():
    """Create an admin user and return auth headers"""
    return _create_user_with_token("testadmin", "admin")


@pytest.fixture
def operator_auth_headers():
    """Create an operator user and return auth headers"""
    return _create_user_with_token("testoperator", "operator")


@pytest.fixture
def viewer_auth_headers():
    """Create a viewer user and return auth headers"""
    return _create_user_with_token("testviewer", "viewer")


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
