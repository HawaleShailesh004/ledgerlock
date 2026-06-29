import crypto from "crypto";
import { merkleRoot } from "./chain.js";

/**
 * Build a Merkle inclusion proof for leaf at `leafIndex`.
 * Tree pairing matches merkleRoot() — odd levels duplicate the last sibling.
 */
export function buildProof(leaves, leafIndex) {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("leaf_index_out_of_range");
  }
  const siblings = [];
  let level = [...leaves];
  let idx = leafIndex;

  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const pairIdx = isRight ? idx - 1 : idx + 1;
    const sibling = level[pairIdx] ?? level[idx];
    siblings.push({ hash: sibling, position: isRight ? "left" : "right" });

    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? level[i];
      next.push(
        crypto.createHash("sha256").update(a + b).digest("hex"),
      );
    }
    level = next;
    idx = Math.floor(idx / 2);
  }

  return {
    leaf: leaves[leafIndex],
    leafIndex,
    siblings,
    root: level[0],
  };
}

/** Verify a Merkle inclusion proof against an expected root. */
export function verifyProof(leaf, siblings, expectedRoot) {
  let hash = leaf;
  for (const { hash: sibling, position } of siblings) {
    hash =
      position === "left"
        ? crypto.createHash("sha256").update(sibling + hash).digest("hex")
        : crypto.createHash("sha256").update(hash + sibling).digest("hex");
  }
  return hash === expectedRoot;
}

/** Merkle root over leaf hashes (delegates to chain.js). */
export { merkleRoot };
