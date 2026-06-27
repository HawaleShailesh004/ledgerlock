// Minimal, single-weight glyphs for the precision-instrument rail + chrome.
// All accept className/props and inherit currentColor.

function base(props) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

export function ShieldGlyph(props) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z" />
    </svg>
  );
}

export function LedgerGlyph(props) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export function PulseGlyph(props) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </svg>
  );
}

export function ChevronDown(props) {
  return (
    <svg {...base({ width: 14, height: 14, strokeWidth: 1.8, ...props })} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CheckTick(props) {
  return (
    <svg {...base({ width: 14, height: 14, strokeWidth: 2, ...props })} aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export function BreakGlyph(props) {
  return (
    <svg {...base({ width: 14, height: 14, ...props })} aria-hidden="true">
      <path d="M9 7L7 9a3 3 0 000 4l1 1M15 17l2-2a3 3 0 000-4l-1-1" />
      <path d="M8 16l1.5-1.5M16 8l-1.5 1.5" />
    </svg>
  );
}

export function PlusGlyph(props) {
  return (
    <svg {...base({ width: 14, height: 14, strokeWidth: 1.8, ...props })} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ArrowDownRight(props) {
  return (
    <svg {...base({ width: 13, height: 13, ...props })} aria-hidden="true">
      <path d="M7 7l10 10M17 9v8h-8" />
    </svg>
  );
}
