// Live Chart.js plot. Chart.js is loaded globally by a <script> tag in index.html.

const axis = (text) => ({
  title: { display: true, text, color: "#64748b", font: { size: 9 } },
  ticks: { color: "#64748b", font: { size: 8 } },
  grid: { color: "#1e293b" },
});

const line = (label, color, extra = {}) => ({
  label,
  data: [],
  borderColor: color,
  borderWidth: 1.5,
  pointRadius: 0,
  fill: false,
  ...extra,
});

export function createQueueChart(canvas, maxPoints = 50) {
  if (!canvas || typeof Chart === "undefined") return { push() {} };

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        line("Empirical Wq", "#38bdf8", {
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
          fill: true,
        }),
        line("M/M/1 Model", "#f87171", { borderDash: [5, 5] }),
        line("M/G/1 Model", "#4ade80", { borderDash: [3, 3] }),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      scales: {
        x: { ...axis("Job Index"), ticks: { color: "#64748b", font: { size: 8 }, maxTicksLimit: 8 } },
        y: { ...axis("Wait Time (Wq) [s]"), beginAtZero: true },
      },
      plugins: {
        legend: { position: "top", labels: { color: "#94a3b8", boxWidth: 10, font: { size: 9 } } },
      },
    },
  });

  const finite = (v) => (v === Infinity ? null : v); // null = gap in the line

  return {
    push(label, stats) {
      chart.data.labels.push(label);
      chart.data.datasets[0].data.push(stats.meanWq);
      chart.data.datasets[1].data.push(finite(stats.mm1PredictedWq));
      chart.data.datasets[2].data.push(finite(stats.mg1PredictedWq));
      if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets.forEach((ds) => ds.data.shift());
      }
      chart.update();
    },
  };
}
