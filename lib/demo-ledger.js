// Client-side demo ledger that mirrors the server's hash-chain + Merkle logic
// exactly. Used as a fallback when the live DynamoDB backend is unreachable or
// empty, so the verify walk, tamper cascade, and WORM cross-check remain fully
// demoable in preview. State lives in memory (React) - nothing touches localStorage.

// Deterministic serialization - must match lib/chain.js canonical().
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
    new TextEncoder().encode(str),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// hash = SHA256( canonical(event-without-hash) + prevHash ) - matches lib/chain.js
export async function computeHash(eventWithoutHash, prevHash) {
  return sha256Hex(canonical(eventWithoutHash) + prevHash);
}

// Binary Merkle root over ordered leaf hashes - matches lib/chain.js (live + Lambda)
export async function merkleRoot(hashes) {
  if (!hashes || hashes.length === 0) return "EMPTY";
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? level[i];
      next.push(await sha256Hex(a + b));
    }
    level = next;
  }
  return level[0];
}

export const ACTIONS = [
  "PHI_READ",
  "RECORD_UPDATE",
  "EXPORT",
  "BREAK_THE_GLASS",
];
export const CHECKPOINT_INTERVAL = 30;
const TOTAL = 32; // events seeded per tenant
const HOUR = 3600 * 1000;

// Deterministic PRNG so a tenant's seed is stable across reloads in a session.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TENANTS = {
  acme: {
    actors: [
      "dr.patel@acme-health.org",
      "nurse.lee@acme-health.org",
      "dr.kim@acme-health.org",
      "billing@acme-health.org",
      "ext.audit@acme-health.org",
      "admin@acme-health.org",
    ],
    weights: [0.5, 0.28, 0.14, 0.08],
  },
  northwind: {
    actors: [
      "teller.ramos@northwind-bank.com",
      "ops@northwind-bank.com",
      "compliance@northwind-bank.com",
      "trader.voss@northwind-bank.com",
      "admin@northwind-bank.com",
    ],
    weights: [0.42, 0.34, 0.16, 0.08],
  },
  globex: {
    actors: [
      "agent.ford@globex-ins.com",
      "claims@globex-ins.com",
      "adjuster.ng@globex-ins.com",
      "audit@globex-ins.com",
      "admin@globex-ins.com",
    ],
    weights: [0.46, 0.3, 0.16, 0.08],
  },
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickAction(rng, weights) {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r <= acc) return ACTIONS[i];
  }
  return ACTIONS[0];
}

function seedNum(tenantId) {
  let n = 0;
  for (const c of tenantId) n = (n * 31 + c.charCodeAt(0)) | 0;
  return n >>> 0;
}

// Build a fully valid, chained ledger (oldest-first) plus a sealed WORM checkpoint.
export async function buildSeed(tenantId) {
  const cfg = TENANTS[tenantId] || TENANTS.acme;
  const rng = mulberry32(seedNum(tenantId));
  const start = Date.now() - TOTAL * 47 * 60 * 1000;
  let prevHash = "GENESIS";
  let t = start;
  const events = [];
  for (let seq = 0; seq < TOTAL; seq++) {
    t += (28 + rng() * 40) * 60 * 1000; // 28–68 min between events
    const action = pickAction(rng, cfg.weights);
    const actor =
      action === "BREAK_THE_GLASS"
        ? pick(rng, cfg.actors.slice(0, 3))
        : pick(rng, cfg.actors);
    const ts = new Date(t).toISOString();
    const base = {
      PK: `TENANT#${tenantId}`,
      SK: `EVENT#${String(seq).padStart(10, "0")}`,
      seq,
      prevHash,
      actor,
      action,
      payload: {
        ip: `10.0.${1 + Math.floor(rng() * 40)}.${1 + Math.floor(rng() * 250)}`,
      },
      flagged: action === "BREAK_THE_GLASS" || rng() < 0.06,
      ts,
    };
    const hash = await computeHash(base, prevHash);
    events.push({ ...base, hash });
    prevHash = hash;
  }
  return events;
}

// The immutable WORM seal over the first CHECKPOINT_INTERVAL events.
export async function buildCheckpoint(events) {
  const count =
    Math.floor(events.length / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
  if (count === 0) return null;
  const sealed = events.slice(0, count);
  return {
    count,
    merkleRoot: await merkleRoot(sealed.map((e) => e.hash)),
    lastSeq: sealed[sealed.length - 1].seq,
    lastHash: sealed[sealed.length - 1].hash,
    ts: new Date(Date.parse(sealed[sealed.length - 1].ts) + HOUR).toISOString(),
  };
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

// Strip the stored hash + index attrs so we can recompute exactly as the server does.
function contentOf(event) {
  const { hash, GSI1PK, GSI1SK, ...rest } = event;
  return rest;
}

// Recompute one row (for the inspector's live recompute view).
export async function recomputeRow(events, index) {
  if (index < 0 || index >= events.length) return null;
  const ev = events[index];
  const prevHash = index === 0 ? "GENESIS" : events[index - 1].hash;
  const content = contentOf(ev);
  const recomputed = await computeHash(content, prevHash);
  return {
    seq: ev.seq,
    prevHash,
    content: canonical(content),
    recomputed,
    stored: ev.hash,
    match: recomputed === ev.hash && ev.prevHash === prevHash,
  };
}

// Recompute the chain (oldest-first) and the WORM cross-check - mirrors lib/verify.js.
export async function verifyDemo(events, checkpoint) {
  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  const recomputedHashes = []; // content-derived leaves for the WORM cross-check
  for (const it of events) {
    const recomputed = await computeHash(contentOf(it), prevHash);
    recomputedHashes.push(recomputed);
    const linkOk = it.prevHash === prevHash;
    const hashOk = recomputed === it.hash;
    const seqOk = it.seq === expectedSeq;
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = it.hash;
    expectedSeq = it.seq + 1;
  }
  // Cross-check the seal against roots recomputed from live CONTENT, so an
  // after-the-fact edit inside the window diverges from the immutable seal.
  const boundary = checkpoint ? checkpoint.count : events.length;
  const liveRootAtBoundary = await merkleRoot(
    recomputedHashes.slice(0, boundary),
  );
  return {
    intact: breaks.length === 0,
    count: events.length,
    breaks,
    boundary,
    liveRootAtBoundary,
  };
}

// Silently mutate a hashed field on a record INSIDE the checkpoint window without
// recomputing its hash - exactly the after-the-fact edit the ledger is meant to catch.
// Tampering inside the window makes the live Merkle root diverge from the WORM seal.
export function tamperDemo(events) {
  if (events.length < 4) return { events, seq: null };
  const idx = 6 < events.length ? 6 : Math.floor(events.length / 4);
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
