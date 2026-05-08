"""Tests for the remediation action executor and API endpoints"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

import models
import action_executor
from tests.conftest import TestSessionLocal, test_engine
from database import Base
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_tables():
    """每个测试前清空所有表数据"""
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()
    yield


# ─── Action Executor Unit Tests ──────────────────────────────────────────────

class TestActionExecutorShell:
    """Shell command execution tests"""

    @pytest.mark.asyncio
    async def test_execute_shell_success(self):
        result = await action_executor.execute_action("shell", {"command": "echo hello"})
        assert result["success"] is True
        assert "hello" in result["output"]

    @pytest.mark.asyncio
    async def test_execute_shell_no_command(self):
        result = await action_executor.execute_action("shell", {})
        assert result["success"] is False
        assert "No command" in result["output"]

    @pytest.mark.asyncio
    async def test_execute_shell_blocked_command(self):
        result = await action_executor.execute_action("shell", {"command": "rm -rf /"})
        assert result["success"] is False
        assert "Blocked" in result["output"]

    @pytest.mark.asyncio
    async def test_execute_shell_nonzero_exit(self):
        result = await action_executor.execute_action("shell", {"command": "false"})
        assert result["success"] is False
        assert result["return_code"] != 0

    @pytest.mark.asyncio
    async def test_execute_shell_unknown_type(self):
        result = await action_executor.execute_action("unknown_type", {})
        assert result["success"] is False
        assert "Unknown" in result["output"]


class TestActionExecutorHTTP:
    """HTTP request execution tests"""

    @pytest.mark.asyncio
    async def test_execute_http_no_url(self):
        result = await action_executor.execute_action("http", {})
        assert result["success"] is False
        assert "No URL" in result["output"]

    @pytest.mark.asyncio
    async def test_execute_http_unsupported_method(self):
        result = await action_executor.execute_action("http", {"url": "http://localhost", "method": "PATCH"})
        assert result["success"] is False
        assert "Unsupported" in result["output"]

    @pytest.mark.asyncio
    async def test_execute_http_connection_error(self):
        result = await action_executor.execute_action("http", {"url": "http://localhost:99999", "method": "GET"})
        assert result["success"] is False


class TestActionExecutorWebhook:
    """Webhook execution tests"""

    @pytest.mark.asyncio
    async def test_execute_webhook_no_url(self):
        result = await action_executor.execute_action("webhook", {})
        assert result["success"] is False
        assert "No webhook URL" in result["output"]


class TestActionExecutorScript:
    """Script execution tests"""

    @pytest.mark.asyncio
    async def test_execute_script_no_name(self):
        result = await action_executor.execute_action("script", {})
        assert result["success"] is False
        assert "No script name" in result["output"]

    @pytest.mark.asyncio
    async def test_execute_script_not_found(self):
        result = await action_executor.execute_action("script", {"name": "nonexistent.sh"})
        assert result["success"] is False
        assert "not found" in result["output"].lower()


# ─── Remediation Action API Tests ────────────────────────────────────────────

class TestRemediationActionAPI:
    """Remediation Action endpoint tests"""

    def _create_alert(self):
        """Helper: create an alert directly in DB"""
        db = TestSessionLocal()
        alert = models.Alert(
            alert_name="TestAlert",
            status="firing",
            severity="warning",
            summary="Test summary",
            description="Test description",
            raw_data='{"test": true}',
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        alert_id = alert.id
        db.close()
        return alert_id

    def test_list_remediation_actions_empty(self):
        response = client.get("/api/v1/remediation-actions")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_and_list_remediation_action(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Check disk usage",
            description="Run df -h to check disk",
            config='{"command": "df -h"}',
            risk_level="low",
            status="pending",
        )
        db.add(action)
        db.commit()
        db.close()

        response = client.get("/api/v1/remediation-actions")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Check disk usage"
        assert data[0]["action_type"] == "shell"
        assert data[0]["risk_level"] == "low"
        assert data[0]["status"] == "pending"

    def test_get_remediation_action(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Check memory",
            description="Run free -m",
            config='{"command": "free -m"}',
            risk_level="low",
            status="pending",
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        action_id = action.id
        db.close()

        response = client.get(f"/api/v1/remediation-actions/{action_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Check memory"

    def test_get_remediation_action_not_found(self):
        response = client.get("/api/v1/remediation-actions/9999")
        assert response.status_code == 404

    def test_approve_remediation_action(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Check disk",
            description="Run df -h",
            config='{"command": "echo approved_test"}',
            risk_level="low",
            status="pending",
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        action_id = action.id
        db.close()

        response = client.put(
            f"/api/v1/remediation-actions/{action_id}/approve",
            json={"approved": True, "approved_by": "admin"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("completed", "failed")  # executed after approval
        assert data["approved_by"] == "admin"

    def test_approve_non_pending_action_fails(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Already done",
            description="Already completed",
            config='{"command": "echo hi"}',
            risk_level="low",
            status="completed",
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        action_id = action.id
        db.close()

        response = client.put(
            f"/api/v1/remediation-actions/{action_id}/approve",
            json={"approved": True, "approved_by": "admin"},
        )
        assert response.status_code == 400

    def test_reject_remediation_action(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Risky action",
            description="Something risky",
            config='{"command": "reboot"}',
            risk_level="high",
            status="pending",
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        action_id = action.id
        db.close()

        response = client.put(
            f"/api/v1/remediation-actions/{action_id}/approve",
            json={"approved": False, "approved_by": "admin"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "rejected"
        assert response.json()["approved_by"] == "admin"

    def test_execute_remediation_action(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Re-run check",
            description="Run echo again",
            config='{"command": "echo re_execute_test"}',
            risk_level="low",
            status="completed",
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        action_id = action.id
        db.close()

        response = client.post(f"/api/v1/remediation-actions/{action_id}/execute")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("completed", "failed")

    def test_execute_pending_action_fails(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Still pending",
            description="Not yet approved",
            config='{"command": "echo test"}',
            risk_level="medium",
            status="pending",
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        action_id = action.id
        db.close()

        response = client.post(f"/api/v1/remediation-actions/{action_id}/execute")
        assert response.status_code == 400

    def test_list_actions_filter_by_alert_id(self):
        alert_id = self._create_alert()
        db = TestSessionLocal()
        action = models.RemediationAction(
            alert_id=alert_id,
            action_type="shell",
            name="Filtered action",
            description="Should appear in filtered results",
            config='{"command": "echo test"}',
            risk_level="low",
            status="pending",
        )
        db.add(action)
        db.commit()
        db.close()

        response = client.get(f"/api/v1/remediation-actions?alert_id={alert_id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["alert_id"] == alert_id

        response = client.get("/api/v1/remediation-actions?alert_id=9999")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_actions_filter_by_status(self):
        db = TestSessionLocal()
        alert = models.Alert(
            alert_name="StatusTest", status="firing", severity="warning",
            summary="s", description="d", raw_data="{}",
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        alert_id = alert.id

        for status in ["pending", "completed", "pending"]:
            action = models.RemediationAction(
                alert_id=alert_id,
                action_type="shell",
                name=f"Action-{status}",
                description="test",
                config='{"command": "echo test"}',
                risk_level="low",
                status=status,
            )
            db.add(action)
        db.commit()
        db.close()

        response = client.get("/api/v1/remediation-actions?status=pending")
        assert response.status_code == 200
        data = response.json()
        assert all(a["status"] == "pending" for a in data)
        assert len(data) == 2


class TestAlertWebhookWithActions:
    """Test that the alert webhook creates remediation actions from AI response"""

    def test_receive_alert_creates_actions(self, sample_alert_data):
        """Alert webhook should create RemediationAction records when AI returns actions"""
        client.post("/api/v1/model-configs", json={
            "provider_name": "DeepSeek",
            "api_key": "sk-test",
            "base_url": "https://api.deepseek.com/v1",
            "model_name": "deepseek-chat",
            "is_active": True,
        })

        ai_result = {
            "summary": "High memory usage detected",
            "root_cause": "Possible memory leak",
            "suggestion": "Check top processes, restart service",
            "severity": "high",
            "actions": [
                {
                    "action_type": "shell",
                    "name": "Check memory usage",
                    "description": "Run free -m to check current memory",
                    "config": {"command": "free -m"},
                    "risk_level": "low",
                },
                {
                    "action_type": "shell",
                    "name": "Restart nginx",
                    "description": "Restart nginx to free memory",
                    "config": {"command": "systemctl restart nginx"},
                    "risk_level": "medium",
                },
            ],
        }

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
            mock_ai.return_value = ai_result
            with patch("main.dingtalk_service.send_dingtalk_notification", new_callable=AsyncMock):
                with patch("main.execute_action", new_callable=AsyncMock) as mock_exec:
                    mock_exec.return_value = {"success": True, "output": "ok"}
                    response = client.post("/api/v1/alerts", json=webhook_payload)

        assert response.status_code == 200
        assert response.json()["processed"] == 1

        # Verify remediation actions were created
        actions_response = client.get("/api/v1/remediation-actions?alert_id=" + str(response.json().get("alert_ids", ["0"])[0]) if "alert_ids" in response.json() else "/api/v1/remediation-actions")
        assert actions_response.status_code == 200
        actions = actions_response.json()
        # At least the 2 AI-generated actions should exist
        assert len(actions) >= 2

        # Find our AI-generated actions
        low_risk_actions = [a for a in actions if a["risk_level"] == "low" and a["name"] == "Check memory usage"]
        medium_risk_actions = [a for a in actions if a["risk_level"] == "medium" and a["name"] == "Restart nginx"]

        if low_risk_actions:
            low_action = low_risk_actions[0]
            assert low_action["auto_approved"] is True
            assert low_action["status"] in ("completed", "failed", "approved")

        if medium_risk_actions:
            medium_action = medium_risk_actions[0]
            assert medium_action["auto_approved"] is False
            assert medium_action["status"] == "pending"
