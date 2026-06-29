// Unit test Merkle inclusion proofs (no AWS).
import { buildProof, verifyProof, merkleRoot } from "../lib/merkle-proof.js";

const leaves = Array.from({ length: 10 }, (_, i) =>
  `hash-${i}`.padEnd(64, "0"),
);
const root = merkleRoot(leaves);

for (const idx of [0, 3, 7, 9]) {
  const proof = buildProof(leaves, idx);
  const ok = verifyProof(proof.leaf, proof.siblings, root);
  if (!ok || proof.root !== root) {
    console.error(`FAIL at index ${idx}`);
    process.exit(1);
  }
  console.log(`index ${idx}: proof valid, ${proof.siblings.length} siblings`);
}

// Tampered leaf should fail
const bad = buildProof(leaves, 2);
bad.leaf = "tampered";
if (verifyProof(bad.leaf, bad.siblings, root)) {
  console.error("FAIL: tampered leaf accepted");
  process.exit(1);
}

console.log("\nOK: Merkle proofs pass");
process.exit(0);
