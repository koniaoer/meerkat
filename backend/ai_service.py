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
        return {"summary": "No active AI model configuration found.", "root_cause": "", "suggestion": "", "severity": "low"}
    
    client = AsyncOpenAI(
        api_key=config.api_key,
        base_url=config.base_url
    )
    
    prompt = f"""
    You are an expert SRE and DevOps engineer. Analyze the following Prometheus alert and return your analysis STRICTLY as a JSON object with exactly these four fields:

    - "summary": A concise summary of what's happening (string)
    - "root_cause": Potential root cause analysis (string)
    - "suggestion": Recommended troubleshooting and fix steps (string)
    - "severity": Severity level, must be one of: low, medium, high, critical (string)

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
                    return {"summary": content, "root_cause": "", "suggestion": "", "severity": "low"}
            else:
                # Fallback: return raw text in summary
                return {"summary": content, "root_cause": "", "suggestion": "", "severity": "low"}
        
        # Validate and normalize the result
        default = {"summary": "", "root_cause": "", "suggestion": "", "severity": "low"}
        for key in default:
            if key not in result:
                result[key] = default[key]
            elif key == "severity" and result[key] not in ("low", "medium", "high", "critical"):
                result[key] = "low"
        
        return result
    except Exception as e:
        logger.error("AI Analysis failed: %s", str(e), exc_info=True)
        return {"summary": f"AI Analysis failed: {str(e)}", "root_cause": "", "suggestion": "", "severity": "low"}
