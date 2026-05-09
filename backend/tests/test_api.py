"""API 端点测试"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from main import app
from tests.conftest import TestSessionLocal, test_engine
from database import Base
import models
from auth import hash_password, create_access_token

client = TestClient(app)


def _ensure_admin_and_get_headers(username="testadmin", password="testpass123", role="admin"):
    """Create user directly in DB + generate JWT token (bypass register API)"""
    db = TestSessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            user = models.User(
                username=username,
                hashed_password=hash_password(password),
                role=role,
                is_active=True,
                display_name=username
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        user_id = user.id
        user_role = user.role
    finally:
        db.close()
    token = create_access_token({"sub": username, "role": user_role, "uid": user_id})
    return {"Authorization": f"Bearer {token}"}


class TestHealthAPI:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


class TestAuthAPI:
    def test_register_first_user(self):
        """First user registration should succeed and be admin"""
        response = client.post("/api/v1/auth/register", json={
            "username": "firstuser", "password": "test123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "firstuser"
        assert data["role"] == "admin"

    def test_register_second_user_blocked(self):
        """After first user, registration should be blocked"""
        client.post("/api/v1/auth/register", json={"username": "firstuser2", "password": "test123456"})
        response = client.post("/api/v1/auth/register", json={"username": "seconduser", "password": "test123456"})
        assert response.status_code == 403

    def test_login(self):
        """Login should return token with role info"""
        _ensure_admin_and_get_headers("loginuser", "testpass123")
        response = client.post("/api/v1/auth/login", json={"username": "loginuser", "password": "testpass123"})
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"

    def test_login_wrong_password(self):
        _ensure_admin_and_get_headers("wrongpwuser", "testpass123")
        response = client.post("/api/v1/auth/login", json={"username": "wrongpwuser", "password": "wrongpass"})
        assert response.status_code == 401

    def test_get_me(self):
        headers = _ensure_admin_and_get_headers("meuser", "testpass123")
        response = client.get("/api/v1/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["username"] == "meuser"

    def test_get_me_no_token(self):
        _ensure_admin_and_get_headers("nobody", "testpass123")
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401


class TestUserManagementAPI:
    def test_list_users_admin(self):
        admin_h = _ensure_admin_and_get_headers("admin1", "testpass123")
        response = client.get("/api/v1/users", headers=admin_h)
        assert response.status_code == 200

    def test_list_users_viewer_forbidden(self):
        admin_h = _ensure_admin_and_get_headers("admin2", "testpass123")
        viewer_h = _ensure_admin_and_get_headers("viewer2", "testpass123", "viewer")
        response = client.get("/api/v1/users", headers=viewer_h)
        assert response.status_code == 403

    def test_create_user_admin(self):
        admin_h = _ensure_admin_and_get_headers("admin3", "testpass123")
        response = client.post("/api/v1/users", json={
            "username": "newuser", "password": "newpass123", "display_name": "New User", "role": "viewer"
        }, headers=admin_h)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "newuser"
        assert data["role"] == "viewer"

    def test_create_user_operator_forbidden(self):
        admin_h = _ensure_admin_and_get_headers("admin4", "testpass123")
        _ensure_admin_and_get_headers("op4", "testpass123", "operator")
        op_h = _ensure_admin_and_get_headers("op4", "testpass123", "operator")
        response = client.post("/api/v1/users", json={
            "username": "newuser", "password": "newpass123", "role": "viewer"
        }, headers=op_h)
        assert response.status_code == 403

    def test_update_user_admin(self):
        admin_h = _ensure_admin_and_get_headers("admin5", "testpass123")
        client.post("/api/v1/users", json={"username": "editme", "password": "pass123", "role": "viewer"}, headers=admin_h)
        users = client.get("/api/v1/users", headers=admin_h).json()
        user_id = [u for u in users if u["username"] == "editme"][0]["id"]
        response = client.put(f"/api/v1/users/{user_id}", json={
            "display_name": "Updated Name", "role": "operator"
        }, headers=admin_h)
        assert response.status_code == 200
        assert response.json()["role"] == "operator"

    def test_admin_cannot_deactivate_self(self):
        admin_h = _ensure_admin_and_get_headers("admin6", "testpass123")
        users = client.get("/api/v1/users", headers=admin_h).json()
        admin_id = [u for u in users if u["username"] == "admin6"][0]["id"]
        response = client.put(f"/api/v1/users/{admin_id}", json={"is_active": False}, headers=admin_h)
        assert response.status_code == 400

    def test_admin_cannot_demote_self(self):
        admin_h = _ensure_admin_and_get_headers("admin7", "testpass123")
        users = client.get("/api/v1/users", headers=admin_h).json()
        admin_id = [u for u in users if u["username"] == "admin7"][0]["id"]
        response = client.put(f"/api/v1/users/{admin_id}", json={"role": "viewer"}, headers=admin_h)
        assert response.status_code == 400

    def test_delete_user_admin(self):
        admin_h = _ensure_admin_and_get_headers("admin8", "testpass123")
        client.post("/api/v1/users", json={"username": "deleteme", "password": "pass123", "role": "viewer"}, headers=admin_h)
        users = client.get("/api/v1/users", headers=admin_h).json()
        user_id = [u for u in users if u["username"] == "deleteme"][0]["id"]
        response = client.delete(f"/api/v1/users/{user_id}", headers=admin_h)
        assert response.status_code == 200

    def test_admin_cannot_delete_self(self):
        admin_h = _ensure_admin_and_get_headers("admin9", "testpass123")
        users = client.get("/api/v1/users", headers=admin_h).json()
        admin_id = [u for u in users if u["username"] == "admin9"][0]["id"]
        response = client.delete(f"/api/v1/users/{admin_id}", headers=admin_h)
        assert response.status_code == 400


class TestModelConfigAPI:
    def test_get_model_configs(self, sample_model_config):
        admin_h = _ensure_admin_and_get_headers("mcadmin1", "testpass123")
        client.post("/api/v1/model-configs", json=sample_model_config, headers=admin_h)
        response = client.get("/api/v1/model-configs", headers=admin_h)
        assert response.status_code == 200

    def test_get_active_config_not_found(self):
        admin_h = _ensure_admin_and_get_headers("mcadmin2", "testpass123")
        # Delete any existing configs from previous tests
        existing = client.get("/api/v1/model-configs", headers=admin_h).json()
        for cfg in existing:
            client.delete(f"/api/v1/model-configs/{cfg['id']}", headers=admin_h)
        # Create an INACTIVE config only — should return 404 for active
        client.post("/api/v1/model-configs", json={
            "provider_name": "test", "api_key": "test-key", "base_url": "https://test.com",
            "model_name": "test-model", "is_active": False
        }, headers=admin_h)
        response = client.get("/api/v1/model-configs/active", headers=admin_h)
        assert response.status_code == 404

    def test_create_config_viewer_forbidden(self):
        admin_h = _ensure_admin_and_get_headers("mcadmin3", "testpass123")
        viewer_h = _ensure_admin_and_get_headers("mcviewer", "testpass123", "viewer")
        response = client.post("/api/v1/model-configs", json={
            "provider_name": "test", "api_key": "k", "base_url": "u", "model_name": "m", "is_active": False
        }, headers=viewer_h)
        assert response.status_code == 403

    def test_update_nonexistent_config(self):
        admin_h = _ensure_admin_and_get_headers("mcadmin4", "testpass123")
        response = client.put("/api/v1/model-configs/9999", json={
            "provider_name": "test", "api_key": "test", "base_url": "https://test.com",
            "model_name": "test", "is_active": False
        }, headers=admin_h)
        assert response.status_code == 404


class TestDingTalkConfigAPI:
    def test_create_dingtalk_config(self):
        admin_h = _ensure_admin_and_get_headers("dtadmin1", "testpass123")
        response = client.post("/api/v1/dingtalk-configs", json={
            "webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=test",
            "secret": "SECtest", "is_active": True
        }, headers=admin_h)
        assert response.status_code == 200

    def test_get_dingtalk_configs(self):
        admin_h = _ensure_admin_and_get_headers("dtadmin2", "testpass123")
        client.post("/api/v1/dingtalk-configs", json={
            "webhook_url": "https://oapi.dingtalk.com/robot/send?access_token=test", "is_active": True
        }, headers=admin_h)
        response = client.get("/api/v1/dingtalk-configs", headers=admin_h)
        assert response.status_code == 200


class TestRoleBasedAccess:
    def test_viewer_cannot_write_configs(self):
        admin_h = _ensure_admin_and_get_headers("rbaadmin1", "testpass123")
        viewer_h = _ensure_admin_and_get_headers("rbaviewer1", "testpass123", "viewer")
        response = client.get("/api/v1/model-configs", headers=viewer_h)
        assert response.status_code == 200
        response = client.post("/api/v1/model-configs", json={
            "provider_name": "test", "api_key": "k", "base_url": "u", "model_name": "m", "is_active": False
        }, headers=viewer_h)
        assert response.status_code == 403

    def test_operator_can_write_configs(self):
        admin_h = _ensure_admin_and_get_headers("rbaadmin2", "testpass123")
        op_h = _ensure_admin_and_get_headers("rbaop1", "testpass123", "operator")
        response = client.post("/api/v1/model-configs", json={
            "provider_name": "test", "api_key": "k", "base_url": "u", "model_name": "m", "is_active": False
        }, headers=op_h)
        assert response.status_code == 200

    def test_viewer_cannot_acknowledge_alerts(self):
        admin_h = _ensure_admin_and_get_headers("rbaadmin3", "testpass123")
        viewer_h = _ensure_admin_and_get_headers("rbaviewer2", "testpass123", "viewer")
        op_h = _ensure_admin_and_get_headers("rbaop2", "testpass123", "operator")

        mock_analysis = {"summary": "test", "root_cause": "", "suggestion": "", "severity": "low"}
        with patch("ai_service.analyze_alert_with_ai", new_callable=AsyncMock, return_value=mock_analysis):
            client.post("/api/v1/alerts", json={
                "receiver": "test", "status": "firing",
                "alerts": [{"status": "firing", "labels": {"alertname": "TestAlert", "severity": "warning"},
                    "annotations": {"summary": "test", "description": "test"},
                    "startsAt": "2026-01-01T00:00:00Z", "endsAt": "0001-01-01T00:00:00Z",
                    "generatorURL": "http://test", "fingerprint": "rba-test-001"}],
                "groupLabels": {}, "commonLabels": {}, "commonAnnotations": {},
                "externalURL": "", "version": "4", "groupKey": "test", "truncatedAlerts": 0
            })

        response = client.put("/api/v1/alerts/1/acknowledge", headers=viewer_h)
        assert response.status_code == 403

        response = client.put("/api/v1/alerts/1/acknowledge", headers=op_h)
        assert response.status_code == 200
