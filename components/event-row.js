"use client";

import {
  actionMeta,
  actorInitials,
  actorName,
  seqLabel,
  shortHash,
  shortDateTime,
  relativeTime,
} from "./format";
import { CheckTick, BreakGlyph, ChevronRight } from "./icons";

function StatusPill({ rowState }) {
  if (rowState === "verifying") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-weak px-2 py-0.5 text-[11px] font-medium text-accent">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-accent/40 border-t-accent" />
        Checking
      </span>
    );
  }
  if (rowState === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-verified-weak px-2 py-0.5 text-[11px] font-medium text-verified">
        <CheckTick width={12} height={12} />
        Verified
      </span>
    );
  }
  if (rowState === "broken" || rowState === "downstream") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-tamper-weak px-2 py-0.5 text-[11px] font-medium text-tamper">
        <BreakGlyph width={12} height={12} />
        {rowState === "broken" ? "Tampered" : "Chain broken"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
      Unverified
    </span>
  );
}

export default function EventRow({
  event,
  selected,
  isNew,
  rowState,
  onSelect,
}) {
  const meta = actionMeta(event.action);
  const broken = rowState === "broken" || rowState === "downstream";

  return (
    <button
      type="button"
      onClick={() => onSelect(event.seq)}
      aria-pressed={selected}
      data-seq={event.seq}
      className={`group flex w-full items-center gap-4 px-8 py-3 text-left transition-colors ${
        isNew ? "animate-row-in" : ""
      } ${rowState === "verifying" ? "animate-scan" : ""} ${
        broken ? "animate-tamper" : ""
      } ${
        selected
          ? "bg-accent-weak/60"
          : "hover:bg-surface-2"
      }`}
    >
      {/* Avatar */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
          broken
            ? "bg-tamper-weak text-tamper"
            : "bg-surface-2 text-secondary group-hover:bg-surface"
        }`}
      >
        {actorInitials(event.actor)}
      </span>

      {/* Primary: actor + action */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-primary">
            {actorName(event.actor)}
          </span>
          {event.flagged && (
            <span className="rounded bg-flagged-weak px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-flagged">
              Flagged
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-secondary">
          {event.action === "BREAK_THE_GLASS" && (
            <BreakGlyph className="text-tamper" width={13} height={13} />
          )}
          <span className={event.action === "BREAK_THE_GLASS" ? "text-tamper" : ""}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* Time */}
      <div className="hidden w-32 shrink-0 text-right sm:block">
        <div className="text-[13px] font-medium text-primary">
          {shortDateTime(event.ts)}
        </div>
        <div className="text-[11.5px] text-muted">{relativeTime(event.ts)}</div>
      </div>

      {/* Seq + hash (secondary) */}
      <div className="hidden w-28 shrink-0 text-right lg:block">
        <div className="font-mono text-[12px] text-secondary">
          {seqLabel(event.seq)}
        </div>
        <div className="font-mono text-[11px] text-muted">
          {shortHash(event.hash)}
        </div>
      </div>

      {/* Status */}
      <div className="w-24 shrink-0 text-right">
        <StatusPill rowState={rowState} />
      </div>

      <ChevronRight className="shrink-0 text-line-strong group-hover:text-muted" />
    </button>
  );
}
