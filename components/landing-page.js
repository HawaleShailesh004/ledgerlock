import Link from "next/link";
import Logo from "./logo";
import { SealGlyph } from "./icons";

const LAYERS = [
  {
    title: "Conditional append",
    body: "Every write is a PutItem with attribute_not_exists(SK). No overwrite path exists in the API.",
  },
  {
    title: "Least-privilege IAM",
    body: "The app role has PutItem and Query only - no UpdateItem, no DeleteItem. Immutability is a permission you don't have.",
  },
  {
    title: "WORM checkpoints",
    body: "DynamoDB Streams → Lambda → S3 Object Lock. Merkle roots are sealed in COMPLIANCE mode and cannot be altered.",
  },
];

const FLOW = [
  { label: "Next.js API", detail: "Append · Query · Verify" },
  { label: "DynamoDB", detail: "Hash-chained events" },
  { label: "Streams", detail: "NEW_IMAGE feed" },
  { label: "Lambda", detail: "Merkle seal" },
  { label: "S3 Object Lock", detail: "WORM proof" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo variant="full" height={36} priority />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/integrate"
              className="rounded-lg border border-line bg-surface px-4 py-2 text-[13.5px] font-medium text-secondary transition-colors hover:text-primary"
            >
              Integration demo
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-4 py-2 text-[13.5px] font-medium text-on-accent shadow-card transition-colors hover:bg-accent-hover"
            >
              Open console
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-wash border-b border-line">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <Logo variant="full" height={48} className="mb-8 md:h-14" priority />
            <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
              Tamper-evident audit trail · Amazon DynamoDB
            </p>
            <h1 className="max-w-3xl text-[2.5rem] font-semibold leading-[1.12] tracking-tight text-primary md:text-[3.25rem]">
              Audit logs that prove they weren&apos;t altered
            </h1>
            <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-secondary">
              A drop-in API for regulated SaaS - HIPAA, SOC2, SEC 17a-4.
              Append-only writes, SHA-256 hash chains, and WORM checkpoints that
              catch tampering even when someone has database admin access.
            </p>
            <blockquote className="mt-8 border-l-2 border-accent pl-4 text-[15px] italic text-secondary">
              &ldquo;Immutability isn&apos;t a rule we follow - it&apos;s a
              permission we don&apos;t have.&rdquo;
            </blockquote>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent shadow-raised transition-colors hover:bg-accent-hover"
              >
                <span className="rounded-md bg-white/15 p-0.5">
                  <Logo variant="icon" height={18} />
                </span>
                Launch audit console
              </Link>
              <Link
                href="/integrate"
                className="rounded-lg border border-line bg-surface px-5 py-2.5 text-[14px] font-medium text-secondary transition-colors hover:border-line-strong hover:text-primary"
              >
                Integration demo
              </Link>
              <a
                href="#architecture"
                className="rounded-lg border border-line bg-surface px-5 py-2.5 text-[14px] font-medium text-secondary transition-colors hover:border-line-strong hover:text-primary"
              >
                See architecture
              </a>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
              Three enforced layers
            </h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {LAYERS.map(({ title, body }, i) => (
                <article
                  key={title}
                  className="rounded-xl border border-line bg-surface-2 p-6 shadow-card"
                >
                  <span className="font-mono text-[12px] text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-[16px] font-semibold text-primary">
                    {title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-secondary">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="architecture" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
              Architecture
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-secondary">
              Single-table DynamoDB design with partition-per-tenant isolation.
              The demo console verifies hash chains live and cross-checks
              against immutable S3 checkpoints.
            </p>
            <div className="mt-8 flex flex-wrap items-stretch gap-2 md:gap-0">
              {FLOW.map(({ label, detail }, i) => (
                <div key={label} className="flex items-center">
                  <div className="min-w-[140px] rounded-lg border border-line bg-surface px-4 py-3 shadow-card md:min-w-[160px]">
                    <div className="text-[13px] font-semibold text-primary">
                      {label}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted">
                      {detail}
                    </div>
                  </div>
                  {i < FLOW.length - 1 && (
                    <span
                      className="hidden px-2 font-mono text-[14px] text-muted md:inline"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
              The demo moment
            </h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="text-[18px] font-semibold text-primary">
                  Edit a row. Watch it get caught.
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-secondary">
                  Open the audit console, verify a clean chain, then tamper with
                  a historical event in the DynamoDB console. Click Verify Chain
                  - the system pinpoints the broken link and shows the live
                  Merkle root diverging from the WORM checkpoint.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2 p-6 shadow-card">
                <div className="flex items-center gap-2 text-accent">
                  <SealGlyph width={18} height={18} />
                  <span className="text-[13px] font-semibold">
                    Console features
                  </span>
                </div>
                <ul className="mt-4 space-y-2.5 text-[14px] text-secondary">
                  <li>Multi-tenant hash chain visualization</li>
                  <li>Live verify with WORM cross-check</li>
                  <li>Append events with flagged alerts</li>
                  <li>Compliance report export</li>
                </ul>
              </div>
            </div>
            <div className="mt-10">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent shadow-raised transition-colors hover:bg-accent-hover"
              >
                Open audit console
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between">
          <Logo variant="icon" height={40} />
          <div className="flex flex-col gap-1 md:items-end">
            <p className="text-[13px] text-muted">
              Built on Amazon DynamoDB · Single-table · Streams · S3 Object Lock
            </p>
            <p className="font-mono text-[12px] text-muted">
              PutItem + Query ONLY · no Update · no Delete
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
