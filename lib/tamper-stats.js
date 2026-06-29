function seqLabel(seq) {
  return `#${String(seq).padStart(4, "0")}`;
}

/** Summarize hash-chain breach for UI (1 edited row + downstream invalidation). */
export function tamperSummary(brokenSeq, totalCount) {
  if (brokenSeq == null || totalCount == null || totalCount <= 0) return null;
  const intactBefore = Math.max(0, brokenSeq);
  const invalidated = Math.max(0, totalCount - brokenSeq - 1);
  const intactPct = Math.round((intactBefore / totalCount) * 100);
  return {
    brokenSeq,
    brokenLabel: seqLabel(brokenSeq),
    tamperedCount: 1,
    intactBefore,
    invalidated,
    intactPct,
  };
}

/** Short gauge copy when chain failed verification. */
export function tamperGaugeDisplay(summary) {
  if (!summary) {
    return { value: "!", label: "breach", pct: 0 };
  }
  if (summary.intactPct >= 1) {
    return {
      value: `${summary.intactPct}%`,
      label: "before breach",
      pct: summary.intactPct,
    };
  }
  return {
    value: summary.brokenLabel,
    label: "breach at",
    pct: Math.max(1, summary.intactPct),
  };
}

/** One-line banner body for tamper state. */
export function tamperBannerBody(summary) {
  if (!summary) {
    return "A record was altered after it was written. The chain no longer matches its sealed WORM checkpoint.";
  }
  const parts = [
    `${summary.tamperedCount} record tampered at ${summary.brokenLabel}`,
    `${summary.invalidated.toLocaleString()} downstream invalidated`,
  ];
  if (summary.intactBefore > 0) {
    parts.push(`${summary.intactBefore.toLocaleString()} intact before break`);
  }
  return `${parts.join(" · ")}. Red “Chain broken” rows were not edited — the hash chain failed after the breach.`;
}

/** Short label for the verify gauge (never put long phase strings inside the ring). */
export function verifyGaugeLabel(phase) {
  switch (phase) {
    case "loading":
      return "Loading";
    case "seal-check":
      return "Seal check";
    case "seal-trusted":
      return "Seal OK";
    case "tail-walk":
      return "Tail walk";
    case "prefix-walk":
      return "Prefix";
    case "walk":
      return "Recompute";
    case "done":
      return "Done";
    default:
      return "Scanning";
  }
}
