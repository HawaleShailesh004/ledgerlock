"use client";

import { ACTION_META } from "./format";
import { PlusGlyph } from "./icons";

const LEGEND = [
  ["PHI_READ", ACTION_META.PHI_READ],
  ["RECORD_UPDATE", ACTION_META.RECORD_UPDATE],
  ["EXPORT", ACTION_META.EXPORT],
  ["BREAK_THE_GLASS", ACTION_META.BREAK_THE_GLASS],
];

export default function ColumnHeader({ onAppend, demo, onTamper }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline px-5 py-2">
      <div className="flex items-center gap-4">
        <span className="label">audit chain</span>
        <div className="hidden items-center gap-3 lg:flex">
          {LEGEND.map(([name, meta]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={
                  meta.hollow
                    ? { border: `1px solid ${meta.color}` }
                    : { backgroundColor: meta.color }
                }
              />
              <span className="label !text-[9px]">{name}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {demo && (
          <button
            type="button"
            onClick={onTamper}
            className="rounded-sm border border-tamper/40 px-2 py-1 font-mono text-[11px] text-tamper transition-colors duration-150 hover:bg-tamper/10"
            title="Demo: silently alter a sealed record"
          >
            Simulate Tamper
          </button>
        )}
        <button
          type="button"
          onClick={onAppend}
          className="flex items-center gap-1.5 rounded-sm border border-hairline px-2 py-1 font-mono text-[12px] text-secondary transition-colors duration-150 hover:border-steel/50 hover:text-steel"
        >
          <PlusGlyph />
          Append
        </button>
      </div>
    </div>
  );
}
