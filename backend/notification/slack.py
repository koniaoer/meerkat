import httpx
from .base import NotificationChannel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger import logger

class SlackChannel(NotificationChannel):
    def get_channel_type(self) -> str:
        return "slack"
    
    async def send(self, alert_data: dict, analysis: dict, config: dict) -> bool:
        webhook_url = config.get("webhook_url", "")
        if not webhook_url:
            return False
        
        alert_name = alert_data.get("labels", {}).get("alertname", "Unknown")
        severity = alert_data.get("labels", {}).get("severity", "info").upper()
        status = alert_data.get("status", "firing").upper()
        
        severity_emoji = {"CRITICAL": "🔴", "HIGH": "🟠", "WARNING": "🟡", "MEDIUM": "🟡", "LOW": "🔵", "INFO": "⚪"}.get(severity, "⚪")
        
        if isinstance(analysis, dict):
            ai_summary = analysis.get("summary", "N/A")
            ai_root = analysis.get("root_cause", "N/A")
            ai_suggestion = analysis.get("suggestion", "N/A")
        else:
            ai_summary = str(analysis)
            ai_root = "N/A"
            ai_suggestion = "N/A"
        
        payload = {
            "blocks": [
                {"type": "header", "text": {"type": "plain_text", "text": f"{severity_emoji} [{status}] {alert_name}"}},
                {"type": "section", "fields": [
                    {"type": "mrkdwn", "text": f"*Severity:* {severity}"},
                    {"type": "mrkdwn", "text": f"*Status:* {status}"},
                ]},
                {"type": "divider"},
                {"type": "section", "text": {"type": "mrkdwn", "text": f"*AI Summary:* {ai_summary}\n*Root Cause:* {ai_root}\n*Suggestion:* {ai_suggestion}"}}
            ]
        }
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(webhook_url, json=payload, timeout=10)
                logger.info("Slack notification sent for alert: %s", alert_name)
                return resp.status_code == 200
            except Exception as e:
                logger.error("Failed to send Slack notification: %s", str(e), exc_info=True)
                return False
    
    async def test_connection(self, config: dict) -> bool:
        test_alert = {"labels": {"alertname": "TestAlert", "severity": "info"}, "status": "firing", "annotations": {"summary": "Test"}}
        test_analysis = {"summary": "Test connection", "root_cause": "", "suggestion": "", "severity": "info"}
        return await self.send(test_alert, test_analysis, config)
