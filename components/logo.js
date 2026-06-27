const FULL_RATIO = 480 / 120;

/**
 * @param {"full" | "icon"} variant - full wordmark or shield mark only
 * @param {number} height - rendered height in px (width scales for full logo)
 */
export default function Logo({
  variant = "full",
  height = 32,
  className = "",
  priority = false,
}) {
  const shared = {
    className: `block shrink-0 ${className}`.trim(),
    ...(priority ? { fetchPriority: "high" } : {}),
  };

  if (variant === "icon") {
    return (
      <img
        src="/logo-icon.svg"
        alt="LedgerLock"
        width={height}
        height={height}
        {...shared}
      />
    );
  }

  return (
    <img
      src="/logo-ledgerlock.svg"
      alt="LedgerLock"
      width={Math.round(height * FULL_RATIO)}
      height={height}
      {...shared}
    />
  );
}
