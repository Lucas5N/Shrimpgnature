// The attacks mutate only the ledger array
import { computeChainHash } from "../lib/chain.js";

/** Naive attack: alter only last digest. */
export function tamperLastDigest(entries) {
  const target = entries[entries.length - 1];
  target.docDigest = "ffff" + target.docDigest.slice(4);
  return target;
}

/** Smart attack: alter a digest, then recompute every chain hash after it.
 *  Chain check passes, but the signatures no longer match. */
export async function rewriteHistory(entries, sequence) {
  let idx = entries.findIndex((r) => r.sequence === sequence);
  if (idx === -1) idx = sequence;
  if (idx < 0 || idx >= entries.length) {
    throw new Error("Target index outside audit log bounds.");
  }

  const target = entries[idx];
  target.docDigest = "ffffffff" + target.docDigest.slice(8);

  let rollingPrevHash = target.chainProof.prevHash;
  for (let i = idx; i < entries.length; i++) {
    const entry = entries[i];
    entry.chainProof.prevHash = rollingPrevHash;
    entry.chainProof.chainHash = await computeChainHash(
      rollingPrevHash,
      entry.signature,
      entry.docDigest,
    );
    rollingPrevHash = entry.chainProof.chainHash;
  }
}
