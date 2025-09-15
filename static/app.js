(() => {
  const el = document.getElementById('progressChart');
  if (!el) return;

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
            grid: { color: 'rgba(0,0,0,0.06)' },
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
})();
