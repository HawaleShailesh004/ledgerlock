/**
 * Simulates an external app (e.g. hospital EHR) calling LedgerLock as middleware.
 *
 * Usage:
 *   npm run dev   # in another terminal
 *   npm run integration-demo
 *
 *   API_URL=https://ledgerlock-vert.vercel.app npm run integration-demo
 */
import { loadEnvLocal } from "../lib/load-env.mjs";

loadEnvLocal();

const BASE = process.env.API_URL || "http://localhost:3000";
const tenantId = process.env.TENANT_ID || "acme";

const body = {
  tenantId,
  actor: "ehr.integration",
  action: "PHI_READ",
  payload: {
    subject: "ACME-1042",
    view: "lab-results",
    source: "external-ehr-v1",
  },
  flagged: false,
};

console.log(`POST ${BASE}/api/events`);
console.log(JSON.stringify(body, null, 2));

const res = await fetch(`${BASE}/api/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const data = await res.json().catch(() => ({}));
console.log("\nResponse:", res.status, data);

if (!res.ok || data.ok === false) {
  console.error(data.error || "Append failed");
  process.exit(1);
}

console.log(
  `\nSuccess — event #${data.seq} appended (${data.sk}).`,
);
console.log(`Open ${BASE.replace(/\/$/, "")}/dashboard and select tenant "${tenantId}".`);
