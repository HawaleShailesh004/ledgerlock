// Client-side demo ledger that mirrors the server's hash-chain logic exactly.
// Used only as a fallback when the live DynamoDB backend is unreachable or empty,
// so the verify ripple and tamper cascade remain fully demoable in preview.
// State lives in memory (React) — nothing is written to localStorage.

// Deterministic serialization — must match lib/chain.js canonical().
function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") +
    "}"
  );
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// hash = SHA256( canonical(event-without-hash) + prevHash )
async function computeHash(eventWithoutHash, prevHash) {
  return sha256Hex(canonical(eventWithoutHash) + prevHash);
}

// Realistic seed activity per tenant.
const SEED = {
  acme: [
    { actor: "dr.patel@acmehealth.org", action: "PHI_ACCESS", flagged: false },
    { actor: "nurse.lee@acmehealth.org", action: "RECORD_VIEW", flagged: false },
    { actor: "billing@acmehealth.org", action: "CLAIM_SUBMIT", flagged: false },
    { actor: "ext.audit@acmehealth.org", action: "BULK_EXPORT", flagged: true },
    { actor: "dr.kim@acmehealth.org", action: "RECORD_UPDATE", flagged: false },
    { actor: "admin@acmehealth.org", action: "ROLE_GRANT", flagged: false },
  ],
  northwind: [
    { actor: "teller.ramos@northwind.bank", action: "ACCOUNT_OPEN", flagged: false },
    { actor: "ops@northwind.bank", action: "WIRE_TRANSFER", flagged: false },
    { actor: "compliance@northwind.bank", action: "KYC_REVIEW", flagged: false },
    { actor: "trader.voss@northwind.bank", action: "TRADE_EXECUTE", flagged: true },
    { actor: "ops@northwind.bank", action: "LEDGER_RECONCILE", flagged: false },
  ],
  globex: [
    { actor: "agent.ford@globex.ins", action: "POLICY_ISSUE", flagged: false },
    { actor: "claims@globex.ins", action: "CLAIM_OPEN", flagged: false },
    { actor: "adjuster.ng@globex.ins", action: "CLAIM_ADJUST", flagged: false },
    { actor: "claims@globex.ins", action: "PAYOUT_APPROVE", flagged: true },
    { actor: "audit@globex.ins", action: "FILE_EXPORT", flagged: false },
    { actor: "admin@globex.ins", action: "POLICY_CANCEL", flagged: false },
    { actor: "agent.ford@globex.ins", action: "POLICY_RENEW", flagged: false },
  ],
};

const HOUR = 3600 * 1000;

// Build a fully valid, chained ledger (oldest-first) for a tenant.
export async function buildSeed(tenantId) {
  const specs = SEED[tenantId] || SEED.acme;
  const start = Date.now() - specs.length * 6 * HOUR;
  let prevHash = "GENESIS";
  const events = [];
  for (let seq = 0; seq < specs.length; seq++) {
    const s = specs[seq];
    const ts = new Date(start + seq * 6 * HOUR).toISOString();
    const base = {
      PK: `TENANT#${tenantId}`,
      SK: `EVENT#${String(seq).padStart(10, "0")}`,
      seq,
      prevHash,
      actor: s.actor,
      action: s.action,
      payload: {},
      flagged: s.flagged,
      ts,
    };
    const hash = await computeHash(base, prevHash);
    events.push({ ...base, hash });
    prevHash = hash;
  }
  return events;
}

// Append a new event onto an oldest-first chain. Returns { events, seq, hash }.
export async function appendDemo(tenantId, events, { actor, action, flagged }) {
  const prev = events[events.length - 1];
  const prevHash = prev ? prev.hash : "GENESIS";
  const seq = prev ? prev.seq + 1 : 0;
  const ts = new Date().toISOString();
  const base = {
    PK: `TENANT#${tenantId}`,
    SK: `EVENT#${String(seq).padStart(10, "0")}`,
    seq,
    prevHash,
    actor,
    action,
    payload: {},
    flagged: !!flagged,
    ts,
  };
  const hash = await computeHash(base, prevHash);
  const next = [...events, { ...base, hash }];
  return { events: next, seq, hash };
}

// Recompute the chain (oldest-first) and report the first break — mirrors lib/verify.js.
export async function verifyDemo(events) {
  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  for (const it of events) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;
    const recomputed = await computeHash(rest, prevHash);
    const linkOk = it.prevHash === prevHash;
    const hashOk = recomputed === hash;
    const seqOk = it.seq === expectedSeq;
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;
    expectedSeq = it.seq + 1;
  }
  return { intact: breaks.length === 0, count: events.length, breaks };
}

// Silently mutate a hashed field on a mid-chain record without recomputing its
// hash — exactly the kind of after-the-fact edit the ledger is meant to catch.
export function tamperDemo(events) {
  if (events.length < 2) return { events, seq: null };
  const idx = Math.floor(events.length / 2);
  const target = events[idx];
  const mutated = {
    ...target,
    actor: target.actor.includes("(altered)")
      ? target.actor
      : `${target.actor} (altered)`,
  };
  const next = events.map((e, i) => (i === idx ? mutated : e));
  return { events: next, seq: target.seq };
}
