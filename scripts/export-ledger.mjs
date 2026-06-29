// Export tenant ledger + latest WORM checkpoint to JSON for offline verification.
// Usage: node scripts/export-ledger.mjs <tenantId> [out.json]

import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadEnvLocal } from "../lib/load-env.mjs";

loadEnvLocal();

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Usage: node scripts/export-ledger.mjs <tenantId> [out.json]");
  process.exit(1);
}

const outPath = resolve(
  process.cwd(),
  process.argv[3] || `export-${tenantId}.json`,
);

const { queryAllEvents } = await import("../lib/events.js");
const { fetchApplicableCheckpoint } = await import("../lib/worm.js");

console.log(`Exporting ${tenantId}...`);
const events = await queryAllEvents(tenantId);
const checkpoint = await fetchApplicableCheckpoint(tenantId, events.length);

const payload = {
  exportedAt: new Date().toISOString(),
  tenantId,
  count: events.length,
  checkpoint,
  events: events.map(({ GSI1PK, GSI1SK, ...e }) => e),
};

writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`Wrote ${events.length} events → ${outPath}`);
if (checkpoint) {
  console.log(`Checkpoint seal at ${checkpoint.count} events`);
}
