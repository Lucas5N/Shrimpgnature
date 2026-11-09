// ============================================================================
// worker.js - The Central Notary Authority (Background Web Worker)
// ============================================================================

// Isolated Cryptographic State
const privateKeys = {
  ecdsa: null,
  rsa: null,
};

let currentChainHash =
  "0000000000000000000000000000000000000000000000000000000000000000"; // Genesis Hash
let sequenceCounter = 0;
 
// Binary encoding helpers
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Text(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

async function initializeAuthority() {
  try {
    const ecdsaPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    privateKeys.ecdsa = ecdsaPair.privateKey;

    const rsaPair = await crypto.subtle.generateKey(
      {
        name: "RSA-PSS",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    privateKeys.rsa = rsaPair.privateKey;

    const [ecdsaSpki, rsaSpki] = await Promise.all([
      crypto.subtle.exportKey("spki", ecdsaPair.publicKey),
      crypto.subtle.exportKey("spki", rsaPair.publicKey),
    ]);

    // Send public keys to Main Thread
    self.postMessage({
      type: "INIT_SUCCESS",
      payload: {
        publicKeys: {
          ECDSA: bufferToBase64(ecdsaSpki),
          "RSA-PSS": bufferToBase64(rsaSpki),
        },
      },
    });
  } catch (err) {
    self.postMessage({
      type: "INIT_ERROR",
      payload: { error: err.message },
    });
  }
}

/**
 * Request Handler: Signs the digest and commits to the Audit Log
 */
self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === "SIGN_REQUEST") {
    const { id, docDigestBytes, algorithm, tArrival, tQueueExit } = data;

    // ==== START MEASURE SERVICE TIME ====
    const tStart = performance.now();

    try {
      let signatureBuffer;
      if (algorithm === "ECDSA") {
        signatureBuffer = await crypto.subtle.sign(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          privateKeys.ecdsa,
          docDigestBytes,
        );
      } else if (algorithm === "RSA-PSS") {
        signatureBuffer = await crypto.subtle.sign(
          { name: "RSA-PSS", saltLength: 32 },
          privateKeys.rsa,
          docDigestBytes,
        );
      } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const sigHex = bufferToHex(signatureBuffer);
      const docDigestHex = bufferToHex(docDigestBytes);

      // Hash Chaining
      const prevHash = currentChainHash;
      const newChainHash = await sha256Text(prevHash + sigHex + docDigestHex);
      currentChainHash = newChainHash;
      const assignedSequence = sequenceCounter++;

      // ==== STOP MEASURE SERVICE TIME ====
      const tEnd = performance.now();
      const serviceTimeSeconds = (tEnd - tStart) / 1000;

      self.postMessage({
        type: "SIGN_SUCCESS",
        payload: {
          receipt: {// ============================================================================
// worker.js - The Central Notary Authority (Background Web Worker)
// ============================================================================

// Isolated Cryptographic State
const privateKeys = {
  ecdsa: null,
  rsa: null,
};

let currentChainHash =
  "0000000000000000000000000000000000000000000000000000000000000000"; // Genesis Hash
let sequenceCounter = 0;

// Binary encoding helpers
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Text(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

async function initializeAuthority() {
  try {
    const ecdsaPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    privateKeys.ecdsa = ecdsaPair.privateKey;

    const rsaPair = await crypto.subtle.generateKey(
      {
        name: "RSA-PSS",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    privateKeys.rsa = rsaPair.privateKey;

    const [ecdsaSpki, rsaSpki] = await Promise.all([
      crypto.subtle.exportKey("spki", ecdsaPair.publicKey),
      crypto.subtle.exportKey("spki", rsaPair.publicKey),
    ]);

    // Send public keys to Main Thread
    self.postMessage({
      type: "INIT_SUCCESS",
      payload: {
        publicKeys: {
          ECDSA: bufferToBase64(ecdsaSpki),
          "RSA-PSS": bufferToBase64(rsaSpki),
        },
      },
    });
  } catch (err) {
    self.postMessage({
      type: "INIT_ERROR",
      payload: { error: err.message },
    });
  }
}

/**
 * Request Handler: Signs the digest and commits to the Audit Log
 */
self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === "SIGN_REQUEST") {
    const { id, docDigestBytes, algorithm, tArrival, tQueueExit } = data;

    // ==== START MEASURE SERVICE TIME ====
    const tStart = performance.now();

    try {
      let signatureBuffer;
      if (algorithm === "ECDSA") {
        signatureBuffer = await crypto.subtle.sign(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          privateKeys.ecdsa,
          docDigestBytes,
        );
      } else if (algorithm === "RSA-PSS") {
        signatureBuffer = await crypto.subtle.sign(
          { name: "RSA-PSS", saltLength: 32 },
          privateKeys.rsa,
          docDigestBytes,
        );
      } else {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const sigHex = bufferToHex(signatureBuffer);
      const docDigestHex = bufferToHex(docDigestBytes);

      // Hash Chaining
      const prevHash = currentChainHash;
      const newChainHash = await sha256Text(prevHash + sigHex + docDigestHex);
      currentChainHash = newChainHash;
      const assignedSequence = sequenceCounter++;

      // ==== STOP MEASURE SERVICE TIME ====
      const tEnd = performance.now();
      const serviceTimeSeconds = (tEnd - tStart) / 1000;

      self.postMessage({
        type: "SIGN_SUCCESS",
        payload: {
          receipt: {
            sequence: assignedSequence,
            id,
            docDigest: docDigestHex,
            signature: sigHex,
            algorithm,
            timestamp: Date.now(),
            chainProof: {
              prevHash: prevHash,
              chainHash: newChainHash,
            },
          },
          telemetry: {
            tArrival,
            tQueueExit,
            serviceTimeSeconds,
          },
        },
      });
    } catch (err) {
      self.postMessage({
        type: "SIGN_ERROR",
        payload: { id, error: err.message },
      });
    }
  }
};

// Boot up the authority
initializeAuthority();
            sequence: assignedSequence,
            id,
            docDigest: docDigestHex,
            signature: sigHex,
            algorithm,
            timestamp: Date.now(),
            chainProof: {
              prevHash: prevHash,
              chainHash: newChainHash,
            },
          },
          telemetry: {
            tArrival,
            tQueueExit,
            serviceTimeSeconds,
          },
        },
      });
    } catch (err) {
      self.postMessage({
        type: "SIGN_ERROR",
        payload: { id, error: err.message },
      });
    }
  }
};

// Boot up the authority
initializeAuthority();
