// Shared formatting + action metadata for the ledger console.

export const ACTION_META = {
  PHI_READ: { color: "var(--color-act-phi)", hollow: false },
  RECORD_UPDATE: { color: "var(--color-act-update)", hollow: false },
  EXPORT: { color: "var(--color-act-export)", hollow: false },
  BREAK_THE_GLASS: { color: "var(--color-act-glass)", hollow: true },
};

export function actionMeta(action) {
  return ACTION_META[action] || { color: "var(--color-secondary)", hollow: false };
}

// 9f2a…c41b — first 4 + last 4 hex of a hash
export function shortHash(hash) {
  if (!hash || hash.length < 12) return hash || "—";
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

export function seqLabel(seq) {
  return String(seq).padStart(4, "0");
}

// HH:MM:SS on the row, full stamp in the inspector
export function timeOnly(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return ts;
  }
}

export function fullStamp(ts) {
  try {
    return new Date(ts).toISOString().replace("T", " ").replace("Z", "Z");
  } catch {
    return ts;
  }
}

// Diff two equal-length-ish hex strings, returning an array of { ch, diff }.
export function diffHex(a = "", b = "") {
  const len = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const ch = a[i] ?? "";
    out.push({ ch, diff: a[i] !== b[i] });
  }
  return out;
}
