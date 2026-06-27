// Truncate a hash in the middle: 9f2a8c...d3c41b -> 9f2a…c41b
export function truncMid(hash, head = 4, tail = 4) {
  if (!hash) return "—";
  if (hash === "GENESIS") return "GENESIS";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

// Visual metadata for each action type.
export const ACTION_META = {
  PHI_READ: {
    label: "PHI_READ",
    tag: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30",
  },
  RECORD_UPDATE: {
    label: "RECORD_UPDATE",
    tag: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/30",
  },
  EXPORT: {
    label: "EXPORT",
    tag: "bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/30",
  },
  BREAK_THE_GLASS: {
    label: "BREAK_THE_GLASS",
    tag: "bg-transparent text-red-300 ring-1 ring-inset ring-red-500/60",
    alert: true,
  },
};

export function actionMeta(action) {
  return (
    ACTION_META[action] || {
      label: action || "UNKNOWN",
      tag: "bg-zinc-700/30 text-zinc-300 ring-1 ring-inset ring-zinc-600/40",
    }
  );
}

export const ACTION_OPTIONS = [
  "PHI_READ",
  "RECORD_UPDATE",
  "EXPORT",
  "BREAK_THE_GLASS",
];

export function formatTs(ts) {
  if (!ts) return "";
  return ts;
}
