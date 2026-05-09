"""
Alert suppression engine — check if an alert should be suppressed.

Suppression types:
- label: suppress any alert matching the labels (permanent until rule disabled)
- maintenance: suppress alerts within a time window (start_time ~ end_time)
- frequency: suppress repeated alerts within N minutes (same fingerprint)
"""
import json
import time
from typing import Tuple, Optional, Dict
from collections import OrderedDict
from datetime import datetime
from sqlalchemy.orm import Session
import models
from logger import logger


class FrequencySuppressor:
    """In-memory cache for frequency-based suppression (like alert_dedup)."""
    def __init__(self, max_size: int = 500):
        self._cache: OrderedDict[str, float] = OrderedDict()  # fingerprint -> last_notify_timestamp
        self._max_size = max_size

    def should_suppress(self, fingerprint: str, frequency_minutes: int) -> bool:
        now = time.time()
        if fingerprint in self._cache:
            elapsed = now - self._cache[fingerprint]
            if elapsed < frequency_minutes * 60:
                self._cache.move_to_end(fingerprint)
                return True
        # Not suppressed — record this notification time
        while len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        self._cache[fingerprint] = now
        self._cache.move_to_end(fingerprint)
        return False

    def clear_expired(self):
        now = time.time()
        expired = [fp for fp, ts in self._cache.items() if now - ts > 3600]  # 1h max
        for fp in expired:
            del self._cache[fp]


# Global instance
_freq_suppressor = FrequencySuppressor()


def _match_labels(rule_labels: dict, alert_labels: dict) -> bool:
    if not rule_labels:
        return True
    for key, value in rule_labels.items():
        if alert_labels.get(key) != value:
            return False
    return True


def _match_severity(rule_severity: str, alert_severity: str) -> bool:
    if not rule_severity:
        return True
    allowed = [s.strip().lower() for s in rule_severity.split(",") if s.strip()]
    return alert_severity.lower() in allowed


def should_suppress(alert_labels: dict, alert_severity: str,
                    fingerprint: str, db: Session) -> Tuple[bool, Optional[str]]:
    """
    Check if an alert should be suppressed.
    Returns (suppressed: bool, reason: Optional[str]).
    """
    rules = db.query(models.AlertSuppressionRule).filter(
        models.AlertSuppressionRule.is_active == True
    ).all()

    for rule in rules:
        try:
            rule_labels = rule.get_match_labels()
            if not (_match_labels(rule_labels, alert_labels) and _match_severity(rule.match_severity, alert_severity)):
                continue

            if rule.suppression_type == "label":
                return True, f"标签抑制规则: {rule.name}"

            elif rule.suppression_type == "maintenance":
                now = datetime.utcnow()
                start = rule.start_time
                end = rule.end_time
                if start and end and start <= now <= end:
                    return True, f"维护窗口抑制: {rule.name} ({start.strftime('%H:%M')}~{end.strftime('%H:%M')})"
                elif start and not end and now >= start:
                    return True, f"维护窗口抑制: {rule.name} (从 {start.strftime('%H:%M')} 起)"

            elif rule.suppression_type == "frequency":
                if rule.frequency_minutes and rule.frequency_minutes > 0:
                    if _freq_suppressor.should_suppress(fingerprint, rule.frequency_minutes):
                        return True, f"频率抑制: {rule.name} ({rule.frequency_minutes}分钟内)"

        except Exception as e:
            logger.error("Error evaluating suppression rule id=%d: %s", rule.id, e)
            continue

    # Periodic cleanup
    _freq_suppressor.clear_expired()
    return False, None
