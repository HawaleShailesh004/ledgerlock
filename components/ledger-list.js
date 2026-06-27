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
  onSelect,
  onCursorSeq,
}) {
  const [cursorSeq, setCursorSeq] = useState(null);
  const [verifiedSet, setVerifiedSet] = useState(() => new Set());
  const walkTimer = useRef(null);

  // Drive the scan cursor oldest -> newest while verifying.
  useEffect(() => {
    if (status !== "verifying") {
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
  }, [status, events, reduced, onCursorSeq]);

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
        return (
          <li key={event.seq}>
            <EventRow
              event={event}
              selected={selectedSeq === event.seq}
              isNew={newSeq === event.seq}
              rowState={state}
              onSelect={onSelect}
            />
          </li>
        );
      })}
    </ul>
  );
}
