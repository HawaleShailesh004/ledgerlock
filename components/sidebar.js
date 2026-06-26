"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldIcon, ChevronDownIcon } from "./icons";
import { truncMid } from "./utils";

function TenantDropdown({ tenants, selected, onChange }) {
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
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-left text-sm text-zinc-100 transition-colors hover:border-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        <span className="truncate font-medium">{selected?.name}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl shadow-black/40"
          >
            {tenants.map((t) => {
              const active = t.id === selected?.id;
              return (
                <li key={t.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {t.name}
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Sidebar({
  tenants,
  selectedTenant,
  onTenantChange,
  merkleRoot,
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[260px] flex-col border-r border-zinc-800/80 bg-zinc-950/95 px-5 py-6">
      {/* Wordmark */}
      <div className="flex items-center gap-2.5">
        <span className="relative inline-flex h-8 w-8 items-center justify-center">
          <motion.span
            className="absolute inset-0 rounded-full bg-emerald-400/30"
            animate={{ scale: [1, 1.9, 1], opacity: [0.5, 0, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
            aria-hidden="true"
          />
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <ShieldIcon className="h-4 w-4" />
          </span>
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-zinc-50">
          Ledger<span className="text-emerald-400">Lock</span>
        </span>
      </div>

      {/* Tenant selector */}
      <div className="mt-8">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Tenant
        </p>
        <TenantDropdown
          tenants={tenants}
          selected={selectedTenant}
          onChange={onTenantChange}
        />
      </div>

      {/* Nav */}
      <nav className="mt-8">
        <ul className="space-y-1">
          <li>
            <span className="flex items-center gap-3 rounded-md border-l-2 border-emerald-400 bg-zinc-900/70 px-3 py-2 text-sm font-medium text-zinc-100">
              Audit Ledger
            </span>
          </li>
          <li>
            <span className="flex cursor-default items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-zinc-500">
              Access Policies
            </span>
          </li>
          <li>
            <span className="flex cursor-default items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-zinc-500">
              Checkpoints
            </span>
          </li>
          <li>
            <span className="flex cursor-default items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-zinc-500">
              Settings
            </span>
          </li>
        </ul>
      </nav>

      {/* WORM checkpoint status */}
      <div className="mt-auto">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5 shadow-sm shadow-black/30">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              WORM Checkpoint
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">S3 Object Lock · Synced</p>
          <div className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500">
            <span className="text-zinc-600">root: </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={merkleRoot}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="text-emerald-400/90"
              >
                {truncMid(merkleRoot, 4, 4)}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </aside>
  );
}
