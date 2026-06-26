"use client";

import { motion } from "framer-motion";

function ShieldCheckDraw({ reduced }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-6 w-6 text-emerald-400"
      aria-hidden="true"
    >
      <motion.path
        d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      <motion.path
        d="M8.5 11.8l2.2 2.2 4.3-4.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.45 }}
      />
    </svg>
  );
}

function BrokenLinkSplit({ reduced }) {
  return (
    <svg
      viewBox="0 0 32 24"
      fill="none"
      className="h-6 w-8 text-red-400"
      aria-hidden="true"
    >
      {/* left half */}
      <motion.g
        initial={reduced ? false : { x: 2, rotate: 0 }}
        animate={{ x: -1.5, rotate: -8 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ transformOrigin: "16px 12px" }}
      >
        <path
          d="M14 7H9a5 5 0 0 0 0 10h5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.5 12H14"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </motion.g>
      {/* right half */}
      <motion.g
        initial={reduced ? false : { x: -2, rotate: 0 }}
        animate={{ x: 1.5, rotate: 8 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ transformOrigin: "16px 12px" }}
      >
        <path
          d="M18 7h5a5 5 0 0 1 0 10h-5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.5 12H18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </motion.g>
    </svg>
  );
}

export default function VerificationBanner({
  status,
  count,
  brokenSeq,
  reduced,
}) {
  if (status === "tamper") {
    return (
      <motion.div
        key="tamper"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`relative flex items-center gap-3 overflow-hidden rounded-xl border border-red-500/50 bg-red-500/10 px-5 py-4 ${
          reduced ? "" : "tamper-shake"
        }`}
        role="alert"
      >
        <BrokenLinkSplit reduced={reduced} />
        <p className="text-sm font-medium text-red-200">
          <span className="mr-1.5 font-semibold">⚠ TAMPER DETECTED</span>
          at event #{brokenSeq} — hash mismatch; chain diverges from S3
          checkpoint
        </p>
      </motion.div>
    );
  }

  if (status === "verified") {
    return (
      <motion.div
        key="verified"
        initial={reduced ? false : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 backdrop-blur-sm ${
          reduced ? "" : "verify-sweep"
        }`}
        role="status"
      >
        <ShieldCheckDraw reduced={reduced} />
        <p className="text-sm font-medium text-emerald-200">
          Chain intact — {count} events verified against WORM checkpoint
        </p>
      </motion.div>
    );
  }

  if (status === "verifying") {
    return (
      <motion.div
        key="verifying"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-5 py-4"
        role="status"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <motion.span
            className="h-3.5 w-3.5 rounded-full border-2 border-emerald-400/30 border-t-emerald-400"
            animate={reduced ? {} : { rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
        </span>
        <p className="text-sm font-medium text-emerald-200/90">
          Verifying chain…
        </p>
      </motion.div>
    );
  }

  // idle
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
      <span className="h-2 w-2 rounded-full bg-zinc-600" />
      <p className="text-sm text-zinc-400">
        Chain not yet verified this session — run{" "}
        <span className="font-medium text-zinc-300">Verify Chain</span> to
        validate against the WORM checkpoint.
      </p>
    </div>
  );
}
