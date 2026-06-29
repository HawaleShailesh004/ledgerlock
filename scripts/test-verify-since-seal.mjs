// Validate since-seal vs full verify on live table.
import { loadEnvLocal } from "../lib/load-env.mjs";

loadEnvLocal();

const tenantId = process.argv[2] || "acme";
const { verifyChainFull, verifyChainSinceSeal } = await import("../lib/verify.js");

console.log(`Testing verify modes for ${tenantId}...\n`);

const full = await verifyChainFull(tenantId);
const since = await verifyChainSinceSeal(tenantId);

console.log("Full verify:", {
  intact: full.intact,
  count: full.count,
  durationMs: full.durationMs,
  mode: full.mode,
});

console.log("Since-seal:", {
  intact: since.intact,
  count: since.count,
  sealAt: since.sealAt,
  tailVerified: since.tailVerified,
  sealVerified: since.sealVerified,
  durationMs: since.durationMs,
  mode: since.mode,
});

if (full.intact !== since.intact) {
  console.error("\nFAIL: intact mismatch between modes");
  process.exit(1);
}

if (since.sealAt > 0 && since.durationMs >= full.durationMs) {
  console.warn("\nWARN: since-seal not faster than full (small chain?)");
}

console.log("\nOK: both modes agree on integrity.");
process.exit(0);
