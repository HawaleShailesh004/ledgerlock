import { appendEvent } from "../lib/append.js";

for (let i = 0; i < 10; i++) {
  const r = await appendEvent({
    tenantId: "acme",
    actor: "system",
    action: "CHECKPOINT_TEST",
    payload: { n: i },
  });
  console.log(`event ${i}: seq=${r.seq}`);
}