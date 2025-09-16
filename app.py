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

    @app.route('/', methods=['GET'])
    def index():
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

        return render_template(
            'index.html',
            total=total,
            completed=completed,
            remaining=remaining,
            pct=pct,
            rate_per_day=rate_per_day,
            eta_iso=eta_date,
            daily_goal=daily_goal,
            today_progress=today_progress,
            daily_pct=daily_pct,
            milestones=milestones,
            achieved_milestones=achieved_milestones,
        )

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
        storage.add_event(_now_ms())
        return redirect(url_for('index'))

    @app.route('/chart-data', methods=['GET'])
    def chart_data():
        total = storage.get_total()
        events = storage.get_events()
        points = []
        cumulative = 0
        first_ts = events[0] if events else 0
        for ts in sorted(events):
            cumulative += 1
            minutes_elapsed = (ts - first_ts) / 60000.0  # Convert ms to minutes
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
        data = storage._read()
        data['total'] = 0
        data['events'] = []
        storage._write(data)
        return redirect(url_for('index'))

    def _compute_rate_and_eta(total: int, events: List[int]):
        if not events:
            return (0.0, None)
        events = sorted(events)
        n = len(events)
        now_ms = int(time.time() * 1000)

        if n >= 2:
            t0 = events[0]
            tn = events[-1]
        else:
            t0 = events[0]
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

    return app


app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
