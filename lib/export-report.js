// Builds a downloadable compliance report (CSV) from the current ledger view.

import { fullStamp } from "@/components/format";

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadComplianceReport({ tenant, events, status, lastVerifyTs }) {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const header = [
    "seq",
    "timestamp",
    "actor",
    "action",
    "flagged",
    "source_ip",
    "prev_hash",
    "hash",
  ];
  const rows = ordered.map((e) =>
    [
      e.seq,
      fullStamp(e.ts),
      e.actor,
      e.action,
      e.flagged ? "yes" : "no",
      e.payload?.ip || "",
      e.prevHash,
      e.hash,
    ]
      .map(csvCell)
      .join(",")
  );

  const meta = [
    `# LedgerLock compliance report`,
    `# organization,${csvCell(tenant.label)}`,
    `# generated,${csvCell(new Date().toISOString())}`,
    `# total_events,${ordered.length}`,
    `# chain_status,${status === "tamper" ? "BROKEN" : status === "verified" ? "INTACT" : "UNVERIFIED"}`,
    `# last_verified,${csvCell(lastVerifyTs || "n/a")}`,
    "",
  ];

  const csv = [...meta, header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledgerlock-${tenant.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
