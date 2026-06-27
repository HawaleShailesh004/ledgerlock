"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Sidebar from "@/components/sidebar";
import ConfidenceHeader from "@/components/confidence-header";
import LedgerToolbar from "@/components/ledger-toolbar";
import LedgerList from "@/components/ledger-list";
import Inspector from "@/components/inspector";
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
import { downloadComplianceReport } from "@/lib/export-report";

const FALLBACK_TENANTS = [
  { id: "acme", label: "acme-health" },
  { id: "northwind", label: "northwind-bank" },
  { id: "globex", label: "globex-insurance" },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const [tenants, setTenants] = useState(FALLBACK_TENANTS);
  const [tenant, setTenant] = useState(FALLBACK_TENANTS[0]);
  const [events, setEvents] = useState([]); // newest-first
  const [checkpoint, setCheckpoint] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|verifying|verified|tamper
  const [brokenSeq, setBrokenSeq] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [recompute, setRecompute] = useState(null);
  const [worm, setWorm] = useState(null);
  const [newSeq, setNewSeq] = useState(null);
  const [appendOpen, setAppendOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [reduced, setReduced] = useState(false);
  const [demo, setDemo] = useState(false);
  const [lastVerifyTs, setLastVerifyTs] = useState(null);

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

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    tenantRef.current = tenant;
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
        setTenant((cur) => d.tenants.find((t) => t.id === cur.id) || d.tenants[0]);
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

  const publishDemo = useCallback((tenantId) => {
    const chain = demoStore.current[tenantId] || [];
    setEvents([...chain].sort((a, b) => b.seq - a.seq));
    setCheckpoint(demoCheckpoints.current[tenantId] || null);
  }, []);

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
    [publishDemo]
  );

  const loadEvents = useCallback(
    async (tenantId) => {
      setStatus("idle");
      setBrokenSeq(null);
      setVerifyResult(null);
      setWorm(null);
      setSelectedSeq(null);
      try {
        const [evRes, cpRes] = await Promise.all([
          fetch(`/api/events?tenantId=${tenantId}`),
          fetch(`/api/checkpoint?tenantId=${tenantId}`).catch(() => null),
        ]);
        const data = await evRes.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!evRes.ok || items.length === 0) {
          await enterDemo(tenantId);
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
      } catch {
        await enterDemo(tenantId);
      }
    },
    [enterDemo]
  );

  useEffect(() => {
    loadEvents(tenant.id);
  }, [tenant, loadEvents]);

  const handleCopy = useCallback(
    (value) => {
      if (!value) return;
      navigator.clipboard?.writeText(value).then(
        () => showToast("Copied to clipboard"),
        () => showToast("Copy failed")
      );
    },
    [showToast]
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
    [refreshRecompute]
  );

  const handleCursorSeq = useCallback(
    (seq) => {
      setSelectedSeq(seq);
      refreshRecompute(seq);
    },
    [refreshRecompute]
  );

  const handleVerify = useCallback(async () => {
    if (status === "verifying") return;
    setStatus("verifying");
    setBrokenSeq(null);
    setWorm(null);
    try {
      const tid = tenant.id;
      const verifyReq = demoActive.current
        ? verifyDemo(demoStore.current[tid] || [], demoCheckpoints.current[tid])
        : Promise.all([
            fetch("/api/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tenantId: tid }),
            }).then((r) => r.json()),
            fetch(`/api/checkpoint?tenantId=${tid}`)
              .then((r) => r.json())
              .catch(() => ({ checkpoint: null })),
          ]).then(([v, c]) => {
            if (c?.checkpoint) setCheckpoint(c.checkpoint);
            return v;
          });

      const walkMs = reduced ? 150 : Math.max(900, events.length * 45 + 250);
      const [res] = await Promise.all([verifyReq, delay(walkMs)]);
      setVerifyResult(res);
      setLastVerifyTs(
        new Date().toLocaleTimeString("en-US", { hour12: false })
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
        showToast(`Chain intact — ${res.count} events verified`);
      } else {
        const seq = res?.breaks?.[0]?.seq ?? null;
        setBrokenSeq(seq);
        setStatus("tamper");
        setSelectedSeq(seq);
        refreshRecompute(seq);
        showToast(`Integrity breach detected at #${seq}`);
      }
    } catch {
      setStatus("idle");
      showToast("Verification request failed");
    }
  }, [status, tenant, events.length, reduced, checkpoint, showToast, refreshRecompute]);

  const handleAppend = useCallback(
    async ({ actor, action, flagged }) => {
      const tid = tenant.id;
      if (demoActive.current) {
        const { events: next, seq } = await appendDemo(
          tid,
          demoStore.current[tid] || [],
          { actor, action, flagged }
        );
        demoStore.current[tid] = next;
        setStatus("idle");
        setBrokenSeq(null);
        setWorm(null);
        setNewSeq(seq);
        publishDemo(tid);
        showToast(`Event #${seq} logged`);
        setTimeout(() => setNewSeq(null), 1400);
        return;
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tid, actor, action, payload: {}, flagged }),
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
      await loadEvents(tid);
      showToast(`Event #${data.seq} logged`);
      setTimeout(() => setNewSeq(null), 1400);
    },
    [tenant, loadEvents, showToast, publishDemo]
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
    showToast(`Record #${seq} silently altered — run verification`);
  }, [tenant, publishDemo, showToast]);

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
        const hay = `${e.actor} ${e.action} ${e.hash} ${e.prevHash}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, query, actionFilter, flaggedOnly]);

  const selectedEvent = events.find((e) => e.seq === selectedSeq) || null;
  const checkpointCount = checkpoint?.count ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        tenants={tenants}
        tenant={tenant}
        onTenantChange={setTenant}
        demo={demo}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main ledger column */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <ConfidenceHeader
              tenantLabel={tenant.label}
              count={events.length}
              checkpointCount={checkpointCount}
              status={status}
              brokenSeq={brokenSeq}
              lastVerifyTs={lastVerifyTs}
              verifying={status === "verifying"}
              onVerify={handleVerify}
            />

            <LedgerToolbar
              query={query}
              onQuery={setQuery}
              actionFilter={actionFilter}
              onActionFilter={setActionFilter}
              flaggedOnly={flaggedOnly}
              onFlaggedOnly={setFlaggedOnly}
              resultCount={filtered.length}
              totalCount={events.length}
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
              onSelect={handleSelect}
              onCursorSeq={handleCursorSeq}
            />
          </div>

          {demo && (
            <div className="flex items-center justify-between border-t border-line bg-surface px-8 py-2.5">
              <span className="text-[12px] text-muted">
                Demo environment — explore the tamper-detection flow safely.
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

        <Inspector
          event={selectedEvent}
          recompute={recompute}
          worm={worm}
          onCopy={handleCopy}
          onClose={() => setSelectedSeq(null)}
        />
      </div>

      <AppendModal
        open={appendOpen}
        onClose={() => setAppendOpen(false)}
        onSubmit={handleAppend}
      />
      <Toast message={toast} />
    </div>
  );
}
