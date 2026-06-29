"use client";

import { seqLabel } from "./format";

export default function VerifyProgressBar({
  progress,
  onCancelVerify,
}) {
  if (!progress) return null;

  const { verified = 0, total = 0, label, phase } = progress;
  const safeTotal = Math.max(total, verified, 1);
  const pct = Math.min(100, Math.round((verified / safeTotal) * 100));

  const phaseLabel =
    label ||
    (phase === "loading"
      ? "Loading chain from DynamoDB"
      : phase === "seal-check"
        ? "Validating WORM seal"
        : phase === "seal-trusted"
          ? "WORM seal trusted"
          : phase === "tail-walk"
            ? "Walking live tail"
            : phase === "prefix-walk"
              ? "Recomputing prefix"
              : phase === "walk"
                ? "Recomputing chain"
                : "Verifying integrity");

  return (
    <div className="border-b border-accent/20 bg-accent-weak px-8 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[13px] font-semibold text-primary">
              {phaseLabel}
            </span>
            <span className="font-mono text-[13px] tabular-nums text-accent">
              {verified.toLocaleString()} / {safeTotal.toLocaleString()} verified
            </span>
            {verified > 0 && verified <= safeTotal && (
              <span className="text-[12px] text-muted">
                at {seqLabel(Math.max(0, verified - 1))}
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[12px] font-medium tabular-nums text-secondary">
            {pct}%
          </span>
          {onCancelVerify && (
            <button
              type="button"
              onClick={onCancelVerify}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-primary hover:bg-surface-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
