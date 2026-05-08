import asyncio
import time
import hashlib
import json
from collections import OrderedDict
from typing import Optional, Dict, Any
from logger import logger

class AlertDeduplicator:
    """LRU cache-based alert deduplication and AI analysis caching"""
    
    def __init__(self, max_size: int = 1000, dedup_window_minutes: int = 5):
        self._cache: OrderedDict[str, dict] = OrderedDict()  # fingerprint -> {analysis, timestamp}
        self._max_size = max_size
        self._dedup_window = dedup_window_minutes * 60  # seconds
    
    def compute_fingerprint(self, alert_data: dict) -> str:
        """Compute fingerprint from alert labels for dedup"""
        labels = alert_data.get("labels", {})
        key_parts = [
            labels.get("alertname", ""),
            labels.get("severity", ""),
            labels.get("instance", ""),
            labels.get("job", ""),
            labels.get("namespace", ""),
        ]
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def is_duplicate(self, fingerprint: str) -> bool:
        """Check if this fingerprint was seen within the dedup window"""
        if fingerprint in self._cache:
            entry = self._cache[fingerprint]
            if time.time() - entry["timestamp"] < self._dedup_window:
                # Move to end (most recently used)
                self._cache.move_to_end(fingerprint)
                return True
        return False
    
    def get_cached_analysis(self, fingerprint: str) -> Optional[Dict[str, Any]]:
        """Get cached AI analysis result for this fingerprint"""
        if fingerprint in self._cache:
            entry = self._cache[fingerprint]
            if time.time() - entry["timestamp"] < self._dedup_window:
                self._cache.move_to_end(fingerprint)
                return entry.get("analysis")
        return None
    
    def cache_analysis(self, fingerprint: str, analysis: Dict[str, Any]):
        """Cache AI analysis result for this fingerprint"""
        # Evict oldest if at capacity
        while len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        
        self._cache[fingerprint] = {
            "analysis": analysis,
            "timestamp": time.time(),
        }
        self._cache.move_to_end(fingerprint)
        logger.info("Cached AI analysis for fingerprint: %s", fingerprint)
    
    def clear(self):
        """Clear all cache entries"""
        self._cache.clear()

    def clear_expired(self):
        """Remove expired entries from cache"""
        now = time.time()
        expired = [fp for fp, entry in self._cache.items() 
                   if now - entry["timestamp"] >= self._dedup_window]
        for fp in expired:
            del self._cache[fp]
        if expired:
            logger.info("Cleared %d expired cache entries", len(expired))


class AIRateLimiter:
    """Async semaphore-based AI API rate limiter"""
    
    def __init__(self, max_concurrent: int = 3):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_concurrent = max_concurrent
    
    async def acquire(self):
        await self._semaphore.acquire()
        logger.debug("AI rate limiter: acquired slot")
    
    def release(self):
        self._semaphore.release()
        logger.debug("AI rate limiter: released slot")


# Global instances
alert_dedup = AlertDeduplicator(max_size=1000, dedup_window_minutes=5)
ai_rate_limiter = AIRateLimiter(max_concurrent=3)
