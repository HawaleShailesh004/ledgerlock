"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";
import VerificationBanner from "@/components/verification-banner";
import ChainTimeline from "@/components/chain-timeline";
import AppendModal from "@/components/append-modal";
import Toast from "@/components/toast";
import {
  buildSeed,
  appendDemo,
  verifyDemo,
  tamperDemo,
} from "@/lib/demo-ledger";

const FALLBACK_TENANTS = [
  { id: "acme", name: "Acme Health" },
  { id: "northwind", name: "Northwind Bank" },
  { id: "globex", name: "Globex Insurance" },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const [tenants, setTenants] = useState(FALLBACK_TENANTS);
  const [tenant, setTenant] = useState(FALLBACK_TENANTS[0]);
  const [events, setEvents] = useState([]); // newest-first
  const [status, setStatus] = useState("idle");
  const [verifyCount, setVerifyCount] = useState(0);
  const [brokenSeq, setBrokenSeq] = useState(null);
  const [ripple, setRipple] = useState(false);
  const [newSeq, setNewSeq] = useState(null);
  const [appendOpen, setAppendOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [flashId, setFlashId] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [demo, setDemo] = useState(false);

  const toastTimer = useRef(null);
  // Demo ledger lives in memory, oldest-first, keyed by tenant id.
  const demoStore = useRef({});
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

  // Publish the in-memory demo chain (stored oldest-first) to the view (newest-first).
  const publishDemo = useCallback((tenantId) => {
    const chain = demoStore.current[tenantId] || [];
    setEvents([...chain].sort((a, b) => b.seq - a.seq));
  }, []);

  // Lazily seed and activate the demo ledger for a tenant.
  const enterDemo = useCallback(
    async (tenantId) => {
      demoActive.current = true;
      setDemo(true);
      if (!demoStore.current[tenantId]) {
        demoStore.current[tenantId] = await buildSeed(tenantId);
      }
      publishDemo(tenantId);
    },
    [publishDemo]
  );

  const loadEvents = useCallback(
    async (tenantId) => {
      setStatus("idle");
      setBrokenSeq(null);
      setRipple(false);
      try {
        const res = await fetch(`/api/events?tenantId=${tenantId}`);
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!res.ok || items.length === 0) {
          // Backend unreachable or empty — fall back to the demo ledger.
          await enterDemo(tenantId);
          return;
        }
        demoActive.current = false;
        setDemo(false);
        // API returns oldest-first; show newest-first.
        items.sort((a, b) => b.seq - a.seq);
        setEvents(items);
      } catch {
        await enterDemo(tenantId);
      }
    },
    [enterDemo]
  );

  // Reload on tenant change
  useEffect(() => {
    loadEvents(tenant.id);
  }, [tenant, loadEvents]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }, []);

  const handleCopyHash = useCallback(
    (value) => {
      if (!value) return;
      navigator.clipboard?.writeText(value).then(
        () => showToast("Hash copied to clipboard"),
        () => showToast("Copy failed")
      );
    },
    [showToast]
  );

  const handleVerify = useCallback(async () => {
    if (status === "verifying") return;
    setStatus("verifying");
    setBrokenSeq(null);
    setRipple(false);
    try {
      const verifyReq = demoActive.current
        ? verifyDemo(demoStore.current[tenant.id] || [])
        : fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: tenant.id }),
          }).then((r) => r.json());

      const [res] = await Promise.all([
        verifyReq,
        delay(reduced ? 150 : 1150), // let the scan-bar walk the chain
      ]);

      setVerifyCount(res?.count ?? events.length);

      if (res?.intact) {
        setStatus("verified");
        setRipple(true);
        const rippleMs = reduced ? 200 : events.length * 100 + 600;
        setTimeout(() => setRipple(false), rippleMs);
      } else {
        const seq = res?.breaks?.[0]?.seq ?? null;
        setBrokenSeq(seq);
        setStatus("tamper");
        setFlashId((n) => n + 1); // viewport red flash, once
      }
    } catch {
      setStatus("idle");
      showToast("Verification request failed");
    }
  }, [status, tenant, events.length, reduced, showToast]);

  const handleAppend = useCallback(
    async ({ actor, action, flagged }) => {
      if (demoActive.current) {
        const { events: next, seq } = await appendDemo(
          tenant.id,
          demoStore.current[tenant.id] || [],
          { actor, action, flagged }
        );
        demoStore.current[tenant.id] = next;
        setStatus("idle");
        setBrokenSeq(null);
        setNewSeq(seq);
        publishDemo(tenant.id);
        showToast(`Event #${seq} appended`);
        setTimeout(() => setNewSeq(null), 1200);
        return;
      }

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
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
      setNewSeq(data.seq);
      await loadEvents(tenant.id);
      showToast(`Event #${data.seq} appended`);
      setTimeout(() => setNewSeq(null), 1200);
    },
    [tenant, loadEvents, showToast, publishDemo]
  );

  // Demo-only: silently corrupt a mid-chain record so "Verify Chain" surfaces it.
  const handleTamper = useCallback(() => {
    if (!demoActive.current) return;
    const { events: next } = tamperDemo(demoStore.current[tenant.id] || []);
    demoStore.current[tenant.id] = next;
    setStatus("idle");
    setBrokenSeq(null);
    setRipple(false);
    publishDemo(tenant.id);
    showToast("Record silently altered — run Verify Chain");
  }, [tenant, publishDemo, showToast]);

  const merkleRoot = events[0]?.hash || "GENESIS";

  return (
    <div className="relative min-h-screen">
      <Sidebar
        tenants={tenants}
        selectedTenant={tenant}
        onTenantChange={setTenant}
        merkleRoot={merkleRoot}
      />

      <main className="ml-[260px] min-h-screen">
        <div className="mx-auto max-w-4xl px-10 py-8">
          <TopBar
            tenantName={tenant.name}
            count={events.length}
            onAppend={() => setAppendOpen(true)}
            onVerify={handleVerify}
            verifying={status === "verifying"}
            demo={demo}
            onTamper={handleTamper}
          />

          <div className="mt-6">
            <AnimatePresence mode="wait">
              <VerificationBanner
                key={status}
                status={status}
                count={verifyCount || events.length}
                brokenSeq={brokenSeq}
                reduced={reduced}
              />
            </AnimatePresence>
          </div>

          <div className="mt-8">
            <ChainTimeline
              events={events}
              reduced={reduced}
              status={status}
              brokenSeq={brokenSeq}
              ripple={ripple}
              newSeq={newSeq}
              onCopyHash={handleCopyHash}
            />
          </div>
        </div>
      </main>

      <AppendModal
        open={appendOpen}
        onClose={() => setAppendOpen(false)}
        onSubmit={handleAppend}
        reduced={reduced}
      />

      <Toast message={toast} reduced={reduced} />

      {/* Viewport red flash on tamper — fires once per detection */}
      {flashId > 0 && !reduced && (
        <div
          key={flashId}
          className="tamper-flash pointer-events-none fixed inset-0 z-[55]"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
