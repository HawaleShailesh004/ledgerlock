"use client";

import { AnimatePresence, motion } from "framer-motion";
import EventBlock from "./event-block";

export default function ChainTimeline({
  events,
  reduced,
  status,
  brokenSeq,
  ripple,
  newSeq,
  onCopyHash,
}) {
  const brokenIndex =
    status === "tamper" && brokenSeq != null
      ? events.findIndex((e) => e.seq === brokenSeq)
      : -1;

  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-16 text-center">
        <p className="text-sm text-zinc-500">
          No events recorded for this tenant yet.
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Append an event to begin the chain.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Verifying scan-bar walking down the chain */}
      <AnimatePresence>
        {status === "verifying" && !reduced && (
          <motion.div
            key="scanbar"
            className="pointer-events-none absolute inset-x-0 z-20"
            initial={{ top: 0, opacity: 0 }}
            animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          >
            <div className="h-px w-full bg-emerald-400/80 shadow-[0_0_12px_2px_rgba(52,211,153,0.5)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {events.map((event, index) => {
          const tamperActive = brokenIndex !== -1 && index >= brokenIndex;
          return (
            <EventBlock
              key={event.seq}
              event={event}
              index={index}
              isLast={index === events.length - 1}
              isNew={event.seq === newSeq}
              reduced={reduced}
              ripple={ripple}
              tamperActive={tamperActive}
              tamperIsOrigin={index === brokenIndex}
              tamperOrder={tamperActive ? index - brokenIndex : 0}
              onCopyHash={onCopyHash}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
