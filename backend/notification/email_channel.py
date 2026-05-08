import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from .base import NotificationChannel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger import logger

class EmailChannel(NotificationChannel):
    def get_channel_type(self) -> str:
        return "email"
    
    async def send(self, alert_data: dict, analysis: dict, config: dict) -> bool:
        smtp_host = config.get("smtp_host", "")
        smtp_port = int(config.get("smtp_port", 587))
        smtp_user = config.get("smtp_user", "")
        smtp_password = config.get("smtp_password", "")
        from_addr = config.get("from_addr", smtp_user)
        to_addrs = config.get("to_addrs", "")  # comma-separated
        
        if not all([smtp_host, smtp_user, smtp_password, to_addrs]):
            logger.warning("Email channel missing required config")
            return False
        
        alert_name = alert_data.get("labels", {}).get("alertname", "Unknown")
        severity = alert_data.get("labels", {}).get("severity", "info").upper()
        status = alert_data.get("status", "firing").upper()
        
        if isinstance(analysis, dict):
            ai_summary = analysis.get("summary", "N/A")
            ai_root = analysis.get("root_cause", "N/A")
            ai_suggestion = analysis.get("suggestion", "N/A")
        else:
            ai_summary = str(analysis)
            ai_root = ai_suggestion = "N/A"
        
        subject = f"[{status}] {alert_name} - {severity}"
        
        html = f"""<html><body>
        <h2>🚨 Meerkat 告警分析</h2>
        <table border="1" cellpadding="8"><tr><td>告警名称</td><td>{alert_name}</td></tr>
        <tr><td>级别</td><td>{severity}</td></tr><tr><td>状态</td><td>{status}</td></tr></table>
        <h3>AI 分析</h3><p><b>摘要:</b> {ai_summary}</p>
        <p><b>根因:</b> {ai_root}</p><p><b>建议:</b> {ai_suggestion}</p>
        </body></html>"""
        
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = to_addrs
            msg.attach(MIMEText(html, "html", "utf-8"))
            
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(from_addr, [a.strip() for a in to_addrs.split(",")], msg.as_string())
            
            logger.info("Email notification sent for alert: %s", alert_name)
            return True
        except Exception as e:
            logger.error("Failed to send email notification: %s", str(e), exc_info=True)
            return False
    
    async def test_connection(self, config: dict) -> bool:
        test_alert = {"labels": {"alertname": "TestAlert", "severity": "info"}, "status": "firing", "annotations": {"summary": "Test from Meerkat"}}
        test_analysis = {"summary": "测试连接", "root_cause": "", "suggestion": "", "severity": "info"}
        return await self.send(test_alert, test_analysis, config)
