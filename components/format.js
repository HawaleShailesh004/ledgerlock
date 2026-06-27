// Shared formatting + action metadata for the audit console.

export const ACTION_META = {
  PHI_READ: {
    label: "Viewed patient record",
    short: "PHI read",
    tone: "neutral",
  },
  RECORD_UPDATE: {
    label: "Updated a record",
    short: "Record update",
    tone: "neutral",
  },
  EXPORT: { label: "Exported data", short: "Export", tone: "flagged" },
  BREAK_THE_GLASS: {
    label: "Break-the-glass access",
    short: "Break-the-glass",
    tone: "tamper",
  },
};

export function actionMeta(action) {
  return (
    ACTION_META[action] || { label: action, short: action, tone: "neutral" }
  );
}

export const ACTION_OPTIONS = Object.keys(ACTION_META);

// 9f2a3c…e41b9d - first 6 + last 6 hex of a hash
export function shortHash(hash, head = 6, tail = 6) {
  if (!hash) return "-";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function seqLabel(seq) {
  return `#${String(seq).padStart(4, "0")}`;
}

// Initials for an actor email, e.g. dr.patel@... -> DP
export function actorInitials(actor = "") {
  const name = actor.split("@")[0] || actor;
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const letters =
    (parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "");
  return letters.toUpperCase() || "?";
}

export function actorName(actor = "") {
  return actor.split("@")[0] || actor;
}

// Relative time for the row: "3h ago", "just now"
export function relativeTime(ts) {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  } catch {
    return ts;
  }
}

// "Apr 3, 14:22" - readable absolute time for rows
export function shortDateTime(ts) {
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export function timeOnly(ts) {
  try {
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return ts;
  }
}

export function fullStamp(ts) {
  try {
    return new Date(ts).toISOString().replace("T", " ");
  } catch {
    return ts;
  }
}

// Diff two hex strings, returning an array of { ch, diff }.
export function diffHex(a = "", b = "") {
  const len = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const ch = a[i] ?? "";
    out.push({ ch, diff: a[i] !== b[i] });
  }
  return out;
}
