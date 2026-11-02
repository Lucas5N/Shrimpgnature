// main.js

// Public keys exposed by the Authority
const authorityPublicKeys = {
  ECDSA: null,
  "RSA-PSS": null,
};

// UI Elements
const workerBadge = document.getElementById("worker-badge");
const workerStatusDesc = document.getElementById("worker-status-desc");
const pubkeyEcdsaInput = document.getElementById("pubkey-ecdsa");
const pubkeyRsaInput = document.getElementById("pubkey-rsa");
const selectAlgo = document.getElementById("select-algo");
const btnTestSign = document.getElementById("btn-test-sign");
const consoleOutput = document.getElementById("console-output");

function logToConsole(message) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  consoleOutput.textContent += `\n[${timestamp}] ${message}`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

logToConsole("Spawning Central Authority Worker process...");
const notaryWorker = new Worker("worker.js");

notaryWorker.onmessage = (event) => {
  const { type, payload, data } = event.data;

  switch (type) {
    case "INIT_SUCCESS":
      authorityPublicKeys["ECDSA"] = payload.publicKeys["ECDSA"];
      authorityPublicKeys["RSA-PSS"] = payload.publicKeys["RSA-PSS"];

      workerBadge.textContent = "AUTHORITY ONLINE";
      workerBadge.className =
        "px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      workerStatusDesc.textContent =
        "Cryptographic keys initialized. Worker ready for signing jobs.";
      pubkeyEcdsaInput.value = authorityPublicKeys["ECDSA"];
      pubkeyRsaInput.value = authorityPublicKeys["RSA-PSS"];

      btnTestSign.disabled = false;
      logToConsole(
        "Central Authority ready. Received exported SPKI public keys.",
      );
      break;

    case "INIT_ERROR":
      workerBadge.textContent = "INIT ERROR";
      workerBadge.className =
        "px-3 py-1 text-xs font-semibold rounded-full bg-red-500/10 text-red-400 border border-red-500/20";
      logToConsole(`ERROR: Failed to initialize keys: ${payload.error}`);
      break;

    case "SIGN_SUCCESS":
      logToConsole(`SUCCESS: Signed document ID [${data.id.slice(0, 8)}...]`);
      logToConsole(`  Algorithm: ${data.algorithm}`);
      logToConsole(`  Digest:    ${data.docDigestHex.slice(0, 24)}...`);
      logToConsole(`  Signature: ${data.signatureHex.slice(0, 32)}...`);
      logToConsole(
        `  Service Execution Time (S): ${(data.serviceTimeSeconds * 1000).toFixed(3)} ms`,
      );
      btnTestSign.disabled = false;
      break;

    case "SIGN_ERROR":
      logToConsole(
        `ERROR: Sign operation failed for ID [${data.id}]: ${data.error}`,
      );
      btnTestSign.disabled = false;
      break;
  }
};

btnTestSign.addEventListener("click", async () => {
  btnTestSign.disabled = true;
  const chosenAlgorithm = selectAlgo.value;

  // Simulate client document data
  const rawDocumentData = new TextEncoder().encode(
    `Notary assertion test at ${performance.now()}`,
  );

  const digestBuffer = await crypto.subtle.digest("SHA-256", rawDocumentData);
  const docDigestBytes = new Uint8Array(digestBuffer);

  const tArrival = performance.now();
  const tQueueExit = performance.now(); // direct dispatch without waiting queue (for Step 2 test)

  logToConsole(`Dispatching signing job to Authority (${chosenAlgorithm})...`);

  notaryWorker.postMessage({
    type: "SIGN_REQUEST",
    data: {
      id: crypto.randomUUID(),
      docDigestBytes: docDigestBytes,
      algorithm: chosenAlgorithm,
      tArrival,
      tQueueExit,
    },
  });
});
