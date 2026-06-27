"use client";

export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-10 left-1/2 z-[60] -translate-x-1/2 border border-hairline bg-raised px-3 py-1.5 font-mono text-[12px] text-primary shadow-xl"
    >
      {message}
    </div>
  );
}
