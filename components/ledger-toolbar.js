"use client";

import { SearchGlyph, PlusGlyph, DownloadGlyph, ChevronDown } from "./icons";
import { ACTION_META } from "./format";

export default function LedgerToolbar({
  query,
  onQuery,
  actionFilter,
  onActionFilter,
  flaggedOnly,
  onFlaggedOnly,
  resultCount,
  totalCount,
  onAppend,
  onExport,
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/95 px-8 py-3.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <SearchGlyph className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by actor, action, or hash…"
            className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-[13.5px] text-primary outline-none transition-colors placeholder:text-muted hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent-weak"
            aria-label="Search events"
          />
        </div>

        {/* Action filter */}
        <div className="relative">
          <select
            value={actionFilter}
            onChange={(e) => onActionFilter(e.target.value)}
            className="cursor-pointer appearance-none rounded-lg border border-line bg-surface-2 py-2 pl-3 pr-9 text-[13.5px] font-medium text-primary outline-none transition-colors hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-weak"
            aria-label="Filter by action"
          >
            <option value="all">All actions</option>
            {Object.entries(ACTION_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.short}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>

        {/* Flagged toggle */}
        <button
          type="button"
          onClick={() => onFlaggedOnly(!flaggedOnly)}
          aria-pressed={flaggedOnly}
          className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
            flaggedOnly
              ? "border-flagged/40 bg-flagged-weak text-flagged"
              : "border-line bg-surface-2 text-secondary hover:border-line-strong hover:text-primary"
          }`}
        >
          Flagged only
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] font-medium text-secondary transition-colors hover:border-line-strong hover:text-primary"
          >
            <DownloadGlyph width={14} height={14} />
            Export report
          </button>
          <button
            type="button"
            onClick={onAppend}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90"
          >
            <PlusGlyph width={14} height={14} />
            Log event
          </button>
        </div>
      </div>

      <div className="mt-2.5 text-[12px] text-muted">
        Showing <span className="font-medium text-secondary">{resultCount}</span>{" "}
        of {totalCount} events
      </div>
    </div>
  );
}
