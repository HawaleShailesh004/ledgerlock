# LedgerLock — Build Plan

**Tamper-evident, multi-tenant audit-trail API for regulated SaaS.**
Track 2 (B2B) · Primary backend: Amazon DynamoDB · Frontend/deploy: Next.js on Vercel
Budget: $100 AWS + $100 Vercel credits (this build runs in single-digit dollars)

---

## 0. The one-sentence pitch

A drop-in audit-log API for HIPAA/SOC2/SEC-regulated SaaS where **immutability is enforced by the data layer, not promised by policy**: append-only writes (conditional `PutItem` + an IAM role with no Update/Delete), a SHA-256 hash chain across events, and periodic Merkle-root checkpoints written to S3 Object Lock (WORM). Tampering with any historical event is mathematically detectable and provable against a regulator-grade immutable checkpoint.

The whole demo rests on one moment: **edit a row in the DynamoDB console, click "Verify," and watch the system pinpoint the broken link and prove it against the WORM checkpoint.**

---

## 1. Architecture (the diagram you put on the slide)

```
                         ┌─────────────────────────────────────────────┐
                         │                 VERCEL                        │
                         │  Next.js (v0-scaffolded UI)                   │
                         │  ┌─────────────────────────────────────────┐  │
   Compliance officer ──▶│  │  /dashboard   (chain viz, tenant switch) │  │
                         │  └─────────────────────────────────────────┘  │
                         │  Serverless API routes (Node, AWS SDK v3)     │
                         │   • POST /api/events      (append)            │
                         │   • GET  /api/events      (query by time)     │
                         │   • POST /api/verify      (walk hash chain)   │
                         └───────┬───────────────────────────┬──────────┘
                                 │ append role               │ verify role
                                 │ (PutItem + Query ONLY)    │ (Query + GetObject)
                                 ▼                           ▼
                    ┌────────────────────────┐      ┌──────────────────────┐
                    │  DynamoDB  (single tbl) │      │  S3 bucket           │
                    │  PK = TENANT#<id>       │      │  Object Lock =       │
                    │  SK = EVENT#<padded-seq>│      │  COMPLIANCE mode     │
                    │  append-only,           │      │  (WORM checkpoints)  │
                    │  hash-chained           │      └──────────▲───────────┘
                    └───────────┬─────────────┘                 │
                                │ NEW_IMAGE                      │ PutObject (write-once)
                                ▼                                │
                    ┌────────────────────────┐                  │
                    │  DynamoDB Streams       │                  │
                    └───────────┬─────────────┘                  │
                                ▼                                │
                    ┌────────────────────────┐                  │
                    │  Lambda (checkpointer)  │──────────────────┘
                    │  • verify hash links    │
                    │  • every N events →     │
                    │    Merkle root → S3      │
                    └─────────────────────────┘
```

**Why the diagram makes a DB judge nod:** the two arrows from the app to DynamoDB are labeled with the IAM scope — `PutItem + Query ONLY`, no `UpdateItem`/`DeleteItem` anywhere. Immutability is visible *in the architecture*, not buried in code.

---

## 2. The data model (single-table design)

One table: `LedgerLock`. Partition key isolates tenants; sort key orders events in time.

| Attribute | Type | Notes |
|---|---|---|
| `PK` | S | `TENANT#<tenantId>` — every query is partition-scoped → structural tenant isolation |
| `SK` | S | `EVENT#<zero-padded-seq>` (e.g. `EVENT#0000000006`) — **the seq is the uniqueness constraint**; strictly linear, prevents chain forks under concurrency (see §6.2 fix). Zero-pad so string sort == numeric sort |
| `ts` | S | ISO8601 timestamp — kept as a regular attribute (not in the key) for display + AP2 time-range queries; included in the hash |
| `seq` | N | per-tenant monotonic sequence number (0,1,2,…) |
| `prevHash` | S | hash of the previous event in this tenant's chain (`GENESIS` for seq 0) |
| `hash` | S | `SHA256(canonical(this event without hash) + prevHash)` |
| `actor` | S | who did it (user id / service principal) |
| `action` | S | e.g. `PHI_READ`, `RECORD_UPDATE`, `EXPORT`, `BREAK_THE_GLASS` |
| `payload` | M | the audited event details (the thing a tamperer would try to alter) |
| `flagged` | BOOL | true for review-worthy events (break-the-glass, bulk export) |
| `GSI1PK` | S | **sparse**: only set when `flagged=true` → `ALERT#<tenantId>` |
| `GSI1SK` | S | `EVENT#<ts>` |

### Access patterns (write these down first — this is the discipline judges reward)

| # | Pattern | How |
|---|---|---|
| AP1 | Append a new event for a tenant | `PutItem` PK=`TENANT#x`, SK=`EVENT#<padded-seq>`, `ConditionExpression: attribute_not_exists(SK)` — seq collision ⇒ one wins, loser retries |
| AP2 | Get a tenant's events in a time window | `Query` PK=`TENANT#x` (all events are seq-ordered = time-ordered), then filter/scan client-side on the `ts` attribute, OR add a `FilterExpression` on `ts`. (Since seq order == insertion order == time order, a plain forward Query already returns chronological events.) |
| AP3 | Get the latest event (to read `prevHash`/`seq` for the next append) | `Query` PK=`TENANT#x`, `ScanIndexForward=false`, `Limit=1` (returns highest padded-seq SK) |
| AP4 | List only flagged/alert events for a tenant (compliance review) | `Query` on **GSI1**, GSI1PK=`ALERT#x` — sparse index, no scan, no filter |
| AP5 | Verify the chain for a tenant | `Query` AP2-style, walk events, recompute each `hash` |

### Deliberate decisions to call out in the writeup
- **Single-table, partition-per-tenant** → tenant isolation is enforced by the key schema; a query physically cannot cross tenants.
- **Append-only via conditional write** → `attribute_not_exists(SK)` means you can create but never silently overwrite; combined with IAM (no Update/Delete) it's immutable at the data layer.
- **seq is the uniqueness constraint (not a random ULID)** → the SK is `EVENT#<padded-seq>`, so two concurrent appends both target the *same* key and exactly one wins; the loser gets `ConditionalCheckFailedException` and retries. This is **optimistic concurrency control on DynamoDB** and it's what guarantees a single, non-forking, mathematically linear hash chain. (Tradeoff to state aloud: strictly increasing keys concentrate a tenant's writes on one partition boundary — a non-issue at audit-log write rates, and a sign you understand the engine, which this panel rewards.)
- **Sparse GSI** → flagged events are the only items with `GSI1PK`, so the alert query reads *only* alerts — no scan, no filter expression, minimal cost.
- **Hash chain in-row** → integrity travels with the data; altering event N invalidates N and every event after it.
- **No TTL** → audit logs must persist (HIPAA = 6 years min); explicitly *not* using TTL is itself a deliberate, defensible choice you can mention.

---

## 3. Immutability: the three enforced layers

1. **Conditional append.** Every write is `PutItem` + `ConditionExpression: attribute_not_exists(SK)`. No overwrite path exists in the API.
2. **Least-privilege IAM.** The Vercel "append" role's policy lists exactly `dynamodb:PutItem` and `dynamodb:Query` on the table — **no `UpdateItem`, no `DeleteItem`, no `BatchWriteItem`.** Even a compromised app key cannot mutate history. This is the policy you screenshot for the submission's "DB usage" requirement.
3. **WORM checkpoint.** A Lambda on DynamoDB Streams periodically writes a Merkle root of the chain to an S3 bucket with **Object Lock in COMPLIANCE mode**. In compliance mode the object cannot be overwritten or deleted by anyone, including the root account, for the retention window — and S3 Object Lock is Cohasset-assessed for SEC 17a-4 / CFTC / FINRA. So even if someone had full DynamoDB admin and rewrote the whole chain, the independent WORM checkpoint would no longer match.

That third layer is what turns "tamper-evident" into "tamper-evident *and provable to a regulator*," and it's the line that wins the originality + technical points.

---

## 4. IAM policies (copy these)

### 4a. Vercel append role — the immutability-defining policy (screenshot this)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppendAndReadOnly",
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:<ACCOUNT>:table/LedgerLock",
        "arn:aws:dynamodb:ap-south-1:<ACCOUNT>:table/LedgerLock/index/GSI1"
      ]
    }
  ]
}
```
Note what is **absent**: UpdateItem, DeleteItem, BatchWriteItem. That absence is the product.

### 4b. Lambda checkpointer role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetRecords", "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream", "dynamodb:ListStreams"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:<ACCOUNT>:table/LedgerLock/stream/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:ap-south-1:<ACCOUNT>:table/LedgerLock"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectRetention", "s3:GetObject"],
      "Resource": "arn:aws:s3:::ledgerlock-worm-checkpoints/*"
    }
  ]
}
```

---

## 5. Provisioning (AWS CLI, region ap-south-1 / Mumbai)

```bash
# 5.1 Create the table: on-demand billing, Streams with NEW_IMAGE, one sparse GSI
aws dynamodb create-table \
  --table-name LedgerLock \
  --attribute-definitions \
      AttributeName=PK,AttributeType=S \
      AttributeName=SK,AttributeType=S \
      AttributeName=GSI1PK,AttributeType=S \
      AttributeName=GSI1SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_IMAGE \
  --global-secondary-indexes '[{
      "IndexName":"GSI1",
      "KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},
                   {"AttributeName":"GSI1SK","KeyType":"RANGE"}],
      "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region ap-south-1

# 5.2 WORM bucket: Object Lock REQUIRES versioning + lock enabled at creation
aws s3api create-bucket \
  --bucket ledgerlock-worm-checkpoints \
  --object-lock-enabled-for-bucket \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

# 5.3 Default retention so every checkpoint is born immutable (COMPLIANCE mode)
aws s3api put-object-lock-configuration \
  --bucket ledgerlock-worm-checkpoints \
  --object-lock-configuration '{
      "ObjectLockEnabled":"Enabled",
      "Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":1}}
  }'
```

> **Demo footgun (important):** COMPLIANCE mode objects cannot be deleted by *anyone* (incl. root) until retention expires. For a hackathon, keep `Days:1` (or use a separate throwaway bucket) so you are never stuck with un-deletable objects while iterating. Do NOT set years. You can show a screenshot of a longer retention as the "production setting."

---

## 6. Core code

### 6.1 Hash + canonicalization (shared util) — `lib/chain.js`
```js
import crypto from "crypto";

// Deterministic JSON: sort keys so the same logical event always hashes the same.
export function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

// hash = SHA256( canonical(eventWithoutHash) + prevHash )
export function computeHash(eventWithoutHash, prevHash) {
  return crypto
    .createHash("sha256")
    .update(canonical(eventWithoutHash) + prevHash)
    .digest("hex");
}
```

### 6.2 Append endpoint — `app/api/events/route.js` (POST)

**Critical:** the SK is `EVENT#<zero-padded-seq>`, NOT a timestamp+ULID. With a random ULID in the key, two concurrent appends generate two different SKs, so both `attribute_not_exists(SK)` writes succeed → the chain **forks** into two `seq:6` branches and the verifier flags a non-existent tamper under normal load. Making `seq` the key turns the conditional write into real optimistic concurrency control: concurrent appends collide on the same key, exactly one wins, the loser retries.

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { computeHash } from "@/lib/chain";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));
const TABLE = "LedgerLock";
const MAX_RETRIES = 5;

export async function POST(req) {
  const { tenantId, actor, action, payload, flagged = false } = await req.json();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // AP3: read the tenant's latest event to get prevHash + next seq
    const last = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
      ScanIndexForward: false,
      Limit: 1,
    }));
    const prev = last.Items?.[0];
    const prevHash = prev ? prev.hash : "GENESIS";
    const seq = prev ? prev.seq + 1 : 0;

    const ts = new Date().toISOString();
    const sk = `EVENT#${String(seq).padStart(10, "0")}`;   // seq IS the uniqueness constraint

    // ts is kept as an attribute (for display + time queries) and IS hashed
    const base = { PK: `TENANT#${tenantId}`, SK: sk, seq, prevHash, actor, action, payload, flagged, ts };
    const hash = computeHash(base, prevHash);

    const item = { ...base, hash };
    if (flagged) { item.GSI1PK = `ALERT#${tenantId}`; item.GSI1SK = `EVENT#${ts}`; } // sparse

    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(SK)", // append-only AND fork-prevention
      }));
      return Response.json({ ok: true, seq, hash, attempts: attempt + 1 });
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        // another writer took this seq — back off, re-read the new tail, recompute
        await new Promise(r => setTimeout(r, 20 * (attempt + 1) + Math.random() * 20));
        continue;
      }
      throw e;
    }
  }
  // exhausted retries under sustained contention (rare at audit-log write rates)
  return Response.json({ ok: false, error: "append_conflict_exhausted" }, { status: 409 });
}
```

> **Concurrency design (put this in the writeup — it's a scoring point):** Because the SK is the sequence number, two simultaneous appends both target `EVENT#0000000006`. DynamoDB's conditional write guarantees exactly one succeeds; the other catches `ConditionalCheckFailedException`, re-reads the now-advanced tail, recomputes its hash against the real new `prevHash`, and writes `EVENT#0000000007`. That is **optimistic concurrency control implemented natively on a single conditional write** — no locks, no queue — and it's what keeps the cryptographic chain strictly linear and fork-free. State the one tradeoff openly: strictly increasing keys put a tenant's writes on one partition boundary; fine for audit-log rates, and naming it signals engine fluency to this panel.

### 6.3 Verify endpoint — `app/api/verify/route.js` (POST)
```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { computeHash } from "@/lib/chain";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));
const TABLE = "LedgerLock";

export async function POST(req) {
  const { tenantId } = await req.json();
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
    ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
    ScanIndexForward: true,
  }));

  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;       // strip stored hash + GSI attrs (ts stays — it was hashed)
    const recomputed = computeHash(rest, prevHash);
    const linkOk   = it.prevHash === prevHash;          // chain continuity
    const hashOk   = recomputed === hash;               // payload integrity
    const seqOk    = it.seq === expectedSeq;            // no fork / no gap (seq strictly increments)
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;                                     // walk forward using STORED hash
    expectedSeq = it.seq + 1;
  }
  return Response.json({ intact: breaks.length === 0, count: res.Items.length, breaks });
}
```
This returns the exact `seq`/`SK` of the first tampered event — that's what the UI lights up red. The `seqOk` check is what would catch a fork (two items claiming the same seq) or a deletion gap, on top of hash tampering.

> **Field-consistency rule (gets people every time):** the appender hashes `base` = everything except `hash`/`GSI1PK`/`GSI1SK`. The verifier must strip *exactly* those same three and hash everything else — including `ts`. If the two sides disagree on which fields are hashed, a clean chain will falsely report "tampered." Keep them in lockstep.

### 6.4 Stream checkpointer — `lambda/checkpointer.mjs`
```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));
const s3 = new S3Client({ region: "ap-south-1" });
const TABLE = "LedgerLock";
const BUCKET = process.env.WORM_BUCKET;
const CHECKPOINT_EVERY = 10;            // checkpoint at every 10-event boundary

// Merkle root over an ordered list of leaf hashes
function merkleRoot(hashes) {
  if (hashes.length === 0) return crypto.createHash("sha256").update("EMPTY").digest("hex");
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1] ?? level[i]; // duplicate last if odd
      next.push(crypto.createHash("sha256").update(a + b).digest("hex"));
    }
    level = next;
  }
  return level[0];
}

export const handler = async (event) => {
  // Group new appends by tenant (a single Stream batch may contain many)
  const tenants = new Set();
  for (const r of event.Records) {
    if (r.eventName !== "INSERT") continue;             // appends only
    tenants.add(r.dynamodb.NewImage.PK.S);
  }

  for (const pk of tenants) {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: { ":pk": pk, ":p": "EVENT#" },
      ScanIndexForward: true,
    }));
    const n = res.Items.length;
    if (n === 0) continue;

    // BOUNDARY (not modulo): the highest multiple of 10 we've reached.
    // A bursty Stream batch (e.g. 9 -> 24) still produces boundary 20 here,
    // so we never "skip" a checkpoint the way `n % 10 === 0` would.
    const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
    if (boundary === 0) continue;                       // fewer than 10 events yet

    // IDEMPOTENT: the key is derived from the boundary, so re-processing the
    // same events (Streams may retry / overlap shards) writes the SAME object.
    // S3 PutObject to an existing key is naturally idempotent here. No tracker
    // item, so no second read-then-write race to worry about.
    const upTo = res.Items.slice(0, boundary);          // checkpoint exactly the boundary prefix
    const last = upTo[upTo.length - 1];
    const checkpoint = {
      tenant: pk, count: boundary,
      lastSeq: last.seq, lastHash: last.hash,
      merkleRoot: merkleRoot(upTo.map(i => i.hash)),
      ts: new Date().toISOString(),
    };
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${pk.replace("#", "_")}/checkpoint-${boundary}.json`,
      Body: JSON.stringify(checkpoint),
      ContentType: "application/json",
      // Object Lock default retention (COMPLIANCE) applies automatically from bucket config
    }));
  }
  return { statusCode: 200 };
};
```

> **Why boundary beats modulo (and beats a tracker item):** `n % 10 === 0` silently fails when Streams deliver a batch that jumps the count past a multiple of 10 — checkpoints stop. A separate "last-checkpointed-count" config item *would* fix the skip but reintroduces a concurrency hole: Streams shards run in parallel, so two invocations could read the same counter and race on updating it (the exact read-then-write fork we eliminated in §6.2). The boundary approach sidesteps both: the S3 key is a pure function of the event count, so concurrent or retried invocations converge on the same object instead of fighting. A missed boundary self-heals on the next event. If you ever *do* want a tracker, it needs its own `ConditionExpression` guard — but you don't need one here.

Wire it to the stream:
```bash
aws lambda create-event-source-mapping \
  --function-name ledgerlock-checkpointer \
  --event-source-arn <LedgerLock stream ARN> \
  --starting-position LATEST \
  --batch-size 100 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures \
  --region ap-south-1
```

---

## 7. The frontend (v0 prompt + design intent)

**v0 prompt to start:**
> "Build a compliance audit dashboard in Next.js + Tailwind. Left sidebar: a tenant switcher (dropdown). Main panel: a vertical 'chain' of audit events rendered as connected blocks (like a blockchain), each showing timestamp, actor, action, and a short hash; consecutive blocks joined by a link line. A green shield badge 'Chain intact' at top, which turns into a red broken-link badge when verification fails, with the broken block highlighted red. A 'Verify Chain' button and an 'Append test event' form. Minimal, serious, enterprise-security aesthetic — slate/zinc with a single emerald accent for 'verified' and red for 'tampered'."

**Design-to-data binding (the "design in deliberate relation to the back end" rubric line):**
- The chain visualization *is* the SK ordering + hash links rendered literally.
- Switching tenants visibly re-scopes everything → the partition key made visible.
- The verify badge maps 1:1 to the `/api/verify` response; the red block is the returned `breaks[0].seq`.
- A small "WORM checkpoint: ✓ matches" line maps to the latest S3 checkpoint vs recomputed Merkle root.

---

## 8. The <3-minute demo script (rehearse to time)

1. **(0:00–0:25) Problem.** "Regulated SaaS must keep audit logs that are provably unaltered — HIPAA, SEC 17a-4, FINRA. Most apps log to a table an admin can quietly edit. LedgerLock makes tampering impossible to hide."
2. **(0:25–1:00) The model.** Show the dashboard: one tenant's chain of events. Switch tenants — "every query is scoped to one partition key, so tenants are structurally isolated." Append an event live — it links onto the chain.
3. **(1:00–1:30) The guarantees.** Show the IAM policy screenshot: "the app role has PutItem and Query — no Update, no Delete. Immutability isn't a rule we follow, it's a permission we don't have." Show the S3 bucket in Object Lock COMPLIANCE mode.
4. **(1:30–2:30) THE PEAK — tamper + catch.** Open the DynamoDB console. Manually edit a historical event's payload (this requires *your* admin creds — simulating a malicious insider who bypassed the app entirely). Back in the app, click **Verify Chain**. It flips red, pinpoints the exact broken block, and shows the Merkle root no longer matches the WORM checkpoint in S3. "Even with full database admin, the tamper is caught — because the proof lives in write-once storage they can't touch."
5. **(2:30–2:55) Shippable.** "This is a drop-in API for any regulated SaaS, serverless, scales to millions of events a day, per-tenant. It fills the gap left by QLDB's retirement." State the DB explicitly: "Built on Amazon DynamoDB — single-table design, Streams, and S3 Object Lock."

**The line that wins it:** *"Immutability isn't a rule we follow — it's a permission we don't have."*

---

## 9. Cost reality (you have $100 each — you'll spend cents)

- DynamoDB on-demand: a few thousand demo writes/reads = well under $1.
- Streams + Lambda: free-tier covers it; pennies at most.
- S3 Object Lock: storage of tiny JSON checkpoints = negligible; just keep retention short while iterating.
- Vercel: a hobby/free Next.js deploy; credits untouched.
- **No 24/7 instance anywhere** — nothing runs when idle. This is the lowest-cost of the five ideas, by design.

---

## 10. First-48-hours validation checklist (do these before any UI polish)

- [ ] **V1 — Vercel → DynamoDB with least-privilege IAM works end to end.** Deploy a stub `/api/events` to Vercel; confirm it can `PutItem` with the append role that has NO Update/Delete. Confirm an `UpdateItem` attempt from that role is denied. Confirm the live Vercel URL stays up.
- [ ] **V2 — Streams → Lambda → S3 Object Lock checkpoint fires.** Append 10 events, confirm a checkpoint JSON lands in the WORM bucket and that attempting to delete it is rejected.
- [ ] **V3 — Tamper → verify reads clearly in one watch.** Edit a row in console, run `/api/verify`, confirm it returns the exact broken `seq`, and that a non-author watching the dashboard immediately understands what happened. Time the whole demo: must land under 3:00.

---

## 11. Submission checklist (track requirements + bonus)

- [ ] Live published Vercel URL (judge-clickable, pre-seeded with ~3 tenants × ~30 events).
- [ ] <3-min video naming the DB (DynamoDB), showing the app + the tamper-catch, stating problem/audience.
- [ ] Clean labeled directional architecture diagram (use §1).
- [ ] DB-usage screenshot — use the **IAM policy** (no Update/Delete) + the DynamoDB items view showing the hash chain.
- [ ] Vercel Team ID.
- [ ] **Bonus (+0.6):** one blog post + one short video, tagged **#H0Hackathon**, e.g. "Building a tamper-evident audit log on DynamoDB after QLDB's retirement." Near-free points — write it last.

---

## 12. Second submission (optional, independent shot)

**DropGuard** — Track 1 (B2C), oversell-proof limited-drop commerce on DynamoDB conditional writes + sharded counters + TTL reservations. Substantially different product and access pattern (atomic decrement vs append-only), same DynamoDB-depth strength, minimal added build cost since the data-model muscle is already built here. Only build it after V1–V3 above pass and LedgerLock's demo is locked.
