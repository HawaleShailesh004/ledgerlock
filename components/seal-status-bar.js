"use client";

import { seqLabel } from "./format";
import { ClockGlyph, CheckTick, SealGlyph } from "./icons";

const STATUS_COPY = {
  "caught-up": {
    label: "Caught up",
    tone: "text-verified",
    bg: "bg-verified-weak border-verified/25",
    icon: CheckTick,
  },
  "catching-up": {
    label: "Checkpointer catching up",
    tone: "text-accent",
    bg: "bg-accent-weak border-accent/25",
    icon: ClockGlyph,
  },
  behind: {
    label: "Checkpointer behind (burst load)",
    tone: "text-flagged",
    bg: "bg-flagged-weak border-flagged/25",
    icon: SealGlyph,
  },
};

export default function SealStatusBar({ sealStatus, compact = false }) {
  if (!sealStatus || sealStatus.totalEvents === 0) return null;

  const meta = STATUS_COPY[sealStatus.status] || STATUS_COPY["caught-up"];
  const Icon = meta.icon;
  const { sealedThrough, pendingSeal, totalEvents } = sealStatus;

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-8 py-2 font-mono text-[11.5px] ${meta.bg} border-line`}
      >
        <span className={`inline-flex items-center gap-1.5 font-medium ${meta.tone}`}>
          <Icon width={13} height={13} />
          {meta.label}
        </span>
        <span className="text-secondary">
          Sealed through {seqLabel(sealedThrough)} ·{" "}
          {pendingSeal > 0 ? (
            <span className="text-primary">{pendingSeal.toLocaleString()} pending seal</span>
          ) : (
            <span className="text-verified">0 pending</span>
          )}{" "}
          · {totalEvents.toLocaleString()} total events
        </span>
      </div>
    );
  }

  return (
    <div className={`mx-8 mt-4 rounded-xl border p-4 ${meta.bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
          >
            <Icon className={meta.tone} width={18} height={18} />
          </span>
          <div>
            <p className={`text-[14px] font-semibold ${meta.tone}`}>{meta.label}</p>
            <p className="mt-1 text-[13px] leading-snug text-secondary">
              {pendingSeal > 0 ? (
                <>
                  <span className="font-medium text-primary">
                    {pendingSeal.toLocaleString()} events
                  </span>{" "}
                  are valid in DynamoDB but not yet covered by the newest WORM seal.
                  Verification still walks this tail — the system stays correct, just slower
                  until the checkpointer catches up or you run backfill.
                </>
              ) : (
                <>
                  WORM seal covers through event {seqLabel(sealedThrough)}. Bounded verify
                  trusts the sealed prefix and only walks the live tail.
                </>
              )}
            </p>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-4 text-center">
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Total
            </dt>
            <dd className="font-mono text-[16px] font-semibold text-primary">
              {totalEvents.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Sealed
            </dt>
            <dd className="font-mono text-[16px] font-semibold text-primary">
              {sealedThrough.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Pending
            </dt>
            <dd
              className={`font-mono text-[16px] font-semibold ${
                pendingSeal > 0 ? "text-flagged" : "text-verified"
              }`}
            >
              {pendingSeal.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
