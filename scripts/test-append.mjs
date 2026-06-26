import { appendEvent } from "../lib/append.js";

const r1 = await appendEvent({ tenantId: "acme", actor: "dr.smith", action: "PHI_READ", payload: { patient: "p-001" } });
const r2 = await appendEvent({ tenantId: "acme", actor: "dr.smith", action: "RECORD_UPDATE", payload: { patient: "p-001", field: "dosage" } });
console.log("event 0:", r1);
console.log("event 1:", r2);
console.log("chained:", r2.seq === 1 ? "yes" : "no");