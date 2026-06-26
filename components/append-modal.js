"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ACTION_OPTIONS } from "./utils";

export default function AppendModal({ open, onClose, onSubmit, reduced }) {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState(ACTION_OPTIONS[0]);
  const [flagged, setFlagged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setActor("");
      setAction(ACTION_OPTIONS[0]);
      setFlagged(false);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!actor.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ actor: actor.trim(), action, flagged });
      onClose();
    } catch (err) {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="append-title"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            <h2
              id="append-title"
              className="text-base font-semibold tracking-tight text-zinc-50"
            >
              Append Event
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              A new block will be hashed and chained onto the ledger tail.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="actor"
                  className="mb-1.5 block text-xs font-medium text-zinc-400"
                >
                  Actor
                </label>
                <input
                  id="actor"
                  type="text"
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="dr.reyes@acme.health"
                  autoFocus
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="action"
                  className="mb-1.5 block text-xs font-medium text-zinc-400"
                >
                  Action
                </label>
                <select
                  id="action"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="bg-zinc-900">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={flagged}
                  onChange={(e) => setFlagged(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 accent-emerald-500 focus:ring-emerald-500/30"
                />
                Flag for review
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3.5 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  disabled={submitting || !actor.trim()}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Appending…" : "Append"}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
