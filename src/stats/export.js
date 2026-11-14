let exportDataLog = [];

export function logForExport(receipt, telemetry, stats) {
  if (!stats) return;

  const waitTimeSeconds = (telemetry.tQueueExit - telemetry.tArrival) / 1000;

  exportDataLog.push({
    Sequence: receipt.sequence,
    Algorithm: receipt.algorithm,
    Target_Lambda: stats.lambda,
    Arrival_Time_ms: telemetry.tArrival.toFixed(3),
    Wait_Time_Wq_sec: waitTimeSeconds.toFixed(6),
    Service_Time_S_sec: telemetry.serviceTimeSeconds.toFixed(6),
    Utilization_Rho: stats.rho.toFixed(4),
    Empirical_Mean_Wq: stats.meanWq.toFixed(6),
    Theoretical_MM1_Wq:
      stats.mm1PredictedWq === Infinity
        ? "Infinity"
        : stats.mm1PredictedWq.toFixed(6),
    Theoretical_MG1_Wq:
      stats.mg1PredictedWq === Infinity
        ? "Infinity"
        : stats.mg1PredictedWq.toFixed(6),
  });
}

export function clearExportLog() {
  exportDataLog = [];
}

export function downloadCSV() {
  if (exportDataLog.length === 0) {
    alert("No data to export! Run a simulation first.");
    return;
  }

  const headers = Object.keys(exportDataLog[0]);

  const csvRows = [];
  csvRows.push(headers.join(",")); // Header row

  for (const row of exportDataLog) {
    const values = headers.map((header) => row[header]);
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute("download", `notary_simulation_${Date.now()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
