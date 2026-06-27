"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import LeftRail from "@/components/left-rail";
import StatusStrip from "@/components/status-strip";
import ColumnHeader from "@/components/column-header";
import LedgerColumn from "@/components/ledger-column";
import Inspector from "@/components/inspector";
import AppendPanel from "@/components/append-panel";
import TelemetryBar from "@/components/telemetry-bar";
import Toast from "@/components/toast";
import {
  buildSeed,
  buildCheckpoint,
  appendDemo,
  verifyDemo,
  tamperDemo,
  recomputeRow,
} from "@/lib/demo-ledger";

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
  const [verifyResult, setVerifyResult] = useState(null); // raw verify response
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [cursorSeq, setCursorSeq] = useState(null);
  const [recompute, setRecompute] = useState(null);
  const [worm, setWorm] = useState(null);
  const [newSeq, setNewSeq] = useState(null);
  const [appendOpen, setAppendOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [reduced, setReduced] = useState(false);
  const [demo, setDemo] = useState(false);
  const [lastVerifyTs, setLastVerifyTs] = useState(null);

  const toastTimer = useRef(null);
  const demoStore = useRef({}); // tenantId -> oldest-first chain
  const demoCheckpoints = useRef({}); // tenantId -> checkpoint
  const demoActive = useRef(false);

  // prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Load tenants once
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
    toastTimer.current = setTimeout(() => setToast(""), 1600);
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
        () => showToast("copied"),
        () => showToast("copy failed")
      );
    },
    [showToast]
  );

  // Recompute the inspector's recompute view for a given seq from current data.
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

  // refs so the cursor callback always sees fresh data without re-subscribing
  const eventsRef = useRef(events);
  const tenantRef = useRef(tenant);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    tenantRef.current = tenant;
  }, [tenant]);

  const handleCursorSeq = useCallback(
    (seq) => {
      setCursorSeq(seq);
      setSelectedSeq(seq);
      refreshRecompute(seq);
    },
    [refreshRecompute]
  );

  const handleSelect = useCallback(
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

      const walkMs = reduced ? 120 : Math.max(900, events.length * 60 + 200);
      const [res] = await Promise.all([verifyReq, delay(walkMs)]);
      setVerifyResult(res);
      setLastVerifyTs(new Date().toLocaleTimeString("en-US", { hour12: false }));

      // Build WORM cross-check panel
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
      } else {
        const seq = res?.breaks?.[0]?.seq ?? null;
        setBrokenSeq(seq);
        setStatus("tamper");
        setSelectedSeq(seq);
        refreshRecompute(seq);
      }
    } catch {
      setStatus("idle");
      showToast("verification request failed");
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
        showToast(`event #${seq} appended`);
        setTimeout(() => setNewSeq(null), 1200);
        return;
      }
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tid, actor, action, payload: {}, flagged }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        showToast(data?.error || "append failed");
        throw new Error("append_failed");
      }
      setStatus("idle");
      setBrokenSeq(null);
      setWorm(null);
      setNewSeq(data.seq);
      await loadEvents(tid);
      showToast(`event #${data.seq} appended`);
      setTimeout(() => setNewSeq(null), 1200);
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
    showToast(`record #${seq} silently altered — run Verify Chain`);
  }, [tenant, publishDemo, showToast]);

  const selectedEvent = events.find((e) => e.seq === selectedSeq) || null;
  const checkpointCount = checkpoint?.count ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <LeftRail
        statusColor={
          status === "tamper" ? "var(--color-tamper)" : "var(--color-steel)"
        }
        statusTitle={status === "tamper" ? "integrity breach" : "operational"}
      />

      <div className="flex flex-1 flex-col overflow-hidden pl-16">
        <StatusStrip
          tenants={tenants}
          tenant={tenant}
          onTenantChange={setTenant}
          count={events.length}
          checkpointCount={checkpointCount}
          status={status}
          brokenSeq={brokenSeq}
          onVerify={handleVerify}
          verifying={status === "verifying"}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* center ledger column — the dominant element */}
          <main className="flex flex-1 flex-col overflow-hidden">
            <ColumnHeader
              onAppend={() => setAppendOpen(true)}
              demo={demo}
              onTamper={handleTamper}
            />
            <div className="flex-1 overflow-y-auto">
              <LedgerColumn
                events={events}
                selectedSeq={selectedSeq}
                newSeq={newSeq}
                status={status}
                brokenSeq={brokenSeq}
                reduced={reduced}
                onSelect={handleSelect}
                onCopyHash={handleCopy}
                onCursorSeq={handleCursorSeq}
              />
            </div>
          </main>

          <Inspector
            event={selectedEvent}
            recompute={recompute}
            worm={worm}
            onCopy={handleCopy}
            appendSlot={
              <AppendPanel
                open={appendOpen}
                onClose={() => setAppendOpen(false)}
                onSubmit={handleAppend}
              />
            }
          />
        </div>

        <TelemetryBar
          status={status}
          count={events.length}
          brokenSeq={brokenSeq}
          checkpointCount={checkpointCount}
          demo={demo}
          lastVerifyTs={lastVerifyTs}
        />
      </div>

      <Toast message={toast} />
    </div>
  );
}
