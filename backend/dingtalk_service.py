import httpx
import time
import hmac
import hashlib
import base64
import urllib.parse
import json
from models import DingTalkConfig
from logger import logger

async def send_dingtalk_notification(alert_data: dict, analysis_result, config: DingTalkConfig):
    if not config or not config.webhook_url:
        return
    
    # Support both dict (structured) and str (legacy) analysis_result
    if isinstance(analysis_result, dict):
        ai_summary = analysis_result.get("summary", "N/A")
        ai_root_cause = analysis_result.get("root_cause", "N/A")
        ai_suggestion = analysis_result.get("suggestion", "N/A")
        ai_severity = analysis_result.get("severity", "N/A")
        ai_text = f"摘要: {ai_summary}\n\n根因: {ai_root_cause}\n\n建议: {ai_suggestion}\n\nAI评估严重程度: {ai_severity}"
    else:
        ai_text = str(analysis_result)
    
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
            await client.post(webhook_url, json=payload)
            logger.info("DingTalk notification sent successfully for alert: %s", alert_name)
        except Exception as e:
            logger.error("Failed to send DingTalk notification: %s", str(e), exc_info=True)
