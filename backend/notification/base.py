from abc import ABC, abstractmethod
from typing import Dict, Any

class NotificationChannel(ABC):
    """Abstract base class for notification channels"""
    
    @abstractmethod
    async def send(self, alert_data: dict, analysis: dict, config: dict) -> bool:
        """Send notification. Returns True on success."""
        pass
    
    @abstractmethod
    async def test_connection(self, config: dict) -> bool:
        """Test channel connectivity. Returns True on success."""
        pass
    
    @abstractmethod
    def get_channel_type(self) -> str:
        """Return channel type identifier"""
        pass
