"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { actionMeta, actorInitials, actorName, relativeTime } from "./format";
import {
  CheckTick,
  ShieldCheck,
  ShieldAlert,
  FlagGlyph,
  BreakGlyph,
  LockGlyph,
  ArrowRight,
  LedgerGlyph,
} from "./icons";
import ConfidenceGauge from "./confidence-gauge";
import {
  tamperSummary,
  tamperGaugeDisplay,
  verifyGaugeLabel,
} from "@/lib/tamper-stats";

const ACTION_COLORS = {
  PHI_READ: "var(--color-accent)",
  RECORD_UPDATE: "#9aa6b6",
  EXPORT: "var(--color-flagged)",
  BREAK_THE_GLASS: "var(--color-tamper)",
};

function Card({ title, sub, children, className = "", action }) {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface p-5 shadow-card ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-[14px] font-semibold tracking-tight text-primary">
                {title}
              </h2>
            )}
            {sub && <p className="mt-0.5 text-[12px] text-secondary">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function KpiCard({ label, value, sub, icon, tone = "primary" }) {
  const toneColor =
    tone === "flagged"
      ? "text-flagged"
      : tone === "tamper"
        ? "text-tamper"
        : tone === "verified"
          ? "text-verified"
          : "text-primary";
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        {icon}
      </div>
      <div className={`mt-3 text-[28px] font-semibold leading-none tracking-tight ${toneColor}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-secondary">{sub}</div>}
    </div>
  );
}

function ChartTip({ active, payload, label, unit = "events" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-primary">
        {payload[0].value} {unit}
      </div>
    </div>
  );
}

export default function OverviewView({
  tenantLabel,
  metrics,
  totalEventCount,
  events,
  checkpointCount,
  status,
  brokenSeq,
  verifying,
  verifyProgress,
  onVerify,
  onCancelVerify,
  onOpenLedger,
}) {
  const tampered = status === "tamper";
  const verified = status === "verified";
  const recent = events.slice(0, 6);
  const chainTotal = totalEventCount ?? metrics.total;
  const breach = tampered ? tamperSummary(brokenSeq, chainTotal) : null;

  const gauge = verifying
    ? (() => {
        const live = verifyProgress;
        const liveTotal = live?.total ?? chainTotal;
        const liveVerified = live?.verified ?? 0;
        const pct = liveTotal
          ? Math.min(100, Math.round((liveVerified / liveTotal) * 100))
          : 30;
        return {
          tone: "accent",
          value: live ? `${pct}%` : "…",
          label: verifyGaugeLabel(live?.phase),
          pct,
          spinning: live?.phase !== "done",
          compact: true,
        };
      })()
    : verified
      ? { tone: "verified", value: "100%", label: "Integrity", pct: 100, compact: false }
      : tampered && breach
        ? { tone: "tamper", ...tamperGaugeDisplay(breach), compact: false }
        : tampered
          ? { tone: "tamper", value: "!", label: "breach", pct: 0, compact: false }
        : { tone: "accent", value: "Ready", label: "to verify", pct: 0, compact: false };

  const totalActions = metrics.actionDistribution.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="animate-view px-8 pb-12 pt-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-primary">
            Overview
          </h1>
          <p className="mt-0.5 text-[13.5px] text-secondary">
            Access activity & integrity for{" "}
            <span className="font-medium text-primary">{tenantLabel}</span>
          </p>
        </div>
        {verifying ? (
          <button
            type="button"
            onClick={onCancelVerify}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-primary shadow-raised transition-all hover:bg-surface-2"
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
            Verify integrity
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Total events"
          value={chainTotal}
          sub={`${metrics.actorCount} distinct accounts (loaded sample)`}
          icon={<LedgerGlyph className="text-accent" width={16} height={16} />}
        />
        <KpiCard
          label="Flagged access"
          value={metrics.flaggedCount}
          sub="requires review"
          tone="flagged"
          icon={<FlagGlyph className="text-flagged" />}
        />
        <KpiCard
          label="Break-the-glass"
          value={metrics.breakGlassCount}
          sub="emergency overrides"
          tone="tamper"
          icon={<BreakGlyph className="text-tamper" width={15} height={15} />}
        />
        <KpiCard
          label="Chain status"
          value={tampered ? "Broken" : verified ? "Intact" : "Unverified"}
          sub={checkpointCount != null ? `sealed at #${checkpointCount}` : "no checkpoint"}
          tone={tampered ? "tamper" : verified ? "verified" : "primary"}
          icon={<LockGlyph className="text-accent" />}
        />
      </div>

      {/* Charts grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Volume over time */}
        <Card
          title="Access volume over time"
          sub="Events recorded across the audit period"
          className="lg:col-span-2"
        >
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-line)" }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={34}
                />
                <Tooltip content={<ChartTip unit="events" />} cursor={{ stroke: "var(--color-accent)", strokeOpacity: 0.3 }} />
                <Area
                  type="monotone"
                  dataKey="events"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#volGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Action breakdown donut */}
        <Card title="Action breakdown" sub="Distribution by access type">
          <div className="flex items-center gap-4">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.actionDistribution}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={68}
                    paddingAngle={2}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  >
                    {metrics.actionDistribution.map((d) => (
                      <Cell key={d.action} fill={ACTION_COLORS[d.action] || "#9aa6b6"} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTip unit="events" />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-2">
              {metrics.actionDistribution.map((d) => (
                <li key={d.action} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: ACTION_COLORS[d.action] || "#9aa6b6" }}
                  />
                  <span className="flex-1 truncate text-secondary">{d.label}</span>
                  <span className="font-medium text-primary">
                    {Math.round((d.value / totalActions) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Flagged trend */}
        <Card
          title="Flagged access trend"
          sub="Sensitive access events over time"
          className="lg:col-span-2"
        >
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-line)" }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={34}
                />
                <Tooltip content={<ChartTip unit="flagged" />} cursor={{ fill: "var(--color-flagged-weak)" }} />
                <Bar dataKey="flagged" fill="var(--color-flagged)" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Integrity summary with gauge */}
        <Card title="Integrity confidence">
          <div className="flex flex-col items-center">
            <ConfidenceGauge
              pct={gauge.pct}
              tone={gauge.tone}
              value={gauge.value}
              label={gauge.label}
              spinning={gauge.spinning}
              compact={gauge.compact}
              size={128}
            />
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium ${
                tampered
                  ? "bg-tamper-weak text-tamper"
                  : verified
                    ? "bg-verified-weak text-verified"
                    : "bg-accent-weak text-accent"
              }`}
            >
              {tampered ? (
                <ShieldAlert width={15} height={15} />
              ) : (
                <ShieldCheck width={15} height={15} />
              )}
              {tampered && breach
                ? `1 tampered · ${breach.invalidated.toLocaleString()} invalidated`
                : tampered
                  ? `Breach at #${String(brokenSeq).padStart(4, "0")}`
                  : verified
                    ? "All records intact"
                    : "Run verification to confirm"}
            </div>
          </div>
        </Card>
      </div>

      {/* Most active accounts + recent activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Most active accounts" sub="By number of access events">
          <ul className="space-y-3">
            {metrics.topActors.map((a) => {
              const pct = Math.round((a.count / (metrics.topActors[0]?.count || 1)) * 100);
              return (
                <li key={a.actor} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-secondary">
                    {actorInitials(a.actor)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[13px] font-medium text-primary">
                        {actorName(a.actor)}
                      </span>
                      <span className="ml-2 text-[12px] tabular-nums text-secondary">
                        {a.count}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Recent activity"
          sub="Latest entries in the ledger"
          action={
            <button
              type="button"
              onClick={onOpenLedger}
              className="flex items-center gap-1 text-[12.5px] font-medium text-accent transition-colors hover:text-accent-hover"
            >
              View ledger
              <ArrowRight width={14} height={14} />
            </button>
          }
        >
          <ul className="divide-y divide-line">
            {recent.map((e) => {
              const meta = actionMeta(e.action);
              return (
                <li key={e.seq} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-secondary">
                    {actorInitials(e.actor)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-primary">
                      {actorName(e.actor)}
                    </div>
                    <div className="truncate text-[12px] text-secondary">{meta.label}</div>
                  </div>
                  {e.flagged && (
                    <span className="rounded bg-flagged-weak px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-flagged">
                      Flagged
                    </span>
                  )}
                  <span className="shrink-0 text-[11.5px] text-muted">
                    {relativeTime(e.ts)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
