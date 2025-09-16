(() => {
  // Chart block (guarded so the rest of the script still runs)
  const el = document.getElementById('progressChart');
  if (el) {
    const ctx = el.getContext('2d');
    let chartInstance = null;
    let chartData = null;
    let currentMode = localStorage.getItem('chartMode') || 'full'; // 'full' or 'current'

    const fullBtn = document.getElementById('fullChartBtn');
    const currentBtn = document.getElementById('currentChartBtn');

    fetch('/chart-data')
      .then(r => r.json())
      .then(data => {
        chartData = data;
        createChart(currentMode);

        fullBtn.addEventListener('click', () => {
          currentMode = 'full';
          localStorage.setItem('chartMode', currentMode);
          fullBtn.classList.add('active');
          currentBtn.classList.remove('active');
          createChart(currentMode);
        });

        currentBtn.addEventListener('click', () => {
          currentMode = 'current';
          localStorage.setItem('chartMode', currentMode);
          currentBtn.classList.add('active');
          fullBtn.classList.remove('active');
          createChart(currentMode);
        });

        // Set initial active classes based on currentMode
        if (currentMode === 'full') {
          fullBtn.classList.add('active');
          currentBtn.classList.remove('active');
        } else {
          currentBtn.classList.add('active');
          fullBtn.classList.remove('active');
        }
      })
      .catch(() => {});

    function createChart(mode) {
      if (chartInstance) {
        chartInstance.destroy();
        ctx.clearRect(0, 0, el.width, el.height);
      }

      const series = chartData.points.map(p => ({ x: p.t, y: p.y }));
      const datasets = [];

      if (series.length) {
        datasets.push({
          label: 'Закрыто',
          data: series,
          borderColor: '#0a84ff',
          backgroundColor: 'rgba(10,132,255,0.08)',
          tension: 0.25,
          fill: true,
          pointRadius: 2,
          borderWidth: 2,
          parsing: true,
        });
      }

      if (mode === 'full' && chartData.projection) {
        const from = chartData.projection.from;
        const to = chartData.projection.to;
        const projSeries = [
          { x: from.t, y: from.y },
          { x: to.t, y: to.y },
        ];

        datasets.push({
          label: 'Прогноз',
          data: projSeries,
          borderColor: '#34c759',
          backgroundColor: 'transparent',
          tension: 0,
          fill: false,
          pointRadius: 0,
          borderDash: [6, 6],
          borderWidth: 2,
        });
      }

      const target = chartData.total;
      let suggestedMax;
      if (mode === 'full') {
        suggestedMax = Math.max(target || 0, (series[series.length - 1]?.y || 0) + 2);
      } else {
        suggestedMax = (series[series.length - 1]?.y || 0) + 2;
      }

      chartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { top: 18, right: 24 }
          },
          scales: {
            x: {
              type: 'linear',
              grid: { display: false },
              ticks: {
                display: true,
                color: getCss('--muted'),
                callback: (value) => `${value} мин`
              },
              title: {
                display: true,
                text: 'Минуты',
                color: getCss('--muted')
              },
            },
            y: {
              beginAtZero: true,
              suggestedMax,
              grid: { color: getCss('--border') },
              ticks: { color: getCss('--muted') },
              title: {
                display: true,
                text: 'Количество',
                color: getCss('--muted')
              },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false },
            annotation: mode === 'full' && chartData.eta ? {
              annotations: {
                etaLabel: {
                  type: 'label',
                  xValue: chartData.projection.to.t,
                  yValue: target,
                  content: new Date(chartData.eta).toLocaleString('ru-RU'),
                  backgroundColor: 'rgba(52, 199, 89, 0.8)',
                  color: 'white',
                  font: { size: 12 },
                  padding: 4,
                  cornerRadius: 4,
                  position: 'center',
                  xAdjust: -60,
                  yAdjust: 10,
                }
              }
            } : {},
          },
          elements: { point: { radius: 2 } },
        }
      });
    }
  }

  function getCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // Reset button functionality
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Вы уверены, что хотите сбросить весь прогресс? Это действие нельзя отменить.')) {
        fetch('/reset', { method: 'POST' })
          .then(() => window.location.reload())
          .catch(() => alert('Ошибка при сбросе'));
      }
    });
  }

  // Circular progress animation
  const circularProgress = document.querySelector('.circular-progress');
  if (circularProgress) {
    const progressCircle = circularProgress.querySelector('.progress-circle');
    if (progressCircle) {
      // Get initial progress from data attribute or calculate
      const initialOffset = progressCircle.getAttribute('stroke-dashoffset');
      // Animate from 0 to current value
      progressCircle.style.strokeDashoffset = '314.16';
      setTimeout(() => {
        progressCircle.style.strokeDashoffset = initialOffset;
      }, 100);
    }
  }

  // Milestone confetti animation
  function createConfetti() {
    const container = document.body;
    for (let i = 0; i < 30; i++) { // Reduced to 30 for lighter animation
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.animationDelay = Math.random() * 2 + 's';
      confetti.style.backgroundColor = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b'][Math.floor(Math.random() * 5)];
      container.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3000);
    }
  }

  // Check for new milestones and trigger confetti
  const badges = document.querySelectorAll('.milestone-badge.achieved');
  const currentAchieved = Array.from(badges).map(b => parseInt(b.dataset.milestone));
  const stored = JSON.parse(localStorage.getItem('achieved_milestones') || '[]');
  const newMilestones = currentAchieved.filter(m => !stored.includes(m));
  if (newMilestones.length > 0) {
    createConfetti();
    localStorage.setItem('achieved_milestones', JSON.stringify(currentAchieved));
  }

  // Render activity calendar
  renderCalendar();

  // Pomodoro Timer Logic
  let pomodoroTimer = null;
  let timeLeft = 25 * 60; // 25 minutes in seconds
  let isRunning = false;
  let isWorkPhase = true;
  let workCount = 0;
  let breakCount = 0;

  const timerEl = document.getElementById('timer');
  const phaseEl = document.getElementById('phase');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetTimerBtn = document.getElementById('resetTimerBtn');
  const workCountEl = document.getElementById('workCount');
  const breakCountEl = document.getElementById('breakCount');

  function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    phaseEl.textContent = isWorkPhase ? 'Работа' : 'Отдых';
    workCountEl.textContent = workCount;
    breakCountEl.textContent = breakCount;
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    pomodoroTimer = setInterval(tick, 1000);
    startBtn.disabled = true;
    pauseBtn.disabled = false;
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(pomodoroTimer);
    startBtn.disabled = false;
    pauseBtn.disabled = true;
  }

  function resetTimer() {
    pauseTimer();
    timeLeft = 25 * 60;
    isWorkPhase = true;
    workCount = 0;
    breakCount = 0;
    updateDisplay();
    startBtn.disabled = false;
    pauseBtn.disabled = true;
  }

  function tick() {
    timeLeft--;
    if (timeLeft <= 0) {
      if (isWorkPhase) {
        workCount++;
        timeLeft = 5 * 60; // 5 minutes break
        isWorkPhase = false;
      } else {
        breakCount++;
        timeLeft = 25 * 60; // 25 minutes work
        isWorkPhase = true;
      }
      // Optional: play sound or show notification
      // new Audio('/static/notification.mp3').play();
    }
    updateDisplay();
  }

  // Event listeners
  if (startBtn) startBtn.addEventListener('click', startTimer);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
  if (resetTimerBtn) resetTimerBtn.addEventListener('click', resetTimer);

  // Initialize display
  updateDisplay();
  // Initial controls state
  if (startBtn) startBtn.disabled = false;
  if (pauseBtn) pauseBtn.disabled = true;
})();

function renderCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl || !window.calendarData) return;

  const data = window.calendarData;
  const activityMap = {};
  data.forEach(item => {
    activityMap[item.date] = item.count;
  });

  // We render a compact 7x5 grid (7 days x 5 weeks)
  // Week 1 is the week when the first activity started.
  const activeDates = Object.keys(activityMap).sort();
  // Determine start Monday in UTC
  let startMonday;
  if (activeDates.length > 0) {
    const first = new Date(activeDates[0] + 'T00:00:00Z');
    startMonday = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
    let dow = startMonday.getUTCDay(); // 0=Sun
    if (dow === 0) dow = 7; // make Sunday=7
    startMonday.setUTCDate(startMonday.getUTCDate() - (dow - 1)); // back to Monday
  } else {
    // Fallback: current week Monday (UTC)
    const today = new Date();
    const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    let dow = utc.getUTCDay();
    if (dow === 0) dow = 7;
    utc.setUTCDate(utc.getUTCDate() - (dow - 1));
    startMonday = utc;
  }

  const days = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(startMonday);
    d.setUTCDate(startMonday.getUTCDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const count = activityMap[dateStr] || 0;
    days.push({ date: dateStr, count });
  }

  // Build nodes for a labeled grid (extra top row and left column)
  // First row: corner + week labels
  const nodes = [];
  nodes.push(createCorner());
  for (let w = 0; w < 5; w++) {
    const label = document.createElement('div');
    label.className = 'calendar-label week-label';
    label.textContent = String(w + 1); // Weeks 1..5
    nodes.push(label);
  }

  const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  // Remaining rows: day label + 5 cells each
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const dayLabel = document.createElement('div');
    dayLabel.className = 'calendar-label day-label';
    dayLabel.textContent = dayNames[dayOfWeek];
    nodes.push(dayLabel);

    for (let week = 0; week < 5; week++) {
      const index = week * 7 + dayOfWeek;
      const dayData = days[index];
      const div = document.createElement('div');
      div.className = 'calendar-day';
      if (dayData && dayData.count > 0) {
        div.classList.add('active');
        div.setAttribute('data-count', Math.min(dayData.count, 5));
      }
      nodes.push(div);
    }
  }

  calendarEl.innerHTML = '';
  nodes.forEach(n => calendarEl.appendChild(n));
}

function createCorner() {
  const d = document.createElement('div');
  d.className = 'calendar-corner';
  return d;
}
