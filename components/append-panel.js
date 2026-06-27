"use client";

import { useState } from "react";
import { ACTIONS } from "@/lib/demo-ledger";

export default function AppendPanel({ open, onClose, onSubmit }) {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState(ACTIONS[0]);
  const [flagged, setFlagged] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    if (!actor.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ actor: actor.trim(), action, flagged });
      setActor("");
      setAction(ACTIONS[0]);
      setFlagged(false);
      onClose();
    } catch {
      // parent surfaces the error toast
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-hairline bg-raised">
      <div className="flex h-9 items-center border-b border-hairline px-4">
        <span className="label">append event</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto font-mono text-[12px] text-label transition-colors duration-150 hover:text-secondary"
        >
          esc
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3 px-4 py-3">
        <div>
          <label className="label mb-1 block" htmlFor="ap-actor">
            actor
          </label>
          <input
            id="ap-actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="user@tenant.com"
            autoFocus
            className="w-full rounded-sm border border-hairline bg-canvas px-2 py-1.5 font-mono text-[13px] text-primary outline-none transition-colors duration-150 placeholder:text-label focus:border-steel/60"
          />
        </div>

        <div>
          <label className="label mb-1 block" htmlFor="ap-action">
            action
          </label>
          <select
            id="ap-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-sm border border-hairline bg-canvas px-2 py-1.5 font-mono text-[13px] text-primary outline-none transition-colors duration-150 focus:border-steel/60"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a} className="bg-canvas">
                {a}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center justify-between">
          <span className="label">flag for review</span>
          <button
            type="button"
            role="switch"
            aria-checked={flagged}
            onClick={() => setFlagged((f) => !f)}
            className="relative h-4 w-7 rounded-full border transition-colors duration-150"
            style={{
              borderColor: flagged ? "var(--color-steel)" : "var(--color-hairline)",
              backgroundColor: flagged ? "rgba(63,182,196,0.2)" : "transparent",
            }}
          >
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all duration-150"
              style={{
                left: flagged ? "14px" : "2px",
                backgroundColor: flagged ? "var(--color-steel)" : "var(--color-label)",
              }}
            />
          </button>
        </label>

        <button
          type="submit"
          disabled={busy || !actor.trim()}
          className="w-full rounded-sm border border-steel/40 bg-steel/10 py-1.5 font-mono text-[13px] font-medium text-steel transition-colors duration-150 hover:bg-steel/20 disabled:opacity-40"
        >
          {busy ? "Appending…" : "Append"}
        </button>
      </form>
    </div>
  );
}
