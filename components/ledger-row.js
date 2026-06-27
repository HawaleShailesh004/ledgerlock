"use client";

import { memo } from "react";
import { actionMeta, shortHash, seqLabel, timeOnly } from "./format";
import { CheckTick, BreakGlyph } from "./icons";

function ActionDot({ action }) {
  const meta = actionMeta(action);
  if (meta.hollow) {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full border"
        style={{ borderColor: meta.color }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: meta.color }}
      aria-hidden="true"
    />
  );
}

function LedgerRow({
  event,
  selected,
  isNew,
  // verify states
  cursorOn, // scan cursor is currently on this row
  locked, // verified + ticked
  broken, // this row is the break point
  downstream, // below the break — cascade red
  onSelect,
  onCopyHash,
}) {
  const tamperTone = broken || downstream;

  return (
    <button
      type="button"
      onClick={() => onSelect(event.seq)}
      className={`group relative flex w-full items-center gap-3 py-2 pl-5 pr-3 text-left transition-colors duration-150 ${
        isNew ? "row-snap-in" : ""
      } ${selected ? "bg-raised" : "hover:bg-panel"}`}
      style={
        selected
          ? { boxShadow: `inset 2px 0 0 ${broken ? "var(--color-tamper)" : "var(--color-steel)"}` }
          : broken
            ? { boxShadow: "inset 2px 0 0 var(--color-tamper)" }
            : undefined
      }
    >
      {/* scan cursor glow on the spine */}
      {cursorOn && (
        <span
          className="pointer-events-none absolute left-0 top-0 h-full w-[2px]"
          style={{ backgroundColor: "var(--color-steel)", boxShadow: "0 0 8px var(--color-steel)" }}
          aria-hidden="true"
        />
      )}

      {/* seq anchor — the chain threads through the dot */}
      <div className="relative flex w-14 shrink-0 items-center justify-start">
        <span
          className="font-mono text-[15px] tabular-nums"
          style={{ color: tamperTone ? "var(--color-tamper)" : "var(--color-primary)" }}
        >
          {seqLabel(event.seq)}
        </span>
      </div>

      {/* action dot + name */}
      <div className="flex w-40 shrink-0 items-center gap-2">
        <ActionDot action={event.action} />
        <span className="label !text-[10px]" style={tamperTone ? { color: "var(--color-tamper)" } : undefined}>
          {event.action}
        </span>
        {event.flagged && (
          <span
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: "var(--color-act-update)" }}
            title="flagged for review"
            aria-hidden="true"
          />
        )}
      </div>

      {/* actor */}
      <div className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px]"
          style={{ color: tamperTone ? "var(--color-tamper)" : "var(--color-secondary)" }}
        >
          {event.actor}
        </span>
      </div>

      {/* hash (mono, bright, larger) */}
      <div
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onCopyHash(event.hash);
        }}
        className="w-[92px] shrink-0 text-right font-mono text-[14px] transition-colors duration-150 hover:text-steel"
        style={{ color: tamperTone ? "var(--color-tamper)" : "var(--color-primary)" }}
        title="Click to copy full hash"
      >
        {shortHash(event.hash)}
      </div>

      {/* state marker */}
      <div className="flex w-5 shrink-0 items-center justify-center">
        {broken ? (
          <span className="tick-lock text-tamper">
            <BreakGlyph />
          </span>
        ) : locked ? (
          <span className="tick-lock text-steel">
            <CheckTick />
          </span>
        ) : null}
      </div>

      {/* timestamp */}
      <div className="w-[72px] shrink-0 text-right">
        <span
          className="font-mono text-[12px]"
          style={{ color: tamperTone ? "var(--color-tamper)" : "var(--color-label)" }}
        >
          {timeOnly(event.ts)}
        </span>
      </div>

      {/* mismatch tag on the broken row */}
      {broken && (
        <span className="absolute -bottom-px left-5 font-mono text-[10px] font-medium tracking-wide text-tamper">
          HASH MISMATCH
        </span>
      )}
    </button>
  );
}

export default memo(LedgerRow);
