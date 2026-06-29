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
  compact = false,
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
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span
          className={`font-semibold tracking-tight leading-none ${
            compact ? "text-[22px]" : "text-[26px]"
          }`}
          style={{ color }}
        >
          {value}
        </span>
        {label && !compact && (
          <span className="mt-1 max-w-22 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted line-clamp-2">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
