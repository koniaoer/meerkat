"""
ChatOps engine — conversational alert operations.

Understands natural language commands and maps them to actions:
- "确认告警 #5" → acknowledge alert 5
- "静默告警 #3 2小时" → silence alert 3 for 120 min
- "查看告警 #7" → show alert detail
- "搜索磁盘告警" → search alerts by keyword
- "应用模板3到告警5" → apply template to alert
- "当前值班是谁" → show on-call
- "有多少活跃告警" → show stats
- Other → AI chat with context (knowledge base + alerts)
"""

import re
import json
import uuid
import crud, models, schemas, ai_service
from logger import logger
from datetime import datetime


def parse_command(text: str):
    """Parse natural language command into structured action."""
    text = text.strip()
    lower = text.lower()

    # Acknowledge: "确认告警 #5" / "ack alert 5" / "确认 5"
    m = re.search(r'(?:确认|ack|acknowledge)\s*(?:告警)?\s*#?(\d+)', lower)
    if m:
        return {"action": "acknowledge", "alert_id": int(m.group(1))}

    # Silence: "静默告警 #3 2小时" / "silence 3 30m" / "静默 3 60分钟"
    m = re.search(r'(?:静默|silence|muted?)\s*(?:告警)?\s*#?(\d+)\s*(?:(\d+)\s*(小时|h|小时|分钟|min|m|天|d))?', lower)
    if m:
        alert_id = int(m.group(1))
        duration = int(m.group(2)) if m.group(2) else 60
        unit = m.group(3) or 'min'
        if unit in ('小时', 'h'):
            duration *= 60
        elif unit in ('天', 'd'):
            duration *= 1440
        return {"action": "silence", "alert_id": alert_id, "duration": duration}

    # View alert: "查看告警 #7" / "show alert 7" / "看看 7"
    m = re.search(r'(?:查看|看看|show|view|detail)\s*(?:告警)?\s*#?(\d+)', lower)
    if m:
        return {"action": "view_alert", "alert_id": int(m.group(1))}

    # Search alerts: "搜索磁盘告警" / "search disk alerts"
    m = re.search(r'(?:搜索|查找|search|find)\s*(.+?)(?:告警|alerts?)?$', lower)
    if m:
        return {"action": "search_alerts", "query": m.group(1).strip()}

    # Apply template: "应用模板3到告警5" / "apply template 3 to alert 5"
    m = re.search(r'(?:应用|apply)\s*模板\s*#?(\d+)\s*(?:到|to)\s*告警\s*#?(\d+)', lower)
    if m:
        return {"action": "apply_template", "template_id": int(m.group(1)), "alert_id": int(m.group(2))}

    # On-call: "当前值班" / "who is on call"
    if re.search(r'(?:值班|on.?call|oncall)', lower):
        return {"action": "oncall"}

    # Stats: "统计" / "多少告警" / "how many alerts"
    if re.search(r'(?:统计|多少|how many|stats|overview)', lower):
        return {"action": "stats"}

    # List firing: "活跃告警" / "firing alerts"
    if re.search(r'(?:活跃|firing|未恢复)', lower) and re.search(r'(?:告警|alert)', lower):
        return {"action": "firing_alerts"}

    return None


async def handle_chatops(db, message: str, session_id: str = None, alert_id: int = None, user: models.User = None):
    """
    Process a ChatOps message and return response.
    """
    if not session_id:
        session_id = str(uuid.uuid4())[:8]

    # Save user message
    crud.save_chat_message(db, session_id, "user", message, alert_id=alert_id)

    # Try to parse as command first
    cmd = parse_command(message)
    response_text = ""
    action_taken = None

    if cmd:
        try:
            if cmd["action"] == "acknowledge":
                alert = db.query(models.Alert).filter(models.Alert.id == cmd["alert_id"]).first()
                if not alert:
                    response_text = f"❌ 告警 #{cmd['alert_id']} 不存在"
                elif alert.acknowledged:
                    response_text = f"⚠️ 告警 #{cmd['alert_id']} 已经确认过了"
                else:
                    crud.acknowledge_alert(db, cmd["alert_id"], acknowledged_by=user.username if user else "chatops")
                    response_text = f"✅ 已确认告警 #{cmd['alert_id']} ({alert.alert_name})"
                    action_taken = json.dumps({"action": "acknowledge", "alert_id": cmd["alert_id"]})

            elif cmd["action"] == "silence":
                alert = db.query(models.Alert).filter(models.Alert.id == cmd["alert_id"]).first()
                if not alert:
                    response_text = f"❌ 告警 #{cmd['alert_id']} 不存在"
                else:
                    crud.silence_alert(db, cmd["alert_id"], cmd["duration"])
                    response_text = f"🔇 已静默告警 #{cmd['alert_id']} ({alert.alert_name}) {cmd['duration']} 分钟"
                    action_taken = json.dumps({"action": "silence", "alert_id": cmd["alert_id"], "duration": cmd["duration"]})

            elif cmd["action"] == "view_alert":
                alert = db.query(models.Alert).filter(models.Alert.id == cmd["alert_id"]).first()
                if not alert:
                    response_text = f"❌ 告警 #{cmd['alert_id']} 不存在"
                else:
                    status_emoji = "🔴" if alert.status == "firing" else "🟢"
                    ack_emoji = "✅" if alert.acknowledged else "⏳"
                    response_text = f"{status_emoji} **告警 #{alert.id}**\n"
                    response_text += f"  名称: {alert.alert_name}\n"
                    response_text += f"  级别: {alert.severity}\n"
                    response_text += f"  状态: {alert.status}\n"
                    response_text += f"  确认: {ack_emoji}\n"
                    if alert.analysis_summary:
                        response_text += f"  分析: {alert.analysis_summary[:200]}\n"

            elif cmd["action"] == "search_alerts":
                alerts = db.query(models.Alert).filter(
                    models.Alert.alert_name.ilike(f"%{cmd['query']}%")
                ).order_by(models.Alert.created_at.desc()).limit(5).all()
                if not alerts:
                    response_text = f"🔍 未找到与 '{cmd['query']}' 相关的告警"
                else:
                    response_text = f"🔍 找到 {len(alerts)} 条相关告警:\n"
                    for a in alerts:
                        emoji = "🔴" if a.status == "firing" else "🟢"
                        response_text += f"  {emoji} #{a.id} {a.alert_name} [{a.severity}] {a.status}\n"

            elif cmd["action"] == "apply_template":
                tmpl = crud.get_remediation_template(db, cmd["template_id"])
                alert = db.query(models.Alert).filter(models.Alert.id == cmd["alert_id"]).first()
                if not tmpl:
                    response_text = f"❌ 模板 #{cmd['template_id']} 不存在"
                elif not alert:
                    response_text = f"❌ 告警 #{cmd['alert_id']} 不存在"
                else:
                    from remediation_recommender import fill_template
                    raw = json.loads(alert.raw_data) if alert.raw_data else {}
                    labels = raw.get("labels", {})
                    context = {"service_name": labels.get("service", ""), "namespace": labels.get("namespace", "default"), "instance": labels.get("instance", "")}
                    filled = fill_template(tmpl.config_template, context)
                    action_create = schemas.RemediationActionCreate(
                        alert_id=cmd["alert_id"], action_type=tmpl.action_type,
                        name=f"[ChatOps] {tmpl.name}", description=tmpl.description or "",
                        config=filled, risk_level=tmpl.risk_level,
                    )
                    result = crud.create_remediation_action(db, action_create, auto_approved=not tmpl.requires_approval)
                    response_text = f"🔧 已应用模板「{tmpl.name}」到告警 #{cmd['alert_id']}\n"
                    response_text += f"  风险: {tmpl.risk_level} | {'需要审批' if tmpl.requires_approval else '自动执行'}\n"
                    response_text += f"  操作ID: #{result.id}"
                    action_taken = json.dumps({"action": "apply_template", "template_id": cmd["template_id"], "alert_id": cmd["alert_id"]})

            elif cmd["action"] == "oncall":
                now = datetime.utcnow()
                shifts = db.query(models.OnCallShift).filter(
                    models.OnCallShift.start_time <= now, models.OnCallShift.end_time >= now
                ).all()
                if not shifts:
                    response_text = "👤 当前没有值班人员"
                else:
                    lines = []
                    for s in shifts:
                        u = db.query(models.User).filter(models.User.id == s.user_id).first()
                        name = u.display_name or u.username if u else "未知"
                        lines.append(f"  👤 {name} (至 {s.end_time.strftime('%H:%M')})")
                    response_text = "📋 当前值班:\n" + "\n".join(lines)

            elif cmd["action"] == "stats":
                stats = crud.get_alert_stats(db)
                response_text = f"📊 告警统计:\n"
                response_text += f"  总数: {stats['total']}\n"
                response_text += f"  🔴 触发: {stats['firing']}\n"
                response_text += f"  🟢 已恢复: {stats['resolved']}\n"
                response_text += f"  ✅ 已确认: {stats['acknowledged']}\n"
                if stats.get('recent_24h'):
                    response_text += f"  📈 24h新增: {stats['recent_24h']}\n"

            elif cmd["action"] == "firing_alerts":
                alerts = db.query(models.Alert).filter(models.Alert.status == "firing").order_by(models.Alert.created_at.desc()).limit(10).all()
                if not alerts:
                    response_text = "🎉 当前没有活跃告警！"
                else:
                    response_text = f"🔴 当前 {len(alerts)} 条活跃告警:\n"
                    for a in alerts:
                        ack = "✅" if a.acknowledged else "⏳"
                        response_text += f"  {ack} #{a.id} [{a.severity}] {a.alert_name}\n"

        except Exception as e:
            logger.error("ChatOps command error: %s", e)
            response_text = f"❌ 命令执行失败: {str(e)}"

    else:
        # Not a command → AI chat with context
        try:
            config = db.query(models.ModelConfig).filter(models.ModelConfig.is_active == True).first()
            if not config:
                response_text = "⚠️ AI 模型未配置，无法回答。请先在「AI 模型」页面配置模型。"
            else:
                # Build context from DB
                context_parts = []
                if alert_id:
                    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
                    if alert:
                        context_parts.append(f"当前告警: #{alert.id} {alert.alert_name} [{alert.severity}] {alert.status}")
                        if alert.analysis_summary:
                            context_parts.append(f"AI分析: {alert.analysis_summary}")
                # Recent firing alerts
                firing = db.query(models.Alert).filter(models.Alert.status == "firing").limit(5).all()
                if firing:
                    context_parts.append("活跃告警: " + ", ".join(f"#{a.id} {a.alert_name}" for a in firing))
                # Relevant knowledge articles
                if alert_id:
                    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
                    if alert and alert.alert_name:
                        articles = crud.find_articles_for_alert(db, alert.alert_name)
                        if articles:
                            for art in articles[:2]:
                                context_parts.append(f"知识库[{art.title}]: {art.content[:300]}")

                # Get chat history for context
                history = crud.get_chat_history(db, session_id, limit=6)
                history_msgs = [{"role": m.role, "content": m.content} for m in history[:-1]]  # exclude current

                system_prompt = f"""你是 Meerkat 智能运维助手。你可以帮助用户管理告警、分析问题、推荐修复方案。
当前系统上下文:
{chr(10).join(context_parts) if context_parts else '暂无活跃告警'}

你可以理解的快捷命令:
- 确认告警 #ID — 确认告警
- 静默告警 #ID 时长 — 静默告警 (如: 静默告警 #3 30分钟)
- 查看告警 #ID — 查看告警详情
- 搜索 关键词 — 搜索告警
- 当前值班 — 查看值班人员
- 统计 — 查看告警统计

请用中文简洁回答。"""

                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=config.api_key, base_url=config.base_url)
                resp = await client.chat.completions.create(
                    model=config.model_name,
                    messages=[{"role": "system", "content": system_prompt}] + history_msgs + [{"role": "user", "content": message}],
                    temperature=0.7, max_tokens=1000,
                )
                response_text = resp.choices[0].message.content

        except Exception as e:
            logger.error("ChatOps AI error: %s", e)
            response_text = f"❌ AI 回答失败: {str(e)[:100]}"

    # Save assistant response
    msg = crud.save_chat_message(db, session_id, "assistant", response_text,
                                  action_taken=action_taken, alert_id=alert_id)
    return msg
