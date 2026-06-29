"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Logo from "./logo";
import { LedgerLockClient } from "@/lib/client";

const TENANTS = [
  { id: "acme", label: "acme-health" },
  { id: "northwind", label: "northwind-bank" },
  { id: "globex", label: "globex-insurance" },
];

function buildPayload(tenantId) {
  return {
    tenantId,
    actor: "ehr.integration",
    action: "PHI_READ",
    payload: {
      subject: "ACME-1042",
      view: "lab-results",
      source: "external-ehr-v1",
    },
    flagged: false,
  };
}

export default function IntegrationDemo() {
  const [tenantId, setTenantId] = useState("acme");
  const [status, setStatus] = useState("idle");
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [lastSeq, setLastSeq] = useState(null);

  const client = useMemo(
    () => new LedgerLockClient(typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

  const payload = buildPayload(tenantId);

  async function sendEvent() {
    setStatus("sending");
    setError(null);
    setResponse(null);
    try {
      const data = await client.appendEvent(payload);
      setResponse(data);
      setLastSeq(data.seq);
      setStatus("ok");
    } catch (e) {
      setError(e.message || "Request failed");
      setStatus("error");
    }
  }

  const clientSnippet = `import { LedgerLockClient } from "@/lib/client";

const ledger = new LedgerLockClient("https://ledgerlock-vert.vercel.app");

await ledger.appendEvent({
  tenantId: "${tenantId}",
  actor: "ehr.integration",
  action: "PHI_READ",
  payload: { subject: "ACME-1042", view: "lab-results" },
});`;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo variant="full" height={32} />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:text-primary"
            >
              Audit console
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
          B2B integration · middleware demo
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-primary">
          External app → LedgerLock API
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-secondary">
          LedgerLock is a{" "}
          <strong className="font-medium text-primary">drop-in audit API</strong>, not
          only a dashboard. Any regulated SaaS calls{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-primary">
            POST /api/events
          </code>{" "}
          via <code className="font-mono text-[12px]">LedgerLockClient</code> — the
          console is for compliance officers reviewing the chain.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-bold text-secondary">
                EHR
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-primary">
                  Hospital EHR (client app)
                </h2>
                <p className="text-[12px] text-muted">Uses LedgerLockClient</p>
              </div>
            </div>

            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Tenant
            </label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="mb-4 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] text-primary"
            >
              {TENANTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.id})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={sendEvent}
              disabled={status === "sending"}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-on-accent shadow-card transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Send audit event → LedgerLock"}
            </button>

            <p className="mt-4 text-[12px] leading-relaxed text-muted">
              CLI equivalent:{" "}
              <code className="block mt-1 rounded bg-surface-2 p-2 font-mono text-[11px] text-secondary">
                npm run integration-demo
              </code>
            </p>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-weak text-[10px] font-bold text-accent">
                API
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-primary">LedgerLock API</h2>
                <p className="font-mono text-[12px] text-muted">POST /api/events</p>
              </div>
            </div>

            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Request body
            </p>
            <pre className="mb-4 max-h-40 overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-primary">
              {JSON.stringify(payload, null, 2)}
            </pre>

            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Response
            </p>
            <pre
              className={`min-h-[88px] overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed ${
                status === "ok"
                  ? "border-verified/30 bg-verified-weak text-verified"
                  : status === "error"
                    ? "border-tamper/30 bg-tamper-weak text-tamper"
                    : "border-line bg-surface-2 text-muted"
              }`}
            >
              {status === "idle" && "// Click send — append via least-privilege IAM"}
              {status === "sending" && "// Appending to DynamoDB…"}
              {status === "ok" && JSON.stringify(response, null, 2)}
              {status === "error" && error}
            </pre>
          </section>
        </div>

        <section className="mt-8 rounded-xl border border-line bg-surface p-5 shadow-card">
          <h2 className="text-[14px] font-semibold text-primary">
            Embed in your SaaS (3 lines)
          </h2>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-[11px] leading-relaxed text-primary">
            {clientSnippet}
          </pre>
        </section>

        {status === "ok" && lastSeq != null && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-verified/25 bg-verified-weak px-5 py-4">
            <div>
              <p className="text-[14px] font-medium text-verified">
                Event #{lastSeq} written to DynamoDB
              </p>
              <p className="mt-1 text-[13px] text-secondary">
                Partition{" "}
                <code className="font-mono text-[12px]">TENANT#{tenantId}</code> · actor{" "}
                <code className="font-mono text-[12px]">ehr.integration</code>
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent shadow-card hover:bg-accent-hover"
            >
              View in audit console →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
