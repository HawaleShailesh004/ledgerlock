"use client";

import { actionMeta, seqLabel, fullStamp, diffHex } from "./format";
import { CheckTick, BreakGlyph } from "./icons";

function Field({ label, children, mono = true }) {
  return (
    <div className="border-b border-hairline px-4 py-2.5">
      <div className="label mb-1">{label}</div>
      <div
        className={`${mono ? "font-mono" : ""} break-words text-[13px] text-primary`}
      >
        {children}
      </div>
    </div>
  );
}

// Full hash, wrapped, with optional per-char diff highlighting.
function HashBlock({ value, against, onCopy }) {
  if (against) {
    const chars = diffHex(value, against);
    return (
      <button
        type="button"
        onClick={() => onCopy?.(value)}
        className="block w-full break-all text-left font-mono text-[12px] leading-5"
        title="Click to copy"
      >
        {chars.map((c, i) => (
          <span key={i} style={c.diff ? { color: "var(--color-tamper)" } : { color: "var(--color-primary)" }}>
            {c.ch}
          </span>
        ))}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onCopy?.(value)}
      className="block w-full break-all text-left font-mono text-[12px] leading-5 text-primary transition-colors duration-150 hover:text-steel"
      title="Click to copy"
    >
      {value}
    </button>
  );
}

function RecomputePanel({ recompute, onCopy }) {
  if (!recompute) return null;
  const match = recompute.match;
  return (
    <div className="px-4 py-3">
      <div className="label mb-2 flex items-center gap-1.5">
        <span>recompute</span>
        {match ? (
          <span className="text-steel">
            <CheckTick width={12} height={12} />
          </span>
        ) : (
          <span className="text-tamper">
            <BreakGlyph width={12} height={12} />
          </span>
        )}
      </div>

      <div className="space-y-2 font-mono text-[11px]">
        <div>
          <span className="text-label">prevHash</span>
          <div className="break-all text-secondary">{recompute.prevHash}</div>
        </div>
        <div className="text-label">+ content → SHA-256 ↓</div>

        <div>
          <span className="text-label">stored</span>
          <HashBlock value={recompute.stored} onCopy={onCopy} />
        </div>
        <div>
          <span className="text-label">recomputed</span>
          {match ? (
            <HashBlock value={recompute.recomputed} onCopy={onCopy} />
          ) : (
            <HashBlock value={recompute.recomputed} against={recompute.stored} onCopy={onCopy} />
          )}
        </div>
      </div>

      <div
        className="mt-2 font-mono text-[11px]"
        style={{ color: match ? "var(--color-steel)" : "var(--color-tamper)" }}
      >
        {match ? "✓ recomputed = stored — locked" : "✗ recomputed ≠ stored — refuses to lock"}
      </div>
    </div>
  );
}

function WormPanel({ worm, onCopy }) {
  if (!worm) return null;
  const { liveRoot, checkpointRoot, checkpointCount, match } = worm;
  return (
    <div className="border-t border-hairline px-4 py-3">
      <div className="label mb-2">worm cross-check</div>
      <div className="space-y-2 font-mono text-[11px]">
        <div>
          <span className="text-label">live root @ #{checkpointCount}</span>
          {match ? (
            <HashBlock value={liveRoot} onCopy={onCopy} />
          ) : (
            <HashBlock value={liveRoot} against={checkpointRoot} onCopy={onCopy} />
          )}
        </div>
        <div>
          <span className="text-label">s3 object-lock checkpoint #{checkpointCount}</span>
          <HashBlock value={checkpointRoot} onCopy={onCopy} />
        </div>
      </div>
      <div
        className="mt-2 font-mono text-[11px] leading-4"
        style={{ color: match ? "var(--color-steel)" : "var(--color-tamper)" }}
      >
        {match
          ? "✓ live root matches WORM checkpoint"
          : `live root diverges from WORM checkpoint #${checkpointCount}`}
      </div>
    </div>
  );
}

export default function Inspector({
  event,
  recompute,
  worm,
  onCopy,
  appendSlot,
}) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-hairline bg-panel">
      {/* append panel slides in here when open */}
      {appendSlot}

      <div className="flex h-9 shrink-0 items-center border-b border-hairline px-4">
        <span className="label">inspector</span>
        {event && (
          <span className="ml-auto font-mono text-[13px] text-primary">
            #{seqLabel(event.seq)}
          </span>
        )}
      </div>

      {!event ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center font-mono text-[12px] text-label">
          select a row to inspect
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <Field label="seq">{seqLabel(event.seq)}</Field>
          <Field label="action">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={
                  actionMeta(event.action).hollow
                    ? { border: `1px solid ${actionMeta(event.action).color}` }
                    : { backgroundColor: actionMeta(event.action).color }
                }
              />
              {event.action}
            </span>
          </Field>
          <Field label="actor">{event.actor}</Field>
          <Field label="timestamp">{fullStamp(event.ts)}</Field>
          <Field label="flagged">{event.flagged ? "true" : "false"}</Field>

          <div className="border-b border-hairline px-4 py-2.5">
            <div className="label mb-1">hash</div>
            <HashBlock value={event.hash} onCopy={onCopy} />
          </div>
          <div className="border-b border-hairline px-4 py-2.5">
            <div className="label mb-1">prevHash</div>
            <HashBlock value={event.prevHash} onCopy={onCopy} />
          </div>

          <RecomputePanel recompute={recompute} onCopy={onCopy} />
          <WormPanel worm={worm} onCopy={onCopy} />
        </div>
      )}
    </aside>
  );
}
