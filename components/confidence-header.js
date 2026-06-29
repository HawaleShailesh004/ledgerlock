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
import {
  tamperSummary,
  tamperGaugeDisplay,
  tamperBannerBody,
  verifyGaugeLabel,
} from "@/lib/tamper-stats";

function StatCard({ label, value, sub, series, color, icon }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        {icon}
      </div>
      {series && series.length > 1 && (
        <div className="mt-2 flex justify-start">
          <Sparkline data={series} color={color} width={84} height={30} />
        </div>
      )}
      <div className={series && series.length > 1 ? "mt-1" : "mt-2"}>
        <div className="text-[22px] font-semibold leading-none tracking-tight text-primary">
          {value}
        </div>
        {sub && (
          <div className="mt-1 text-[12px] leading-tight text-secondary whitespace-nowrap">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConfidenceHeader({
  tenantLabel,
  count,
  loadedCount,
  checkpointCount,
  status,
  brokenSeq,
  lastVerifyTs,
  verifying,
  metrics,
  verifyResult,
  verifyProgress,
  onVerify,
  onCancelVerify,
  pageIndex,
  pageSize,
}) {
  const tampered = status === "tamper";
  const verified = status === "verified";
  const breach = tampered ? tamperSummary(brokenSeq, count) : null;

  let gauge;
  if (verifying) {
    const live = verifyProgress;
    const liveTotal = live?.total ?? count;
    const liveVerified = live?.verified ?? 0;
    const pct = liveTotal
      ? Math.min(100, Math.round((liveVerified / liveTotal) * 100))
      : 30;
    gauge = {
      tone: "accent",
      value: live ? `${pct}%` : "…",
      label: verifyGaugeLabel(live?.phase),
      pct,
      spinning: live?.phase !== "done",
      compact: true,
    };
  } else if (verified) {
    gauge = { tone: "verified", value: "100%", label: "Integrity", pct: 100, compact: false };
  } else if (tampered && breach) {
    gauge = { tone: "tamper", ...tamperGaugeDisplay(breach), compact: false };
  } else if (tampered) {
    gauge = { tone: "tamper", value: "!", label: "breach", pct: 0, compact: false };
  } else {
    gauge = { tone: "accent", value: "Ready", label: "to verify", pct: 0, compact: false };
  }

  const banner = tampered
    ? {
        wash: "hero-wash-tamper",
        icon: <ShieldAlert className="text-tamper" width={20} height={20} />,
        iconBg: "bg-tamper-weak",
        title: `Integrity breach at event ${
          brokenSeq != null ? `#${String(brokenSeq).padStart(4, "0")}` : ""
        }`,
        body: tamperBannerBody(breach),
        titleColor: "text-tamper",
      }
    : verified
      ? {
          wash: "hero-wash-verified",
          icon: (
            <ShieldCheck className="text-verified" width={20} height={20} />
          ),
          iconBg: "bg-verified-weak",
          title: "Chain verified - all records intact",
          body: verifyResult?.mode === "since-seal" && verifyResult?.sealAt > 0
            ? `WORM seal trusted through event ${verifyResult.sealAt}; ${verifyResult.tailVerified} tail events walked in ${verifyResult.durationMs ?? "?"}ms.`
            : `${count} events recomputed in ${verifyResult?.durationMs ?? "?"}ms.`,
          titleColor: "text-verified",
        }
      : verifying
        ? {
            wash: "hero-wash",
            icon: (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            ),
            iconBg: "bg-accent-weak",
            title: "Verifying chain integrity",
            body: verifyProgress
              ? `${verifyProgress.verified.toLocaleString()} / ${verifyProgress.total.toLocaleString()} events checked — ${verifyProgress.label || "in progress"}`
              : "Recomputing hash chain against the WORM seal…",
            titleColor: "text-accent",
          }
        : {
            wash: "hero-wash",
            icon: <ShieldCheck className="text-accent" width={20} height={20} />,
            iconBg: "bg-accent-weak",
            title: "Ready to verify integrity",
            body: "Since-seal verify trusts the WORM checkpoint prefix and walks only the tail.",
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

        {verifying ? (
          <button
            type="button"
            onClick={onCancelVerify}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-primary shadow-raised transition-all hover:bg-surface-2 active:scale-[0.98]"
          >
            Cancel verify
          </button>
        ) : (
          <button
            type="button"
            onClick={onVerify}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-accent shadow-raised transition-all hover:bg-accent-hover active:scale-[0.98]"
          >
            <CheckTick width={16} height={16} />
            Verify chain integrity
          </button>
        )}
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
              compact={gauge.compact}
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
            value={count?.toLocaleString?.() ?? count}
            sub={
              loadedCount != null && count
                ? `${loadedCount.toLocaleString()} on page ${(pageIndex ?? 0) + 1} · ${pageSize ?? loadedCount}/page`
                : "logged this period"
            }
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
            value={checkpointCount != null ? `#${checkpointCount}` : "-"}
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
            sub={
              verifying
                ? "In progress…"
                : tampered
                  ? "Breach detected"
                  : verified
                    ? "All intact"
                    : "Awaiting check"
            }
          />
        </div>
      </div>
    </header>
  );
}
