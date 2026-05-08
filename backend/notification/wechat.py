import httpx
from .base import NotificationChannel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger import logger

class WeChatChannel(NotificationChannel):
    def get_channel_type(self) -> str:
        return "wechat"
    
    async def send(self, alert_data: dict, analysis: dict, config: dict) -> bool:
        webhook_url = config.get("webhook_url", "")
        if not webhook_url:
            return False
        
        alert_name = alert_data.get("labels", {}).get("alertname", "Unknown")
        severity = alert_data.get("labels", {}).get("severity", "info").upper()
        status = alert_data.get("status", "firing").upper()
        
        if isinstance(analysis, dict):
            ai_summary = analysis.get("summary", "N/A")
            ai_suggestion = analysis.get("suggestion", "N/A")
        else:
            ai_summary = str(analysis)
            ai_suggestion = ""
        
        content = f"**Meerkat 告警分析**\n" \
                  f"> 告警名称: {alert_name}\n" \
                  f"> 级别: {severity}\n" \
                  f"> 状态: {status}\n" \
                  f"> AI摘要: {ai_summary}\n" \
                  f"> 建议: {ai_suggestion}"
        
        payload = {
            "msgtype": "markdown",
            "markdown": {"content": content}
        }
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(webhook_url, json=payload, timeout=10)
                logger.info("WeChat notification sent for alert: %s", alert_name)
                return resp.status_code == 200
            except Exception as e:
                logger.error("Failed to send WeChat notification: %s", str(e), exc_info=True)
                return False
    
    async def test_connection(self, config: dict) -> bool:
        test_alert = {"labels": {"alertname": "TestAlert", "severity": "info"}, "status": "firing", "annotations": {"summary": "Test"}}
        test_analysis = {"summary": "测试连接", "root_cause": "", "suggestion": "", "severity": "info"}
        return await self.send(test_alert, test_analysis, config)
