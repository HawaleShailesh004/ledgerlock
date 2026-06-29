"use client";

import { useEffect, useRef, useState } from "react";
import EventRow from "./event-row";

// Determines the per-row visual state during/after a verification walk.
function rowStateFor({ seq, status, cursorSeq, brokenSeq, verifiedSet }) {
  if (status === "verifying") {
    if (cursorSeq != null && seq === cursorSeq) return "verifying";
    if (verifiedSet.has(seq)) return "verified";
    return "idle";
  }
  if (status === "verified") return "verified";
  if (status === "tamper" && brokenSeq != null) {
    if (seq === brokenSeq) return "broken";
    if (seq > brokenSeq) return "downstream";
    return "verified";
  }
  return "idle";
}

export default function LedgerList({
  events, // newest-first
  selectedSeq,
  newSeq,
  status,
  brokenSeq,
  reduced,
  skipRowWalk = false,
  totalEventCount,
  verifyProgress,
  onCancelVerify,
  onSelect,
  onCursorSeq,
}) {
  const [cursorSeq, setCursorSeq] = useState(null);
  const [verifiedSet, setVerifiedSet] = useState(() => new Set());
  const walkTimer = useRef(null);

  // Drive the scan cursor oldest -> newest while verifying (skip on large scale tenants).
  useEffect(() => {
    if (status !== "verifying" || skipRowWalk) {
      setCursorSeq(null);
      setVerifiedSet(new Set());
      if (walkTimer.current) clearInterval(walkTimer.current);
      return;
    }
    const ordered = [...events].sort((a, b) => a.seq - b.seq);
    if (ordered.length === 0) return;
    let i = 0;
    const verified = new Set();
    const stepMs = reduced ? 8 : Math.max(28, Math.min(70, 1100 / ordered.length));

    const tick = () => {
      const ev = ordered[i];
      if (!ev) {
        if (walkTimer.current) clearInterval(walkTimer.current);
        return;
      }
      setCursorSeq(ev.seq);
      onCursorSeq?.(ev.seq);
      if (i > 0) verified.add(ordered[i - 1].seq);
      setVerifiedSet(new Set(verified));
      i += 1;
    };
    tick();
    walkTimer.current = setInterval(tick, stepMs);
    return () => {
      if (walkTimer.current) clearInterval(walkTimer.current);
    };
  }, [status, events, reduced, skipRowWalk, onCursorSeq]);

  if (status === "verifying" && skipRowWalk) {
    const n = verifyProgress?.total ?? totalEventCount ?? events.length;
    const v = verifyProgress?.verified ?? 0;
    const pct = n ? Math.min(100, Math.round((v / n) * 100)) : 0;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        <p className="text-[14px] font-medium text-primary">
          {verifyProgress?.label || "Verifying on server…"}
        </p>
        <p className="font-mono text-[15px] tabular-nums text-accent">
          {v.toLocaleString()} / {n.toLocaleString()} verified ({pct}%)
        </p>
        <p className="max-w-md text-[12.5px] text-secondary">
          Progress is shown in the bar at the top on every tab. Row animation is
          skipped for large tenants — only the loaded page is shown below.
        </p>
        {onCancelVerify && (
          <button
            type="button"
            onClick={onCancelVerify}
            className="mt-2 rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-medium text-primary hover:bg-surface-2"
          >
            Cancel verify
          </button>
        )}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-[13.5px] text-muted">
        No events match your filters.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {events.map((event) => {
        const state = rowStateFor({
          seq: event.seq,
          status,
          cursorSeq,
          brokenSeq,
          verifiedSet,
        });
        // Stagger the breach cascade outward from the break point.
        const cascadeDelay =
          status === "tamper" && brokenSeq != null && event.seq >= brokenSeq
            ? Math.min((event.seq - brokenSeq) * 35, 600)
            : 0;
        return (
          <li key={event.seq}>
            <EventRow
              event={event}
              selected={selectedSeq === event.seq}
              isNew={newSeq === event.seq}
              rowState={state}
              cascadeDelay={cascadeDelay}
              onSelect={onSelect}
            />
          </li>
        );
      })}
    </ul>
  );
}
