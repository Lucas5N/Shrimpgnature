//chain hashing rules
import { sha256Text } from "./encoding.js";

export const GENESIS_HASH = "0".repeat(64);

export function computeChainHash(prevHash, signatureHex, docDigestHex) {
  return sha256Text(prevHash + signatureHex + docDigestHex);
}
