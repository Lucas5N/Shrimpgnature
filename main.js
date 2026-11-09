// ============================================================================
// main.js - Client Application, FIFO Queue, File Notarization & Verification Engine
// ============================================================================

// --- 1. Client-Side State ---
const authorityPublicKeys = {
  ECDSA: null,
  "RSA-PSS": null,
};

const publicAuditLog = [];

// FIFO Queue & Single-Server State
const requestQueue = [];
let serverState = "IDLE"; // "IDLE" or "PROCESSING"

// Statistical Engine State (Task A.3)
const METRIC_WINDOW_SIZE = 100;
const waitTimesHistory = [];    // W_q in seconds
const serviceTimesHistory = []; // S in seconds
let currentLambda = 5;          // Target arrival rate for theoretical models

// Traffic Simulation State (Task A.2)
let simulationActive = false;


// --- 2. Binary Encoding Helpers ---
function base64ToBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function sha256Text(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


// --- 3. DOM Elements & Terminal Logging ---
const workerBadge = document.getElementById("worker-badge");
const selectAlgo = document.getElementById("select-algo");
const btnSign = document.getElementById("btn-sign");
const btnTamper = document.getElementById("btn-tamper");
const btnVerifyChain = document.getElementById("btn-verify-chain");
const tableBody = document.getElementById("log-rows");
const consoleOutput = document.getElementById("console-output");
const fileInput = document.getElementById("file-input");

// Simulation UI Elements
const inputLambda = document.getElementById("input-lambda");
const inputCount = document.getElementById("input-count");
const btnSim = document.getElementById("btn-sim");

function logToConsole(message) {
  const time = new Date().toISOString().split("T")[1].slice(0, -1);
  if (consoleOutput) {
    consoleOutput.textContent += `\n[${time}] ${message}`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
}


// --- 4. FIFO Queue & Single-Server State Machine ---
export function enqueueSigningRequest(docDigestBytes, algorithm = "ECDSA") {
  enqueueRequest({
    id: crypto.randomUUID(),
    docDigestBytes,
    algorithm,
  });
}

export function enqueueRequest(requestData) {
  requestData.tArrival = performance.now();
  requestQueue.push(requestData);

  logToConsole(`📥 Enqueued request. Queue length: ${requestQueue.length}`);
  processQueue();
}

export function processQueue() {
  if (serverState === "PROCESSING" || requestQueue.length === 0) {
    return;
  }

  const nextRequest = requestQueue.shift();
  serverState = "PROCESSING";
  nextRequest.tQueueExit = performance.now();

  notaryWorker.postMessage({
    type: "SIGN_REQUEST",
    data: nextRequest,
  });
}


// --- 5. Statistical Rolling Metrics & Mathematical Modeling (Task A.3) ---
export function recordTelemetry(tArrival, tQueueExit, serviceTimeSeconds) {
  const waitDurationSeconds = (tQueueExit - tArrival) / 1000;
  waitTimesHistory.push(waitDurationSeconds);
  serviceTimesHistory.push(serviceTimeSeconds);

  if (waitTimesHistory.length > METRIC_WINDOW_SIZE) {
    waitTimesHistory.shift();
    serviceTimesHistory.shift();
  }

  return computeQueueStatistics();
}

function computeQueueStatistics() {
  const n = serviceTimesHistory.length;
  if (n < 5) return null; // Wait for minimum sample size

  // 1. Mean Service Time (S_bar) and Rate (mu)
  const sumS = serviceTimesHistory.reduce((acc, v) => acc + v, 0);
  const meanS = sumS / n;
  const mu = 1 / meanS;

  // 2. Sample Variance of Service Time (sigma_s^2)
  const varianceS = serviceTimesHistory.reduce((acc, v) => acc + Math.pow(v - meanS, 2), 0) / (n - 1);

  // 3. Observed Empirical Wait Time (Wq_empirical)
  const meanWq = waitTimesHistory.reduce((acc, v) => acc + v, 0) / waitTimesHistory.length;

  // 4. Traffic Intensity (rho)
  const lambda = currentLambda;
  const rho = lambda / mu;

  // 5. Theoretical Models (Guard against infinite divergence at saturation)
  let mm1PredictedWq = Infinity;
  let mg1PredictedWq = Infinity;

  if (rho < 1.0) {
    mm1PredictedWq = rho / (mu * (1 - rho));
    mg1PredictedWq = (lambda * (varianceS + Math.pow(meanS, 2))) / (2 * (1 - rho));
  }

  return { lambda, mu, rho, meanS, varianceS, meanWq, mm1PredictedWq, mg1PredictedWq };
}


// --- 6. Spawn Worker & Listen for Receipts ---
logToConsole("Spawning Central Notary Authority...");
const notaryWorker = new Worker("worker.js");

notaryWorker.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === "INIT_SUCCESS") {
    authorityPublicKeys.ECDSA = payload.publicKeys.ECDSA;
    authorityPublicKeys["RSA-PSS"] = payload.publicKeys["RSA-PSS"];

    if (workerBadge) {
      workerBadge.textContent = "ONLINE";
      workerBadge.className = "badge online";
    }
    if (btnSign) btnSign.disabled = false;

    logToConsole("Central Authority ready with internal Audit Ledger.");
    logToConsole("Public Keys Loaded: ECDSA and RSA-PSS.");
    return;
  }

  if (type === "INIT_ERROR") {
    if (workerBadge) {
      workerBadge.textContent = "INIT ERROR";
      workerBadge.className = "px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
    logToConsole(`ERROR: ${payload.error}`);
    return;
  }

  if (type === "SIGN_SUCCESS") {
    const { receipt, telemetry } = payload;

    const waitTimeMs = telemetry && telemetry.tArrival != null && telemetry.tQueueExit != null
        ? telemetry.tQueueExit - telemetry.tArrival : 0;
    const serviceTimeMs = telemetry && telemetry.serviceTimeSeconds != null
        ? telemetry.serviceTimeSeconds * 1000 : 0;

    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];
    publicAuditLog.push(receipt);
    renderAuditTable();

    logToConsole(`✅ Block #${receipt.sequence} minted | Wait: ${waitTimeMs.toFixed(1)}ms | Service: ${serviceTimeMs.toFixed(1)}ms`);

    if (telemetry && telemetry.tArrival != null && telemetry.tQueueExit != null) {
      const stats = recordTelemetry(telemetry.tArrival, telemetry.tQueueExit, telemetry.serviceTimeSeconds);
      if (stats) {
        logToConsole(`📊 [Stats] ρ=${stats.rho.toFixed(2)} | Empirical Wq=${stats.meanWq.toFixed(4)}s | M/M/1=${stats.mm1PredictedWq.toFixed(4)}s | M/G/1=${stats.mg1PredictedWq.toFixed(4)}s`);
      }
    }

    if (btnSign) btnSign.disabled = false;

    serverState = "IDLE";
    processQueue();
  }

  if (type === "SIGN_ERROR") {
    logToConsole(`ERROR: Failed to sign request [${payload.id || "unknown"}]: ${payload.error}`);
    if (btnSign) btnSign.disabled = false;
    serverState = "IDLE";
    processQueue();
  }
};


// --- 7. Local File Notarization ---
export async function notarizeLocalFile(fileBlob, chosenAlgorithm = "ECDSA") {
  const arrayBuffer = await fileBlob.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const docDigestBytes = new Uint8Array(digestBuffer);

  logToConsole(`Local document hashed: "${fileBlob.name}"`);
  enqueueSigningRequest(docDigestBytes, chosenAlgorithm);
}


// --- 8. Synthetic Poisson Traffic Generator ---
function getPoissonDelayMs(lambda) {
  const U = Math.random();
  return (-Math.log(1 - U) / lambda) * 1000;
}

export function startTrafficSimulation(targetLambda, totalRequests, chosenAlgorithm = "ECDSA") {
  simulationActive = true;
  currentLambda = targetLambda;
  let count = 0;

  if (btnSim) {
    btnSim.textContent = "Stop Workload";
    btnSim.className = "danger";
  }

  logToConsole(`🚀 Poisson generator started (λ=${targetLambda} req/s, target=${totalRequests})`);

  function scheduleNext() {
    if (!simulationActive || count >= totalRequests) {
      stopTrafficSimulation();
      if (count >= totalRequests) {
        logToConsole(`🏁 Finished generating ${totalRequests} Poisson requests.`);
      }
      return;
    }

    const delayMs = getPoissonDelayMs(targetLambda);

    setTimeout(async () => {
      if (!simulationActive) return;
      count++;
      const dummyContent = `Poisson doc #${count} at ${performance.now()}`;
      const digestBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(dummyContent)
      );

      enqueueSigningRequest(new Uint8Array(digestBuffer), chosenAlgorithm);
      scheduleNext();
    }, delayMs);
  }

  scheduleNext();
}

export function stopTrafficSimulation() {
  simulationActive = false;
  if (btnSim) {
    btnSim.textContent = "Start Workload";
    btnSim.className = "success";
  }
}

// Keep window global function available for DevTools usage
window.startPoissonTraffic = (lambda, totalRequests, algorithm = "ECDSA") => {
  startTrafficSimulation(lambda, totalRequests, algorithm);
};


// --- 9. Verification Engine & Attack Simulator ---
export async function verifyReceiptSignature(receipt) {
  try {
    const pubKeyBuf = base64ToBuffer(receipt.signerPublicKey);
    const sigBytes = hexToBytes(receipt.signature);
    const docDigestBytes = hexToBytes(receipt.docDigest);

    const importParams = receipt.algorithm === "ECDSA"
        ? { name: "ECDSA", namedCurve: "P-256" }
        : { name: "RSA-PSS", hash: "SHA-256" };

    const verifyParams = receipt.algorithm === "ECDSA"
        ? { name: "ECDSA", hash: { name: "SHA-256" } }
        : { name: "RSA-PSS", saltLength: 32 };

    const cryptoKey = await crypto.subtle.importKey("spki", pubKeyBuf, importParams, false, ["verify"]);
    return await crypto.subtle.verify(verifyParams, cryptoKey, sigBytes, docDigestBytes);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

export async function executeComprehensiveAudit() {
  if (publicAuditLog.length === 0) return { status: "EMPTY", totalBlocks: 0 };

  let chainIntegrityPassed = true;
  let signatureIntegrityPassed = true;
  let firstTamperedBlock = -1;
  let firstForgedSignatureBlock = -1;
  let expectedPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";

  for (let i = 0; i < publicAuditLog.length; i++) {
    const block = publicAuditLog[i];

    const recalculated = await sha256Text(block.chainProof.prevHash + block.signature + block.docDigest);

    if (block.chainProof.prevHash !== expectedPrevHash || recalculated !== block.chainProof.chainHash) {
      if (chainIntegrityPassed) {
        chainIntegrityPassed = false;
        firstTamperedBlock = i;
      }
    }
    expectedPrevHash = block.chainProof.chainHash;

    const isSignatureValid = await verifyReceiptSignature(block);
    if (!isSignatureValid && signatureIntegrityPassed) {
      signatureIntegrityPassed = false;
      firstForgedSignatureBlock = i;
    }
  }

  return {
    status: "OK",
    totalBlocks: publicAuditLog.length,
    chainIntegrityPassed,
    signatureIntegrityPassed,
    firstTamperedBlock,
    firstForgedSignatureBlock,
  };
}

export async function executeHistoryRewritingAttack(targetIndex) {
  let idx = publicAuditLog.findIndex((r) => r.sequence === targetIndex);
  if (idx === -1) idx = targetIndex;

  if (idx < 0 || idx >= publicAuditLog.length) {
    throw new Error("Target index outside audit log bounds.");
  }

  const targetEntry = publicAuditLog[idx];
  targetEntry.docDigest = "ffffffff" + targetEntry.docDigest.slice(8);

  let rollingPrevHash = targetEntry.chainProof.prevHash;

  for (let i = idx; i < publicAuditLog.length; i++) {
    const entry = publicAuditLog[i];
    entry.chainProof.prevHash = rollingPrevHash;
    entry.chainProof.chainHash = await sha256Text(entry.chainProof.prevHash + entry.signature + entry.docDigest);
    rollingPrevHash = entry.chainProof.chainHash;
  }

  renderAuditTable();
}


// --- 10. UI Rendering & Event Listeners ---
function renderAuditTable() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (publicAuditLog.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b">No documents signed yet.</td></tr>`;
    return;
  }

  publicAuditLog.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-700 text-xs font-mono hover:bg-slate-800/50";
    tr.innerHTML = `
      <td class="p-2 text-slate-400">#${item.sequence}</td>
      <td class="p-2 text-emerald-400">${item.docDigest.slice(0, 10)}...</td>
      <td class="p-2 text-indigo-400">${item.signature.slice(0, 10)}...</td>
      <td class="p-2 text-slate-400">${item.chainProof.chainHash.slice(0, 10)}...</td>
      <td class="p-2">
        <button onclick="window.verifySingleRow(${item.sequence})" class="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-white text-xs">Verify</button>
        <button onclick="window.attackRewriteRow(${item.sequence})" class="danger" style="margin-left: 4px; padding: 2px 6px; font-size: 11px;">Rewrite</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.verifySingleRow = async (sequence) => {
  const receipt = publicAuditLog.find((r) => r.sequence === sequence);
  if (!receipt) return alert(`Receipt #${sequence} not found!`);
  const isValid = await verifyReceiptSignature(receipt);
  alert(`Receipt #${sequence} Signature Valid: ${isValid ? "✅ YES" : "❌ NO"}`);
};

window.attackRewriteRow = async (sequence) => {
  try {
    await executeHistoryRewritingAttack(sequence);
    logToConsole(`[ATTACK] Hashes updated in the table for Block #${sequence} onward.`);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// Start / Stop Simulation Toggle Listener
if (btnSim) {
  btnSim.addEventListener("click", () => {
    if (simulationActive) {
      stopTrafficSimulation();
      logToConsole("🛑 Simulation stopped by user.");
    } else {
      const lambda = parseFloat(inputLambda.value) || 5;
      const count = parseInt(inputCount.value, 10) || 100;
      const algo = selectAlgo ? selectAlgo.value : "ECDSA";

      startTrafficSimulation(lambda, count, algo);
    }
  });
}

if (btnSign) {
  btnSign.addEventListener("click", async () => {
    const chosenAlgorithm = selectAlgo ? selectAlgo.value : "ECDSA";
    const dummyContent = `Document data at ${performance.now()}`;
    const digestBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dummyContent));

    logToConsole(`Submitting document digest to Authority (${chosenAlgorithm})...`);
    enqueueSigningRequest(new Uint8Array(digestBuffer), chosenAlgorithm);
  });
}

if (btnTamper) {
  btnTamper.addEventListener("click", () => {
    if (publicAuditLog.length === 0) {
      alert("Sign at least one document first!");
      return;
    }
    const target = publicAuditLog[publicAuditLog.length - 1];
    target.docDigest = "ffff" + target.docDigest.slice(4);
    renderAuditTable();
    logToConsole(`ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`);
  });
}

if (btnVerifyChain) {
  btnVerifyChain.addEventListener("click", async () => {
    const result = await executeComprehensiveAudit();
    if (result.status === "EMPTY") {
      alert("Ledger is empty. Sign some documents first!");
      return;
    }

    let msg = `AUDIT REPORT (${result.totalBlocks} Blocks Checked)\n`;
    msg += `----------------------------------------\n`;
    msg += `Layer 1 (Hash Chain Links):  ${result.chainIntegrityPassed ? "✅ VALID" : "❌ BROKEN at Block #" + result.firstTamperedBlock}\n`;
    msg += `Layer 2 (Digital Signatures): ${result.signatureIntegrityPassed ? "✅ VALID" : "❌ FORGERY at Block #" + result.firstForgedSignatureBlock}\n`;
    msg += `----------------------------------------\n`;

    if (result.chainIntegrityPassed && result.signatureIntegrityPassed) {
      msg += `🏆 RESULT: Ledger is 100% authentic and uncorrupted.`;
    } else if (result.chainIntegrityPassed && !result.signatureIntegrityPassed) {
      msg += `🚨 RESULT: HISTORY-REWRITING ATTACK DETECTED!\nHashes were recalculated to match, but the Notary signatures are invalid!`;
    } else {
      msg += `🚨 RESULT: LEDGER TAMPERING DETECTED!`;
    }

    logToConsole(msg);
    alert(msg);
  });
}

if (fileInput) {
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const algorithm = selectAlgo ? selectAlgo.value : "ECDSA";
    await notarizeLocalFile(file, algorithm);
    fileInput.value = "";
  });
}
