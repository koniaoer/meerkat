import asyncio
import json
from typing import Dict, Any, List
from .base import NotificationChannel
from .dingtalk import DingTalkChannel
from .wechat import WeChatChannel
from .slack import SlackChannel
from .email_channel import EmailChannel
from .webhook import WebhookChannel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logger import logger

CHANNEL_REGISTRY: Dict[str, NotificationChannel] = {
    "dingtalk": DingTalkChannel(),
    "wechat": WeChatChannel(),
    "slack": SlackChannel(),
    "email": EmailChannel(),
    "webhook": WebhookChannel(),
}

class NotificationManager:
    """Manage and dispatch notifications to all active channels"""
    
    def get_channel(self, channel_type: str) -> NotificationChannel:
        return CHANNEL_REGISTRY.get(channel_type)
    
    async def dispatch(self, alert_data: dict, analysis: dict, channels: list) -> Dict[str, bool]:
        """Send notification to all provided channel configs concurrently.
        channels: list of dicts with channel_type and config fields.
        Returns dict of channel_name -> success"""
        
        if not channels:
            return {}
        
        tasks = []
        names = []
        for ch in channels:
            channel_type = ch.get("channel_type", "")
            config = ch.get("config", {})
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except:
                    config = {}
            
            channel_impl = CHANNEL_REGISTRY.get(channel_type)
            if channel_impl:
                tasks.append(channel_impl.send(alert_data, analysis, config))
                names.append(ch.get("name", channel_type))
            else:
                logger.warning("Unknown channel type: %s", channel_type)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        outcome = {}
        for name, result in zip(names, results):
            if isinstance(result, Exception):
                logger.error("Channel %s failed with exception: %s", name, result)
                outcome[name] = False
            else:
                outcome[name] = result
        
        return outcome
    
    async def test_channel(self, channel_type: str, config: dict) -> bool:
        """Test a specific channel"""
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except:
                config = {}
        
        channel_impl = CHANNEL_REGISTRY.get(channel_type)
        if not channel_impl:
            return False
        return await channel_impl.test_connection(config)

# Global instance
notification_manager = NotificationManager()
