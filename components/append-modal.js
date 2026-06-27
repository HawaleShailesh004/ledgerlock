"use client";

import { useEffect, useState } from "react";
import { ACTION_META, ACTION_OPTIONS } from "./format";
import { CloseGlyph, PlusGlyph } from "./icons";

const DEFAULT_ACTORS = [
  "dr.patel@acme-health.org",
  "nurse.lee@acme-health.org",
  "billing@acme-health.org",
  "admin@acme-health.org",
];

export default function AppendModal({ open, onClose, onSubmit }) {
  const [actor, setActor] = useState(DEFAULT_ACTORS[0]);
  const [action, setAction] = useState(ACTION_OPTIONS[0]);
  const [flagged, setFlagged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setActor(DEFAULT_ACTORS[0]);
      setAction(ACTION_OPTIONS[0]);
      setFlagged(false);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!actor.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ actor: actor.trim(), action, flagged });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-primary/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <form
        onSubmit={submit}
        className="animate-row-in relative w-full max-w-md rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-[16px] font-semibold tracking-tight text-primary">
            Log a new event
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-primary"
            aria-label="Close"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-secondary">
              Actor
            </label>
            <input
              list="actor-options"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-primary outline-none transition-colors focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent-weak"
              placeholder="name@org.com"
            />
            <datalist id="actor-options">
              {DEFAULT_ACTORS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-secondary">
              Action
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_OPTIONS.map((key) => {
                const active = action === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAction(key)}
                    className={`rounded-lg border px-3 py-2 text-left text-[12.5px] font-medium transition-colors ${
                      active
                        ? "border-accent bg-accent-weak text-accent"
                        : "border-line bg-surface-2 text-secondary hover:border-line-strong hover:text-primary"
                    }`}
                  >
                    {ACTION_META[key].short}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => setFlagged(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            <span className="text-[13px] text-secondary">
              Flag this event for review
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-70"
          >
            <PlusGlyph width={14} height={14} />
            {submitting ? "Appending…" : "Append to ledger"}
          </button>
        </div>
      </form>
    </div>
  );
}
