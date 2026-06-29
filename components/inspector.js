"use client";

import { useEffect, useState } from "react";
import { actionMeta, actorName, seqLabel, fullStamp, diffHex } from "./format";
import {
  CloseGlyph,
  CopyGlyph,
  CheckTick,
  BreakGlyph,
  ChevronRight,
} from "./icons";

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-[13.5px] text-primary">{children}</div>
    </div>
  );
}

function HashLine({ value, onCopy, diffAgainst }) {
  const chars = diffAgainst ? diffHex(value, diffAgainst) : null;
  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 break-all rounded-md bg-surface-2 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-secondary">
        {chars
          ? chars.map((c, i) => (
              <span
                key={i}
                className={c.diff ? "bg-tamper-weak text-tamper" : ""}
              >
                {c.ch}
              </span>
            ))
          : value || "-"}
      </code>
      <button
        type="button"
        onClick={() => onCopy(value)}
        className="mt-1 shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-primary"
        aria-label="Copy hash"
      >
        <CopyGlyph />
      </button>
    </div>
  );
}

function Collapsible({ title, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronRight
          className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-[13px] font-semibold text-primary">{title}</span>
        {badge}
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3.5">{children}</div>
      )}
    </div>
  );
}

export default function Inspector({ event, recompute, worm, proof, onCopy, onClose }) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;

  const meta = actionMeta(event.action);
  const mismatch = recompute && !recompute.match;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-end p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-title"
    >
      <div
        className="absolute inset-0 bg-primary/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="animate-drawer relative flex h-full w-full max-w-[420px] flex-col overflow-hidden rounded-none border-l border-line bg-surface shadow-pop sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:border">
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <div className="font-mono text-[12px] text-muted">
              {seqLabel(event.seq)}
            </div>
            <h2
              id="inspector-title"
              className="mt-0.5 text-[16px] font-semibold tracking-tight text-primary"
            >
              {meta.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-primary"
            aria-label="Close inspector"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {mismatch && (
            <div className="flex items-start gap-2 rounded-lg border border-tamper/30 bg-tamper-weak px-3 py-2.5">
              <BreakGlyph className="mt-0.5 text-tamper" width={15} height={15} />
              <p className="text-[12.5px] leading-snug text-tamper">
                This record was altered after it was sealed. The recomputed hash
                no longer matches the stored value.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Actor">
              <span className={mismatch ? "text-tamper" : ""}>
                {actorName(event.actor)}
              </span>
              <div className="text-[11.5px] text-muted">{event.actor}</div>
            </Field>
            <Field label="Flagged">{event.flagged ? "Yes" : "No"}</Field>
            <Field label="Timestamp">
              <span className="font-mono text-[12px]">{fullStamp(event.ts)}</span>
            </Field>
            <Field label="Source IP">
              <span className="font-mono text-[12px]">
                {event.payload?.ip || "-"}
              </span>
            </Field>
          </div>

          <Collapsible
            title="Cryptographic proof"
            defaultOpen={mismatch}
            badge={
              recompute ? (
                recompute.match ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-verified-weak px-2 py-0.5 text-[11px] font-medium text-verified">
                    <CheckTick width={11} height={11} /> Match
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-tamper-weak px-2 py-0.5 text-[11px] font-medium text-tamper">
                    <BreakGlyph width={11} height={11} /> Mismatch
                  </span>
                )
              ) : null
            }
          >
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Previous hash
                </div>
                <HashLine value={event.prevHash} onCopy={onCopy} />
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Stored hash
                </div>
                <HashLine value={event.hash} onCopy={onCopy} />
              </div>
              {recompute && (
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Recomputed hash
                  </div>
                  <HashLine
                    value={recompute.recomputed}
                    onCopy={onCopy}
                    diffAgainst={mismatch ? recompute.stored : null}
                  />
                  <p className="mt-1.5 text-[12px] text-secondary">
                    {recompute.match
                      ? "Recomputed value matches the stored hash — this record is authentic."
                      : "Recomputed value differs from the stored hash — this record cannot be trusted."}
                  </p>
                </div>
              )}
            </div>
          </Collapsible>

          {worm && (
            <Collapsible
              title="WORM checkpoint cross-check"
              defaultOpen={!worm.match}
              badge={
                worm.match ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-verified-weak px-2 py-0.5 text-[11px] font-medium text-verified">
                    <CheckTick width={11} height={11} /> Sealed
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-tamper-weak px-2 py-0.5 text-[11px] font-medium text-tamper">
                    <BreakGlyph width={11} height={11} /> Diverged
                  </span>
                )
              }
            >
              <p className="mb-3 text-[12.5px] leading-snug text-secondary">
                The Merkle root of the first {worm.checkpointCount} events is
                compared against the immutable checkpoint sealed at write time.
              </p>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Live Merkle root
                  </div>
                  <HashLine
                    value={worm.liveRoot}
                    onCopy={onCopy}
                    diffAgainst={worm.match ? null : worm.checkpointRoot}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Sealed checkpoint root
                  </div>
                  <HashLine value={worm.checkpointRoot} onCopy={onCopy} />
                </div>
              </div>
            </Collapsible>
          )}

          {proof && !proof.error && (
            <Collapsible
              title="Merkle inclusion proof"
              defaultOpen={false}
              badge={
                proof.proofValid ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-verified-weak px-2 py-0.5 text-[11px] font-medium text-verified">
                    <CheckTick width={11} height={11} /> Valid
                  </span>
                ) : proof.proofValid === false ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-tamper-weak px-2 py-0.5 text-[11px] font-medium text-tamper">
                    <BreakGlyph width={11} height={11} /> Invalid
                  </span>
                ) : null
              }
            >
              <p className="mb-3 text-[12.5px] leading-snug text-secondary">
                Proves event #{proof.seq} is included in checkpoint boundary{" "}
                {proof.boundary} without revealing sibling events.
              </p>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Leaf hash (this event)
                  </div>
                  <HashLine value={proof.leaf} onCopy={onCopy} />
                </div>
                {proof.siblings?.map((s, i) => (
                  <div key={i}>
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                      Sibling {i + 1} ({s.position})
                    </div>
                    <HashLine value={s.hash} onCopy={onCopy} />
                  </div>
                ))}
                {proof.checkpointRoot && (
                  <div>
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                      Sealed root
                    </div>
                    <HashLine value={proof.checkpointRoot} onCopy={onCopy} />
                  </div>
                )}
              </div>
            </Collapsible>
          )}
        </div>
      </aside>
    </div>
  );
}
