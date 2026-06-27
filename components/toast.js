"use client";

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="animate-row-in pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg border border-line-strong bg-primary px-4 py-2 text-[13px] font-medium text-surface shadow-lg"
    >
      {message}
    </div>
  );
}
