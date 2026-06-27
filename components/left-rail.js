"use client";

import { ShieldGlyph, LedgerGlyph, PulseGlyph } from "./icons";

function RailButton({ children, active, label }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-sm transition-colors duration-150 ${
        active
          ? "bg-raised text-steel"
          : "text-label hover:text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

export default function LeftRail({ statusColor = "var(--color-steel)", statusTitle = "operational" }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col items-center border-r border-hairline bg-panel">
      {/* Shield mark */}
      <div className="flex h-12 w-full items-center justify-center border-b border-hairline">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-steel/10 text-steel">
          <ShieldGlyph width={18} height={18} />
        </div>
      </div>

      {/* Nav glyphs */}
      <nav className="mt-3 flex flex-col items-center gap-1">
        <RailButton active label="Ledger">
          <LedgerGlyph width={18} height={18} />
        </RailButton>
        <RailButton label="Activity">
          <PulseGlyph width={18} height={18} />
        </RailButton>
      </nav>

      {/* Status dot at bottom */}
      <div className="mt-auto flex h-12 w-full items-center justify-center border-t border-hairline">
        <span
          title={statusTitle}
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
        />
      </div>
    </aside>
  );
}
