"use client";

import { BreakGlyph, CheckTick } from "./icons";

export default function TamperLegend({ summary }) {
  if (!summary) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-8 py-2.5 text-[12px]">
      <span className="font-medium text-secondary">Legend:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-tamper-weak px-2 py-0.5 text-[11px] font-medium text-tamper">
          <BreakGlyph width={11} height={11} />
          Tampered
        </span>
        <span className="text-muted">direct edit at {summary.brokenLabel}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-tamper-weak px-2 py-0.5 text-[11px] font-medium text-tamper">
          <BreakGlyph width={11} height={11} />
          Chain broken
        </span>
        <span className="text-muted">
          {summary.invalidated.toLocaleString()} rows invalidated downstream
        </span>
      </span>
      {summary.intactBefore > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-verified-weak px-2 py-0.5 text-[11px] font-medium text-verified">
            <CheckTick width={11} height={11} />
            Verified
          </span>
          <span className="text-muted">
            {summary.intactBefore.toLocaleString()} intact before breach
          </span>
        </span>
      )}
    </div>
  );
}
