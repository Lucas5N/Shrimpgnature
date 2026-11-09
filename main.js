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

function logToConsole(message) {
  const time = new Date().toISOString().split("T")[1].slice(0, -1);
  if (consoleOutput) {
    consoleOutput.textContent += `\n[${time}] ${message}`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
}


// --- 4. FIFO Queue & Single-Server State Machine ---

// Adds a raw signing request to the queue (used by notarizeLocalFile & btnSign)
export function enqueueSigningRequest(docDigestBytes, algorithm = "ECDSA") {
  enqueueRequest({
    id: crypto.randomUUID(),
    docDigestBytes,
    algorithm,
  });
}

// Adds a request object to the queue and records arrival timestamp
export function enqueueRequest(requestData) {
  requestData.tArrival = performance.now();
  requestQueue.push(requestData);

  logToConsole(`📥 Enqueued request. Queue length: ${requestQueue.length}`);
  processQueue();
}

// Dispatches requests one-by-one to the single worker
export function processQueue() {
  // If the server is busy or the queue is empty, do nothing
  if (serverState === "PROCESSING" || requestQueue.length === 0) {
    return;
  }

  // Dequeue the oldest request (First-In, First-Out)
  const nextRequest = requestQueue.shift();
  serverState = "PROCESSING";

  // Record exit time right before handing off to the worker
  nextRequest.tQueueExit = performance.now();

  notaryWorker.postMessage({
    type: "SIGN_REQUEST",
    data: nextRequest,
  });
}


// --- 5. Spawn Worker & Listen for Receipts ---
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
      workerBadge.className =
        "px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20";
    }
    logToConsole(`ERROR: ${payload.error}`);
    return;
  }

  if (type === "SIGN_SUCCESS") {
    const { receipt, telemetry } = payload;

    // Queueing metrics
    const waitTimeMs =
      telemetry && telemetry.tArrival != null && telemetry.tQueueExit != null
        ? telemetry.tQueueExit - telemetry.tArrival
        : 0;
    const serviceTimeMs =
      telemetry && telemetry.serviceTimeSeconds != null
        ? telemetry.serviceTimeSeconds * 1000
        : 0;
    const totalTimeMs = waitTimeMs + serviceTimeMs;

    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];
    publicAuditLog.push(receipt);
    renderAuditTable();

    logToConsole(
      `✅ Block #${receipt.sequence} minted | Wait: ${waitTimeMs.toFixed(1)}ms | Service: ${serviceTimeMs.toFixed(1)}ms | Total: ${totalTimeMs.toFixed(1)}ms`
    );

    if (btnSign) btnSign.disabled = false;

    // Free the server and immediately process the next queued item
    serverState = "IDLE";
    processQueue();
  }

  if (type === "SIGN_ERROR") {
    logToConsole(
      `ERROR: Failed to sign request [${payload.id || "unknown"}]: ${payload.error}`
    );
    if (btnSign) btnSign.disabled = false;
    serverState = "IDLE";
    processQueue();
  }
};


// --- 6. Local File Notarization ---
export async function notarizeLocalFile(fileBlob, chosenAlgorithm = "ECDSA") {
  const arrayBuffer = await fileBlob.arrayBuffer();

  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const docDigestBytes = new Uint8Array(digestBuffer);

  logToConsole(`Local document hashed: "${fileBlob.name}"`);

  enqueueSigningRequest(docDigestBytes, chosenAlgorithm);
}


// --- 7. Synthetic Poisson Traffic Generator ---

// Inverse Transform Sampling: Δt = - (1 / λ) * ln(1 - U)
function getPoissonDelayMs(lambda) {
  const U = Math.random();
  return (-Math.log(1 - U) / lambda) * 1000;
}

/**
 * Exposed to window for browser DevTools console:
 * startPoissonTraffic(10, 15, "ECDSA")
 */
window.startPoissonTraffic = function (lambda, totalRequests, algorithm = "ECDSA") {
  let count = 0;
  logToConsole(`🚀 Poisson generator started (λ=${lambda} req/s, target=${totalRequests})`);

  function scheduleNext() {
    if (count >= totalRequests) {
      logToConsole(`🏁 Finished generating ${totalRequests} Poisson requests.`);
      return;
    }

    const delayMs = getPoissonDelayMs(lambda);

    setTimeout(async () => {
      count++;
      const dummyContent = `Poisson doc #${count} at ${performance.now()}`;
      const digestBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(dummyContent),
      );

      enqueueSigningRequest(new Uint8Array(digestBuffer), algorithm);

      scheduleNext();
    }, delayMs);
  }

  scheduleNext();
};


// --- 8. Verification Engine ---
export async function verifyReceiptSignature(receipt) {
  try {
    const pubKeyBuf = base64ToBuffer(receipt.signerPublicKey);
    const sigBytes = hexToBytes(receipt.signature);
    const docDigestBytes = hexToBytes(receipt.docDigest);

    const importParams =
      receipt.algorithm === "ECDSA"
        ? { name: "ECDSA", namedCurve: "P-256" }
        : { name: "RSA-PSS", hash: "SHA-256" };

    const verifyParams =
      receipt.algorithm === "ECDSA"
        ? { name: "ECDSA", hash: { name: "SHA-256" } }
        : { name: "RSA-PSS", saltLength: 32 };

    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      pubKeyBuf,
      importParams,
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      verifyParams,
      cryptoKey,
      sigBytes,
      docDigestBytes,
    );
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

export async function verifyEntireAuditChain() {
  if (publicAuditLog.length === 0) return { valid: true, count: 0 };

  let expectedPrevHash =
    "0000000000000000000000000000000000000000000000000000000000000000";

  for (let i = 0; i < publicAuditLog.length; i++) {
    const entry = publicAuditLog[i];

    if (entry.chainProof.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Previous hash mismatch!`,
      };
    }

    const recalculated = await sha256Text(
      entry.chainProof.prevHash + entry.signature + entry.docDigest,
    );

    if (recalculated !== entry.chainProof.chainHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Hash mutation detected!`,
      };
    }

    expectedPrevHash = entry.chainProof.chainHash;
  }

  return { valid: true, count: publicAuditLog.length };
}

export async function executeComprehensiveAudit() {
  if (publicAuditLog.length === 0) return { status: "EMPTY", totalBlocks: 0 };

  let chainIntegrityPassed = true;
  let signatureIntegrityPassed = true;
  let firstTamperedBlock = -1;
  let firstForgedSignatureBlock = -1;

  let expectedPrevHash =
    "0000000000000000000000000000000000000000000000000000000000000000";

  for (let i = 0; i < publicAuditLog.length; i++) {
    const block = publicAuditLog[i];

    // Layer 1: Hash Chain Continuity Check
    const recalculated = await sha256Text(
      block.chainProof.prevHash + block.signature + block.docDigest,
    );

    if (
      block.chainProof.prevHash !== expectedPrevHash ||
      recalculated !== block.chainProof.chainHash
    ) {
      if (chainIntegrityPassed) {
        chainIntegrityPassed = false;
        firstTamperedBlock = i;
      }
    }
    expectedPrevHash = block.chainProof.chainHash;

    // Layer 2: Notary Asymmetric Signature Verification
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
  if (idx === -1) {
    idx = targetIndex;
  }
  if (idx < 0 || idx >= publicAuditLog.length) {
    throw new Error("Target index outside audit log bounds.");
  }

  // Mutate the target document digest
  const targetEntry = publicAuditLog[idx];
  targetEntry.docDigest = "ffffffff" + targetEntry.docDigest.slice(8);

  // Cascade forward: recalculate downstream chain hashes
  let rollingPrevHash = targetEntry.chainProof.prevHash;

  // Recompute current link and downstream
  for (let i = idx; i < publicAuditLog.length; i++) {
    const entry = publicAuditLog[i];
    entry.chainProof.prevHash = rollingPrevHash;

    entry.chainProof.chainHash = await sha256Text(
      entry.chainProof.prevHash + entry.signature + entry.docDigest,
    );

    rollingPrevHash = entry.chainProof.chainHash;
  }

  renderAuditTable();
}


// --- 9. UI Rendering & Button Listeners ---
function renderAuditTable() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (publicAuditLog.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b">No documents signed yet.</td></tr>`;
    return;
  }

  publicAuditLog.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className =
      "border-b border-slate-700 text-xs font-mono hover:bg-slate-800/50";
    tr.innerHTML = `
      <td class="p-2 text-slate-400">#${item.sequence}</td>
      <td class="p-2 text-emerald-400">${item.docDigest.slice(0, 10)}...</td>
      <td class="p-2 text-indigo-400">${item.signature.slice(0, 10)}...</td>
      <td class="p-2 text-slate-400">${item.chainProof.chainHash.slice(0, 10)}...</td>
      <td class="p-2">
        <button onclick="window.verifySingleRow(${item.sequence})" class="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-white text-xs">
          Verify
        </button>
        <button onclick="window.attackRewriteRow(${item.sequence})" class="danger" style="margin-left: 4px; padding: 2px 6px; font-size: 11px;">
          Rewrite
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.verifySingleRow = async (sequence) => {
  const receipt = publicAuditLog.find((r) => r.sequence === sequence);
  if (!receipt) return alert(`Receipt #${sequence} not found!`);
  const isValid = await verifyReceiptSignature(receipt);
  alert(
    `Receipt #${sequence} Signature Valid: ${isValid ? "✅ YES" : "❌ NO"}`
  );
};

window.attackRewriteRow = async (sequence) => {
  try {
    await executeHistoryRewritingAttack(sequence);
    logToConsole(
      `[ATTACK] Hashes updated in the table for Block #${sequence} onward.`
    );
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// Clicking "Sign" directs through the FIFO queue
if (btnSign) {
  btnSign.addEventListener("click", async () => {
    const chosenAlgorithm = selectAlgo ? selectAlgo.value : "ECDSA";
    const dummyContent = `Document data at ${performance.now()}`;
    const digestBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(dummyContent),
    );

    logToConsole(
      `Submitting document digest to Authority (${chosenAlgorithm})...`
    );

    enqueueSigningRequest(new Uint8Array(digestBuffer), chosenAlgorithm);
  });
}

// Tamper button mutates the latest block digest
if (btnTamper) {
  btnTamper.addEventListener("click", () => {
    if (publicAuditLog.length === 0) {
      alert("Sign at least one document first!");
      return;
    }
    const target = publicAuditLog[publicAuditLog.length - 1];
    target.docDigest = "ffff" + target.docDigest.slice(4);
    renderAuditTable();
    logToConsole(
      `ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`
    );
  });
}

// Verify Chain button executes full dual-layer audit
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

// Local file input listener
if (fileInput) {
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const algorithm = selectAlgo ? selectAlgo.value : "ECDSA";
    await notarizeLocalFile(file, algorithm);
    fileInput.value = "";
  });
}
