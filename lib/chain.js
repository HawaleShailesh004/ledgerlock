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