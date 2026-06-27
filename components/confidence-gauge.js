"use client";

import { useEffect, useState } from "react";

// Animated trust ring. `pct` 0–100, `tone` selects the color.
export default function ConfidenceGauge({
  pct = 100,
  tone = "accent", // accent | verified | tamper | idle
  size = 132,
  label,
  value,
  spinning = false,
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (shown / 100) * c;

  const color =
    tone === "tamper"
      ? "var(--color-tamper)"
      : tone === "verified"
        ? "var(--color-verified)"
        : "var(--color-accent)";

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={`-rotate-90 ${spinning ? "animate-spin [animation-duration:1.4s]" : ""}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={spinning ? c * 0.7 : offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[26px] font-semibold tracking-tight"
          style={{ color }}
        >
          {value}
        </span>
        {label && (
          <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
