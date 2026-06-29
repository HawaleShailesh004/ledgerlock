// Backfill missing WORM checkpoints after bulk seed (checkpointer lag).
// Requires S3 PutObject on the WORM bucket — use admin creds in .env.local.
//
// Usage:
//   node scripts/backfill-worm.mjs scale-test           # seal latest boundary only
//   node scripts/backfill-worm.mjs scale-test --all     # every missing 10..N boundary
//   node scripts/backfill-worm.mjs scale-test --dry-run

import { loadEnvLocal } from "../lib/load-env.mjs";

const useAwsProfile = process.argv.includes("--use-aws-profile");
loadEnvLocal();

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tenantId = args[0];
const allBoundaries = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

if (!tenantId) {
  console.error(
    "Usage: node scripts/backfill-worm.mjs <tenantId> [--all] [--dry-run] [--force] [--use-aws-profile]",
  );
  process.exit(1);
}

if (!process.env.WORM_BUCKET) {
  console.error("Missing WORM_BUCKET in .env.local");
  process.exit(1);
}

if (!useAwsProfile && !process.env.LL_ACCESS_KEY_ID) {
  console.error("Missing LL_ACCESS_KEY_ID in .env.local (or pass --use-aws-profile)");
  process.exit(1);
}

const { queryAllEvents } = await import("../lib/events.js");
const { listCheckpoints } = await import("../lib/worm.js");
const { maxBoundary, writeCheckpoint, buildCheckpoint } = await import(
  "../lib/checkpoint-seal.js"
);
const { verifySealPrefix } = await import("../lib/verify-core.js");

console.log(`Backfill WORM for ${tenantId}${dryRun ? " (dry-run)" : ""}...`);

const items = await queryAllEvents(tenantId);
const n = items.length;
const top = maxBoundary(n);

if (top === 0) {
  console.log(`Only ${n} events — need at least 10 for a checkpoint.`);
  process.exit(0);
}

const existing = await listCheckpoints(tenantId);
const existingBoundaries = new Set(existing.map((c) => c.count));

function needsWrite(boundary) {
  if (force) return true;
  if (!existingBoundaries.has(boundary)) return true;
  const cp = existing.find((c) => c.count === boundary);
  if (!cp) return true;
  return !verifySealPrefix(items, cp).sealOk;
}

const targets = allBoundaries
  ? Array.from({ length: top / 10 }, (_, i) => (i + 1) * 10).filter(needsWrite)
  : [top].filter(needsWrite);

if (targets.length === 0) {
  console.log(`Already sealed through ${top} (${n} events). Nothing to do.`);
  process.exit(0);
}

console.log(`Events: ${n} · max boundary: ${top}`);
console.log(
  `Will write ${targets.length} checkpoint(s)${allBoundaries ? " (--all)" : ""}`,
);

if (useAwsProfile && !dryRun) {
  delete process.env.LL_ACCESS_KEY_ID;
  delete process.env.LL_SECRET_ACCESS_KEY;
  delete process.env.LL_ADMIN_ACCESS_KEY_ID;
  delete process.env.LL_ADMIN_SECRET_ACCESS_KEY;
}

const t0 = Date.now();
let written = 0;

for (const boundary of targets) {
  if (dryRun) {
    const cp = buildCheckpoint(tenantId, items, boundary);
    console.log(
      `  [dry-run] checkpoint-${boundary}.json → merkle ${cp.merkleRoot.slice(0, 12)}…`,
    );
    written += 1;
    continue;
  }

  try {
    await writeCheckpoint(tenantId, items, boundary);
  } catch (e) {
    if (e.name === "AccessDenied" || e.Code === "AccessDenied") {
      console.error(`
AccessDenied on S3 PutObject — ledgerlock-app is read-only on WORM.

Add ledgerlock-admin keys to .env.local (one-time):
  LL_ADMIN_ACCESS_KEY_ID=...
  LL_ADMIN_SECRET_ACCESS_KEY=...

Or attach iam/backfill-worm-policy.json to admin, then re-run:
  npm run backfill-worm -- ${tenantId}

Alternative (Lambda writes S3): npm run trigger-checkpoint -- ${tenantId} --use-aws-profile
  (requires admin lambda:InvokeFunction)
`);
      process.exit(1);
    }
    throw e;
  }
  written += 1;
  if (written % 50 === 0 || boundary === targets[targets.length - 1]) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`\r  ${written}/${targets.length} (${elapsed}s)   `);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDone — ${written} checkpoint(s) in ${elapsed}s`);
console.log(
  `Sealed through event boundary ${targets[targets.length - 1]} (${n} total events)`,
);
console.log(
  `Pending tail after seal: ${n - targets[targets.length - 1]} events`,
);
