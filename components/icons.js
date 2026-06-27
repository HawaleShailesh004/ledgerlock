// Single-weight line icons. All accept className/props and inherit currentColor.

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
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function LedgerGlyph(props) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
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

export function GearGlyph(props) {
  return (
    <svg {...base(props)} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
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
    <svg {...base({ width: 14, height: 14, strokeWidth: 2.2, ...props })} aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export function ShieldCheck(props) {
  return (
    <svg {...base({ width: 16, height: 16, ...props })} aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z" />
      <path d="M9 11.5l2 2 4-4" />
    </svg>
  );
}

export function ShieldAlert(props) {
  return (
    <svg {...base({ width: 16, height: 16, ...props })} aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z" />
      <path d="M12 8v4M12 15.5v.5" />
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
    <svg {...base({ width: 15, height: 15, strokeWidth: 1.9, ...props })} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchGlyph(props) {
  return (
    <svg {...base({ width: 15, height: 15, ...props })} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function CopyGlyph(props) {
  return (
    <svg {...base({ width: 13, height: 13, ...props })} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h8" />
    </svg>
  );
}

export function DownloadGlyph(props) {
  return (
    <svg {...base({ width: 15, height: 15, ...props })} aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

export function CloseGlyph(props) {
  return (
    <svg {...base({ width: 15, height: 15, ...props })} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronRight(props) {
  return (
    <svg {...base({ width: 14, height: 14, strokeWidth: 1.8, ...props })} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function LinkGlyph(props) {
  return (
    <svg {...base({ width: 14, height: 14, ...props })} aria-hidden="true">
      <path d="M10 14a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1" />
      <path d="M14 10a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1" />
    </svg>
  );
}

export function ClockGlyph(props) {
  return (
    <svg {...base({ width: 14, height: 14, ...props })} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
