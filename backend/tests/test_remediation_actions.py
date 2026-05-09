"""Tests for the remediation action executor and API endpoints"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import asyncio
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

import models
import action_executor
from tests.conftest import TestSessionLocal, test_engine
from database import Base
from main import app
from auth import hash_password, create_access_token

client = TestClient(app)


def _ensure_admin_and_get_headers(username="testadmin", password="testpass123", role="admin"):
    """Create user directly in DB + generate JWT token"""
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


def _create_alert_with_actions(fingerprint, actions_list):
    """Helper: create model config + alert with mock AI returning actions, return admin_headers"""
    admin_h = _ensure_admin_and_get_headers(f"alert_{fingerprint}", "testpass123")
    # Must create an active model config so AI analysis is triggered
    client.post("/api/v1/model-configs", json={
        "provider_name": "test", "api_key": "test-key", "base_url": "https://test.com",
        "model_name": "test-model", "is_active": True
    }, headers=admin_h)
    mock_analysis = {
        "summary": "Test alert", "root_cause": "Test", "suggestion": "Test", "severity": "low",
        "actions": actions_list
    }
    with patch("ai_service.analyze_alert_with_ai", new_callable=AsyncMock, return_value=mock_analysis):
        client.post("/api/v1/alerts", json={
            "receiver": "test", "status": "firing",
            "alerts": [{"status": "firing", "labels": {"alertname": "TestAlert", "severity": "low"},
                "annotations": {"summary": "test", "description": "test"},
                "startsAt": "2026-01-01T00:00:00Z", "endsAt": "0001-01-01T00:00:00Z",
                "generatorURL": "http://test", "fingerprint": fingerprint}],
            "groupLabels": {}, "commonLabels": {}, "commonAnnotations": {},
            "externalURL": "", "version": "4", "groupKey": "test", "truncatedAlerts": 0
        })
    return admin_h


# ─── Unit Tests: ActionExecutor ──────────────────────────────────────────────

class TestActionExecutorUnit:
    def test_shell_command_success(self):
        result = asyncio.run(action_executor.execute_action("shell", {"command": "echo hello"}))
        assert result["success"] is True
        assert "hello" in result["output"]

    def test_shell_command_failure(self):
        result = asyncio.run(action_executor.execute_action("shell", {"command": "false"}))
        assert result["success"] is False

    def test_http_get_success(self):
        result = asyncio.run(action_executor.execute_action("http", {"method": "GET", "url": "https://httpbin.org/status/200"}))
        assert result["success"] is True

    def test_http_post_success(self):
        result = asyncio.run(action_executor.execute_action("http", {
            "method": "POST", "url": "https://httpbin.org/post", "body": {"test": "data"},
        }))
        assert result["success"] is True

    def test_http_failure(self):
        result = asyncio.run(action_executor.execute_action("http", {"method": "GET", "url": "https://httpbin.org/status/500"}))
        assert result["success"] is False

    def test_webhook_success(self):
        result = asyncio.run(action_executor.execute_action("webhook", {
            "url": "https://httpbin.org/post", "payload": {"test": "webhook"},
        }))
        assert result["success"] is True

    def test_dangerous_command_blocked(self):
        result = asyncio.run(action_executor.execute_action("shell", {"command": "rm -rf /"}))
        assert result["success"] is False

    def test_unknown_action_type(self):
        result = asyncio.run(action_executor.execute_action("unknown_type", {}))
        assert result["success"] is False

    def test_timeout_handling(self):
        result = asyncio.run(action_executor.execute_action("shell", {"command": "sleep 30", "timeout": 1}))
        assert result["success"] is False


# ─── API Tests ────────────────────────────────────────────────────────────────

class TestRemediationActionAPI:
    def test_list_remediation_actions(self):
        admin_h = _ensure_admin_and_get_headers("ra1", "testpass123")
        response = client.get("/api/v1/remediation-actions", headers=admin_h)
        assert response.status_code == 200

    def test_get_remediation_action_not_found(self):
        admin_h = _ensure_admin_and_get_headers("ra2", "testpass123")
        response = client.get("/api/v1/remediation-actions/9999", headers=admin_h)
        assert response.status_code == 404

    def test_list_actions_filter_by_status(self):
        admin_h = _create_alert_with_actions("filter-001", [{
            "action_type": "shell", "name": "Restart", "description": "Restart service",
            "config": {"command": "systemctl restart myapp"}, "risk_level": "medium",
        }])
        response = client.get("/api/v1/remediation-actions?status=pending", headers=admin_h)
        assert response.status_code == 200
        assert len(response.json()) >= 1

    def test_approve_remediation_action(self):
        admin_h = _create_alert_with_actions("approve-001", [{
            "action_type": "shell", "name": "Approve Me", "description": "Test",
            "config": {"command": "echo approved"}, "risk_level": "medium",
        }])
        actions = client.get("/api/v1/remediation-actions?status=pending", headers=admin_h).json()
        if actions:
            op_h = _ensure_admin_and_get_headers("op_approve", "testpass123", "operator")
            with patch("action_executor.execute_action", new_callable=AsyncMock, return_value={"success": True, "output": "ok"}):
                resp = client.put(f"/api/v1/remediation-actions/{actions[0]['id']}/approve",
                    json={"approved": True, "approved_by": "op_approve"}, headers=op_h)
                assert resp.status_code == 200

    def test_reject_remediation_action(self):
        admin_h = _create_alert_with_actions("reject-001", [{
            "action_type": "shell", "name": "Reject Me", "description": "Test",
            "config": {"command": "echo reject"}, "risk_level": "medium",
        }])
        actions = client.get("/api/v1/remediation-actions?status=pending", headers=admin_h).json()
        if actions:
            op_h = _ensure_admin_and_get_headers("op_reject", "testpass123", "operator")
            resp = client.put(f"/api/v1/remediation-actions/{actions[0]['id']}/approve",
                json={"approved": False, "approved_by": "op_reject"}, headers=op_h)
            assert resp.status_code == 200
            assert resp.json()["status"] == "rejected"

    def test_execute_pending_action_fails(self):
        admin_h = _create_alert_with_actions("execfail-001", [{
            "action_type": "shell", "name": "Pending", "description": "Test",
            "config": {"command": "echo pending"}, "risk_level": "medium",
        }])
        actions = client.get("/api/v1/remediation-actions?status=pending", headers=admin_h).json()
        if actions:
            op_h = _ensure_admin_and_get_headers("op_execfail", "testpass123", "operator")
            resp = client.post(f"/api/v1/remediation-actions/{actions[0]['id']}/execute", headers=op_h)
            assert resp.status_code == 400


class TestAlertWebhookWithActions:
    def test_receive_alert_creates_actions(self):
        admin_h = _create_alert_with_actions("webhook-001", [
            {"action_type": "shell", "name": "Restart", "description": "Restart service",
             "config": {"command": "systemctl restart myapp"}, "risk_level": "medium"},
            {"action_type": "http", "name": "Scale Up", "description": "Scale up",
             "config": {"method": "POST", "url": "http://k8s-api/scale", "body": {"replicas": 3}}, "risk_level": "high"},
        ])
        actions = client.get("/api/v1/remediation-actions", headers=admin_h).json()
        assert len(actions) >= 2
        names = [a["name"] for a in actions]
        assert "Restart" in names
        assert "Scale Up" in names


class TestRoleBasedActionAccess:
    def test_viewer_cannot_approve_actions(self):
        admin_h = _create_alert_with_actions("viewer-001", [{
            "action_type": "shell", "name": "Viewer Test", "description": "Test",
            "config": {"command": "echo viewer"}, "risk_level": "medium",
        }])
        viewer_h = _ensure_admin_and_get_headers("viewer_act", "testpass123", "viewer")
        actions = client.get("/api/v1/remediation-actions?status=pending", headers=admin_h).json()
        if actions:
            resp = client.put(f"/api/v1/remediation-actions/{actions[0]['id']}/approve",
                json={"approved": True, "approved_by": "viewer"}, headers=viewer_h)
            assert resp.status_code == 403
