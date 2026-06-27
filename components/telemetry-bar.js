"use client";

export default function TelemetryBar({
  status,
  count,
  brokenSeq,
  checkpointCount,
  demo,
  lastVerifyTs,
}) {
  let verdict;
  if (status === "verified") {
    verdict = (
      <span className="text-steel">
        last verify: intact · {count}/{count}
      </span>
    );
  } else if (status === "tamper") {
    verdict = (
      <span className="text-tamper">
        last verify: TAMPER @ #{brokenSeq} · break propagated downstream
      </span>
    );
  } else if (status === "verifying") {
    verdict = <span className="text-steel">verifying chain…</span>;
  } else {
    verdict = <span className="text-secondary">last verify: —</span>;
  }

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-hairline bg-panel px-4 font-mono text-[11px]">
      <div className="flex items-center gap-4">
        {verdict}
        {lastVerifyTs && status !== "idle" && status !== "verifying" && (
          <span className="hidden text-label md:inline">at {lastVerifyTs}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-label">
          worm checkpoint: {checkpointCount != null ? `#${checkpointCount}` : "—"}
        </span>
        <span className="text-label">events: {count}</span>
        {demo && (
          <span className="rounded-sm border border-hairline px-1.5 py-0.5 text-label">
            demo data
          </span>
        )}
      </div>
    </div>
  );
}
