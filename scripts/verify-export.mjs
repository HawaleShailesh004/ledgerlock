#!/usr/bin/env node
// Independent offline verifier (Phase 2A) — no AWS credentials required.
// Usage: node scripts/verify-export.mjs export-acme.json [--full]

import { readFileSync } from "fs";
import { verifyChainInMemory, verifySealPrefix } from "../lib/verify-core.js";

const file = process.argv[2];
const fullMode = process.argv.includes("--full");

if (!file) {
  console.error("Usage: node scripts/verify-export.mjs <export.json> [--full]");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(file, "utf8"));
const events = payload.events || [];
let checkpoint = fullMode ? null : payload.checkpoint || null;

if (checkpoint && !fullMode) {
  if (checkpoint.count > events.length) checkpoint = null;
  else if (!verifySealPrefix(events, checkpoint).sealOk) checkpoint = null;
}

const started = Date.now();
const result = verifyChainInMemory(events, checkpoint);
const durationMs = Date.now() - started;

console.log("\nLedgerLock Independent Verifier");
console.log("================================");
console.log(`Tenant:     ${payload.tenantId || "unknown"}`);
console.log(`Events:     ${result.count}`);
console.log(`Mode:       ${result.mode}${fullMode ? " (forced full)" : ""}`);
if (result.sealAt > 0) {
  console.log(`Seal at:    ${result.sealAt} events (WORM)`);
  console.log(`Tail walk:  ${result.tailVerified} events`);
  console.log(`Seal OK:    ${result.sealVerified ? "yes" : "NO"}`);
}
console.log(`Duration:   ${durationMs}ms`);
console.log(`Intact:     ${result.intact ? "YES" : "NO"}`);

if (result.liveRootAtBoundary && payload.checkpoint?.merkleRoot) {
  const wormContentMatch =
    result.liveRootAtBoundary === payload.checkpoint.merkleRoot;
  console.log(`WORM root:  ${wormContentMatch ? "matches seal" : "DIVERGED (content tamper)"}`);
}

if (!result.intact) {
  console.log("\nBreaks:");
  for (const b of result.breaks.slice(0, 5)) {
    console.log(`  seq ${b.seq}`, b);
  }
  process.exit(2);
}

console.log("\nChain verified independently.");
process.exit(0);
