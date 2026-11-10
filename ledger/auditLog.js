// Verifications
import { base64ToBuffer, hexToBytes } from "../lib/encoding.js";
import { GENESIS_HASH, computeChainHash } from "../lib/chain.js";

export async function verifyReceiptSignature(receipt) {
  try {
    const publicKey = base64ToBuffer(receipt.signerPublicKey);
    const signature = hexToBytes(receipt.signature);
    const digest = hexToBytes(receipt.docDigest);
    const isEcdsa = receipt.algorithm === "ECDSA";

    const importParams = isEcdsa
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { name: "RSA-PSS", hash: "SHA-256" };
    const verifyParams = isEcdsa
      ? { name: "ECDSA", hash: { name: "SHA-256" } }
      : { name: "RSA-PSS", saltLength: 32 };

    const key = await crypto.subtle.importKey(
      "spki",
      publicKey,
      importParams,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(verifyParams, key, signature, digest);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

/** Layer 1: hash-chain links. Layer 2: digital signatures. */
export async function auditLedger(entries) {
  if (entries.length === 0) return { status: "EMPTY", totalBlocks: 0 };

  let chainIntegrityPassed = true;
  let signatureIntegrityPassed = true;
  let firstTamperedBlock = -1;
  let firstForgedSignatureBlock = -1;
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const block = entries[i];
    const recalculated = await computeChainHash(
      block.chainProof.prevHash,
      block.signature,
      block.docDigest,
    );

    const linkBroken =
      block.chainProof.prevHash !== expectedPrevHash ||
      recalculated !== block.chainProof.chainHash;
    if (linkBroken && chainIntegrityPassed) {
      chainIntegrityPassed = false;
      firstTamperedBlock = i;
    }
    expectedPrevHash = block.chainProof.chainHash;

    if (!(await verifyReceiptSignature(block)) && signatureIntegrityPassed) {
      signatureIntegrityPassed = false;
      firstForgedSignatureBlock = i;
    }
  }

  return {
    status: "OK",
    totalBlocks: entries.length,
    chainIntegrityPassed,
    signatureIntegrityPassed,
    firstTamperedBlock,
    firstForgedSignatureBlock,
  };
}
