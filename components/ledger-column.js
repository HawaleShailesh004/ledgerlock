"use client";

import { useEffect, useRef, useState } from "react";
import LedgerRow from "./ledger-row";

// events are passed NEWEST-FIRST for display, but verify walks oldest→newest.
export default function LedgerColumn({
  events,
  selectedSeq,
  newSeq,
  status, // idle | verifying | verified | tamper
  brokenSeq, // seq of first break (or null)
  reduced,
  onSelect,
  onCopyHash,
  onCursorSeq, // report which seq the cursor is on (drives inspector recompute)
}) {
  // cursorIndex walks the DISPLAY array bottom→top (oldest first visually = last index)
  const [cursorVisualIdx, setCursorVisualIdx] = useState(-1);
  const [lockedSeqs, setLockedSeqs] = useState(() => new Set());
  const [cascadeReached, setCascadeReached] = useState(null); // seq down to which red has propagated
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  // Drive the scan-cursor walk + lock + cascade off the status transitions.
  useEffect(() => {
    clearTimers();

    if (status === "idle") {
      setCursorVisualIdx(-1);
      setLockedSeqs(new Set());
      setCascadeReached(null);
      return;
    }

    // oldest→newest = from the LAST display index up to index 0
    const order = [];
    for (let i = events.length - 1; i >= 0; i--) order.push(i);

    if (status === "verifying") {
      setLockedSeqs(new Set());
      setCascadeReached(null);
      if (reduced) {
        setCursorVisualIdx(-1);
        return;
      }
      const stepMs = 60;
      order.forEach((visualIdx, step) => {
        const t = setTimeout(() => {
          setCursorVisualIdx(visualIdx);
          onCursorSeq?.(events[visualIdx]?.seq ?? null);
        }, step * stepMs);
        timers.current.push(t);
      });
      return;
    }

    if (status === "verified") {
      // lock every row, oldest→newest, crisp ticks
      if (reduced) {
        setLockedSeqs(new Set(events.map((e) => e.seq)));
        setCursorVisualIdx(-1);
        return;
      }
      const stepMs = 60;
      order.forEach((visualIdx, step) => {
        const t = setTimeout(() => {
          setCursorVisualIdx(visualIdx);
          onCursorSeq?.(events[visualIdx]?.seq ?? null);
          setLockedSeqs((prev) => {
            const next = new Set(prev);
            next.add(events[visualIdx].seq);
            return next;
          });
        }, step * stepMs);
        timers.current.push(t);
      });
      const done = setTimeout(() => setCursorVisualIdx(-1), order.length * stepMs + 200);
      timers.current.push(done);
      return;
    }

    if (status === "tamper") {
      // lock the clean rows up to the break, then cascade red downstream
      const breakStep = order.findIndex((vi) => events[vi].seq === brokenSeq);
      if (reduced) {
        setLockedSeqs(
          new Set(events.filter((e) => e.seq < brokenSeq).map((e) => e.seq))
        );
        setCascadeReached(events.length ? events[0].seq : null); // all downstream
        setCursorVisualIdx(-1);
        return;
      }
      const stepMs = 60;
      // walk + lock up to (not including) the break
      for (let step = 0; step <= breakStep && step < order.length; step++) {
        const visualIdx = order[step];
        const t = setTimeout(() => {
          setCursorVisualIdx(visualIdx);
          onCursorSeq?.(events[visualIdx]?.seq ?? null);
          if (events[visualIdx].seq < brokenSeq) {
            setLockedSeqs((prev) => {
              const next = new Set(prev);
              next.add(events[visualIdx].seq);
              return next;
            });
          }
        }, step * stepMs);
        timers.current.push(t);
      }
      // cascade: from the break downstream (newer events), 120ms stagger
      const cascadeStart = breakStep * stepMs + 200;
      const downstream = [];
      for (let vi = events.length - 1; vi >= 0; vi--) {
        if (events[vi].seq >= brokenSeq) downstream.push(events[vi].seq);
      }
      downstream.forEach((seq, i) => {
        const t = setTimeout(() => {
          setCascadeReached(seq);
          if (i === downstream.length - 1) setCursorVisualIdx(-1);
        }, cascadeStart + i * 120);
        timers.current.push(t);
      });
      return;
    }

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, brokenSeq, events, reduced]);

  useEffect(() => () => clearTimers(), []);

  // Is the segment of spine at/after this row tamper-red?
  const isDownstreamRed = (seq) =>
    status === "tamper" && cascadeReached != null && seq >= brokenSeq && seq <= cascadeReached;

  return (
    <div className="relative">
      {/* continuous chain line down the left of the column */}
      <div
        className="pointer-events-none absolute bottom-3 left-[34px] top-3 w-px"
        style={{ backgroundColor: "var(--color-hairline)" }}
        aria-hidden="true"
      />

      <ul className="relative">
        {events.map((ev) => {
          const broken = status === "tamper" && ev.seq === brokenSeq;
          const downstream =
            status === "tamper" && ev.seq > brokenSeq && isDownstreamRed(ev.seq);
          const redSpine = isDownstreamRed(ev.seq);
          const cursorOn =
            cursorVisualIdx >= 0 && events[cursorVisualIdx]?.seq === ev.seq;

          return (
            <li key={ev.seq} className="relative border-b border-hairline last:border-b-0">
              {/* per-row spine segment + node */}
              <span
                className="pointer-events-none absolute left-[34px] top-0 h-full w-px"
                style={{
                  backgroundColor: redSpine ? "var(--color-tamper)" : "transparent",
                }}
                aria-hidden="true"
              />
              <span
                className="pointer-events-none absolute left-[31px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full border"
                style={{
                  backgroundColor: "var(--color-canvas)",
                  borderColor: redSpine
                    ? "var(--color-tamper)"
                    : cursorOn || lockedSeqs.has(ev.seq)
                      ? "var(--color-steel)"
                      : "var(--color-hairline)",
                }}
                aria-hidden="true"
              />
              <LedgerRow
                event={ev}
                selected={ev.seq === selectedSeq}
                isNew={ev.seq === newSeq}
                cursorOn={cursorOn}
                locked={lockedSeqs.has(ev.seq)}
                broken={broken}
                downstream={downstream}
                onSelect={onSelect}
                onCopyHash={onCopyHash}
              />
            </li>
          );
        })}
      </ul>

      {events.length === 0 && (
        <div className="py-16 text-center font-mono text-[13px] text-label">
          no events for this tenant
        </div>
      )}
    </div>
  );
}
