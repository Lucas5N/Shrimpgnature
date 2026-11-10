// Central Notary Authority
import { bufferToBase64, bufferToHex } from "../lib/encoding.js";
import { GENESIS_HASH, computeChainHash } from "../lib/chain.js";

const SIGNERS = {
  ECDSA: {
    keyName: "ecdsa",
    params: { name: "ECDSA", hash: { name: "SHA-256" } },
  },
  "RSA-PSS": { keyName: "rsa", params: { name: "RSA-PSS", saltLength: 32 } },
};

export function createAuthority() {
  const privateKeys = { ecdsa: null, rsa: null };
  let currentChainHash = GENESIS_HASH;
  let sequenceCounter = 0;

  async function init() {
    const ecdsaPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
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
    privateKeys.ecdsa = ecdsaPair.privateKey;
    privateKeys.rsa = rsaPair.privateKey;

    const [ecdsaSpki, rsaSpki] = await Promise.all([
      crypto.subtle.exportKey("spki", ecdsaPair.publicKey),
      crypto.subtle.exportKey("spki", rsaPair.publicKey),
    ]);
    return {
      ECDSA: bufferToBase64(ecdsaSpki),
      "RSA-PSS": bufferToBase64(rsaSpki),
    };
  }

  // Service time = everything from tStart to the end (sign + chain hash)
  async function sign({ id, docDigestBytes, algorithm, tArrival, tQueueExit }) {
    const tStart = performance.now();

    const signer = SIGNERS[algorithm];
    if (!signer) throw new Error(`Unsupported algorithm: ${algorithm}`);
    const key = privateKeys[signer.keyName];
    if (!key) throw new Error("Authority not initialised yet");

    const signatureBuffer = await crypto.subtle.sign(
      signer.params,
      key,
      docDigestBytes,
    );
    const signature = bufferToHex(signatureBuffer);
    const docDigest = bufferToHex(docDigestBytes);

    const prevHash = currentChainHash;
    const chainHash = await computeChainHash(prevHash, signature, docDigest);
    currentChainHash = chainHash;
    const sequence = sequenceCounter++;

    const serviceTimeSeconds = (performance.now() - tStart) / 1000;

    return {
      receipt: {
        sequence,
        id,
        docDigest,
        signature,
        algorithm,
        timestamp: Date.now(),
        chainProof: { prevHash, chainHash },
      },
      telemetry: { tArrival, tQueueExit, serviceTimeSeconds },
    };
  }

  return { init, sign };
}
