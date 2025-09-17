(() => {
  const DASH_LENGTH = 314.16;

  // Chart setup
  const chartSection = document.getElementById('chartSection');
  const chartCanvas = document.getElementById('progressChart');
  const chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;
  const fullBtn = document.getElementById('fullChartBtn');
  const currentBtn = document.getElementById('currentChartBtn');
  let chartInstance = null;
  let chartData = null;
  let currentMode = localStorage.getItem('chartMode') || 'full';

  if (fullBtn && currentBtn) {
    fullBtn.addEventListener('click', () => setChartMode('full'));
    currentBtn.addEventListener('click', () => setChartMode('current'));
    setActiveChartButton();
  }

  if (chartSection && chartSection.dataset.hasData === 'true') {
    showChartSection();
    refreshChartData();
  }

  async function refreshChartData() {
    if (!chartCanvas) {
      return;
    }
    try {
      const response = await fetch('/chart-data');
      if (!response.ok) {
        throw new Error('Failed to load chart data');
      }
      chartData = await response.json();
      if (Array.isArray(chartData.points) && chartData.points.length > 0) {
        if (chartSection) {
          chartSection.dataset.hasData = 'true';
          showChartSection();
        }
        requestAnimationFrame(() => createChart(currentMode));
      } else if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
    } catch (err) {
      console.error(err);
    }
  }

  function setChartMode(mode) {
    currentMode = mode;
    localStorage.setItem('chartMode', currentMode);
    setActiveChartButton();
    if (chartData && chartCanvas && (!chartSection || !chartSection.hasAttribute('hidden'))) {
      createChart(currentMode);
    }
  }

  function setActiveChartButton() {
    if (!fullBtn || !currentBtn) return;
    fullBtn.classList.toggle('active', currentMode === 'full');
    currentBtn.classList.toggle('active', currentMode === 'current');
  }

  function showChartSection() {
    if (!chartSection) return;
    if (chartSection.hasAttribute('hidden')) {
      chartSection.removeAttribute('hidden');
    }
  }

  function createChart(mode) {
    if (!chartCtx || !chartData) return;

    if (chartInstance) {
      chartInstance.destroy();
      chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    }

    const series = Array.isArray(chartData.points)
      ? chartData.points.map(p => ({ x: p.t, y: p.y }))
      : [];
    if (!series.length) {
      return;
    }

    const datasets = [{
      label: 'Закрыто',
      data: series,
      borderColor: '#0a84ff',
      backgroundColor: 'rgba(10,132,255,0.08)',
      tension: 0.25,
      fill: true,
      pointRadius: 2,
      borderWidth: 2,
      parsing: true,
    }];

    const hasProjection = mode === 'full' && chartData.projection && chartData.projection.to;
    if (hasProjection) {
      const from = chartData.projection.from;
      const to = chartData.projection.to;
      datasets.push({
        label: 'Прогноз',
        data: [
          { x: from.t, y: from.y },
          { x: to.t, y: to.y },
        ],
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
    const lastY = series[series.length - 1]?.y || 0;
    const suggestedMax = mode === 'full'
      ? Math.max(target || 0, lastY + 2)
      : lastY + 2;

    chartInstance = new Chart(chartCtx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 18, right: 24 },
        },
        scales: {
          x: {
            type: 'linear',
            grid: { display: false },
            ticks: {
              display: true,
              color: getCss('--muted'),
              callback: value => `${value} мин`,
            },
            title: {
              display: true,
              text: 'Минуты',
              color: getCss('--muted'),
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
              color: getCss('--muted'),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
          annotation: hasProjection && chartData.eta ? {
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
              },
            },
          } : {},
        },
        elements: { point: { radius: 2 } },
      },
    });
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
  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
    const initialOffset = progressCircle.getAttribute('stroke-dashoffset');
    progressCircle.style.strokeDashoffset = String(DASH_LENGTH);
    setTimeout(() => {
      progressCircle.style.strokeDashoffset = initialOffset;
    }, 100);
  }

  // Milestone confetti helpers
  function createConfetti() {
    const container = document.body;
    for (let i = 0; i < 30; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.animationDelay = Math.random() * 2 + 's';
      confetti.style.backgroundColor = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b'][Math.floor(Math.random() * 5)];
      container.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3000);
    }
  }

  function syncMilestones(currentAchieved) {
    const badges = document.querySelectorAll('.milestone-badge');
    const stored = JSON.parse(localStorage.getItem('achieved_milestones') || '[]');
    const achievedSet = new Set(currentAchieved || []);
    const newlyAchieved = [];

    badges.forEach(badge => {
      const milestone = parseInt(badge.dataset.milestone, 10);
      if (!Number.isFinite(milestone)) return;
      if (achievedSet.has(milestone)) {
        if (!badge.classList.contains('achieved')) {
          newlyAchieved.push(milestone);
        }
        badge.classList.add('achieved');
      } else {
        badge.classList.remove('achieved');
      }
    });

    const newMilestones = currentAchieved.filter(m => !stored.includes(m));
    if (newMilestones.length > 0 || newlyAchieved.length > 0) {
      createConfetti();
    }
    localStorage.setItem('achieved_milestones', JSON.stringify(currentAchieved));
  }

  const initialAchieved = Array.from(document.querySelectorAll('.milestone-badge.achieved'))
    .map(badge => parseInt(badge.dataset.milestone, 10))
    .filter(Number.isFinite);
  syncMilestones(initialAchieved);

  // Render activity calendar
  renderCalendar();

  // Add form handler
  const addForm = document.getElementById('addForm');
  if (addForm) {
    const handleAddSubmit = async (event) => {
      event.preventDefault();
      const submitBtn = addForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const formData = new FormData(addForm);
        const response = await fetch(addForm.action, {
          method: 'POST',
          body: formData,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error('Request failed');
        }
        const payload = await response.json();
        applyDashboardUpdate(payload);
        await refreshChartData();
      } catch (err) {
        console.error(err);
        addForm.removeEventListener('submit', handleAddSubmit);
        addForm.submit();
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    };

    addForm.addEventListener('submit', handleAddSubmit);
  }

  function applyDashboardUpdate(payload) {
    if (!payload || typeof payload !== 'object') return;

    const todayProgress = Number(payload.today_progress ?? 0);
    const dailyGoal = Number(payload.daily_goal ?? 0);
    const dailyPct = Number(payload.daily_pct ?? 0);
    const completed = Number(payload.completed ?? 0);
    const total = Number(payload.total ?? 0);
    const pct = Number(payload.pct ?? 0);
    const remaining = Number(payload.remaining ?? 0);
    const ratePerDay = payload.rate_per_day ?? 0;
    const etaIso = payload.eta_iso;

    const progressNumberEl = document.querySelector('.progress-text .progress-number');
    if (progressNumberEl) {
      progressNumberEl.textContent = `${todayProgress}/${dailyGoal}`;
    }

    if (progressCircle) {
      const clamped = Math.max(0, Math.min(100, dailyPct));
      const offset = DASH_LENGTH - (clamped / 100) * DASH_LENGTH;
      progressCircle.style.strokeDashoffset = offset;
    }

    const headerStrong = document.querySelectorAll('.progress-header strong');
    if (headerStrong.length >= 2) {
      headerStrong[0].textContent = completed;
      headerStrong[1].textContent = total;
    }
    const headerPct = document.querySelector('.progress-header > div:last-child');
    if (headerPct) {
      const formattedPct = Number.isFinite(pct) ? pct.toFixed(1) : '0.0';
      headerPct.textContent = `${formattedPct}%`;
    }

    const progressFill = document.querySelector('.progress-fill');
    if (progressFill && Number.isFinite(pct)) {
      const width = Math.max(0, Math.min(100, pct));
      progressFill.style.width = `${width}%`;
    }

    const footer = document.querySelector('.progress-footer');
    if (footer) {
      const spans = footer.querySelectorAll('span');
      if (spans[0]) {
        const strong = spans[0].querySelector('strong');
        if (strong) {
          strong.textContent = remaining;
        } else {
          spans[0].innerHTML = `Осталось: <strong>${remaining}</strong>`;
        }
      }
      if (spans[1]) {
        if (etaIso) {
          spans[1].innerHTML = `ETA: <strong>${etaIso}</strong>`;
        } else {
          spans[1].textContent = 'ETA: —';
        }
      }
      if (spans[2]) {
        const strong = spans[2].querySelector('strong');
        if (strong) {
          strong.textContent = ratePerDay;
        } else {
          spans[2].innerHTML = `Скорость: <strong>${ratePerDay}</strong>/день`;
        }
      }
    }

    const pageInput = document.getElementById('page');
    if (pageInput && Object.prototype.hasOwnProperty.call(payload, 'last_page')) {
      pageInput.value = payload.last_page;
    }
    const qInput = document.getElementById('question_number');
    if (qInput && Object.prototype.hasOwnProperty.call(payload, 'next_question_number')) {
      qInput.value = payload.next_question_number;
    }

    if (Array.isArray(payload.achieved_milestones)) {
      syncMilestones(payload.achieved_milestones);
    }

    if (Array.isArray(payload.calendar_data)) {
      window.calendarData = payload.calendar_data;
      renderCalendar();
    }

    if (chartSection && completed > 0) {
      chartSection.dataset.hasData = 'true';
      showChartSection();
    }
  }

  // Pomodoro Timer Logic
  let pomodoroTimer = null;
  let timeLeft = 25 * 60;
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
        timeLeft = 5 * 60;
        isWorkPhase = false;
      } else {
        breakCount++;
        timeLeft = 25 * 60;
        isWorkPhase = true;
      }
    }
    updateDisplay();
  }

  if (startBtn) startBtn.addEventListener('click', startTimer);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
  if (resetTimerBtn) resetTimerBtn.addEventListener('click', resetTimer);

  updateDisplay();
  if (startBtn) startBtn.disabled = false;
  if (pauseBtn) pauseBtn.disabled = true;

  // Expose refresh for debugging if needed
  window.refreshChartData = refreshChartData;
})();

function renderCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl || !window.calendarData) return;

  const data = window.calendarData;
  const activityMap = {};
  data.forEach(item => {
    activityMap[item.date] = item.count;
  });

  const activeDates = Object.keys(activityMap).sort();
  let startMonday;
  if (activeDates.length > 0) {
    const first = new Date(activeDates[0] + 'T00:00:00Z');
    startMonday = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
    let dow = startMonday.getUTCDay();
    if (dow === 0) dow = 7;
    startMonday.setUTCDate(startMonday.getUTCDate() - (dow - 1));
  } else {
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

  const nodes = [];
  nodes.push(createCorner());
  for (let w = 0; w < 5; w++) {
    const label = document.createElement('div');
    label.className = 'calendar-label week-label';
    label.textContent = String(w + 1);
    nodes.push(label);
  }

  const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

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
