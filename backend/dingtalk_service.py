import httpx
import time
import hmac
import hashlib
import base64
import urllib.parse
import json
from models import DingTalkConfig

async def send_dingtalk_notification(alert_data: dict, analysis_result: str, config: DingTalkConfig):
    if not config or not config.webhook_url:
        return
    
    webhook_url = config.webhook_url
    
    # 处理加签
    if config.secret:
        timestamp = str(round(time.time() * 1000))
        secret_enc = config.secret.encode('utf-8')
        string_to_sign = '{}\n{}'.format(timestamp, config.secret)
        string_to_sign_enc = string_to_sign.encode('utf-8')
        hmac_code = hmac.new(secret_enc, string_to_sign_enc, digestmod=hashlib.sha256).digest()
        sign = urllib.parse.quote_plus(base64.b64encode(hmac_code))
        webhook_url = f"{webhook_url}&timestamp={timestamp}&sign={sign}"
    
    # 构建 Markdown 消息
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
                       f"{analysis_result}\n\n" \
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
            await client.post(webhook_url, json=payload)
        except Exception as e:
            print(f"Failed to send DingTalk notification: {str(e)}")
