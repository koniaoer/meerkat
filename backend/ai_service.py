import httpx
from openai import AsyncOpenAI
from models import ModelConfig
import json

async def analyze_alert_with_ai(alert_data: dict, config: ModelConfig):
    if not config:
        return "No active AI model configuration found."
    
    client = AsyncOpenAI(
        api_key=config.api_key,
        base_url=config.base_url
    )
    
    prompt = f"""
    You are an expert SRE and DevOps engineer. Analyze the following Prometheus alert and provide:
    1. A summary of what's happening.
    2. Potential root causes.
    3. Recommended troubleshooting steps.
    
    Alert Data:
    {json.dumps(alert_data, indent=2)}
    """
    
    try:
        response = await client.chat.completions.create(
            model=config.model_name,
            messages=[
                {"role": "system", "content": "You are a helpful assistant for analyzing system alerts."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"AI Analysis failed: {str(e)}"
