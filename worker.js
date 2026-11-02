// Private keys are held exclusively inside this isolated thread scope
const privateKeys = {
  ecdsa: null,
  rsa: null,
};

// Utilities: Binary to Base64 and Hex
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

async function initializeAuthority() {
  try {
    const ecdsaPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true, // extractable (to export public key only)
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

    // 3. Export ONLY Public Keys to SubjectPublicKeyInfo (SPKI)
    const [ecdsaSpki, rsaSpki] = await Promise.all([
      crypto.subtle.exportKey("spki", ecdsaPair.publicKey),
      crypto.subtle.exportKey("spki", rsaPair.publicKey),
    ]);

    // 4. Notify Main Thread that Central Authority is online
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

self.onmessage = async (event) => {
  const { type, data } = event.data;

  if (type === "SIGN_REQUEST") {
    const { id, docDigestBytes, algorithm, tArrival, tQueueExit } = data;

    // Start measuring raw cryptographic service time (S)
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

      // Stop measuring service time
      const tEnd = performance.now();
      const serviceTimeSeconds = (tEnd - tStart) / 1000;

      // Emit completion back to Main Thread
      self.postMessage({
        type: "SIGN_SUCCESS",
        data: {
          id,
          algorithm,
          docDigestHex: bufferToHex(docDigestBytes),
          signatureHex: bufferToHex(signatureBuffer),
          tArrival,
          tQueueExit,
          serviceTimeSeconds,
        },
      });
    } catch (err) {
      self.postMessage({
        type: "SIGN_ERROR",
        data: { id, error: err.message },
      });
    }
  }
};

initializeAuthority();
