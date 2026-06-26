"use client";

import { AnimatePresence, motion } from "framer-motion";

export default function Toast({ message, reduced }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 shadow-lg shadow-black/40"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
