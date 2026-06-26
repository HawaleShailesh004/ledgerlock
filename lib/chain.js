import crypto from "crypto";

// Deterministic serialization: same logical object => same string, always.
export function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

// hash = SHA256( canonical(event-without-hash) + prevHash )
export function computeHash(eventWithoutHash, prevHash) {
  return crypto.createHash("sha256")
    .update(canonical(eventWithoutHash) + prevHash)
    .digest("hex");
}

// Merkle root — must match lambda/checkpointer.mjs byte-for-byte
export function merkleRoot(hashes) {
  if (hashes.length === 0) return crypto.createHash("sha256").update("EMPTY").digest("hex");
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1] ?? level[i];
      next.push(crypto.createHash("sha256").update(a + b).digest("hex"));
    }
    level = next;
  }
  return level[0];
}