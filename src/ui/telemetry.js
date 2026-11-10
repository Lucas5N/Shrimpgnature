// The four KPI cards (Panel 2).

export function createTelemetryView({ rho, mu, meanS, queueDepth }) {
  return {
    setQueueDepth(n) {
      if (queueDepth) queueDepth.textContent = n;
    },
    update(stats) {
      if (!stats) return;
      if (rho) {
        rho.textContent = stats.rho.toFixed(2);
        rho.style.color = stats.rho >= 1.0 ? "#ef4444" : stats.rho >= 0.8 ? "#f59e0b" : "#38bdf8";
      }
      if (mu) mu.textContent = `${stats.mu.toFixed(1)} req/s`;
      if (meanS) meanS.textContent = `${(stats.meanS * 1000).toFixed(1)} ms`;
    },
  };
}
