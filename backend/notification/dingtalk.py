import httpx
import time
import hmac
import hashlib
import base64
import urllib.parse
from .base import NotificationChannel
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger import logger

class DingTalkChannel(NotificationChannel):
    def get_channel_type(self) -> str:
        return "dingtalk"
    
    async def send(self, alert_data: dict, analysis: dict, config: dict) -> bool:
        webhook_url = config.get("webhook_url", "")
        secret = config.get("secret")
        
        if not webhook_url:
            return False
        
        # Support both dict and str analysis
        if isinstance(analysis, dict):
            ai_summary = analysis.get("summary", "N/A")
            ai_root_cause = analysis.get("root_cause", "N/A")
            ai_suggestion = analysis.get("suggestion", "N/A")
            ai_severity = analysis.get("severity", "N/A")
            ai_text = f"摘要: {ai_summary}\n\n根因: {ai_root_cause}\n\n建议: {ai_suggestion}\n\nAI评估严重程度: {ai_severity}"
        else:
            ai_text = str(analysis)
        
        # Handle signing
        if secret:
            timestamp = str(round(time.time() * 1000))
            secret_enc = secret.encode('utf-8')
            string_to_sign = '{}\n{}'.format(timestamp, secret)
            string_to_sign_enc = string_to_sign.encode('utf-8')
            hmac_code = hmac.new(secret_enc, string_to_sign_enc, digestmod=hashlib.sha256).digest()
            sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
            webhook_url = f"{webhook_url}&timestamp={timestamp}&sign={sign}"
        
        alert_name = alert_data.get("labels", {}).get("alertname", "Unknown Alert")
        severity = alert_data.get("labels", {}).get("severity", "info").upper()
        status = alert_data.get("status", "firing").upper()
        
        title = f"[{status}] {alert_name}"
        
        markdown_content = f"### 🚨 Meerkat 告警分析\n\n" \
                           f"**告警名称**: {alert_name}\n\n" \
                           f"**级别**: {severity}\n\n" \
                           f"**状态**: {status}\n\n" \
                           f"**摘要**: {alert_data.get('annotations', {}).get('summary', 'N/A')}\n\n" \
                           f"---\n\n" \
                           f"**🤖 AI 分析建议**:\n\n" \
                           f"{ai_text}\n\n" \
                           f"---\n\n" \
                           f"[查看详情](http://localhost:3000/alerts)"
        
        payload = {
            "msgtype": "markdown",
            "markdown": {
                "title": title,
                "text": markdown_content
            }
        }
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(webhook_url, json=payload, timeout=10)
                logger.info("DingTalk notification sent for alert: %s", alert_name)
                return resp.status_code == 200
            except Exception as e:
                logger.error("Failed to send DingTalk notification: %s", str(e), exc_info=True)
                return False
    
    async def test_connection(self, config: dict) -> bool:
        test_alert = {
            "labels": {"alertname": "TestAlert", "severity": "info"},
            "status": "firing",
            "annotations": {"summary": "Test from Meerkat"}
        }
        test_analysis = {"summary": "测试连接", "root_cause": "", "suggestion": "", "severity": "info"}
        return await self.send(test_alert, test_analysis, config)
