"use client";

import Link from "next/link";
import Logo from "./logo";
import { LedgerGlyph, ChartGlyph, SealGlyph, FlagGlyph, ChevronDown } from "./icons";

const NAV = [
  { id: "overview", label: "Overview", Icon: ChartGlyph },
  { id: "ledger", label: "Audit Ledger", Icon: LedgerGlyph },
  { id: "alerts", label: "Review queue", Icon: FlagGlyph },
  { id: "checkpoints", label: "Checkpoints", Icon: SealGlyph },
];

export default function Sidebar({
  tenants,
  tenant,
  onTenantChange,
  demo,
  view,
  onNavigate,
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <Link
        href="/"
        className="block px-5 py-5 transition-opacity hover:opacity-80"
      >
        <Logo variant="full" height={28} className="max-w-full" priority />
        <p className="mt-2 text-[11px] text-muted">Compliance audit</p>
      </Link>

      <nav className="flex flex-col gap-0.5 px-3 py-2">
        {NAV.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-accent-weak text-accent"
                  : "text-secondary hover:bg-surface-2 hover:text-primary"
              }`}
            >
              <Icon width={17} height={17} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-4">
        <label className="mb-1.5 block px-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          Organization
        </label>
        <div className="relative">
          <select
            value={tenant.id}
            onChange={(e) => {
              const next = tenants.find((t) => t.id === e.target.value);
              if (next) onTenantChange(next);
            }}
            className="w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface-2 py-2 pl-3 pr-9 text-[13.5px] font-medium text-primary outline-none transition-colors hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-weak"
            aria-label="Select organization"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
        {demo && (
          <p className="mt-2 px-2 text-[11px] leading-snug text-muted">
            Demo data - live DynamoDB ledger loads automatically when connected.
          </p>
        )}
      </div>
    </aside>
  );
}
