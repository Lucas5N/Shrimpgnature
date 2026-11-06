// Client-side state
const authorityPublicKeys = {
  ECDSA: null,
  "RSA-PSS": null,
};

const publicAuditLog = [];

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

    // Attach public key to the receipt for self-contained independent audits
    receipt.signerPublicKey = authorityPublicKeys[receipt.algorithm];

    // Append to public ledger view
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

// Independent Verification Engine
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
  if (publicAuditLog.length === 0) {
    return { valid: true, count: 0 };
  }

  let expectedPrevHash =
    "0000000000000000000000000000000000000000000000000000000000000000";

  for (let i = 0; i < publicAuditLog.length; i++) {
    const entry = publicAuditLog[i];

    // Chain continuity
    if (entry.chainProof.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Previous hash mismatch! Expected ${expectedPrevHash.slice(0, 8)}... but got ${entry.chainProof.prevHash.slice(0, 8)}...`,
      };
    }

    // Recompute Hash Link
    const recalculated = await sha256Text(
      entry.chainProof.prevHash + entry.signature + entry.docDigest,
    );

    if (recalculated !== entry.chainProof.chainHash) {
      return {
        valid: false,
        brokenIndex: i,
        reason: `Hash mutation detected! Entry content was modified.`,
      };
    }

    expectedPrevHash = entry.chainProof.chainHash;
  }

  return { valid: true, count: publicAuditLog.length };
}

function renderAuditTable() {
  tableBody.innerHTML = "";

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

//TODO: add option to load real document, placeholding with "dummyContent"
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
  // Mutate the document digest of the latest entry to simulate an attack
  // TODO: Considering others attack vector simulations
  const target = publicAuditLog[publicAuditLog.length - 1];
  target.docDigest = "ffff" + target.docDigest.slice(4);
  renderAuditTable();

  logToConsole(
    `ATTACK SIMULATED: Tampered with document digest in Block #${target.sequence}!`,
  );
  alert(
    `Tampered with Block #${target.sequence}! Run "Verify Chain" or click "Verify" on that row.`,
  );
});

btnVerifyChain.addEventListener("click", async () => {
  const result = await verifyEntireAuditChain();
  if (result.valid) {
    alert(
      `✅ Audit Chain Valid! All ${result.count} blocks are cryptographically intact and strictly ordered.`,
    );
  } else {
    alert(
      `❌ AUDIT CHAIN COMPROMISED at Block #${result.brokenIndex}!\nReason: ${result.reason}`,
    );
  }
});

//TODO: Considering adding History Rewrite Attack

export async function notarazieLocalFile(fileBlob, chosenAlgorithm) {
  const arrayBuffer = await fileBlob.arrayBuffer();

  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const docDigestBytes = new Uint8Array(digestBuffer);

  enqueueSigningRequest(docDigestBytes, chosenAlgorithm);
}

//TODO: event listner on a specific button or like this?
fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const algorithm = selectAlgo.value;
  await notarizeLocalFile(file, algorithm);
  fileInput.value = ""; // Reset input so you can re-upload if needed
});

export async function notarizeLocalFile(fileBlob, algorithm) {
  const arrayBuffer = await fileBlob.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const docDigestBytes = new Uint8Array(digestBuffer);

  logToConsole(`Local document hashed: "${fileBlob.name}"`);

  // Passes the 32-byte hash directly to Developer A's queue
  enqueueSigningRequest(docDigestBytes, algorithm);
}
