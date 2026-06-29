"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/sidebar";
import ConfidenceHeader from "@/components/confidence-header";
import LedgerToolbar from "@/components/ledger-toolbar";
import LedgerList from "@/components/ledger-list";
import Inspector from "@/components/inspector";
import OverviewView from "@/components/overview-view";
import CheckpointsView from "@/components/checkpoints-view";
import AlertsView from "@/components/alerts-view";
import SealStatusBar from "@/components/seal-status-bar";
import VerifyProgressBar from "@/components/verify-progress-bar";
import TamperLegend from "@/components/tamper-legend";
import TablePagination, { PAGE_SIZE_OPTIONS } from "@/components/table-pagination";
import AppendModal from "@/components/append-modal";
import Toast from "@/components/toast";
import { BreakGlyph } from "@/components/icons";
import {
  buildSeed,
  buildCheckpoint,
  appendDemo,
  verifyDemo,
  tamperDemo,
  recomputeRow,
} from "@/lib/demo-ledger";
import { computeMetrics } from "@/lib/metrics";
import { tamperSummary } from "@/lib/tamper-stats";
import { downloadComplianceReport } from "@/lib/export-report";

const FALLBACK_TENANTS = [
  { id: "acme", label: "acme-health" },
  { id: "northwind", label: "northwind-bank" },
  { id: "globex", label: "globex-insurance" },
  { id: "scale-test", label: "scale-test (10k)" },
  { id: "scale-100k", label: "scale-100k (100k)" },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyWithStream(tenantId, signal, onProgress) {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, mode: "since-seal", stream: true }),
    signal,
  });
  if (!res.ok) throw new Error("verify_failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      const msg = JSON.parse(line.slice(6));
      if (msg.type === "progress") {
        onProgress({
          phase: msg.phase,
          verified: msg.verified,
          total: msg.total,
          label: msg.label,
        });
      } else if (msg.type === "done") {
        result = msg.result;
      } else if (msg.type === "error") {
        throw new Error(msg.message || "verify_failed");
      }
    }
  }
  if (!result) throw new Error("verify_incomplete");
  return result;
}

export default function DashboardPage() {
  const [tenants, setTenants] = useState(FALLBACK_TENANTS);
  const [tenant, setTenant] = useState(FALLBACK_TENANTS[0]);
  const [events, setEvents] = useState([]); // newest-first
  const [checkpoint, setCheckpoint] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|verifying|verified|tamper
  const [brokenSeq, setBrokenSeq] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyProgress, setVerifyProgress] = useState(null);
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [recompute, setRecompute] = useState(null);
  const [worm, setWorm] = useState(null);
  const [newSeq, setNewSeq] = useState(null);
  const [appendOpen, setAppendOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [reduced, setReduced] = useState(false);
  const [demo, setDemo] = useState(false);
  const [lastVerifyTs, setLastVerifyTs] = useState(null);
  const [view, setView] = useState("overview");
  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [eventProof, setEventProof] = useState(null);
  const [sealStatus, setSealStatus] = useState(null);
  const [totalEventCount, setTotalEventCount] = useState(null);

  // Filters
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const toastTimer = useRef(null);
  const demoStore = useRef({});
  const demoCheckpoints = useRef({});
  const demoActive = useRef(false);
  const eventsRef = useRef(events);
  const tenantRef = useRef(tenant);
  const verifyAbortRef = useRef(null);
  const pageSizeRef = useRef(pageSize);
  const totalEventCountRef = useRef(totalEventCount);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);
  useEffect(() => {
    totalEventCountRef.current = totalEventCount;
  }, [totalEventCount]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    tenantRef.current = tenant;
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = null;
  }, [tenant]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tenants")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.tenants?.length) return;
        setTenants(d.tenants);
        setTenant(
          (cur) => d.tenants.find((t) => t.id === cur.id) || d.tenants[0],
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  const handleCancelVerify = useCallback(() => {
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = null;
    setStatus("idle");
    setVerifyProgress(null);
    showToast("Verification cancelled");
  }, [showToast]);

  const publishDemo = useCallback((tenantId, page = 0) => {
    const chain = demoStore.current[tenantId] || [];
    const size = pageSizeRef.current;
    const from = page * size;
    const slice = [...chain]
      .sort((a, b) => a.seq - b.seq)
      .slice(from, from + size)
      .sort((a, b) => b.seq - a.seq);
    setEvents(slice);
    setPageIndex(page);
    setCheckpoint(demoCheckpoints.current[tenantId] || null);
    setTotalEventCount(chain.length);
  }, []);

  const fetchEventsPage = useCallback(
    async (tenantId, page, size = pageSizeRef.current) => {
      setPageLoading(true);
      try {
        if (demoActive.current) {
          publishDemo(tenantId, page);
          return;
        }
        const fromSeq = page * size;
        const res = await fetch(
          `/api/events?tenantId=${encodeURIComponent(tenantId)}&limit=${size}&fromSeq=${fromSeq}`,
        );
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        items.sort((a, b) => b.seq - a.seq);
        setEvents(items);
        setPageIndex(page);
      } catch {
        showToast("Failed to load events");
      } finally {
        setPageLoading(false);
      }
    },
    [publishDemo, showToast],
  );

  const enterDemo = useCallback(
    async (tenantId) => {
      demoActive.current = true;
      setDemo(true);
      if (!demoStore.current[tenantId]) {
        const seeded = await buildSeed(tenantId);
        demoStore.current[tenantId] = seeded;
        demoCheckpoints.current[tenantId] = await buildCheckpoint(seeded);
      }
      publishDemo(tenantId);
    },
    [publishDemo],
  );

  const fetchTenantStats = useCallback(async (tenantId) => {
    if (demoActive.current) {
      const n = demoStore.current[tenantId]?.length ?? 0;
      const cp = demoCheckpoints.current[tenantId];
      const sealed = cp?.count ?? 0;
      setTotalEventCount(n);
      setSealStatus({
        totalEvents: n,
        sealedThrough: sealed,
        pendingSeal: Math.max(0, n - sealed),
        status: n - sealed > 10 ? "behind" : n - sealed > 0 ? "catching-up" : "caught-up",
      });
      return n;
    }
    try {
      const res = await fetch(
        `/api/tenant-stats?tenantId=${encodeURIComponent(tenantId)}`,
      );
      const data = await res.json();
      if (res.ok && data?.totalEvents != null) {
        setSealStatus(data);
        setTotalEventCount(data.totalEvents);
        return data.totalEvents;
      }
    } catch {
      setSealStatus(null);
    }
    return null;
  }, []);

  const loadEvents = useCallback(
    async (tenantId) => {
      setStatus("idle");
      setBrokenSeq(null);
      setVerifyResult(null);
      setVerifyProgress(null);
      setWorm(null);
      setSelectedSeq(null);
      setSealStatus(null);
      setTotalEventCount(null);
      setPageIndex(0);
      const size = pageSizeRef.current;
      try {
        const [evRes, cpRes, statsRes] = await Promise.all([
          fetch(
            `/api/events?tenantId=${tenantId}&limit=${size}&fromSeq=0`,
          ),
          fetch(`/api/checkpoint?tenantId=${tenantId}`).catch(() => null),
          fetch(`/api/tenant-stats?tenantId=${tenantId}`).catch(() => null),
        ]);
        const data = await evRes.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!evRes.ok || items.length === 0) {
          await enterDemo(tenantId);
          publishDemo(tenantId, 0);
          return;
        }
        demoActive.current = false;
        setDemo(false);
        items.sort((a, b) => b.seq - a.seq);
        setEvents(items);
        if (cpRes) {
          const cp = await cpRes.json().catch(() => null);
          setCheckpoint(cp?.checkpoint || null);
        }
        if (statsRes) {
          const stats = await statsRes.json().catch(() => null);
          if (stats?.totalEvents != null) {
            setSealStatus(stats);
            setTotalEventCount(stats.totalEvents);
          }
        }
      } catch {
        await enterDemo(tenantId);
      }
    },
    [enterDemo, publishDemo],
  );

  const handlePageSizeChange = useCallback(
    (size) => {
      setPageSize(size);
      pageSizeRef.current = size;
      setPageIndex(0);
      fetchEventsPage(tenantRef.current.id, 0, size);
    },
    [fetchEventsPage],
  );

  const handlePagePrev = useCallback(() => {
    if (pageIndex <= 0 || pageLoading) return;
    fetchEventsPage(tenantRef.current.id, pageIndex - 1);
  }, [pageIndex, pageLoading, fetchEventsPage]);

  const handlePageNext = useCallback(() => {
    if (pageLoading) return;
    const total = totalEventCountRef.current;
    const size = pageSizeRef.current;
    const totalPages = total ? Math.ceil(total / size) : null;
    if (totalPages != null && pageIndex >= totalPages - 1) return;
    fetchEventsPage(tenantRef.current.id, pageIndex + 1);
  }, [pageIndex, pageLoading, fetchEventsPage]);

  // Poll seal status while checkpointer is behind (scale seed / burst load).
  useEffect(() => {
    if (demo || !tenant?.id) return;
    if (!sealStatus || sealStatus.pendingSeal <= 0) return;
    const id = setInterval(() => fetchTenantStats(tenant.id), 15000);
    return () => clearInterval(id);
  }, [demo, tenant?.id, sealStatus?.pendingSeal, fetchTenantStats]);

  useEffect(() => {
    loadEvents(tenant.id);
  }, [tenant, loadEvents]);

  const handleCopy = useCallback(
    (value) => {
      if (!value) return;
      navigator.clipboard?.writeText(value).then(
        () => showToast("Copied to clipboard"),
        () => showToast("Copy failed"),
      );
    },
    [showToast],
  );

  const scrollToBreach = useCallback((seq) => {
    if (seq == null) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        document
          .querySelector(`[data-seq="${seq}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    });
  }, []);

  const ensureBreachVisible = useCallback(
    async (tenantId, seq) => {
      if (seq == null) return;
      const size = pageSizeRef.current;
      const targetPage = Math.floor(seq / size);
      if (demoActive.current) {
        publishDemo(tenantId, targetPage);
        scrollToBreach(seq);
        return;
      }
      if (eventsRef.current.some((e) => e.seq === seq)) {
        scrollToBreach(seq);
        return;
      }
      await fetchEventsPage(tenantId, targetPage, size);
      scrollToBreach(seq);
    },
    [scrollToBreach, publishDemo, fetchEventsPage],
  );

  const refreshRecompute = useCallback(async (seq) => {
    if (seq == null) {
      setRecompute(null);
      return;
    }
    const tid = tenantRef.current.id;
    let chain;
    if (demoActive.current) {
      chain = [...(demoStore.current[tid] || [])];
    } else {
      chain = [...eventsRef.current].sort((a, b) => a.seq - b.seq);
    }
    const idx = chain.findIndex((e) => e.seq === seq);
    if (idx < 0) {
      setRecompute(null);
      return;
    }
    const rc = await recomputeRow(chain, idx);
    setRecompute(rc);
  }, []);

  const handleSelect = useCallback(
    (seq) => {
      setSelectedSeq(seq);
      refreshRecompute(seq);
    },
    [refreshRecompute],
  );

  const handleCursorSeq = useCallback(
    (seq) => {
      const total = totalEventCount ?? eventsRef.current.length;
      if (total > eventsRef.current.length) return;
      setSelectedSeq(seq);
      refreshRecompute(seq);
    },
    [refreshRecompute, totalEventCount],
  );

  const handleVerify = useCallback(async () => {
    if (status === "verifying") return;
    verifyAbortRef.current?.abort();
    const ac = new AbortController();
    verifyAbortRef.current = ac;
    setStatus("verifying");
    setBrokenSeq(null);
    setWorm(null);
    setEventProof(null);
    setVerifyProgress({
      phase: "loading",
      verified: 0,
      total: totalEventCount ?? events.length,
      label: "Starting verification",
    });
    try {
      const tid = tenant.id;
      const signal = ac.signal;
      const onProgress = (p) => {
        if (!ac.signal.aborted) setVerifyProgress(p);
      };

      let res;
      if (demoActive.current) {
        const chain = demoStore.current[tid] || [];
        const total = chain.length;
        const cp = demoCheckpoints.current[tid];
        const sealAt = cp?.count ?? 0;
        const stepMs = reduced ? 8 : 35;

        onProgress({
          phase: "loading",
          verified: 0,
          total,
          label: "Loading demo chain",
        });
        for (let i = 1; i <= total; i += 1) {
          if (ac.signal.aborted) return;
          onProgress({
            phase: i <= sealAt ? "seal-trusted" : "tail-walk",
            verified: i,
            total,
            label:
              i <= sealAt
                ? `WORM seal trusted through event ${sealAt.toLocaleString()}`
                : `Walking tail (${(i - sealAt).toLocaleString()} / ${(total - sealAt).toLocaleString()})`,
          });
          await delay(stepMs);
        }
        res = await verifyDemo(chain, cp);
      } else {
        const checkpointReq = fetch(`/api/checkpoint?tenantId=${tid}`, { signal })
          .then((r) => r.json())
          .catch(() => ({ checkpoint: null }));

        const [verifyRes, cpPayload] = await Promise.all([
          verifyWithStream(tid, signal, onProgress),
          checkpointReq,
        ]);
        res = verifyRes;
        if (cpPayload?.checkpoint) setCheckpoint(cpPayload.checkpoint);
      }
      if (ac.signal.aborted) return;
      setVerifyProgress({
        phase: "done",
        verified: res.count ?? totalEventCount ?? events.length,
        total: res.count ?? totalEventCount ?? events.length,
        label: "Verification complete",
      });
      setVerifyResult(res);
      setLastVerifyTs(
        new Date().toLocaleTimeString("en-US", { hour12: false }),
      );

      const cp = demoActive.current ? demoCheckpoints.current[tid] : checkpoint;
      if (cp && res?.liveRootAtBoundary) {
        setWorm({
          liveRoot: res.liveRootAtBoundary,
          checkpointRoot: cp.merkleRoot,
          checkpointCount: cp.count,
          match: res.liveRootAtBoundary === cp.merkleRoot,
        });
      } else {
        setWorm(null);
      }

      if (res?.intact) {
        setStatus("verified");
        const modeLabel =
          res.mode === "since-seal" && res.sealAt > 0
            ? `seal@${res.sealAt}, tail ${res.tailVerified}`
            : "full walk";
        showToast(
          `Chain intact (${modeLabel}) - ${res.durationMs ?? "?"}ms`,
        );
      } else {
        const seq =
          res?.breaks?.find((b) => typeof b.seq === "number" && b.seq >= 0)?.seq ??
          null;
        setBrokenSeq(seq);
        setStatus("tamper");
        setSelectedSeq(seq);
        setView("ledger");
        refreshRecompute(seq);
        await ensureBreachVisible(tid, seq);
        showToast(`Integrity breach detected at #${seq}`);
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
      setStatus("idle");
      setVerifyProgress(null);
      showToast("Verification failed — is the dev server running?");
    } finally {
      if (verifyAbortRef.current === ac) verifyAbortRef.current = null;
    }
  }, [
    status,
    tenant,
    events.length,
    totalEventCount,
    reduced,
    checkpoint,
    showToast,
    refreshRecompute,
    ensureBreachVisible,
  ]);

  const handleAppend = useCallback(
    async ({ actor, action, flagged }) => {
      const tid = tenant.id;
      if (demoActive.current) {
        const { events: next, seq } = await appendDemo(
          tid,
          demoStore.current[tid] || [],
          { actor, action, flagged },
        );
        demoStore.current[tid] = next;
        setStatus("idle");
        setBrokenSeq(null);
        setWorm(null);
        setNewSeq(seq);
        const lastPage = Math.max(
          0,
          Math.ceil(next.length / pageSizeRef.current) - 1,
        );
        publishDemo(tid, lastPage);
        showToast(`Event #${seq} logged`);
        setTimeout(() => setNewSeq(null), 1400);
        return;
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tid,
          actor,
          action,
          payload: {},
          flagged,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        showToast(data?.error || "Append failed");
        throw new Error("append_failed");
      }
      setStatus("idle");
      setBrokenSeq(null);
      setWorm(null);
      setNewSeq(data.seq);
      const total = (await fetchTenantStats(tid)) ?? data.seq + 1;
      const lastPage = Math.max(
        0,
        Math.ceil(total / pageSizeRef.current) - 1,
      );
      await fetchEventsPage(tid, lastPage);
      showToast(`Event #${data.seq} logged`);
      setTimeout(() => setNewSeq(null), 1400);
    },
    [tenant, fetchEventsPage, showToast, publishDemo, fetchTenantStats],
  );

  const handleTamper = useCallback(() => {
    if (!demoActive.current) return;
    const tid = tenant.id;
    const { events: next, seq } = tamperDemo(demoStore.current[tid] || []);
    demoStore.current[tid] = next;
    setStatus("idle");
    setBrokenSeq(null);
    setWorm(null);
    publishDemo(tid);
    showToast(`Record #${seq} silently altered - run verification`);
  }, [tenant, publishDemo, showToast]);

  useEffect(() => {
    if (!selectedSeq || demoActive.current || status === "verifying") {
      setEventProof(null);
      return;
    }
    const total = totalEventCount ?? events.length;
    if (total > 5000) {
      setEventProof(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/proof?tenantId=${encodeURIComponent(tenant.id)}&seq=${selectedSeq}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEventProof(d.error ? null : d);
      })
      .catch(() => {
        if (!cancelled) setEventProof(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSeq, tenant.id, status, totalEventCount, events.length]);

  const skipRowWalk =
    !demo && (totalEventCount ?? 0) > events.length;

  const handleExport = useCallback(() => {
    downloadComplianceReport({ tenant, events, status, lastVerifyTs });
    showToast("Compliance report downloaded");
  }, [tenant, events, status, lastVerifyTs, showToast]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (flaggedOnly && !e.flagged) return false;
      if (q) {
        const hay =
          `${e.actor} ${e.action} ${e.hash} ${e.prevHash}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, query, actionFilter, flaggedOnly]);

  const displayCount = totalEventCount ?? events.length;
  const selectedEvent = events.find((e) => e.seq === selectedSeq) || null;
  const checkpointCount = checkpoint?.count ?? null;
  const metrics = useMemo(() => computeMetrics(events), [events]);
  const pageSeqRange = useMemo(() => {
    if (!events.length) return { min: null, max: null };
    const seqs = events.map((e) => e.seq);
    return { min: Math.min(...seqs), max: Math.max(...seqs) };
  }, [events]);
  const breachSummary = useMemo(
    () =>
      status === "tamper" ? tamperSummary(brokenSeq, displayCount) : null,
    [status, brokenSeq, displayCount],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        tenants={tenants}
        tenant={tenant}
        onTenantChange={setTenant}
        demo={demo}
        view={view}
        onNavigate={setView}
      />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col overflow-hidden">
          {!demo && sealStatus && sealStatus.totalEvents > 0 && status !== "verifying" && (
            <SealStatusBar sealStatus={sealStatus} compact />
          )}
          {status === "verifying" && verifyProgress && (
            <VerifyProgressBar
              progress={verifyProgress}
              onCancelVerify={handleCancelVerify}
            />
          )}
          <div className="flex-1 overflow-y-auto">
            {view === "overview" && (
              <OverviewView
                tenantLabel={tenant.label}
                metrics={metrics}
                totalEventCount={displayCount}
                events={events}
                checkpointCount={checkpointCount}
                status={status}
                brokenSeq={brokenSeq}
                verifying={status === "verifying"}
                verifyProgress={verifyProgress}
                onVerify={handleVerify}
                onCancelVerify={handleCancelVerify}
                onOpenLedger={() => setView("ledger")}
              />
            )}

            {view === "ledger" && (
              <>
                <ConfidenceHeader
                  tenantLabel={tenant.label}
                  count={displayCount}
                  loadedCount={events.length}
                  checkpointCount={checkpointCount}
                  status={status}
                  brokenSeq={brokenSeq}
                  lastVerifyTs={lastVerifyTs}
                  verifying={status === "verifying"}
                  metrics={metrics}
                  verifyResult={verifyResult}
                  verifyProgress={verifyProgress}
                  onVerify={handleVerify}
                  onCancelVerify={handleCancelVerify}
                  pageIndex={pageIndex}
                  pageSize={pageSize}
                />

                {status === "tamper" && breachSummary && (
                  <TamperLegend summary={breachSummary} />
                )}

                <LedgerToolbar
                  query={query}
                  onQuery={setQuery}
                  actionFilter={actionFilter}
                  onActionFilter={setActionFilter}
                  flaggedOnly={flaggedOnly}
                  onFlaggedOnly={setFlaggedOnly}
                  onAppend={() => setAppendOpen(true)}
                  onExport={handleExport}
                />

                <LedgerList
                  events={filtered}
                  selectedSeq={selectedSeq}
                  newSeq={newSeq}
                  status={status}
                  brokenSeq={brokenSeq}
                  reduced={reduced}
                  skipRowWalk={skipRowWalk}
                  totalEventCount={displayCount}
                  verifyProgress={verifyProgress}
                  onSelect={handleSelect}
                  onCursorSeq={handleCursorSeq}
                  onCancelVerify={handleCancelVerify}
                />

                <TablePagination
                  pageIndex={pageIndex}
                  pageSize={pageSize}
                  pageSizes={PAGE_SIZE_OPTIONS}
                  totalCount={displayCount}
                  rowCount={events.length}
                  filteredCount={filtered.length}
                  seqMin={pageSeqRange.min}
                  seqMax={pageSeqRange.max}
                  loading={pageLoading}
                  onPageSizeChange={handlePageSizeChange}
                  onPrev={handlePagePrev}
                  onNext={handlePageNext}
                />
              </>
            )}

            {view === "alerts" && (
              <AlertsView
                tenantLabel={tenant.label}
                tenantId={tenant.id}
                demo={demo}
                events={events}
                onSelectEvent={(seq) => {
                  setView("ledger");
                  handleSelect(seq);
                }}
                onOpenLedger={() => setView("ledger")}
              />
            )}

            {view === "checkpoints" && (
              <CheckpointsView
                tenantLabel={tenant.label}
                checkpoint={checkpoint}
                totalEvents={displayCount}
                sealStatus={sealStatus}
                worm={worm}
                status={status}
                brokenSeq={brokenSeq}
                verifying={status === "verifying"}
                verifyProgress={verifyProgress}
                onVerify={handleVerify}
                onCancelVerify={handleCancelVerify}
                onCopy={handleCopy}
              />
            )}
          </div>

          {view === "ledger" && demo && (
            <div className="flex items-center justify-between border-t border-line bg-surface px-8 py-2.5">
              <span className="text-[12px] text-muted">
                Demo environment - explore the tamper-detection flow safely.
              </span>
              <button
                type="button"
                onClick={handleTamper}
                className="flex items-center gap-1.5 rounded-lg border border-tamper/30 bg-tamper-weak px-3 py-1.5 text-[12px] font-medium text-tamper transition-colors hover:bg-tamper/10"
              >
                <BreakGlyph width={13} height={13} />
                Simulate tampering
              </button>
            </div>
          )}
        </main>
      </div>

      {view === "ledger" && (
        <Inspector
          event={selectedEvent}
          recompute={recompute}
          worm={worm}
          proof={eventProof}
          onCopy={handleCopy}
          onClose={() => setSelectedSeq(null)}
        />
      )}

      <AppendModal
        open={appendOpen}
        onClose={() => setAppendOpen(false)}
        onSubmit={handleAppend}
      />
      <Toast message={toast} />
    </div>
  );
}
