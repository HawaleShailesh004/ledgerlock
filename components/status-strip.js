"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "./icons";

function TenantSelector({ tenants, tenant, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 font-mono text-[13px] text-primary transition-colors duration-150 hover:text-steel"
      >
        <span className="text-label">tenant:</span>
        <span className="text-primary">{tenant.label}</span>
        <ChevronDown className="text-secondary" />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-50 min-w-[180px] border border-hairline bg-raised py-1 shadow-xl">
          {tenants.map((t) => {
            const active = t.id === tenant.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 font-mono text-[13px] transition-colors duration-150 ${
                  active
                    ? "bg-steel/10 text-steel"
                    : "text-secondary hover:bg-panel hover:text-primary"
                }`}
              >
                {t.label}
                {active && <span className="text-steel">●</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VerifyChip({ status, brokenSeq }) {
  if (status === "verifying") {
    return (
      <span className="font-mono text-[13px] text-steel">
        verify: <span className="animate-pulse">scanning…</span>
      </span>
    );
  }
  if (status === "tamper") {
    return (
      <span className="font-mono text-[13px] font-medium text-tamper">
        TAMPER @ #{brokenSeq}
      </span>
    );
  }
  if (status === "verified") {
    return (
      <span className="font-mono text-[13px] text-steel">verify: intact</span>
    );
  }
  return <span className="font-mono text-[13px] text-secondary">verify: idle</span>;
}

export default function StatusStrip({
  tenants,
  tenant,
  onTenantChange,
  count,
  checkpointCount,
  status,
  brokenSeq,
  onVerify,
  verifying,
}) {
  return (
    <div className="flex h-8 items-center justify-between border-b border-hairline bg-panel px-4">
      <TenantSelector tenants={tenants} tenant={tenant} onChange={onTenantChange} />

      <div className="flex items-center gap-5">
        <span className="font-mono text-[13px] text-secondary">
          <span className="text-label">events:</span>{" "}
          <span className="text-primary">{count}</span>
        </span>
        <span className="hidden font-mono text-[13px] text-secondary sm:inline">
          <span className="text-label">checkpoint:</span>{" "}
          <span className="text-primary">
            {checkpointCount != null ? `#${checkpointCount}` : "—"}
          </span>
        </span>

        <span className="h-3.5 w-px bg-hairline" aria-hidden="true" />

        <VerifyChip status={status} brokenSeq={brokenSeq} />

        <button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          className="rounded-sm border border-steel/40 bg-steel/10 px-2.5 py-1 font-mono text-[12px] font-medium text-steel transition-colors duration-150 hover:bg-steel/20 disabled:opacity-50"
        >
          {verifying ? "Verifying…" : "Verify Chain"}
        </button>
      </div>
    </div>
  );
}
