"use client";

import {
  ShieldCheck,
  ShieldAlert,
  ClockGlyph,
  CheckTick,
  LockGlyph,
  FlagGlyph,
} from "./icons";
import ConfidenceGauge from "./confidence-gauge";
import Sparkline from "./sparkline";

function StatCard({ label, value, sub, series, color, icon }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-[22px] font-semibold leading-none tracking-tight text-primary">
            {value}
          </div>
          {sub && <div className="mt-1 text-[12px] text-secondary">{sub}</div>}
        </div>
        {series && series.length > 1 && (
          <Sparkline data={series} color={color} width={84} height={30} />
        )}
      </div>
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
  metrics,
  onVerify,
}) {
  const tampered = status === "tamper";
  const verified = status === "verified";

  let gauge;
  if (verifying) {
    gauge = { tone: "accent", value: "…", label: "Scanning", pct: 30, spinning: true };
  } else if (verified) {
    gauge = { tone: "verified", value: "100%", label: "Integrity", pct: 100 };
  } else if (tampered) {
    const intact = count ? Math.round(((brokenSeq ?? 0) / count) * 100) : 0;
    gauge = { tone: "tamper", value: `${intact}%`, label: "Integrity", pct: intact };
  } else {
    gauge = { tone: "accent", value: "Ready", label: "to verify", pct: 100 };
  }

  const banner = tampered
    ? {
        wash: "hero-wash-tamper",
        icon: <ShieldAlert className="text-tamper" width={20} height={20} />,
        iconBg: "bg-tamper-weak",
        title: `Integrity breach at event ${
          brokenSeq != null ? `#${String(brokenSeq).padStart(4, "0")}` : ""
        }`,
        body: "A record was altered after it was written. The chain no longer matches its sealed WORM checkpoint.",
        titleColor: "text-tamper",
      }
    : verified
      ? {
          wash: "hero-wash-verified",
          icon: <ShieldCheck className="text-verified" width={20} height={20} />,
          iconBg: "bg-verified-weak",
          title: "Chain verified — all records intact",
          body: `${count} events recomputed and matched against the sealed WORM checkpoint.`,
          titleColor: "text-verified",
        }
      : {
          wash: "hero-wash",
          icon: <ShieldCheck className="text-accent" width={20} height={20} />,
          iconBg: "bg-accent-weak",
          title: "Ready to verify integrity",
          body: "Run a full integrity check to confirm no records have been altered since they were written.",
          titleColor: "text-accent",
        };

  return (
    <header className={`border-b border-line ${banner.wash} px-8 pb-7 pt-7`}>
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
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-accent shadow-raised transition-all hover:bg-accent-hover active:scale-[0.98] disabled:cursor-progress disabled:opacity-70"
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

      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* Gauge + verdict */}
        <div className="flex items-center gap-5 rounded-2xl border border-line bg-surface p-5 shadow-card lg:w-[420px]">
          <div
            key={verified ? `v-${lastVerifyTs}` : status}
            className={`rounded-full ${verified ? "animate-lock" : ""}`}
          >
            <ConfidenceGauge
              pct={gauge.pct}
              tone={gauge.tone}
              value={gauge.value}
              label={gauge.label}
              spinning={gauge.spinning}
              size={120}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${banner.iconBg}`}
              >
                {banner.icon}
              </span>
              <p className={`text-[14px] font-semibold ${banner.titleColor}`}>
                {banner.title}
              </p>
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-secondary">
              {banner.body}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid flex-1 grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            label="Total events"
            value={count}
            sub="logged this period"
            series={metrics?.volumeSeries}
            color="var(--color-accent)"
          />
          <StatCard
            label="Flagged access"
            value={metrics?.flaggedCount ?? 0}
            sub={`${metrics?.breakGlassCount ?? 0} break-the-glass`}
            series={metrics?.flaggedSeries}
            color="var(--color-flagged)"
            icon={<FlagGlyph className="text-flagged" />}
          />
          <StatCard
            label="Sealed checkpoint"
            value={checkpointCount != null ? `#${checkpointCount}` : "—"}
            sub="WORM-protected"
            icon={<LockGlyph className="text-accent" />}
          />
          <StatCard
            label="Last verified"
            value={
              <span className="flex items-center gap-1.5 text-[16px]">
                <ClockGlyph className="text-muted" />
                {lastVerifyTs || "Not yet"}
              </span>
            }
            sub={tampered ? "Breach detected" : verified ? "All intact" : "Awaiting check"}
          />
        </div>
      </div>
    </header>
  );
}
