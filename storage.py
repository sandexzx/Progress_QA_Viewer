from __future__ import annotations

import json
import os
import threading
from typing import List, Dict, Any


class Storage:
    def __init__(self, path: str):
        self.path = self._normalize_path(path)
        self._lock = threading.Lock()
        if not os.path.exists(self.path):
            self._ensure_parent()
            self._write(self._initial_state())

    def _normalize_path(self, raw_path: str) -> str:
        """Allow mounting a directory in place of the JSON file (e.g. Docker bind)."""
        if os.path.isdir(raw_path):
            for candidate_name in ('data.json', 'progress.json'):
                candidate = os.path.join(raw_path, candidate_name)
                if os.path.isfile(candidate):
                    return candidate
            return os.path.join(raw_path, 'data.json')
        return raw_path

    def _initial_state(self) -> Dict[str, Any]:
        return {
            'total': 0,
            'events': [],
            'daily_goal': 10,
            'daily_progress': {},
        }

    def _ensure_parent(self):
        parent = os.path.dirname(self.path)
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)

    def _read(self) -> Dict[str, Any]:
        with self._lock:
            if not os.path.exists(self.path):
                return self._initial_state()
            with open(self.path, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = self._initial_state()
        data.setdefault('total', 0)
        data.setdefault('events', [])
        data.setdefault('daily_goal', 10)
        data.setdefault('daily_progress', {})

        # Convert old int events to dict format for backward compatibility
        events = data.get('events', [])
        converted_events = []
        for event in events:
            if isinstance(event, int):
                converted_events.append({'ts': event})
            else:
                converted_events.append(event)
        data['events'] = converted_events

        return data

    def _write(self, data: Dict[str, Any]):
        tmp_path = self.path + '.tmp'
        with self._lock:
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, separators=(',', ':'), indent=2)
            os.replace(tmp_path, self.path)

    def reset(self):
        data = self._read()
        daily_goal = data.get('daily_goal', 10)
        self._write({
            'total': 0,
            'events': [],
            'daily_goal': daily_goal,
            'daily_progress': {},
        })

    def get_total(self) -> int:
        return int(self._read().get('total', 0))

    def set_total(self, total: int):
        data = self._read()
        data['total'] = int(total)
        self._write(data)

    def get_events(self) -> List[Dict[str, Any]]:
        return list(self._read().get('events', []))

    def add_event(self, ts_ms: int, page: int = None, question_number: int = None):
        data = self._read()
        events = data.get('events', [])

        # Normalize order (should already be sorted by earlier writes)
        events.sort(key=lambda e: e['ts'])

        # Determine existing numbering/page state before adding
        numbered_events = [e for e in events if 'question_number' in e and 'page' in e]
        had_numbers_before = len(numbered_events) > 0
        # Count legacy events without numbering (backward compatibility)
        legacy_events = [e for e in events if 'question_number' not in e]

        # Helper to compute next pair with 1..10 wrap
        def _next_pair_from_last(last_page: int, last_qn: int):
            if last_qn >= 10:
                return (last_page + 1, 1)
            return (last_page, last_qn + 1)

        # Auto-assign question_number/page if not provided
        if question_number is None or page is None:
            if had_numbers_before:
                last = sorted(numbered_events, key=lambda e: e['ts'])[-1]
                lp = int(last.get('page', 1))
                lq = int(last.get('question_number', 0))
                np, nq = _next_pair_from_last(lp, lq)
                if question_number is None:
                    question_number = nq
                if page is None:
                    # If user supplied qn=1 but page missing and last_qn was 10, bump page
                    if question_number == 1 and lq >= 10:
                        page = lp + 1
                    else:
                        page = np
            else:
                # No numbers before: derive from legacy count
                legacy_count = len(legacy_events)
                # Next number cycles 1..10, page increments each 10
                nq = (legacy_count % 10) + 1
                np = (legacy_count // 10) + 1
                if question_number is None:
                    question_number = nq
                if page is None:
                    page = np

        # Append and persist (still keep chronological order)
        new_event = {'ts': int(ts_ms), 'page': page, 'question_number': int(question_number)}
        events.append(new_event)
        events.sort(key=lambda e: e['ts'])
        data['events'] = events

        # Backward compatibility: if we just introduced numbering, fill legacy events
        if not had_numbers_before and len(legacy_events) > 0:
            legacy_events_sorted = sorted(legacy_events, key=lambda e: e['ts'])
            for idx, ev in enumerate(legacy_events_sorted):
                ev['question_number'] = (idx % 10) + 1
                ev['page'] = (idx // 10) + 1

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
