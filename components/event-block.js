"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { actionMeta, truncMid } from "./utils";
import { CopyIcon } from "./icons";

export default function EventBlock({
  event,
  index,
  isLast,
  isNew,
  reduced,
  ripple,
  tamperActive,
  tamperIsOrigin,
  tamperOrder,
  onCopyHash,
}) {
  const [hovered, setHovered] = useState(false);
  const meta = actionMeta(event.action);
  const rippleDelay = reduced ? 0 : index * 0.1;
  const cascadeDelay = reduced ? 0 : tamperOrder * 0.15;

  // Rail line color reacts to tamper cascade.
  const lineBroken = tamperActive && tamperIsOrigin;

  return (
    <motion.div
      layout
      initial={
        isNew && !reduced
          ? { opacity: 0, y: -28 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="relative pl-16"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ paddingBottom: isLast ? 0 : 24 }}
    >
      {/* Left rail: seq circle + connector */}
      <div className="absolute inset-y-0 left-0 flex w-12 flex-col items-center">
        <motion.div
          className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold transition-colors ${
            tamperActive
              ? "border-red-500/60 bg-red-500/10 text-red-300"
              : "border-zinc-700 bg-zinc-900 text-zinc-300"
          }`}
          animate={
            ripple && !reduced
              ? {
                  borderColor: ["#3f3f46", "#34d399", "#3f3f46"],
                  color: ["#d4d4d8", "#6ee7b7", "#d4d4d8"],
                  scale: [1, 1.12, 1],
                }
              : {}
          }
          transition={{ duration: 0.4, delay: rippleDelay }}
        >
          {event.seq}
        </motion.div>

        {/* Connector line to next block */}
        {!isLast && (
          <div className="relative w-px flex-1">
            {lineBroken ? (
              <>
                <motion.span
                  className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-red-500/70"
                  initial={reduced ? false : { rotate: 0, x: "-50%" }}
                  animate={{ rotate: -10 }}
                  style={{ transformOrigin: "top" }}
                  transition={{ duration: 0.3 }}
                />
                <motion.span
                  className="absolute bottom-0 left-1/2 h-1/2 w-px -translate-x-1/2 bg-red-500/70"
                  initial={reduced ? false : { rotate: 0, x: "-50%" }}
                  animate={{ rotate: 10 }}
                  style={{ transformOrigin: "bottom" }}
                  transition={{ duration: 0.3 }}
                />
              </>
            ) : (
              <motion.span
                className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 ${
                  tamperActive
                    ? "bg-red-500/40"
                    : hovered
                    ? "bg-emerald-400/50"
                    : "bg-zinc-800"
                }`}
                initial={
                  isNew && !reduced
                    ? { scaleY: 0 }
                    : false
                }
                animate={{ scaleY: 1 }}
                style={{ transformOrigin: "top" }}
                transition={{ duration: 0.4, delay: 0.12 }}
              />
            )}
          </div>
        )}
      </div>

      {/* Card */}
      <motion.div
        className="rounded-xl border bg-zinc-900/80 px-4 py-3.5 shadow-sm shadow-black/20"
        animate={{
          borderColor: tamperActive
            ? "rgba(239,68,68,0.55)"
            : "rgba(39,39,42,1)",
          boxShadow: tamperActive
            ? "inset 3px 0 0 0 rgba(239,68,68,0.7)"
            : "inset 0 0 0 0 rgba(0,0,0,0)",
        }}
        transition={{ duration: 0.3, delay: cascadeDelay }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight ${meta.tag}`}
            >
              {meta.alert && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
              {meta.label}
            </span>
            {event.flagged && (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300 ring-1 ring-inset ring-amber-500/30">
                Flagged
              </span>
            )}
          </div>

          {tamperActive && tamperIsOrigin && (
            <motion.span
              initial={reduced ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300 ring-1 ring-inset ring-red-500/50"
            >
              Hash Mismatch
            </motion.span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <span className="text-zinc-400">{event.actor}</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono">{event.ts}</span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => onCopyHash(event.hash)}
            className="group inline-flex items-center gap-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            title="Copy hash"
          >
            <span className="text-zinc-600">sha256:</span>
            <span>{truncMid(event.hash)}</span>
            <CopyIcon className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onClick={() => onCopyHash(event.prevHash)}
            className={`group inline-flex items-center gap-1.5 transition-colors hover:text-zinc-200 ${
              hovered ? "text-emerald-300/80" : "text-zinc-500"
            }`}
            title="Copy previous hash"
          >
            <span className={hovered ? "text-emerald-500/70" : "text-zinc-600"}>
              prev:
            </span>
            <span>{truncMid(event.prevHash)}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
