from __future__ import annotations

import json
import os
import threading
from typing import List, Dict, Any


class Storage:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        if not os.path.exists(self.path):
            self._ensure_parent()
            self._write({'total': 0, 'events': []})

    def _ensure_parent(self):
        parent = os.path.dirname(self.path)
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)

    def _read(self) -> Dict[str, Any]:
        with self._lock:
            if not os.path.exists(self.path):
                return {'total': 0, 'events': [], 'daily_goal': 10, 'daily_progress': {}}
            with open(self.path, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = {'total': 0, 'events': [], 'daily_goal': 10, 'daily_progress': {}}
        data.setdefault('total', 0)
        data.setdefault('events', [])
        data.setdefault('daily_goal', 10)
        data.setdefault('daily_progress', {})
        return data

    def _write(self, data: Dict[str, Any]):
        tmp_path = self.path + '.tmp'
        with self._lock:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, separators=(',', ':'), indent=2)
            os.replace(tmp_path, self.path)

    def get_total(self) -> int:
        return int(self._read().get('total', 0))

    def set_total(self, total: int):
        data = self._read()
        data['total'] = int(total)
        self._write(data)

    def get_events(self) -> List[int]:
        return list(self._read().get('events', []))

    def add_event(self, ts_ms: int):
        data = self._read()
        events = data.get('events', [])
        events.append(int(ts_ms))
        events.sort()
        data['events'] = events

        # Update daily progress
        from datetime import datetime, timezone
        dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
        date_str = dt.date().isoformat()
        daily_progress = data.get('daily_progress', {})
        daily_progress[date_str] = daily_progress.get(date_str, 0) + 1
        data['daily_progress'] = daily_progress

        self._write(data)

    def get_daily_goal(self) -> int:
        return int(self._read().get('daily_goal', 10))

    def set_daily_goal(self, goal: int):
        data = self._read()
        data['daily_goal'] = int(goal)
        self._write(data)

    def get_daily_progress(self, date_str: str) -> int:
        return int(self._read().get('daily_progress', {}).get(date_str, 0))

    def get_today_progress(self) -> int:
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).date().isoformat()
        return self.get_daily_progress(today)

