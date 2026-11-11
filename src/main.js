// main.js - WIRING ONLY. Creates the modules and connects events to them.
// Data flow: UI/generator -> submitDigest -> FIFO server -> worker -> SIGN_SUCCESS
//            -> ledger + stats + UI.
import { sha256Bytes } from "./lib/encoding.js";
import { createFifoServer } from "./queue/fifoServer.js";
import { createTelemetryWindow } from "./stats/queueStats.js";
import { createPoissonGenerator } from "./sim/poissonGenerator.js";
import { verifyReceiptSignature, auditLedger } from "./ledger/auditLog.js";
import { tamperLastDigest, rewriteHistory } from "./ledger/attacks.js";
import { createTerminal } from "./ui/terminal.js";
import { createQueueChart } from "./ui/chart.js";
import { createTelemetryView } from "./ui/telemetry.js";
import { createAuditTable } from "./ui/auditTable.js";
import { truncateFileName } from "./ui/format.js";
import { logForExport, clearExportLog, downloadCSV } from "./stats/export.js";

// --- State ---
const $ = (id) => document.getElementById(id);
const publicAuditLog = [];
const authorityPublicKeys = {};
let currentLambda = 5; // configured arrival rate, used for rho and the models

// --- UI pieces ---
const { log } = createTerminal($("console-output"));
const chart = createQueueChart($("queue-chart"), 50);
const telemetryView = createTelemetryView({
  rho: $("kpi-rho"),
  mu: $("kpi-mu"),
  meanS: $("kpi-means"),
  queueDepth: $("kpi-queue-depth"),
});
const auditTable = createAuditTable($("log-rows"), {
  onVerify: verifySingleRow,
  onRewrite: attackRewriteRow,
});
const metrics = createTelemetryWindow(100);

const btnSign = $("btn-sign");
const btnSim = $("btn-sim");
const fileInput = $("file-input");
const selectAlgo = $("select-algo");
const btnExportCsv = $("btn-export-csv");
const currentAlgo = () => (selectAlgo ? selectAlgo.value : "ECDSA");

// Nothing may be submitted until the worker has generated its keys.
function setReady(ready) {
  for (const el of [btnSign, btnSim, fileInput, btnExportCsv])
    if (el) el.disabled = !ready;
}
setReady(false);

// --- Worker + queue ---
log("Spawning Central Notary Authority...");
const notaryWorker = new Worker(
  new URL("./worker/worker.js", import.meta.url),
  { type: "module" },
);

//createFifoServer which is in fifoserver.js takes in two functions as parameters, the onDepthChange defaults to nothing if not provided
// while the dispatch one takes in a request and creates a post message of type SIGN_REQUEST to the notary.
const server = createFifoServer({
  dispatch: (request) =>
    notaryWorker.postMessage({ type: "SIGN_REQUEST", data: request }),
  onDepthChange: telemetryView.setQueueDepth,
});

//request is made up of the following properties: id, docDigestBytes, algorithm, tArrival, tQueueExit
function submitDigest(docDigestBytes, algorithm = "ECDSA") {
  server.enqueue({ id: crypto.randomUUID(), docDigestBytes, algorithm });
}

//prepares the submit message containing the info of the req. then provides the log function, then the onstatechange based on the presence or not of
// btnSim in the DOM. If it is present, it changes the text and class of the button based on whether the generator is running or not.
const generator = createPoissonGenerator({
  submit: submitDigest,
  log,
  onStateChange(running) {
    if (!btnSim) return;
    btnSim.textContent = running ? "Stop Workload" : "Start Workload";
    btnSim.className = running ? "danger" : "success";
  },
});

if (btnExportCsv) {
  btnExportCsv.addEventListener("click", () => {
    downloadCSV();
  });
}

// worker message handlers, here we define a function called by the worker which forwards its keys to the main authority and notifies the UI that the authority is ready to accept requests.
//  It also handles signing success and error messages, updating the audit log and metrics accordingly.
const workerHandlers = {
  INIT_SUCCESS({ publicKeys }) {
    Object.assign(authorityPublicKeys, publicKeys);
    const badge = $("worker-badge");
    if (badge) {
      badge.textContent = "ONLINE";
      badge.className = "badge online";
    }
    setReady(true);
    log("Central Authority ready with internal Audit Ledger.");
    log("Public Keys Loaded: ECDSA and RSA-PSS.");
  },

  INIT_ERROR({ error }) {
    const badge = $("worker-badge");
    if (badge) {
      badge.textContent = "INIT ERROR";
      badge.className =
        "px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
    log(`ERROR: ${error}`);
  },

  //here we handle the SIGN_SUCCESS message from the worker, which includes the receipt and telemetry data.
  //  We calculate the wait time and service time, update the receipt with the signer's public key, which we'll obtain here by the authority.js file.
  // push it to the public audit log, render the audit table, log the successful minting of the block, record metrics,
  //  update the telemetry view, and complete the server request.
  SIGN_SUCCESS({ receipt, telemetry }) {
    const waitMs = telemetry.tQueueExit - telemetry.tArrival;
    const serviceMs = telemetry.serviceTimeSeconds * 1000;

    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];
    publicAuditLog.push(receipt);
    auditTable.render(publicAuditLog);
    log(
      `✅ Block #${receipt.sequence} minted | Wait: ${waitMs.toFixed(1)}ms | Service: ${serviceMs.toFixed(1)}ms`,
    );

    metrics.record(
      telemetry.tArrival,
      telemetry.tQueueExit,
      telemetry.serviceTimeSeconds,
    );
    const stats = metrics.snapshot(currentLambda);
    telemetryView.update(stats);
    if (stats) chart.push(`#${receipt.sequence}`, stats);
    logForExport(receipt, telemetry, stats);

    server.complete();
  },

  SIGN_ERROR({ id, error }) {
    log(`ERROR: Failed to sign request [${id || "unknown"}]: ${error}`);
    server.complete();
  },
};

notaryWorker.onmessage = ({ data: { type, payload } }) =>
  workerHandlers[type]?.(payload);

// --- Table actions ---
// publicAuditlog is an array of recepits which are made up of the following properties: sequence, algorithm, docDigestHex, signatureHex, signerPublicKey
async function verifySingleRow(sequence) {
  const receipt = publicAuditLog.find((r) => r.sequence === sequence);
  if (!receipt) return alert(`Receipt #${sequence} not found!`);
  const ok = await verifyReceiptSignature(receipt);
  alert(`Receipt #${sequence} Signature Valid: ${ok ? "✅ YES" : "❌ NO"}`);
}

async function attackRewriteRow(sequence) {
  try {
    await rewriteHistory(publicAuditLog, sequence);
    auditTable.render(publicAuditLog);
    log(`[ATTACK] Hashes updated in the table for Block #${sequence} onward.`);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function formatAuditReport(r) {
  const line = "----------------------------------------\n";
  let msg = `AUDIT REPORT (${r.totalBlocks} Blocks Checked)\n${line}`;
  msg += `Layer 1 (Hash Chain Links):  ${r.chainIntegrityPassed ? "✅ VALID" : "❌ BROKEN at Block #" + r.firstTamperedBlock}\n`;
  msg += `Layer 2 (Digital Signatures): ${r.signatureIntegrityPassed ? "✅ VALID" : "❌ FORGERY at Block #" + r.firstForgedSignatureBlock}\n${line}`;

  if (r.chainIntegrityPassed && r.signatureIntegrityPassed) {
    msg += "🏆 RESULT: Ledger is 100% authentic and uncorrupted.";
  } else if (r.chainIntegrityPassed) {
    msg +=
      "🚨 RESULT: HISTORY-REWRITING ATTACK DETECTED!\nHashes were recalculated to match, but the Notary signatures are invalid!";
  } else {
    msg += "🚨 RESULT: LEDGER TAMPERING DETECTED!";
  }
  return msg;
}

// --- Event listeners ---
btnSign?.addEventListener("click", async () => {
  const algo = currentAlgo();
  log(`Submitting document digest to Authority (${algo})...`);
  submitDigest(
    await sha256Bytes(`Document data at ${performance.now()}`),
    algo,
  );
});

btnSim?.addEventListener("click", () => {
  if (generator.isActive()) {
    generator.stop();
    log("🛑 Simulation stopped by user.");
    return;
  }
  clearExportLog();
  currentLambda = parseFloat($("input-lambda").value) || 5;
  const total = parseInt($("input-count").value, 10) || 100;
  generator.start({ lambda: currentLambda, total, algorithm: currentAlgo() });
});

$("btn-tamper")?.addEventListener("click", () => {
  if (publicAuditLog.length === 0)
    return alert("Sign at least one document first!");
  const target = tamperLastDigest(publicAuditLog);
  auditTable.render(publicAuditLog);
  log(
    `ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`,
  );
});

$("btn-verify-chain")?.addEventListener("click", async () => {
  const result = await auditLedger(publicAuditLog);
  if (result.status === "EMPTY")
    return alert("Ledger is empty. Sign some documents first!");
  const msg = formatAuditReport(result);
  log(msg);
  alert(msg);
});

fileInput?.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const display = $("file-name-display");
  if (display) {
    display.textContent = truncateFileName(file.name, 18);
    display.title = file.name;
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
  );
  log(`Local document hashed: "${file.name}"`);
  submitDigest(digest, currentAlgo());
  fileInput.value = "";
});

// Console helper kept from the original: window.startPoissonTraffic(lambda, n, algo)
window.startPoissonTraffic = (lambda, total, algorithm = "ECDSA") => {
  currentLambda = lambda;
  generator.start({ lambda, total, algorithm });
};

auditTable.render(publicAuditLog);
