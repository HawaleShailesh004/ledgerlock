// Seed large tenant for scale proof (Phase 1B).
// Usage:
//   npm run seed-scale              # scale-test → 10k
//   npm run seed-100k               # scale-100k → 100k

import { loadEnvLocal } from "../lib/load-env.mjs";

loadEnvLocal();

if (!process.env.LL_ACCESS_KEY_ID || !process.env.LL_SECRET_ACCESS_KEY) {
  console.error("Missing AWS credentials in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TENANT = args[0] || "scale-test";
const TARGET = Number(args[1] || 10_000);

const { appendEvent } = await import("../lib/append.js");
const { queryAllEvents } = await import("../lib/events.js");

const ACTORS = ["svc.api", "analyst.wu", "admin.ops", "auditor.fox", "dr.lee"];

function pickAction(i) {
  if (i % 97 === 0) return { action: "BREAK_THE_GLASS", flagged: true };
  if (i % 11 === 0) return { action: "EXPORT", flagged: false };
  if (i % 5 === 0) return { action: "RECORD_UPDATE", flagged: false };
  return { action: "PHI_READ", flagged: false };
}

const existing = await queryAllEvents(TENANT);
const start = existing.length;
console.log(`${TENANT} has ${start} events; targeting ${TARGET}`);

if (start >= TARGET) {
  console.log("Already at or above target. Done.");
  process.exit(0);
}

const t0 = Date.now();
for (let i = start; i < TARGET; i++) {
  const { action, flagged } = pickAction(i);
  await appendEvent({
    tenantId: TENANT,
    actor: ACTORS[i % ACTORS.length],
    action,
    payload: {
      subject: `SC-${String(1000 + (i % 500)).padStart(4, "0")}`,
      batch: Math.floor(i / 100),
    },
    flagged,
  });
  if ((i + 1) % 500 === 0 || i === TARGET - 1) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const rate = (((i + 1 - start) / (Date.now() - t0)) * 1000).toFixed(1);
    process.stdout.write(
      `\r  ${i + 1}/${TARGET} (${elapsed}s, ${rate} evt/s)   `,
    );
  }
}

console.log(`\nSeed complete: ${TARGET} events on ${TENANT}`);
console.log(
  "Run backfill after seed: npm run backfill-worm --",
  TENANT,
  "--use-aws-profile",
);
