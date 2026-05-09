"""
AI-powered remediation recommender.

Strategy:
1. Find matching templates by labels/keywords (fast, deterministic)
2. If AI is available, ask AI to:
   a. Pick the best template(s) from matches
   b. Fill in template placeholders with context from the alert
   c. Suggest additional custom actions not in templates
3. Create RemediationAction records for each recommendation
"""

import json
import re
import crud, models, schemas
from logger import logger


def fill_template(config_template: str, context: dict) -> str:
    """Replace {{placeholder}} in template with context values."""
    def replacer(match):
        key = match.group(1)
        return str(context.get(key, match.group(0)))
    return re.sub(r'\{\{(\w+)\}\}', replacer, config_template)


async def recommend_remediations(db, alert: models.Alert, analysis: dict, ai_service_module=None):
    """
    Generate remediation action recommendations for an alert.
    Returns list of created RemediationAction objects.
    """
    # Parse alert context
    try:
        raw = json.loads(alert.raw_data) if alert.raw_data else {}
    except (json.JSONDecodeError, TypeError):
        raw = {}
    labels = raw.get("labels", {})
    alert_name = alert.alert_name or ""
    summary = alert.summary or ""
    severity = alert.severity or "info"

    # Step 1: Find matching templates
    matched_templates = crud.find_matching_templates(db, labels, severity, alert_name, summary)

    actions_created = []
    for tmpl in matched_templates[:3]:  # Max 3 template-based recommendations
        # Fill placeholders with alert context
        context = {
            "service_name": labels.get("service", labels.get("job", labels.get("instance", ""))),
            "namespace": labels.get("namespace", "default"),
            "app_name": labels.get("app", labels.get("deployment", "")),
            "deployment_name": labels.get("deployment", labels.get("app", "")),
            "pod": labels.get("pod", ""),
            "instance": labels.get("instance", ""),
            "key_pattern": "*",
            "replicas": "3",
            "health_url": f"http://{labels.get('instance', 'localhost')}/health",
        }
        filled_config = fill_template(tmpl.config_template, context)

        action_create = schemas.RemediationActionCreate(
            alert_id=alert.id,
            action_type=tmpl.action_type,
            name=f"[模板] {tmpl.name}",
            description=tmpl.description or "",
            config=filled_config,
            risk_level=tmpl.risk_level,
        )
        auto_approved = not tmpl.requires_approval
        db_action = crud.create_remediation_action(db, action_create, auto_approved=auto_approved)
        # Link template
        crud.increment_template_usage(db, tmpl.id, False)  # Will update on execution
        actions_created.append(db_action)

    # Step 2: AI-enhanced recommendations (if AI available)
    if ai_service_module and analysis and isinstance(analysis, dict):
        try:
            ai_suggestions = analysis.get("actions", [])
            for action_data in ai_suggestions[:2]:  # Max 2 AI-suggested actions
                # Skip if similar action already created from template
                action_name = action_data.get("name", "")
                if any(f"[模板]" not in a.name for a in actions_created):
                    continue  # Already has AI actions
                action_create = schemas.RemediationActionCreate(
                    alert_id=alert.id,
                    action_type=action_data.get("action_type", "shell"),
                    name=f"[AI] {action_name}",
                    description=action_data.get("description", ""),
                    config=json.dumps(action_data.get("config", {}), ensure_ascii=False),
                    risk_level=action_data.get("risk_level", "medium"),
                )
                db_action = crud.create_remediation_action(db, action_create, auto_approved=False)
                actions_created.append(db_action)
        except Exception as e:
            logger.warning("AI remediation suggestion failed: %s", e)

    return actions_created
