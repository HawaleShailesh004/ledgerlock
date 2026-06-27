// Seed demo data - run once against the live table (uses creds from .env.local)
// Usage: npm run seed

import { loadEnvLocal } from "../lib/load-env.mjs";

loadEnvLocal();

if (!process.env.LL_ACCESS_KEY_ID || !process.env.LL_SECRET_ACCESS_KEY) {
  console.error(
    "Missing AWS credentials. Add LL_ACCESS_KEY_ID and LL_SECRET_ACCESS_KEY to .env.local",
  );
  process.exit(1);
}

const { appendEvent } = await import("../lib/append.js");

const TENANTS = ["acme", "northwind", "globex"];
const EVENTS_PER_TENANT = 36; // > 30 so each tenant has a checkpoint at boundary 30

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

for (const tenant of TENANTS) {
  console.log(`\nSeeding ${tenant}...`);
  for (let i = 0; i < EVENTS_PER_TENANT; i++) {
    const { action, flagged } = pickAction(i);
    const actor = ACTORS[tenant][i % ACTORS[tenant].length];
    const r = await appendEvent({
      tenantId: tenant,
      actor,
      action,
      payload: payloadFor(tenant, action, i),
      flagged,
    });
    process.stdout.write(
      `  seq ${String(r.seq).padStart(2, "0")} ${action}${flagged ? " *" : ""}\r`,
    );
  }
  console.log(`  done - ${EVENTS_PER_TENANT} events`);
}
console.log(
  "\nSeed complete. Each tenant should have a checkpoint at boundary 30 (events 0–29).",
);
