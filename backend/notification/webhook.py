import httpx
from .base import NotificationChannel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger import logger

class WebhookChannel(NotificationChannel):
    def get_channel_type(self) -> str:
        return "webhook"
    
    async def send(self, alert_data: dict, analysis: dict, config: dict) -> bool:
        url = config.get("url", "")
        method = config.get("method", "POST").upper()
        headers = config.get("headers", {})
        
        if not url:
            return False
        
        payload = {
            "alert": alert_data,
            "analysis": analysis,
        }
        
        async with httpx.AsyncClient() as client:
            try:
                if method == "POST":
                    resp = await client.post(url, json=payload, headers=headers, timeout=10)
                else:
                    resp = await client.get(url, params=payload, headers=headers, timeout=10)
                logger.info("Webhook notification sent to %s, status=%d", url, resp.status_code)
                return resp.status_code < 400
            except Exception as e:
                logger.error("Failed to send webhook notification: %s", str(e), exc_info=True)
                return False
    
    async def test_connection(self, config: dict) -> bool:
        test_alert = {"labels": {"alertname": "TestAlert", "severity": "info"}, "status": "firing", "annotations": {"summary": "Test"}}
        test_analysis = {"summary": "Test connection", "root_cause": "", "suggestion": "", "severity": "info"}
        return await self.send(test_alert, test_analysis, config)
