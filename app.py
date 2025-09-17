from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from flask import Flask, render_template, request, redirect, url_for, jsonify

from storage import Storage


def create_app() -> Flask:
    app = Flask(__name__)
    app.config['JSON_SORT_KEYS'] = False

    data_path = os.path.join(os.path.dirname(__file__), 'progress.json')
    storage = Storage(data_path)

    def _now_ms() -> int:
        return int(time.time() * 1000)

    def _get_dashboard_state() -> Dict[str, Any]:
        total = storage.get_total()
        events = storage.get_events()
        completed = len(events)
        remaining = max(total - completed, 0)
        pct = (completed / total * 100.0) if total > 0 else 0.0
        if pct > 100:
            pct = 100.0

        # Milestones
        milestones = [25, 50, 75, 100]
        achieved_milestones = [m for m in milestones if pct >= m]

        # Stats
        rate_per_day, eta_ms = _compute_rate_and_eta(total, events)
        if eta_ms:
            eta_date = datetime.fromtimestamp(eta_ms / 1000.0, tz=timezone.utc).date().isoformat()
        else:
            eta_date = None

        # Daily goal stats
        daily_goal = storage.get_daily_goal()
        today_progress = storage.get_today_progress()
        daily_pct = (today_progress / daily_goal * 100.0) if daily_goal > 0 else 0.0

        # Calendar data: last 365 days with activity
        calendar_data = _get_calendar_data(events)

        # Next page/number considering that question_number is 1..10 per page
        # Strategy:
        # - If there are numbered events, take the most recent with both fields and wrap 10->1 with page+1
        # - If none are numbered yet, derive from legacy count so UI shows the correct next pair
        next_qn = 1
        next_page = 1
        numbered = [e for e in events if 'question_number' in e and 'page' in e]
        if numbered:
            last = sorted(numbered, key=lambda x: x['ts'])[-1]
            lp = int(last.get('page', 1))
            lq = int(last.get('question_number', 0))
            if lq >= 10:
                next_qn = 1
                next_page = lp + 1
            else:
                next_qn = max(1, lq + 1)
                next_page = lp
        else:
            legacy_count = len(events)
            next_qn = (legacy_count % 10) + 1 if legacy_count > 0 else 1
            next_page = (legacy_count // 10) + 1 if legacy_count > 0 else 1

        return {
            'total': total,
            'completed': completed,
            'remaining': remaining,
            'pct': pct,
            'rate_per_day': rate_per_day,
            'eta_iso': eta_date,
            'daily_goal': daily_goal,
            'today_progress': today_progress,
            'daily_pct': daily_pct,
            'milestones': milestones,
            'achieved_milestones': achieved_milestones,
            'calendar_data': calendar_data,
            'next_question_number': next_qn,
            'last_page': next_page,
        }

    @app.route('/', methods=['GET'])
    def index():
        return render_template('index.html', **_get_dashboard_state())

    @app.route('/set_total', methods=['POST'])
    def set_total():
        try:
            total_str = request.form.get('total', '').strip()
            total = int(total_str)
            if total < 0:
                total = 0
        except Exception:
            return redirect(url_for('index'))

        storage.set_total(total)
        return redirect(url_for('index'))

    @app.route('/add', methods=['POST'])
    def add():
        page = request.form.get('page', type=int)
        question_number = request.form.get('question_number', type=int)
        # Sanitize inputs; if missing or out of bounds, let storage auto-assign
        if page is not None and page < 1:
            page = 1
        if question_number is not None:
            if question_number < 1 or question_number > 10:
                # Invalid number -> delegate to auto assignment
                question_number = None
                # If number is None but user gave page, keep page
        storage.add_event(_now_ms(), page, question_number)
        wants_json = request.accept_mimetypes.best == 'application/json' or \
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            return jsonify(_get_dashboard_state())
        return redirect(url_for('index'))

    @app.route('/chart-data', methods=['GET'])
    def chart_data():
        total = storage.get_total()
        events = storage.get_events()
        points = []
        cumulative = 0
        first_ts = events[0]['ts'] if events else 0
        for event in sorted(events, key=lambda e: e['ts']):
            cumulative += 1
            minutes_elapsed = (event['ts'] - first_ts) / 60000.0  # Convert ms to minutes
            points.append({
                't': minutes_elapsed,
                'y': cumulative,
            })

        # Projection
        rate_per_day, eta_ms = _compute_rate_and_eta(total, events)
        projection = None
        if eta_ms and len(points) > 0:
            last = points[-1]
            eta_minutes = (eta_ms - first_ts) / 60000.0
            projection = {
                'from': last,
                'to': {
                    't': eta_minutes,
                    'y': total,
                }
            }

        return jsonify({
            'points': points,
            'total': total,
            'eta': eta_ms,
            'rate_per_day': rate_per_day,
            'projection': projection,
        })

    @app.route('/reset', methods=['POST'])
    def reset():
        storage.reset()
        return redirect(url_for('index'))

    def _compute_rate_and_eta(total: int, events: List[Dict[str, Any]]):
        if not events:
            return (0.0, None)
        events_ts = sorted([e['ts'] for e in events])
        n = len(events_ts)
        now_ms = int(time.time() * 1000)

        if n >= 2:
            t0 = events_ts[0]
            tn = events_ts[-1]
        else:
            t0 = events_ts[0]
            tn = now_ms

        # Avoid division by zero; add small epsilon of 1 minute
        duration_ms = max(tn - t0, 60_000)
        duration_days = duration_ms / 86_400_000.0
        rate_per_day = n / duration_days

        remaining = max(total - n, 0)
        if rate_per_day <= 0 or remaining == 0:
            return (round(rate_per_day, 2), None)

        days_remaining = remaining / rate_per_day
        eta_dt = datetime.now(timezone.utc) + timedelta(days=days_remaining)
        eta_ms = int(eta_dt.timestamp() * 1000)
        return (round(rate_per_day, 2), eta_ms)

    def _to_iso(ts_ms: int) -> str:
        return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat()

    def _get_calendar_data(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        from collections import defaultdict
        from datetime import timedelta

        if not events:
            return []

        # Group events by date
        date_counts = defaultdict(int)
        for event in events:
            dt = datetime.fromtimestamp(event['ts'] / 1000.0, tz=timezone.utc)
            date_str = dt.date().isoformat()
            date_counts[date_str] += 1

        # Get last 365 days
        today = datetime.now(timezone.utc).date()
        start_date = today - timedelta(days=364)  # 365 days including today

        calendar_data = []
        current_date = start_date
        while current_date <= today:
            date_str = current_date.isoformat()
            count = date_counts.get(date_str, 0)
            if count > 0:
                calendar_data.append({'date': date_str, 'count': count})
            current_date += timedelta(days=1)

        return calendar_data

    return app


app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
