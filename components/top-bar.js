"use client";

import { motion } from "framer-motion";
import { LockIcon, PlusIcon } from "./icons";

export default function TopBar({
  tenantName,
  count,
  onAppend,
  onVerify,
  verifying,
  demo,
  onTamper,
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-zinc-800/70 pb-6">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Audit Ledger
          </h1>
          {demo && (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-400">
              Demo data
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {tenantName} · {count} {count === 1 ? "event" : "events"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {demo && (
          <motion.button
            type="button"
            onClick={onTamper}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
            title="Silently alter a record to demonstrate tamper detection"
          >
            Simulate Tamper
          </motion.button>
        )}
        <motion.button
          type="button"
          onClick={onAppend}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
        >
          <PlusIcon className="h-4 w-4 text-zinc-400" />
          Append Event
        </motion.button>
        <motion.button
          type="button"
          onClick={onVerify}
          disabled={verifying}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-900/40 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LockIcon className="h-4 w-4" strokeWidth={2} />
          {verifying ? "Verifying…" : "Verify Chain"}
        </motion.button>
      </div>
    </header>
  );
}
