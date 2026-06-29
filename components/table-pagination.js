"use client";

import { ChevronDown } from "./icons";

export const PAGE_SIZE_OPTIONS = [10, 50, 100, 500, 1000];

export default function TablePagination({
  pageIndex,
  pageSize,
  pageSizes = PAGE_SIZE_OPTIONS,
  totalCount,
  rowCount,
  filteredCount,
  seqMin,
  seqMax,
  loading = false,
  onPageSizeChange,
  onPrev,
  onNext,
}) {
  const totalPages =
    totalCount != null && totalCount > 0
      ? Math.max(1, Math.ceil(totalCount / pageSize))
      : null;
  const canPrev = pageIndex > 0;
  const canNext =
    totalPages != null ? pageIndex < totalPages - 1 : rowCount >= pageSize;

  const fromSeq =
    seqMin != null ? seqMin : pageIndex * pageSize;
  const toSeq =
    seqMax != null
      ? seqMax
      : rowCount > 0
        ? pageIndex * pageSize + rowCount - 1
        : fromSeq;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-8 py-3">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span>
          Rows per page
        </span>
        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            className="cursor-pointer appearance-none rounded-lg border border-line bg-surface-2 py-1.5 pl-2.5 pr-8 text-[12px] font-medium text-primary outline-none transition-colors hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-weak disabled:opacity-60"
            aria-label="Rows per page"
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" />
        </div>
        <span className="text-secondary">
          {filteredCount != null && filteredCount !== rowCount ? (
            <>
              <span className="font-medium text-primary">{filteredCount}</span> matching
              on this page ·{" "}
            </>
          ) : null}
          {rowCount > 0 ? (
            <>
              events{" "}
              <span className="font-mono font-medium text-primary">
                #{String(fromSeq).padStart(4, "0")}–#
                {String(toSeq).padStart(4, "0")}
              </span>
            </>
          ) : (
            "no rows"
          )}
          {totalCount != null && (
            <>
              {" "}
              of{" "}
              <span className="font-medium text-primary">
                {totalCount.toLocaleString()}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {totalPages != null && (
          <span className="text-[12px] text-secondary">
            Page{" "}
            <span className="font-medium text-primary">{pageIndex + 1}</span> of{" "}
            <span className="font-medium text-primary">
              {totalPages.toLocaleString()}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev || loading}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:border-line-strong hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext || loading}
          className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:border-line-strong hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading…" : "Next"}
        </button>
      </div>
    </div>
  );
}
