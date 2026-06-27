import crypto from "crypto";

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Binary Merkle root over an ordered list of leaf hashes.
// Odd nodes are promoted (duplicated) - standard for append-only logs.
export function merkleRoot(hashes) {
  if (!hashes || hashes.length === 0) return "EMPTY";
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? level[i];
      next.push(sha256(a + b));
    }
    level = next;
  }
  return level[0];
}
