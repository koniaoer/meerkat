"""API 端点测试"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

import models
from database import Base, get_db
from main import app

# 内存测试数据库 — StaticPool 保证所有连接共享同一个内存库
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DB_URL,
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


@pytest.fixture(autouse=True)
def clean_tables():
    """每个测试前清空数据"""
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()
    yield


client = TestClient(app)


class TestHealthEndpoint:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestModelConfigAPI:
    def test_create_model_config(self, sample_model_config):
        response = client.post("/api/v1/model-configs", json=sample_model_config)
        assert response.status_code == 200
        data = response.json()
        assert data["provider_name"] == "DeepSeek"
        assert data["id"] is not None

    def test_get_model_configs(self, sample_model_config):
        client.post("/api/v1/model-configs", json=sample_model_config)
        response = client.get("/api/v1/model-configs")
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_get_active_config_not_found(self):
        response = client.get("/api/v1/model-configs/active")
        assert response.status_code == 404

    def test_update_model_config(self, sample_model_config):
        create_resp = client.post("/api/v1/model-configs", json=sample_model_config)
        config_id = create_resp.json()["id"]

        updated = sample_model_config.copy()
        updated["provider_name"] = "OpenAI"
        response = client.put(f"/api/v1/model-configs/{config_id}", json=updated)
        assert response.status_code == 200
        assert response.json()["provider_name"] == "OpenAI"

    def test_delete_model_config(self, sample_model_config):
        create_resp = client.post("/api/v1/model-configs", json=sample_model_config)
        config_id = create_resp.json()["id"]

        response = client.delete(f"/api/v1/model-configs/{config_id}")
        assert response.status_code == 200

    def test_update_nonexistent_config(self):
        response = client.put("/api/v1/model-configs/9999", json={
            "provider_name": "X",
            "api_key": "k",
            "base_url": "u",
            "model_name": "m",
            "is_active": False,
        })
        assert response.status_code == 404


class TestDingTalkConfigAPI:
    def test_create_dingtalk_config(self, sample_dingtalk_config):
        response = client.post("/api/v1/dingtalk-configs", json=sample_dingtalk_config)
        assert response.status_code == 200
        assert response.json()["webhook_url"] == sample_dingtalk_config["webhook_url"]

    def test_get_dingtalk_configs(self, sample_dingtalk_config):
        client.post("/api/v1/dingtalk-configs", json=sample_dingtalk_config)
        response = client.get("/api/v1/dingtalk-configs")
        assert response.status_code == 200
        assert len(response.json()) >= 1


class TestAlertAPI:
    def test_receive_alert(self, sample_alert_data):
        """测试告警接收端点（mock AI 和钉钉）"""
        client.post("/api/v1/model-configs", json={
            "provider_name": "DeepSeek",
            "api_key": "sk-test",
            "base_url": "https://api.deepseek.com/v1",
            "model_name": "deepseek-chat",
            "is_active": True,
        })

        webhook_payload = {
            "receiver": "meerkat-webhook",
            "status": "firing",
            "alerts": [sample_alert_data],
            "groupLabels": {"alertname": "HighMemoryUsage"},
            "commonLabels": {"severity": "warning"},
            "commonAnnotations": {"summary": "Memory high"},
            "externalURL": "http://alertmanager:9093",
            "version": "4",
            "groupKey": "{}:{}",
            "truncatedAlerts": 0,
        }

        with patch("main.ai_service.analyze_alert_with_ai", new_callable=AsyncMock) as mock_ai:
            mock_ai.return_value = {"summary": "Test analysis", "root_cause": "", "suggestion": "", "severity": "low"}
            with patch("main.dingtalk_service.send_dingtalk_notification", new_callable=AsyncMock):
                response = client.post("/api/v1/alerts", json=webhook_payload)

        assert response.status_code == 200
        assert response.json()["processed"] == 1

    def test_get_alerts(self):
        response = client.get("/api/v1/alerts")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
