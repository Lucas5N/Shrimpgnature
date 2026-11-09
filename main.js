// ============================================================================
// main.js - Client Application, FIFO Queue & Verification Engine
// ============================================================================

// --- 1. State ---
const authorityPublicKeys = {
  ECDSA: null,
  "RSA-PSS": null,
};

const publicAuditLog = [];

<<<<<<< /tmp/.psub.nID64p
const workerBadge = document.getElementById("worker-badge");
const selectAlgo = document.getElementById("select-algo");
const btnSign = document.getElementById("btn-sign");
const btnTamper = document.getElementById("btn-tamper");
const btnVerifyChain = document.getElementById("btn-verify-chain");
const tableBody = document.getElementById("log-rows");
const consoleOutput = document.getElementById("console-output");
const fileInput = document.getElementById("file-input");

// Binary conversion utilities for verification
||||||| /tmp/.psub.mPXQ22
// Binary conversion utilities for verification
=======
// FIFO Queue & Single-Server State
const requestQueue = [];
let serverState = "IDLE"; // "IDLE" or "PROCESSING"


// --- 2. Binary Encoding Helpers ---
>>>>>>> /tmp/.psub.Db6qh0
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

<<<<<<< /tmp/.psub.nID64p
||||||| /tmp/.psub.mPXQ22
const workerBadge = document.getElementById("worker-badge");
const selectAlgo = document.getElementById("select-algo");
const btnSign = document.getElementById("btn-sign");
const btnTamper = document.getElementById("btn-tamper");
const btnVerifyChain = document.getElementById("btn-verify-chain");
const tableBody = document.getElementById("log-rows");
const consoleOutput = document.getElementById("console-output");

=======

// --- 3. DOM Elements & Terminal Logging ---
const workerBadge = document.getElementById("worker-badge");
const selectAlgo = document.getElementById("select-algo");
const btnSign = document.getElementById("btn-sign");
const btnTamper = document.getElementById("btn-tamper");
const btnVerifyChain = document.getElementById("btn-verify-chain");
const tableBody = document.getElementById("log-rows");
const consoleOutput = document.getElementById("console-output");

>>>>>>> /tmp/.psub.Db6qh0
function logToConsole(message) {
  const time = new Date().toISOString().split("T")[1].slice(0, -1);
  consoleOutput.textContent += `\n[${time}] ${message}`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}


// --- 4. FIFO Queue & Single-Server State Machine ---

// Adds a request to the queue and records arrival timestamp
function enqueueRequest(requestData) {
  requestData.tArrival = performance.now();
  requestQueue.push(requestData);

  logToConsole(`📥 Enqueued request. Queue length: ${requestQueue.length}`);
  processQueue();
}

// Dispatches requests one-by-one to the single worker
function processQueue() {
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

    workerBadge.textContent = "ONLINE";
    workerBadge.className = "badge online";
    btnSign.disabled = false;

    logToConsole("Central Authority ready. Keys loaded.");
    return;
  }

  if (type === "INIT_ERROR") {
    workerBadge.textContent = "INIT ERROR";
    logToConsole(`ERROR: ${payload.error}`);
    return;
  }

  if (type === "SIGN_SUCCESS") {
    const { receipt, telemetry } = payload;

<<<<<<< /tmp/.psub.nID64p
    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];
||||||| /tmp/.psub.mPXQ22
    // Attach public key to the receipt for self-contained independent audits
    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];

    // Append to public ledger view
=======
    // Queueing metrics
    const waitTimeMs = telemetry.tQueueExit - telemetry.tArrival;
    const serviceTimeMs = telemetry.serviceTimeSeconds * 1000;
    const totalTimeMs = waitTimeMs + serviceTimeMs;

    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];
>>>>>>> /tmp/.psub.Db6qh0
    publicAuditLog.push(receipt);

    renderAuditTable();

    logToConsole(
      `✅ Block #${receipt.sequence} minted | Wait: ${waitTimeMs.toFixed(1)}ms | Service: ${serviceTimeMs.toFixed(1)}ms | Total: ${totalTimeMs.toFixed(1)}ms`
    );

    // Free the server and immediately process the next queued item
    serverState = "IDLE";
    processQueue();
  }

  if (type === "SIGN_ERROR") {
    logToConsole(`ERROR: ${payload.error}`);
    serverState = "IDLE";
    processQueue();
  }
};


// --- 6. Synthetic Poisson Traffic Generator ---

// Inverse Transform Sampling: Δt = - (1 / λ) * ln(1 - U)
function getPoissonDelayMs(lambda) {
  const U = Math.random();
  return (-Math.log(1 - U) / lambda) * 1000;
}

/**
 * Exposed to window so you can call it from the browser DevTools console:
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

      enqueueRequest({
        id: crypto.randomUUID(),
        docDigestBytes: new Uint8Array(digestBuffer),
        algorithm: algorithm,
      });

      scheduleNext();
    }, delayMs);
  }

  scheduleNext();
};

<<<<<<< /tmp/.psub.nID64p
export async function notarizeLocalFile(fileBlob, chosenAlgorithm) {
  const arrayBuffer = await fileBlob.arrayBuffer();

  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const docDigestBytes = new Uint8Array(digestBuffer);

  logToConsole(`Local document hashed: "${fileBlob.name}"`);

  enqueueSigningRequest(docDigestBytes, chosenAlgorithm);
}

||||||| /tmp/.psub.mPXQ22
// Independent Verification Engine
=======

// --- 7. Verification Engine ---
>>>>>>> /tmp/.psub.Db6qh0
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

<<<<<<< /tmp/.psub.nID64p
export async function executeComprehensiveAudit() {
  if (publicAuditLog.length === 0) return { status: "EMPTY" };

  let chainIntegrityPassed = true;
  let signatureIntegrityPassed = true;
  let firstTamperedBlock = -1;
  let firstForgedSignatureBlock = -1;
||||||| /tmp/.psub.mPXQ22
export async function verifyEntireAuditChain() {
  if (publicAuditLog.length === 0) {
    return { valid: true, count: 0 };
  }
=======
export async function verifyEntireAuditChain() {
  if (publicAuditLog.length === 0) return { valid: true, count: 0 };
>>>>>>> /tmp/.psub.Db6qh0

  let expectedPrevHash =
    "0000000000000000000000000000000000000000000000000000000000000000";

  for (let i = 0; i < publicAuditLog.length; i++) {
    const block = publicAuditLog[i];

<<<<<<< /tmp/.psub.nID64p
    // Layer 1: Hash Chain Continuity Check
||||||| /tmp/.psub.mPXQ22
    // Chain continuity
    if (entry.chainProof.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Previous hash mismatch! Expected ${expectedPrevHash.slice(0, 8)}... but got ${entry.chainProof.prevHash.slice(0, 8)}...`,
      };
    }

    // Recompute Hash Link
=======
    if (entry.chainProof.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Previous hash mismatch!`,
      };
    }

>>>>>>> /tmp/.psub.Db6qh0
    const recalculated = await sha256Text(
      block.chainProof.prevHash + block.signature + block.docDigest,
    );

<<<<<<< /tmp/.psub.nID64p
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
||||||| /tmp/.psub.mPXQ22
    if (recalculated !== entry.chainProof.chainHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Hash mutation detected! Entry content was modified.`,
      };
=======
    if (recalculated !== entry.chainProof.chainHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Hash mutation detected!`,
      };
>>>>>>> /tmp/.psub.Db6qh0
    }
  }

  return {
    chainIntegrityPassed,
    signatureIntegrityPassed,
    firstTamperedBlock,
    firstForgedSignatureBlock,
  };
}

export async function executeHistoryRewritingAttack(targetIndex) {
  if (publicAuditLog.length <= targetIndex) {
    throw new Error("Target index outside audit log bounds.");
  }

  //Mutate the target document digest
  const targetEntry = publicAuditLog[targetIndex];
  targetEntry.docDigest = "ffffffff" + targetEntry.docDigest.slice(8);

  //Cascade forward: recalculate downstream chain hashes
  let rollingPrevHash = targetEntry.chainProof.prevHash;

  //Recompute current link
  for (let i = targetIndex; i < publicAuditLog.length; i++) {
    const entry = publicAuditLog[i];
    entry.chainProof.prevHash = rollingPrevHash;

    entry.chainProof.chainHash = await sha256Text(
      entry.chainProof.prevHash + entry.signature + entry.docDigest,
    );

    rollingPrevHash = entry.chainProof.chainHash;
  }

  renderAuditTable();
}


// --- 8. UI Rendering & Button Listeners ---
function renderAuditTable() {
  tableBody.innerHTML = "";
<<<<<<< /tmp/.psub.nID64p

  if (publicAuditLog.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b">No documents signed yet.</td></tr>`;
    return;
  }

||||||| /tmp/.psub.mPXQ22

=======
>>>>>>> /tmp/.psub.Db6qh0
  publicAuditLog.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
<<<<<<< /tmp/.psub.nID64p
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
||||||| /tmp/.psub.mPXQ22
      <td class="p-2 text-slate-400">#${item.sequence}</td>
      <td class="p-2 text-emerald-400">${item.docDigest.slice(0, 10)}...</td>
      <td class="p-2 text-indigo-400">${item.signature.slice(0, 10)}...</td>
      <td class="p-2 text-slate-400">${item.chainProof.chainHash.slice(0, 10)}...</td>
      <td class="p-2">
        <button onclick="window.verifySingleRow(${item.sequence})" class="bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-white text-xs">
          Verify
        </button>
=======
      <td>#${item.sequence}</td>
      <td>${item.docDigest.slice(0, 10)}...</td>
      <td>${item.signature.slice(0, 10)}...</td>
      <td>${item.chainProof.chainHash.slice(0, 10)}...</td>
      <td>
        <button onclick="window.verifySingleRow(${item.sequence})">Verify</button>
>>>>>>> /tmp/.psub.Db6qh0
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.verifySingleRow = async (sequence) => {
  const receipt = publicAuditLog.find((r) => r.sequence === sequence);
  const isValid = await verifyReceiptSignature(receipt);
  alert(`Receipt #${sequence} Valid: ${isValid ? "✅ YES" : "❌ NO"}`);
};

<<<<<<< /tmp/.psub.nID64p
//TODO: Remove it after implementation of notarization of local file is completed
||||||| /tmp/.psub.mPXQ22
//TODO: add option to load real document, placeholding with "dummyContent"
=======
// Clicking "Sign" directs through the FIFO queue
>>>>>>> /tmp/.psub.Db6qh0
btnSign.addEventListener("click", async () => {
  const chosenAlgorithm = selectAlgo.value;
  const dummyContent = `Document at ${performance.now()}`;
  const digestBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(dummyContent),
  );

  enqueueRequest({
    id: crypto.randomUUID(),
    docDigestBytes: new Uint8Array(digestBuffer),
    algorithm: chosenAlgorithm,
  });
});

btnTamper.addEventListener("click", () => {
<<<<<<< /tmp/.psub.nID64p
  if (publicAuditLog.length === 0) {
    alert("Sign at least one document first!");
    return;
  }
||||||| /tmp/.psub.mPXQ22
  if (publicAuditLog.length === 0) {
    alert("Sign at least one document first!");
    return;
  }
  // Mutate the document digest of the latest entry to simulate an attack
  // TODO: Considering others attack vector simulations
=======
  if (publicAuditLog.length === 0) return alert("Sign a document first!");
>>>>>>> /tmp/.psub.Db6qh0
  const target = publicAuditLog[publicAuditLog.length - 1];
  target.docDigest = "ffff" + target.docDigest.slice(4);
<<<<<<< /tmp/.psub.nID64p

  logToConsole(
    `ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`,
  );
||||||| /tmp/.psub.mPXQ22
  renderAuditTable();

  logToConsole(
    `ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`,
  );
  alert(
    `Tampered with Block #${target.sequence}! Run "Verify Chain" or click "Verify" on that row.`,
  );
=======
  renderAuditTable();
  logToConsole(`ATTACK: Tampered Block #${target.sequence}`);
>>>>>>> /tmp/.psub.Db6qh0
});

btnVerifyChain.addEventListener("click", async () => {
<<<<<<< /tmp/.psub.nID64p
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
||||||| /tmp/.psub.mPXQ22
  const result = await verifyEntireAuditChain();
  if (result.valid) {
    alert(
      `✅ Audit Chain Valid! All ${result.count} blocks are cryptographically intact and strictly ordered.`,
    );
=======
  const result = await verifyEntireAuditChain();
  if (result.valid) {
    alert(`✅ Audit Chain Valid! All ${result.count} blocks intact.`);
>>>>>>> /tmp/.psub.Db6qh0
  } else {
<<<<<<< /tmp/.psub.nID64p
    msg += `🚨 RESULT: LEDGER TAMPERING DETECTED!`;
||||||| /tmp/.psub.mPXQ22
    alert(
      `❌ AUDIT CHAIN COMPROMISED at Block #${result.brokenIndex}!\nReason: ${result.reason}`,
    );
=======
    alert(`❌ CHAIN COMPROMISED at Block #${result.brokenIndex}!`);
>>>>>>> /tmp/.psub.Db6qh0
  }

  logToConsole(msg);
});
<<<<<<< /tmp/.psub.nID64p

//TODO: event listner on a specific button or like this?
fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const algorithm = selectAlgo.value;
  await notarizeLocalFile(file, algorithm);
  fileInput.value = "";
});

window.attackRewriteRow = async (sequence) => {
  try {
    await executeHistoryRewritingAttack(sequence);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
  logToConsole(
    `[ATTACK] Hashes updated in the table for Block #${sequence} onward.`,
  );
};
||||||| /tmp/.psub.mPXQ22

//TODO: Considering adding History Rewrite Attack
=======
>>>>>>> /tmp/.psub.Db6qh0
