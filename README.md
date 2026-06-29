# LedgerLock

**A tamper-evident audit-trail API for regulated SaaS, built on Amazon DynamoDB.**  
*Immutability isn't a rule we follow — it's a permission we don't have.*

Built for the **#H0Hackathon** (Hack the Zero Stack with Vercel and AWS Databases).  
Live: https://ledgerlock-vert.vercel.app

---

## The database thesis (read this first)

Most "immutable" audit logs are a normal table plus a promise. LedgerLock enforces immutability at the data layer, on a single DynamoDB table, with four guarantees:

1. **Append-only by permission, not policy.** Every write is `PutItem` with `ConditionExpression: attribute_not_exists(SK)`. The app's IAM role has **only** `PutItem` + `Query` — no `UpdateItem`, no `DeleteItem`. You can't misuse a capability you were never granted.
2. **SHA-256 hash chain.** `hash = SHA256(canonical(event) + prevHash)`. Altering any record breaks every record after it.
3. **WORM-sealed Merkle checkpoints.** DynamoDB Streams → Lambda → S3 Object Lock (COMPLIANCE). Every **10 events** a Merkle root is sealed into write-once storage — so a tampering admin who rewrites the live chain still can't match the sealed root.
4. **Bounded, portable proof.** Verification trusts the newest sealed root and walks only the tail since that seal (`O(tail)`, not `O(n)`). Any record produces an `O(log n)` Merkle **inclusion proof** a regulator can verify **offline**, with no access to the app or AWS.

## Single-table design

| Attr | Value | Why |
|---|---|---|
| `PK` | `TENANT#<id>` | structural multi-tenant isolation — every query is partition-scoped |
| `SK` | `EVENT#<zero-padded-seq>` | strict linear chain; seq is the fork-prevention constraint |
| `hash`, `prevHash` | SHA-256 | the chain |
| `GSI1PK` | `ALERT#<id>` (sparse) | flagged-event review queue, no scan |

## Architecture

See `architecture-diagram (1).svg` and `LedgerLock_Devpost_Submission_FINAL.md` for multi-region reads and retention lifecycle.

```
SaaS app ── LedgerLockClient.appendEvent() ──▶ Next.js API (Vercel) ──▶ DynamoDB single table
                                              POST /api/verify (since-seal)              │ Streams
                                              GET  /api/proof (Merkle inclusion)           ▼
                                              GET  /api/alerts (sparse GSI)         Lambda checkpointer
                                                                                       Merkle root / 10
   app IAM role: ✓ PutItem ✓ Query ✗ Update ✗ Delete                                         ▼
                                                                                    S3 Object Lock (COMPLIANCE)
```

## API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/events` | Append an event (conditional `PutItem`, fork-safe retry) |
| `POST /api/verify` | `{ mode: "since-seal" \| "full" }` — bounded integrity check |
| `GET /api/proof?tenantId=&seq=` | O(log n) Merkle inclusion proof against the sealed root |
| `GET /api/alerts?tenantId=` | Flagged events via sparse GSI1 (no scan) |
| `GET /api/checkpoint?tenantId=` | Latest sealed WORM Merkle root |
| `GET /api/tenant-stats?tenantId=` | Total events + checkpointer lag (sealed / pending) |

## B2B embed (`LedgerLockClient`)

```javascript
import { LedgerLockClient } from "@/lib/client";

const ledger = new LedgerLockClient("https://ledgerlock-vert.vercel.app");

await ledger.appendEvent({
  tenantId: "acme",
  actor: "ehr.integration",
  action: "PHI_READ",
  payload: { subject: "ACME-1042" },
});

const stats = await ledger.getTenantStats("acme");
const proof = await ledger.getProof("acme", 6);
```

Live demo: `/integrate`

## Scripts

```bash
npm run dev
npm run seed                              # demo tenants (acme, northwind, globex)
npm run seed-100k                         # scale-100k tenant → 100k events
npm run backfill-worm -- scale-100k --use-aws-profile   # after bulk seed
npm run bench:verify -- scale-100k
npm run export-ledger -- acme export-acme.json
npm run verify-export -- export-acme.json   # offline, no AWS creds
npm run integration-demo
```

## Notable engineering

- **Fork-proof chain:** seq-as-sort-key + conditional write + retry = optimistic concurrency without locks.
- **Bounded verify:** WORM seals make hash verification `O(tail)` instead of `O(n)` — at 100k fully sealed, DynamoDB load (~22s) dominates; the win is largest when the checkpointer lags and the tail is small after catch-up.
- **Self-healing checkpointer:** under write bursts the sealer can fall behind; the dashboard shows sealed / pending counts; verification walks the unsealed tail until catch-up or `backfill-worm`.
- **Inclusion proofs + offline verifier:** regulator-grade portability — the guarantee doesn't depend on trusting us.

## Fails safely under load

During burst writes (e.g. seeding 100k events), Streams→Lambda can **fall behind**. The system:

- Keeps appending correctly (hash chain intact)
- Shows **sealed through #X · Y pending seal** in the dashboard
- Still verifies correctly by walking the unsealed tail
- **Self-heals** when Lambda catches up or you run `backfill-worm`

Verification never silently trusts a stale seal — it resolves the newest **cryptographically valid** WORM checkpoint.

## Offline verification

```bash
node scripts/export-ledger.mjs acme export-acme.json
node scripts/verify-export.mjs export-acme.json
```

## Stack

Amazon DynamoDB (single-table, Streams) · AWS Lambda · Amazon S3 Object Lock · AWS IAM · Next.js · Vercel · Node.js

## Submission assets (in repo)

| File | Purpose |
|---|---|
| `LedgerLock_Devpost_Submission_FINAL.md` | Devpost copy-paste package |
| `LedgerLock_devto_article_FINAL.md` | Bonus dev.to article |
| `architecture-diagram (1).svg` | Architecture diagram |
| `LedgerLock_Phase_By_Phase_Build_Guide.md` | Build guide (internal reference) |

---

*Built for #H0Hackathon. Database: Amazon DynamoDB. Front end: Vercel.*
