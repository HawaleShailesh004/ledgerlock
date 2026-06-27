"use client";

import { CHECKPOINT_INTERVAL } from "@/lib/demo-ledger";
import { seqLabel, shortDateTime } from "./format";
import {
  SealGlyph,
  LockGlyph,
  ShieldCheck,
  ShieldAlert,
  CheckTick,
  CopyGlyph,
  ClockGlyph,
} from "./icons";

function Card({ children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}>
      {children}
    </section>
  );
}

function HashLine({ label, value, onCopy }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-relaxed text-secondary">
          {value}
        </code>
        {onCopy && (
          <button
            type="button"
            onClick={() => onCopy(value)}
            className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-surface hover:text-primary"
            aria-label={`Copy ${label}`}
          >
            <CopyGlyph />
          </button>
        )}
      </div>
    </div>
  );
}

export default function CheckpointsView({
  tenantLabel,
  checkpoint,
  totalEvents,
  worm,
  status,
  brokenSeq,
  verifying,
  onVerify,
  onCopy,
}) {
  const interval = CHECKPOINT_INTERVAL;
  const sealedCount = checkpoint?.count ?? 0;
  const hasSeal = sealedCount > 0;
  const nextBoundary = sealedCount + interval;
  const sinceSeal = Math.max(totalEvents - sealedCount, 0);
  const progress = Math.min((sinceSeal / interval) * 100, 100);

  const tampered = status === "tamper";
  const verified = status === "verified";

  // Cross-check state for the sealed checkpoint
  const crossChecked = !!worm;
  const match = worm?.match;

  return (
    <div className="animate-view px-8 pb-12 pt-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-primary">
            Checkpoints & Seals
          </h1>
          <p className="mt-0.5 text-[13.5px] text-secondary">
            Immutable WORM seals for{" "}
            <span className="font-medium text-primary">{tenantLabel}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-accent shadow-raised transition-all hover:bg-accent-hover active:scale-[0.98] disabled:cursor-progress disabled:opacity-70"
        >
          <CheckTick width={16} height={16} />
          {verifying ? "Verifying…" : "Verify against seal"}
        </button>
      </div>

      {/* Explainer + cross-check */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-weak text-accent">
              <SealGlyph width={18} height={18} />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-primary">
                How seals protect the ledger
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">
                Every {interval} events, LedgerLock computes a Merkle root over the
                sealed range and writes it to{" "}
                <span className="font-medium text-primary">write-once storage</span>.
                Because the seal can never be rewritten, altering any earlier record
                makes the recomputed root diverge from the sealed root — proving
                tampering even if the attacker also rewrote the hash chain.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Cross-check status
          </div>
          {!crossChecked ? (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-secondary">
              <ClockGlyph className="text-muted" />
              Run verification to compare the live chain against the sealed root.
            </div>
          ) : (
            <div
              className={`mt-3 flex items-start gap-2.5 rounded-lg px-3 py-3 ${
                match ? "bg-verified-weak" : "bg-tamper-weak"
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {match ? (
                  <ShieldCheck className="text-verified" width={18} height={18} />
                ) : (
                  <ShieldAlert className="text-tamper" width={18} height={18} />
                )}
              </span>
              <div>
                <p
                  className={`text-[13px] font-semibold ${
                    match ? "text-verified" : "text-tamper"
                  }`}
                >
                  {match ? "Live root matches seal" : "Root mismatch — tampering detected"}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-secondary">
                  {match
                    ? `Recomputed Merkle root over ${worm.checkpointCount} events is identical to the sealed root.`
                    : "The recomputed root differs from the immutable seal."}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Seal timeline */}
      <h2 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
        Seal history
      </h2>

      <div className="space-y-4">
        {/* Pending seal */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong text-muted">
                <ClockGlyph />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-primary">
                  Next seal at {seqLabel(nextBoundary)}
                </div>
                <div className="text-[12.5px] text-secondary">
                  {sinceSeal} of {interval} events accumulated since the last seal
                </div>
              </div>
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
              Pending
            </span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </Card>

        {/* Sealed checkpoint */}
        {hasSeal ? (
          <Card
            className={
              crossChecked && !match
                ? "ring-1 ring-tamper/30"
                : crossChecked && match
                  ? "ring-1 ring-verified/30"
                  : ""
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-weak text-accent">
                  <LockGlyph />
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-primary">
                    Checkpoint {seqLabel(sealedCount)}
                  </div>
                  <div className="text-[12.5px] text-secondary">
                    Sealed range {seqLabel(0)} – {seqLabel((checkpoint.lastSeq ?? sealedCount - 1))}{" "}
                    · {sealedCount} events
                  </div>
                </div>
              </div>
              {crossChecked ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    match
                      ? "bg-verified-weak text-verified"
                      : "bg-tamper-weak text-tamper"
                  }`}
                >
                  {match ? <CheckTick width={12} height={12} /> : <ShieldAlert width={12} height={12} />}
                  {match ? "Verified" : "Mismatch"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-weak px-2.5 py-1 text-[11px] font-medium text-accent">
                  <LockGlyph width={12} height={12} />
                  Sealed
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <HashLine
                label="Sealed Merkle root"
                value={checkpoint.merkleRoot}
                onCopy={onCopy}
              />
              <HashLine label="Last sealed hash" value={checkpoint.lastHash} onCopy={onCopy} />
            </div>

            {crossChecked && (
              <div className="mt-3">
                <HashLine
                  label={match ? "Recomputed root (matches)" : "Recomputed root (differs)"}
                  value={worm.liveRoot}
                />
              </div>
            )}

            <div className="mt-4 flex items-center gap-1.5 text-[12px] text-muted">
              <ClockGlyph />
              Sealed {shortDateTime(checkpoint.ts)}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center gap-3 py-2 text-[13px] text-secondary">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <SealGlyph />
              </span>
              No seals yet — the first WORM checkpoint is created once {interval} events
              have been logged.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
