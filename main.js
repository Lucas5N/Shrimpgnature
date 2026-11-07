// Client-side state
const authorityPublicKeys = {
  ECDSA: null,
  "RSA-PSS": null,
};

const publicAuditLog = [];

const workerBadge = document.getElementById("worker-badge");
const selectAlgo = document.getElementById("select-algo");
const btnSign = document.getElementById("btn-sign");
const btnTamper = document.getElementById("btn-tamper");
const btnVerifyChain = document.getElementById("btn-verify-chain");
const tableBody = document.getElementById("log-rows");
const consoleOutput = document.getElementById("console-output");
const fileInput = document.getElementById("file-input");

// Binary conversion utilities for verification
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

function logToConsole(message) {
  const time = new Date().toISOString().split("T")[1].slice(0, -1);
  consoleOutput.textContent += `\n[${time}] ${message}`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

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

    logToConsole("Central Authority ready with internal Audit Ledger.");
    logToConsole(`Public Keys Loaded: ECDSA and RSA-PSS.`);
    return;
  }

  if (type === "INIT_ERROR") {
    workerBadge.textContent = "INIT ERROR";
    workerBadge.className =
      "px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20";
    logToConsole(`ERROR: ${payload.error}`);
    return;
  }

  if (type === "SIGN_SUCCESS") {
    const { receipt, telemetry } = payload;

    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];
    publicAuditLog.push(receipt);

    renderAuditTable();

    logToConsole(`SUCCESS: Block #${receipt.sequence} minted.`);
    logToConsole(
      `  Service Time (Sign + Chain): ${(telemetry.serviceTimeSeconds * 1000).toFixed(3)} ms`,
    );
    btnSign.disabled = false;
  }

  if (type === "SIGN_ERROR") {
    logToConsole(
      `ERROR: Failed to sign request [${payload.id}]: ${payload.error}`,
    );
    btnSign.disabled = false;
  }
};

export async function notarizeLocalFile(fileBlob, chosenAlgorithm) {
  const arrayBuffer = await fileBlob.arrayBuffer();

  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const docDigestBytes = new Uint8Array(digestBuffer);

  logToConsole(`Local document hashed: "${fileBlob.name}"`);

  enqueueSigningRequest(docDigestBytes, chosenAlgorithm);
}

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

export async function executeComprehensiveAudit() {
  if (publicAuditLog.length === 0) return { status: "EMPTY" };

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

function renderAuditTable() {
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
  const isValid = await verifyReceiptSignature(receipt);
  alert(
    `Receipt #${sequence} Signature Valid: ${isValid ? "✅ YES" : "❌ NO"}`,
  );
};

//TODO: Remove it after implementation of notarization of local file is completed
btnSign.addEventListener("click", async () => {
  btnSign.disabled = true;
  const chosenAlgorithm = selectAlgo.value;

  const dummyContent = `Document data at ${performance.now()}`;
  const digestBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(dummyContent),
  );

  const tArrival = performance.now();
  const tQueueExit = performance.now();

  logToConsole(
    `Submitting document digest to Authority (${chosenAlgorithm})...`,
  );

  notaryWorker.postMessage({
    type: "SIGN_REQUEST",
    data: {
      id: crypto.randomUUID(),
      docDigestBytes: new Uint8Array(digestBuffer),
      algorithm: chosenAlgorithm,
      tArrival,
      tQueueExit,
    },
  });
});

btnTamper.addEventListener("click", () => {
  if (publicAuditLog.length === 0) {
    alert("Sign at least one document first!");
    return;
  }
  const target = publicAuditLog[publicAuditLog.length - 1];
  target.docDigest = "ffff" + target.docDigest.slice(4);

  logToConsole(
    `ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`,
  );
});

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
});

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
