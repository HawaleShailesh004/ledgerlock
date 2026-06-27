"use client";

import { ShieldCheck, ShieldAlert, ClockGlyph, CheckTick } from "./icons";

function Stat({ label, value, sub }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="mt-0.5 text-[20px] font-semibold tracking-tight text-primary">
        {value}
      </span>
      {sub && <span className="text-[12px] text-secondary">{sub}</span>}
    </div>
  );
}

export default function ConfidenceHeader({
  tenantLabel,
  count,
  checkpointCount,
  status,
  brokenSeq,
  lastVerifyTs,
  verifying,
  onVerify,
}) {
  const tampered = status === "tamper";
  const verified = status === "verified";

  // Trust banner visual state
  const banner = tampered
    ? {
        bg: "bg-tamper-weak",
        ring: "border-tamper/30",
        icon: <ShieldAlert className="text-tamper" width={22} height={22} />,
        title: `Integrity breach at event ${brokenSeq != null ? `#${String(brokenSeq).padStart(4, "0")}` : ""}`,
        body: "A record was altered after it was written. The chain no longer matches its sealed checkpoint.",
        titleColor: "text-tamper",
      }
    : verified
      ? {
          bg: "bg-verified-weak",
          ring: "border-verified/25",
          icon: <ShieldCheck className="text-verified" width={22} height={22} />,
          title: "Chain verified — all records intact",
          body: `${count} events recomputed and matched against the sealed WORM checkpoint.`,
          titleColor: "text-verified",
        }
      : {
          bg: "bg-accent-weak",
          ring: "border-accent/20",
          icon: <ShieldCheck className="text-accent" width={22} height={22} />,
          title: "Ready to verify",
          body: "Run a full integrity check to confirm no records have been altered.",
          titleColor: "text-accent",
        };

  return (
    <header className="border-b border-line bg-surface px-8 pb-6 pt-7">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-primary">
            Audit Ledger
          </h1>
          <p className="mt-0.5 text-[13.5px] text-secondary">
            Tamper-evident HIPAA access log for{" "}
            <span className="font-medium text-primary">{tenantLabel}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-accent shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-progress disabled:opacity-70"
        >
          {verifying ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-accent/40 border-t-on-accent" />
              Verifying…
            </>
          ) : (
            <>
              <CheckTick width={16} height={16} />
              Verify chain integrity
            </>
          )}
        </button>
      </div>

      {/* Trust banner */}
      <div
        className={`mt-5 flex items-start gap-3 rounded-xl border ${banner.ring} ${banner.bg} px-4 py-3.5`}
      >
        <span className="mt-0.5 shrink-0">{banner.icon}</span>
        <div className="min-w-0">
          <p className={`text-[14px] font-semibold ${banner.titleColor}`}>
            {banner.title}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-secondary">
            {banner.body}
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total events" value={count} />
        <Stat
          label="Sealed checkpoint"
          value={checkpointCount != null ? `#${checkpointCount}` : "—"}
          sub="WORM-protected"
        />
        <Stat
          label="Chain status"
          value={tampered ? "Broken" : verified ? "Intact" : "Unverified"}
        />
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Last verified
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[14px] font-medium text-primary">
            <ClockGlyph className="text-muted" />
            {lastVerifyTs || "Not yet"}
          </span>
        </div>
      </div>
    </header>
  );
}
