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
                return {'total': 0, 'events': []}
            with open(self.path, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = {'total': 0, 'events': []}
        data.setdefault('total', 0)
        data.setdefault('events', [])
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
        self._write(data)

