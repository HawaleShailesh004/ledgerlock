"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actionMeta, actorName, seqLabel, fullStamp } from "./format";
import { FlagGlyph, ShieldAlert } from "./icons";
import TablePagination, { PAGE_SIZE_OPTIONS } from "./table-pagination";

function AlertRow({ event, onSelect }) {
  const meta = actionMeta(event.action);
  return (
    <button
      type="button"
      onClick={() => onSelect?.(event.seq)}
      className="flex w-full items-start gap-4 border-b border-line px-8 py-4 text-left transition-colors hover:bg-surface-2"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flagged-weak text-flagged">
        <FlagGlyph width={15} height={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-muted">
            {seqLabel(event.seq)}
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-secondary">
            {meta.short}
          </span>
        </div>
        <p className="mt-1 text-[14px] font-medium text-primary">
          {actorName(event.actor)}
        </p>
        <p className="mt-0.5 text-[12.5px] text-secondary">{meta.label}</p>
      </div>
      <time className="shrink-0 font-mono text-[11.5px] text-muted">
        {fullStamp(event.ts)}
      </time>
    </button>
  );
}

export default function AlertsView({
  tenantLabel,
  tenantId,
  demo,
  events,
  onSelectEvent,
  onOpenLedger,
}) {
  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);
  const cursorsRef = useRef({ 0: null });
  const [hasMore, setHasMore] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  const fetchAlertsPage = useCallback(
    async (page, size, { reset } = {}) => {
      if (demo) return;
      setPageLoading(true);
      try {
        const afterKey = reset ? null : cursorsRef.current[page];
        const url = new URL("/api/alerts", window.location.origin);
        url.searchParams.set("tenantId", tenantId);
        url.searchParams.set("limit", String(size));
        if (afterKey) url.searchParams.set("afterKey", afterKey);

        const res = await fetch(url);
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        setAllAlerts(items);
        setHasMore(Boolean(data?.hasMore));
        if (data?.nextKey) cursorsRef.current[page + 1] = data.nextKey;
        setPageIndex(page);
      } catch {
        setAllAlerts([]);
        setHasMore(false);
      } finally {
        setPageLoading(false);
        setLoading(false);
      }
    },
    [tenantId, demo],
  );

  useEffect(() => {
    setPageIndex(0);
    cursorsRef.current = { 0: null };
    setLoading(true);

    if (demo) {
      const flagged = events.filter((e) => e.flagged).sort((a, b) => b.seq - a.seq);
      setAllAlerts(flagged);
      setHasMore(false);
      setLoading(false);
      return;
    }

    fetchAlertsPage(0, pageSize, { reset: true });
  }, [tenantId, demo, events, fetchAlertsPage]);

  const demoAlerts = useMemo(() => {
    if (!demo) return allAlerts;
    const start = pageIndex * pageSize;
    return allAlerts.slice(start, start + pageSize);
  }, [demo, allAlerts, pageIndex, pageSize]);

  const alerts = demo ? demoAlerts : allAlerts;
  const totalCount = demo ? allAlerts.length : null;
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setPageIndex(0);
    cursorsRef.current = { 0: null };
    if (demo) return;
    fetchAlertsPage(0, size, { reset: true });
  };

  const handlePrev = () => {
    if (pageIndex <= 0 || pageLoading) return;
    if (demo) {
      setPageIndex((p) => p - 1);
      return;
    }
    fetchAlertsPage(pageIndex - 1, pageSize);
  };

  const handleNext = () => {
    if (pageLoading) return;
    if (demo) {
      if (totalPages != null && pageIndex >= totalPages - 1) return;
      setPageIndex((p) => p + 1);
      return;
    }
    if (!hasMore && totalPages != null && pageIndex >= totalPages - 1) return;
    if (!hasMore) return;
    fetchAlertsPage(pageIndex + 1, pageSize);
  };

  const seqRange = useMemo(() => {
    if (!alerts.length) return { min: null, max: null };
    const seqs = alerts.map((e) => e.seq);
    return { min: Math.min(...seqs), max: Math.max(...seqs) };
  }, [alerts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line hero-wash px-8 pb-7 pt-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-primary">
          Review queue
        </h1>
        <p className="mt-0.5 text-[13.5px] text-secondary">
          Flagged events for{" "}
          <span className="font-medium text-primary">{tenantLabel}</span> via
          sparse GSI1 — no table scan
        </p>
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-flagged-weak">
            <ShieldAlert className="text-flagged" width={20} height={20} />
          </span>
          <div>
            <div className="text-[22px] font-semibold leading-none text-primary">
              {loading ? "…" : (totalCount ?? alerts.length).toLocaleString()}
            </div>
            <div className="mt-1 text-[12px] text-secondary">
              open alerts · queried on{" "}
              <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">
                GSI1PK=ALERT#{tenantId}
              </code>
            </div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="py-16 text-center text-[13.5px] text-muted">
          Loading alerts…
        </div>
      ) : alerts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[13.5px] text-muted">No flagged events in queue.</p>
          <button
            type="button"
            onClick={onOpenLedger}
            className="mt-3 text-[13px] font-medium text-accent hover:underline"
          >
            View full ledger
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {alerts.map((event) => (
              <AlertRow
                key={event.seq ?? event.SK}
                event={event}
                onSelect={onSelectEvent}
              />
            ))}
          </div>
          <TablePagination
            pageIndex={pageIndex}
            pageSize={pageSize}
            pageSizes={PAGE_SIZE_OPTIONS}
            totalCount={totalCount}
            rowCount={alerts.length}
            seqMin={seqRange.min}
            seqMax={seqRange.max}
            loading={pageLoading}
            onPageSizeChange={handlePageSizeChange}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        </>
      )}
    </div>
  );
}
