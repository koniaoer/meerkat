import os
import httpx
import re
import json
from openai import AsyncOpenAI
from models import ModelConfig
from logger import logger

async def analyze_alert_with_ai(alert_data: dict, config: ModelConfig) -> dict:
    if not config:
        logger.warning("No active AI model configuration found for alert analysis")
        return {"summary": "No active AI model configuration found.", "root_cause": "", "suggestion": "", "severity": "low", "actions": []}
    
    client = AsyncOpenAI(
        api_key=config.api_key,
        base_url=config.base_url
    )
    
    prompt = f"""
You are an expert SRE and DevOps engineer. Analyze the following Prometheus alert and return your analysis STRICTLY as a JSON object with these fields:

- "summary": A concise summary of what's happening (string)
- "root_cause": Potential root cause analysis (string)
- "suggestion": Recommended troubleshooting steps (string)
- "severity": Severity level, must be one of: low, medium, high, critical (string)
- "actions": A list of remediation actions that can be automatically executed. Each action must have:
  - "action_type": one of "shell", "http", "webhook", "script"
  - "name": short human-readable name (e.g., "Restart nginx", "Check disk usage", "Scale up pods")
  - "description": what this action does and why
  - "config": JSON object with action-specific parameters:
    - For shell: {{"command": "the shell command to run"}}
    - For http: {{"url": "http://...", "method": "POST", "headers": {{}}, "body": {{}}}}
    - For webhook: {{"url": "http://...", "payload": {{}}}}
    - For script: {{"name": "script_name", "args": []}}
  - "risk_level": one of "low", "medium", "high"
    - low: read-only, check status (e.g., df -h, systemctl status, kubectl get pods)
    - medium: restart service, scale up (e.g., systemctl restart nginx, kubectl scale deployment)
    - high: delete data, modify critical config, restart entire server

IMPORTANT RULES for actions:
- Always include at least one low-risk diagnostic action (e.g., check service status, check disk, check logs)
- Only suggest medium/high risk actions if you're confident they'll help
- Never suggest destructive actions (rm -rf, drop database) as automated actions
- For Kubernetes: use kubectl commands
- For systemd services: use systemctl commands
- Keep commands simple and safe

IMPORTANT: Return ONLY the JSON object, no markdown, no code fences, no extra text.

Alert Data:
{json.dumps(alert_data, indent=2)}
"""
    
    try:
        response = await client.chat.completions.create(
            model=config.model_name,
            messages=[
                {"role": "system", "content": "You are a helpful assistant for analyzing system alerts. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=float(os.environ.get("AI_TEMPERATURE", "0.7")),
            max_tokens=int(os.environ.get("AI_MAX_TOKENS", "2000")),
        )
        content = response.choices[0].message.content
        logger.info("AI analysis completed successfully for alert: %s", alert_data.get("labels", {}).get("alertname", "Unknown"))
        
        # Try to parse JSON from the response
        try:
            result = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code fences
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
            if json_match:
                try:
                    result = json.loads(json_match.group(1).strip())
                except json.JSONDecodeError:
                    # Fallback: return raw text in summary
                    return {"summary": content, "root_cause": "", "suggestion": "", "severity": "low", "actions": []}
            else:
                # Fallback: return raw text in summary
                return {"summary": content, "root_cause": "", "suggestion": "", "severity": "low", "actions": []}
        
        # Validate and normalize the result
        default = {"summary": "", "root_cause": "", "suggestion": "", "severity": "low"}
        for key in default:
            if key not in result:
                result[key] = default[key]
            elif key == "severity" and result[key] not in ("low", "medium", "high", "critical"):
                result[key] = "low"
        
        # Validate actions
        if "actions" not in result or not isinstance(result["actions"], list):
            result["actions"] = []
        else:
            # Validate each action
            valid_actions = []
            for action in result["actions"]:
                if isinstance(action, dict) and "action_type" in action and "name" in action:
                    if "config" not in action or not isinstance(action["config"], dict):
                        action["config"] = {}
                    if "risk_level" not in action or action["risk_level"] not in ("low", "medium", "high"):
                        action["risk_level"] = "medium"
                    if "description" not in action:
                        action["description"] = action["name"]
                    valid_actions.append(action)
            result["actions"] = valid_actions
        
        return result
    except Exception as e:
        error_msg = str(e)
        logger.error("AI Analysis failed: %s", error_msg, exc_info=True)
        
        # 友好错误提示
        if "404" in error_msg:
            hint = f"API 返回 404，请检查 Base URL 和模型名称是否正确 (base_url={config.base_url}, model={config.model_name})"
        elif "401" in error_msg or "Authentication" in error_msg:
            hint = "API 认证失败，请检查 API Key 是否正确"
        elif "Connection" in error_msg:
            hint = f"无法连接 API 服务器，请检查 Base URL 是否可达 ({config.base_url})"
        else:
            hint = f"AI 分析失败: {error_msg}"
        
        return {"summary": hint, "root_cause": "", "suggestion": "", "severity": "low", "actions": []}
