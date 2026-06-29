// Wipe + fresh seed + WORM backfill for one demo tenant.
// Usage: node scripts/reseed-tenant.mjs acme [--use-aws-profile]

import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadEnvLocal } from "../lib/load-env.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const useAwsProfile = process.argv.includes("--use-aws-profile");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const tenantId = args[0];

if (!tenantId) {
  console.error("Usage: node scripts/reseed-tenant.mjs <tenantId> [--use-aws-profile]");
  process.exit(1);
}

loadEnvLocal();

if (!process.env.LL_ACCESS_KEY_ID && !useAwsProfile) {
  console.error("Missing LL_ACCESS_KEY_ID in .env.local (needed for append after wipe)");
  process.exit(1);
}

const EVENTS_PER_TENANT = 36;

const ACTORS = {
  acme: ["dr.smith", "dr.lee", "nurse.patel", "admin.ops"],
  northwind: ["teller.gomez", "analyst.wu", "compliance.ray", "admin.ops"],
  globex: ["adjuster.khan", "agent.diaz", "auditor.fox", "admin.ops"],
};

function pickAction(i) {
  if (i === 7 || i === 23) return { action: "BREAK_THE_GLASS", flagged: true };
  const r = i % 10;
  if (r === 0 || r === 5) return { action: "RECORD_UPDATE", flagged: false };
  if (r === 8) return { action: "EXPORT", flagged: false };
  return { action: "PHI_READ", flagged: false };
}

function payloadFor(tenant, action, i) {
  const subject = `${tenant.slice(0, 2).toUpperCase()}-${String(1000 + (i % 25)).padStart(4, "0")}`;
  switch (action) {
    case "RECORD_UPDATE":
      return {
        subject,
        field: ["status", "dosage", "balance", "tier"][i % 4],
        note: "field updated",
      };
    case "EXPORT":
      return { subject, scope: "full-record", dest: "compliance-archive" };
    case "BREAK_THE_GLASS":
      return {
        subject,
        reason: "emergency access",
        approver: "supervisor.on-call",
      };
    default:
      return { subject, view: "summary" };
  }
}

function runNode(script, scriptArgs) {
  const r = spawnSync(process.execPath, [resolve(__dir, script), ...scriptArgs], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`\n=== Reseed ${tenantId} ===\n`);

console.log("1/3 Wiping DynamoDB tenant partition...");
const wipeArgs = [tenantId];
if (useAwsProfile) wipeArgs.push("--use-aws-profile");
runNode("wipe-tenant.mjs", wipeArgs);

console.log(`\n2/3 Seeding ${EVENTS_PER_TENANT} events...`);
const { appendEvent } = await import("../lib/append.js");
const actors = ACTORS[tenantId];
if (!actors) {
  console.error(`Unknown demo tenant: ${tenantId}. Use acme, northwind, or globex.`);
  process.exit(1);
}

for (let i = 0; i < EVENTS_PER_TENANT; i++) {
  const { action, flagged } = pickAction(i);
  const actor = actors[i % actors.length];
  await appendEvent({
    tenantId,
    actor,
    action,
    payload: payloadFor(tenantId, action, i),
    flagged,
  });
  process.stdout.write(
    `  seq ${String(i).padStart(2, "0")} ${action}${flagged ? " *" : ""}\r`,
  );
}
console.log(`  done - ${EVENTS_PER_TENANT} events`);

console.log("\n3/3 WORM backfill (checkpoint at boundary 30)...");
const backfillArgs = [tenantId];
if (useAwsProfile) backfillArgs.push("--use-aws-profile");
runNode("backfill-worm.mjs", backfillArgs);

console.log(`\n=== ${tenantId} reseed complete ===`);
console.log("Verify: npm run test:verify-seal --", tenantId);
