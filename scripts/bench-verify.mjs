// Benchmark full vs since-seal verify (Phase 1B scale proof).
import { loadEnvLocal } from "../lib/load-env.mjs";

loadEnvLocal();

const tenantId = process.argv[2] || "scale-test";
const { verifyChainFull, verifyChainSinceSeal } = await import("../lib/verify.js");

console.log(`Benchmark: ${tenantId}\n`);

const since = await verifyChainSinceSeal(tenantId);
console.log("Since-seal:", {
  count: since.count,
  sealAt: since.sealAt,
  tailVerified: since.tailVerified,
  intact: since.intact,
  durationMs: since.durationMs,
});

const full = await verifyChainFull(tenantId);
console.log("Full walk:", {
  count: full.count,
  intact: full.intact,
  durationMs: full.durationMs,
});

if (since.count > 0) {
  const speedup = (full.durationMs / Math.max(since.durationMs, 1)).toFixed(2);
  console.log(`\nSpeedup: ${speedup}x (since-seal vs full)`);
}
