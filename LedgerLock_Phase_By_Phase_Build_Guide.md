# LedgerLock — Phase-by-Phase Build Guide (from scratch)

**Read this first.** This guide assumes you have never used AWS or Vercel before. Every command is explained. Every console action is spelled out click by click. Do the phases **in order** — each one ends with a checklist you must pass before moving on. Don't skip ahead to the UI; the hard part (and the part that wins) is the database layer in Phases 2–5.

**The golden rule of this project:** *Immutability isn't a rule we follow — it's a permission we don't have.* Everything you build should serve that sentence.

---

## Phase map (what you're building and why each phase exists)

| Phase | Name | Goal | Why it matters |
|---|---|---|---|
| 0 | Accounts & local tooling | Get AWS + Vercel + your laptop ready | Can't build on platforms you can't reach |
| 1 | The table | Create the DynamoDB single-table + Streams | The spine everything hangs off |
| 2 | Least-privilege identity | Create the IAM user/role with NO update/delete | This *is* the product — prove immutability |
| 3 | The append + hash chain | Write events that chain cryptographically | The tamper-evidence mechanism |
| 4 | The verifier | Walk the chain, detect tampering | The demo's payoff |
| 5 | WORM checkpoints | Streams → Lambda → S3 Object Lock | Regulator-grade proof; the originality point |
| 6 | The Next.js API on Vercel | Deploy the live, judge-clickable backend | A submission requirement |
| 7 | The v0 frontend | Build + wire the dashboard UI | Design rubric + the demo surface |
| 8 | Seed, rehearse, record | Demo data + the <3-min video | Demo clarity is a scored differentiator |
| 9 | Submit | Package all deliverables | Don't lose points on logistics |

Each phase below has: **Goal · Concepts (for newcomers) · Steps · Checklist · Common mistakes.**

---

# PHASE 0 — Accounts & local tooling

### Goal
A working AWS account, a Vercel account, and a laptop that can run Node.js and talk to AWS from the command line.

### Concepts (newcomer orientation)
- **AWS** = Amazon's cloud. You'll use three services: **DynamoDB** (the database), **Lambda** (tiny serverless functions), **S3** (file storage with a write-once lock). A **region** is a physical location; you'll use `ap-south-1` (Mumbai) because it's closest to you and DynamoDB is fully available there.
- **The AWS Console** = the website (web UI) where you click things. **The AWS CLI** = a command-line tool that does the same things by typing. We'll use both; the CLI is faster and reproducible.
- **Vercel** = where your Next.js website runs, with a public URL. It connects to AWS over the internet using access keys.
- **Credentials** = an Access Key ID + Secret Access Key. Think of them as a username/password for the CLI and for your app. Treat the secret like a password — never commit it to GitHub.

### Steps

**0.1 — Create an AWS account**
1. Go to aws.amazon.com → "Create an AWS Account." You'll need a card (this build costs cents, but AWS requires one).
2. Once in, top-right corner: set your region to **Asia Pacific (Mumbai) ap-south-1**. Do this now and leave it.

**0.2 — Create an admin user for yourself (don't use the root login for daily work)**
1. In the console search bar, type **IAM** → open it.
2. Left menu → **Users** → **Create user**. Name it `ledgerlock-admin`.
3. "Provide user access to the AWS Management Console" — optional; you can skip console access for this user.
4. Permissions → **Attach policies directly** → check **AdministratorAccess** (this is your build identity; the *app* identity in Phase 2 will be locked down — different thing).
5. Create user → click into it → **Security credentials** tab → **Create access key** → choose **Command Line Interface (CLI)** → confirm → **download the .csv**. This has your Access Key ID + Secret. Keep it safe.

**0.3 — Install Node.js and the AWS CLI on your laptop**
- Node.js: install the LTS version from nodejs.org. Verify: `node -v` (should print v20+).
- AWS CLI v2: follow aws.amazon.com/cli for your OS. Verify: `aws --version`.

**0.4 — Connect the CLI to your account**
```bash
aws configure
# AWS Access Key ID:     <paste from the csv>
# AWS Secret Access Key: <paste from the csv>
# Default region name:   ap-south-1
# Default output format:  json
```
Test it:
```bash
aws sts get-caller-identity
```
This should print your account number and user ARN. If it does, the CLI is talking to AWS.

**0.5 — Create a Vercel account**
- Go to vercel.com → sign up with GitHub (easiest, since you'll deploy from a repo later). No build needed yet.

**0.6 — Make a project folder + git repo**
```bash
mkdir ledgerlock && cd ledgerlock
git init
node -v && aws sts get-caller-identity   # final sanity check
```

### Checklist (must all pass)
- [ ] `aws sts get-caller-identity` prints your account — CLI works.
- [ ] Region is `ap-south-1` everywhere (console top-right + `aws configure`).
- [ ] `node -v` is v20 or higher.
- [ ] Vercel account exists and is linked to GitHub.
- [ ] You have your access key .csv stored somewhere safe (NOT in the project folder).

### Common mistakes
- Leaving the region as `us-east-1`. If your table is in Mumbai and your code says `us-east-1`, nothing connects. Be consistent.
- Committing credentials to git. Add a `.gitignore` now: create a file `.gitignore` containing `.env*` and `node_modules` and the `.csv`.

---

# PHASE 1 — The table

### Goal
Create the `LedgerLock` DynamoDB table with the right key schema, one sparse GSI, and Streams turned on.

### Concepts (newcomer orientation)
- **DynamoDB** stores **items** (like rows) in **tables**. Unlike SQL, there are no joins and no fixed columns — each item is a bag of attributes.
- **Partition key (PK)** + **Sort key (SK)** together identify an item. All items with the same PK live together and are sorted by SK. We use `PK = TENANT#<id>` so each customer's events are grouped, and `SK = EVENT#<zero-padded-seq>` (e.g. `EVENT#0000000006`) so they're in strict sequence order. **Using the sequence number — not a timestamp+random ID — as the sort key is a deliberate choice that prevents the chain from forking under concurrent writes** (explained in Phase 3). The human-readable timestamp lives in a separate `ts` attribute.
- **GSI (Global Secondary Index)** = a second "view" of the table with a different key, so you can query a different way. Ours indexes only *flagged* events (a "sparse" index — items without the GSI key simply don't appear in it, which is efficient and cheap).
- **Streams** = a live feed of every change to the table. We'll later attach a Lambda to it. Turn it on now (it must be on before anything writes, to capture from the start). We use `NEW_IMAGE` so the stream carries the full new item.
- **Billing mode PAY_PER_REQUEST** = on-demand; you pay per request and it scales to zero. Perfect for a hackathon — no idle cost, no capacity planning.

### Steps

**1.1 — Create the table** (run this exactly; explanation follows)
```bash
aws dynamodb create-table \
  --table-name LedgerLock \
  --attribute-definitions \
      AttributeName=PK,AttributeType=S \
      AttributeName=SK,AttributeType=S \
      AttributeName=GSI1PK,AttributeType=S \
      AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
      AttributeName=PK,KeyType=HASH \
      AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_IMAGE \
  --global-secondary-indexes '[{
      "IndexName":"GSI1",
      "KeySchema":[
        {"AttributeName":"GSI1PK","KeyType":"HASH"},
        {"AttributeName":"GSI1SK","KeyType":"RANGE"}],
      "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region ap-south-1
```
Line by line:
- `--attribute-definitions` — you only declare attributes used in keys. `S` = string. (Other attributes like `actor`, `payload` are NOT declared — DynamoDB is schemaless for non-key fields.)
- `--key-schema` — `HASH` means partition key, `RANGE` means sort key.
- `--global-secondary-indexes` — defines GSI1 on the two GSI attributes. `Projection ALL` = copy all attributes into the index so queries on it return full items.

**1.2 — Wait until it's active**
```bash
aws dynamodb describe-table --table-name LedgerLock --region ap-south-1 \
  --query "Table.TableStatus"
```
Repeat until it prints `"ACTIVE"` (usually ~10–30 seconds).

**1.3 — Capture the Stream ARN (you need it in Phase 5)**
```bash
aws dynamodb describe-table --table-name LedgerLock --region ap-south-1 \
  --query "Table.LatestStreamArn" --output text
```
Copy the output (looks like `arn:aws:dynamodb:ap-south-1:...:table/LedgerLock/stream/2026-...`). Paste it into a notes file.

**1.4 — Verify in the console (newcomer confidence check)**
- Console → DynamoDB → Tables → LedgerLock. You should see the table, "Exports and streams" tab showing DynamoDB stream **On** with view type **New image**, and an "Indexes" tab showing **GSI1**.

### Checklist
- [ ] `TableStatus` is `ACTIVE`.
- [ ] `LatestStreamArn` returned a value and you saved it.
- [ ] Console shows GSI1 present and Streams = On (New image).

### Common mistakes
- Declaring non-key attributes in `--attribute-definitions` → error. Only key attributes go there.
- Forgetting Streams now and turning them on later — you'll miss early events. Turn on at creation.

---

# PHASE 2 — Least-privilege identity (the product itself)

### Goal
Create a *separate* AWS identity that your app will use, with permission to **append and read only** — explicitly **no UpdateItem, no DeleteItem**. This is the architectural heart of LedgerLock.

### Concepts (newcomer orientation)
- An **IAM policy** is a JSON document listing exactly which actions an identity may perform. If an action isn't listed, it's denied by default.
- Your *admin* user (Phase 0) can do anything — that's for building. The *app* identity here can only `PutItem` and `Query`. So even if your app's keys leak, an attacker cannot alter or delete history. That's the guarantee you demo.
- We'll make an **IAM user** with access keys for the app (simplest path for Vercel). The policy is what you screenshot for the submission's "DB usage" requirement.

### Steps

**2.1 — Write the policy file** (create `iam/append-policy.json` in your project)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppendAndReadOnly",
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:<ACCOUNT_ID>:table/LedgerLock",
        "arn:aws:dynamodb:ap-south-1:<ACCOUNT_ID>:table/LedgerLock/index/GSI1"
      ]
    }
  ]
}
```
Replace `<ACCOUNT_ID>` with your account number (from `aws sts get-caller-identity`). Note what is **deliberately absent**: `UpdateItem`, `DeleteItem`, `BatchWriteItem`. That absence is the product.

**2.2 — Create the policy in AWS**
```bash
aws iam create-policy \
  --policy-name LedgerLockAppendOnly \
  --policy-document file://iam/append-policy.json
```
Copy the returned policy `Arn`.

**2.3 — Create the app user and attach the policy**
```bash
aws iam create-user --user-name ledgerlock-app

aws iam attach-user-policy \
  --user-name ledgerlock-app \
  --policy-arn <the policy Arn from 2.2>

aws iam create-access-key --user-name ledgerlock-app
```
The last command prints an **AccessKeyId** and **SecretAccessKey** for the *app*. Save them — these go into Vercel later (Phase 6), NOT into git.

**2.4 — Prove the lock works (the test that matters)**
Temporarily configure a second CLI profile as the app user:
```bash
aws configure --profile app
# paste the ledgerlock-app keys, region ap-south-1, json
```
Try a write (should succeed):
```bash
aws dynamodb put-item --profile app --region ap-south-1 \
  --table-name LedgerLock \
  --item '{"PK":{"S":"TENANT#test"},"SK":{"S":"EVENT#2026-01-01T00:00:00Z#000"},"seq":{"N":"0"},"prevHash":{"S":"GENESIS"},"hash":{"S":"abc"},"actor":{"S":"setup"},"action":{"S":"TEST"}}'
```
Now try to delete it (should be **DENIED**):
```bash
aws dynamodb delete-item --profile app --region ap-south-1 \
  --table-name LedgerLock \
  --key '{"PK":{"S":"TENANT#test"},"SK":{"S":"EVENT#2026-01-01T00:00:00Z#000"}}'
```
You should get `AccessDeniedException ... not authorized to perform: dynamodb:DeleteItem`. **Screenshot this denial — it's gold for your demo and writeup.** Then clean up the test item using your *admin* profile (default):
```bash
aws dynamodb delete-item --region ap-south-1 --table-name LedgerLock \
  --key '{"PK":{"S":"TENANT#test"},"SK":{"S":"EVENT#2026-01-01T00:00:00Z#000"}}'
```

### Checklist
- [ ] `LedgerLockAppendOnly` policy exists with only PutItem + Query.
- [ ] `ledgerlock-app` user exists with that policy attached.
- [ ] App profile **can** PutItem.
- [ ] App profile **cannot** DeleteItem (you have the AccessDenied screenshot).
- [ ] App access keys saved outside git.

### Common mistakes
- Putting `dynamodb:*` "just to get it working." That destroys the entire thesis. Resist it. If a later step fails on permissions, add the *specific* read action (e.g. `dynamodb:Query`), never the wildcard.
- Confusing the admin identity with the app identity. Admin builds; app runs. Keep them separate.

---

# PHASE 3 — The append endpoint + hash chain

### Goal
A function that appends an event to a tenant's chain, where each event's hash cryptographically depends on the previous one. This is the tamper-evidence mechanism.

### Concepts (newcomer orientation)
- A **hash** (SHA-256) turns any text into a fixed fingerprint. Change one character of input → completely different fingerprint. We store each event's fingerprint.
- A **hash chain**: each event's fingerprint includes the *previous* event's fingerprint. So if someone alters event #5, its fingerprint changes, which breaks #6's expected previous-fingerprint, which breaks #7… the whole tail is invalidated. That's what makes tampering *detectable*.
- **Canonical JSON**: to hash an object reliably, we must serialize it the same way every time (keys sorted), or the fingerprint would vary meaninglessly.
- **Why the sort key is the sequence number (the critical design decision):** It's tempting to make the SK a timestamp plus a random ID (a ULID). **Don't** — it creates a silent, fatal bug. The `attribute_not_exists(SK)` guard only protects the *exact key*. If two appends happen at once and each gets a different random ID, both keys are unique, so *both writes succeed* — and now you have two events both claiming sequence 6, both pointing at the same previous hash. Your chain has **forked into two branches**, and the verifier will report a break under normal concurrent load. The fix: make the SK the zero-padded sequence number itself (`EVENT#0000000006`). Now two concurrent appends target the *same* key, the conditional write lets exactly one through, and the loser retries. This is called **optimistic concurrency control**, and doing it with a single conditional write (no locks, no queue) is exactly the kind of engine-level detail these database judges respect.
- **Conditional write**: `PutItem` with `ConditionExpression: attribute_not_exists(SK)` means "only create if this exact key doesn't already exist." With a seq-based key this does double duty: it enforces append-only *and* prevents chain forks.

### Steps

**3.1 — Initialise the Node project + dependencies**
```bash
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```
- `@aws-sdk/client-dynamodb` + `lib-dynamodb` = the AWS SDK for talking to DynamoDB (the `lib-dynamodb` "Document client" lets you use plain JS objects instead of the verbose `{"S":"..."}` format).
- (No ULID package — we removed it deliberately. The sort key is the sequence number, not a random ID; see the concept note above.)

**3.2 — The shared chain util** — create `lib/chain.js`
```js
import crypto from "crypto";

// Deterministic serialization: same logical object => same string, always.
export function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

// hash = SHA256( canonical(event-without-hash) + prevHash )
export function computeHash(eventWithoutHash, prevHash) {
  return crypto.createHash("sha256")
    .update(canonical(eventWithoutHash) + prevHash)
    .digest("hex");
}
```

**3.3 — A reusable DynamoDB client** — create `lib/ddb.js`
```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE = "LedgerLock";
export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "ap-south-1" })
);
```

**3.4 — The append logic** — create `lib/append.js`

The sort key is `EVENT#<padded-seq>`, and the function retries on collision. Read the concept note above if you skipped it — this structure is the whole reason the ledger is safe under concurrent writes.
```js
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash } from "./chain.js";

const MAX_RETRIES = 5;

export async function appendEvent({ tenantId, actor, action, payload, flagged = false }) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // AP3: read the tenant's most recent event to chain onto it
    const last = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
      ScanIndexForward: false,   // newest (highest seq) first
      Limit: 1,
    }));
    const prev = last.Items?.[0];
    const prevHash = prev ? prev.hash : "GENESIS";
    const seq = prev ? prev.seq + 1 : 0;

    const ts = new Date().toISOString();
    const sk = `EVENT#${String(seq).padStart(10, "0")}`;   // seq IS the uniqueness constraint
    // ts is a normal attribute (for display + time queries) and IS part of the hash
    const base = { PK: `TENANT#${tenantId}`, SK: sk, seq, prevHash, actor, action, payload, flagged, ts };
    const hash = computeHash(base, prevHash);

    const item = { ...base, hash };
    if (flagged) { item.GSI1PK = `ALERT#${tenantId}`; item.GSI1SK = `EVENT#${ts}`; } // sparse index

    try {
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(SK)", // append-only AND fork-prevention
      }));
      return { seq, hash, sk, attempts: attempt + 1 };
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        // another writer claimed this seq first — wait briefly, re-read tail, recompute
        await new Promise(r => setTimeout(r, 20 * (attempt + 1) + Math.random() * 20));
        continue;
      }
      throw e;                                            // a real error, not a race
    }
  }
  const err = new Error("append_conflict_exhausted");     // sustained contention (rare here)
  err.code = 409;
  throw err;
}
```
**What the retry loop does:** if two requests race for sequence 6, one wins and the other's `PutItem` throws `ConditionalCheckFailedException`. Instead of failing, it loops: re-reads the tail (now at seq 6), recomputes its hash against the *real* new previous hash, and writes seq 7. The chain stays perfectly linear. At audit-log write rates you'll almost never see a retry, but the safety is there and it's a great thing to mention in your writeup.

**3.5 — Quick local test** — create `scripts/test-append.mjs`
```js
import { appendEvent } from "../lib/append.js";

const r1 = await appendEvent({ tenantId: "acme", actor: "dr.smith", action: "PHI_READ", payload: { patient: "p-001" } });
const r2 = await appendEvent({ tenantId: "acme", actor: "dr.smith", action: "RECORD_UPDATE", payload: { patient: "p-001", field: "dosage" } });
console.log("event 0:", r1);
console.log("event 1:", r2);
console.log("chained:", r2.seq === 1 ? "yes" : "no");
```
Run it (uses your default admin creds locally for now):
```bash
node scripts/test-append.mjs
```
Add `"type": "module"` to your `package.json` so `import` works.

### Checklist
- [ ] `node scripts/test-append.mjs` prints event 0 (seq 0, prevHash GENESIS) and event 1 (seq 1).
- [ ] In the DynamoDB console (Explore items → LedgerLock → PK `TENANT#acme`) you see two items, each with a `hash`, and event 1's `prevHash` equals event 0's `hash`.
- [ ] Re-running appends new events with incrementing seq (1, 2, 3…) — it never overwrites.
- [ ] The SK of each item looks like `EVENT#0000000000`, `EVENT#0000000001`, … (padded seq, no random ID).

### Common mistakes
- **Putting a timestamp+ULID in the sort key.** This is the one fatal mistake. Random keys let concurrent writes both succeed and fork the chain. The SK must be the zero-padded `seq`. (See the concept note in this phase.)
- Hashing the item *including* its own `hash` field — circular. Always hash the event *without* the hash, then attach the hash.
- Forgetting `"type": "module"` → `import` errors. Add it.
- Including `GSI1PK`/`GSI1SK` in the hashed `base` — don't; they're index plumbing, not audited content. (The verifier in Phase 4 strips them too — keep both sides consistent.) Note `ts` and `seq` ARE hashed, so the verifier keeps them.

---

# PHASE 4 — The verifier

### Goal
A function that walks a tenant's entire chain, recomputes every hash, and returns the exact event where tampering occurred (if any). This produces the demo's payoff.

### Concepts (newcomer orientation)
- Verification = replay the chain from the start. For each event: (a) does its stored `prevHash` match the actual previous event's hash? (chain continuity) and (b) does recomputing its hash from its own contents match its stored hash? (content integrity). If either fails, that event was tampered with.
- We walk forward using the **stored** hash as the link to the next event, so a single tampered event surfaces as a clean break at exactly that `seq`.

### Steps

**4.1 — The verify logic** — create `lib/verify.js`
```js
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash } from "./chain.js";

export async function verifyChain(tenantId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
    ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
    ScanIndexForward: true,    // oldest first
  }));

  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it;     // strip stored hash + index attrs (ts/seq stay — they were hashed)
    const recomputed = computeHash(rest, prevHash);
    const linkOk = it.prevHash === prevHash;          // continuity
    const hashOk = recomputed === hash;               // integrity
    const seqOk  = it.seq === expectedSeq;            // no fork, no deletion gap
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash;                                  // advance using stored hash
    expectedSeq = it.seq + 1;
  }
  return { intact: breaks.length === 0, count: res.Items.length, breaks };
}
```
The `seqOk` check is what would catch a *fork* (two events with the same seq) or a *deletion gap*, in addition to hash tampering — the three checks together cover every way the chain could be corrupted.

**4.2 — Tamper test** — create `scripts/test-verify.mjs`
```js
import { verifyChain } from "../lib/verify.js";
console.log(JSON.stringify(await verifyChain("acme"), null, 2));
```
Run it — should report `intact: true`.

**4.3 — Now simulate a malicious admin.** In the DynamoDB console: Explore items → LedgerLock → open event seq 0 for `TENANT#acme` → edit the `payload` (e.g. change the patient id) → Save. (You're using *admin* rights here, deliberately bypassing the app — that's the threat model: an insider with database access.) Re-run:
```bash
node scripts/test-verify.mjs
```
It should now report `intact: false` and pinpoint `seq: 0` with `hashOk: false`. **This is the moment your whole project exists to produce.**

### Checklist
- [ ] Clean chain verifies `intact: true`.
- [ ] After editing one item in console, verify returns `intact: false` and the correct `seq`.
- [ ] The break points at the edited event, not a random one.

### Common mistakes
- The verifier stripping different fields than the appender hashed → false "tamper" on a clean chain. The set of fields hashed must match exactly on both sides (strip `hash`, `GSI1PK`, `GSI1SK`; hash everything else).
- Querying with `ScanIndexForward: false` here — verification must go oldest→newest.

---

# PHASE 5 — WORM checkpoints (Streams → Lambda → S3 Object Lock)

### Goal
Every N appends, a Lambda computes a Merkle root of the chain and writes it to an S3 bucket locked in **COMPLIANCE mode** — so even a full-admin tamperer can't make the chain match the independent, un-deletable checkpoint.

### Concepts (newcomer orientation)
- **Lambda** = your code that AWS runs automatically when triggered — here, triggered by the table's Stream. No server to manage.
- **Merkle root** = a single fingerprint summarizing many hashes (a tree of hashes). Storing just the root proves the whole set at that moment.
- **S3 Object Lock, COMPLIANCE mode** = once written, an object cannot be deleted or overwritten by anyone (including the AWS root account) until its retention period expires. This is the regulator-grade "write once" layer. Object Lock **must** be enabled when the bucket is created, and versioning is auto-enabled with it.
- **Demo footgun:** COMPLIANCE objects are truly un-deletable till retention ends. Use a **1-day** retention while building so you don't accumulate permanent junk. Show a longer value only as a screenshot for "production."

### Steps

**5.1 — Create the WORM bucket** (name must be globally unique — add a suffix)
```bash
aws s3api create-bucket \
  --bucket ledgerlock-worm-<yourinitials><random> \
  --object-lock-enabled-for-bucket \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api put-object-lock-configuration \
  --bucket ledgerlock-worm-<same-name> \
  --object-lock-configuration '{
    "ObjectLockEnabled":"Enabled",
    "Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":1}}
  }'
```

**5.2 — The Lambda code** — create `lambda/checkpointer.mjs`
```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "ap-south-1" }));
const s3 = new S3Client({ region: "ap-south-1" });
const TABLE = "LedgerLock";
const BUCKET = process.env.WORM_BUCKET;
const CHECKPOINT_EVERY = 10;

function merkleRoot(hashes) {
  if (hashes.length === 0) return crypto.createHash("sha256").update("EMPTY").digest("hex");
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1] ?? level[i];
      next.push(crypto.createHash("sha256").update(a + b).digest("hex"));
    }
    level = next;
  }
  return level[0];
}

export const handler = async (event) => {
  const tenants = new Set();
  for (const r of event.Records) {
    if (r.eventName === "INSERT") tenants.add(r.dynamodb.NewImage.PK.S);
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

    // Use a BOUNDARY, not a modulo. `n % 10 === 0` silently breaks when a
    // Stream batch jumps the count past a multiple of 10 (e.g. 9 -> 24).
    // The boundary = highest multiple of 10 reached, so bursts still checkpoint.
    const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
    if (boundary === 0) continue;                       // fewer than 10 events yet

    // IDEMPOTENT by design: the S3 key is a pure function of `boundary`, so if
    // Streams retries or parallel shards re-run this, they write the SAME object
    // instead of racing. No tracker item -> no second read-then-write conflict.
    const upTo = res.Items.slice(0, boundary);          // checkpoint the boundary prefix
    const last = upTo[upTo.length - 1];
    const checkpoint = {
      tenant: pk, count: boundary, lastSeq: last.seq, lastHash: last.hash,
      merkleRoot: merkleRoot(upTo.map(i => i.hash)), ts: new Date().toISOString(),
    };
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${pk.replace("#", "_")}/checkpoint-${boundary}.json`,
      Body: JSON.stringify(checkpoint), ContentType: "application/json",
    }));
  }
  return { statusCode: 200 };
};
```

> **Why not a counter/tracker item?** A separate "last-checkpointed" item in DynamoDB would also fix the skip, but DynamoDB Streams can run multiple shards in parallel, so two Lambda invocations could read the same counter and race on updating it — the same read-then-write fork we eliminated in Phase 3. The boundary approach avoids it entirely because the output key is derived purely from the event count; concurrent runs converge instead of conflict. A missed boundary self-heals on the next event.

**5.3 — Package + create the Lambda role + function**
```bash
# package
cd lambda
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3
zip -r ../checkpointer.zip . ../lambda/checkpointer.mjs
cd ..

# trust policy so Lambda can assume a role -> create lambda/trust.json:
#   {"Version":"2012-10-17","Statement":[{"Effect":"Allow",
#    "Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
aws iam create-role --role-name ledgerlock-checkpointer-role \
  --assume-role-policy-document file://lambda/trust.json

# permissions: read stream, query table, put to WORM bucket -> lambda/lambda-policy.json (use §4b from the build plan, fill ARNs)
aws iam put-role-policy --role-name ledgerlock-checkpointer-role \
  --policy-name checkpointer --policy-document file://lambda/lambda-policy.json
# also attach basic logging
aws iam attach-role-policy --role-name ledgerlock-checkpointer-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws lambda create-function --function-name ledgerlock-checkpointer \
  --runtime nodejs20.x --handler checkpointer.handler \
  --zip-file fileb://checkpointer.zip \
  --role arn:aws:iam::<ACCOUNT_ID>:role/ledgerlock-checkpointer-role \
  --environment "Variables={WORM_BUCKET=ledgerlock-worm-<same-name>}" \
  --timeout 30 --region ap-south-1
```

**5.4 — Wire the Stream to the Lambda**
```bash
aws lambda create-event-source-mapping \
  --function-name ledgerlock-checkpointer \
  --event-source-arn "<the Stream ARN from Phase 1.3>" \
  --starting-position LATEST --batch-size 100 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures \
  --region ap-south-1
```

**5.5 — Test it.** Append 10 events for a tenant (loop `appendEvent` or run the seed script from Phase 8). Then:
```bash
aws s3api list-objects-v2 --bucket ledgerlock-worm-<same-name>
```
You should see a `checkpoint-10.json`. Try to delete it — it should be **denied** (COMPLIANCE lock):
```bash
aws s3api delete-object --bucket ledgerlock-worm-<same-name> --key TENANT_acme/checkpoint-10.json
```

### Checklist
- [ ] WORM bucket exists with Object Lock COMPLIANCE default retention (1 day).
- [ ] Lambda created and event-source mapping shows `State: Enabled` (`aws lambda list-event-source-mappings`).
- [ ] After 10 appends, a checkpoint JSON appears in S3.
- [ ] Deleting that object is denied (screenshot it).
- [ ] CloudWatch Logs for the Lambda show no errors (Console → Lambda → function → Monitor → Logs).

### Common mistakes
- Forgetting `--object-lock-enabled-for-bucket` at creation — you cannot add Object Lock to an existing bucket. Recreate if you missed it.
- Setting retention to years during testing — you'll be stuck with permanent objects. Keep it at 1 day.
- Lambda missing S3/Query permissions → check CloudWatch Logs; add the *specific* action.

---

# PHASE 6 — The Next.js API on Vercel (the live backend)

### Goal
Wrap the append/verify/query logic in Next.js API routes and deploy to a live, judge-clickable Vercel URL using the *app* (least-privilege) credentials.

### Concepts (newcomer orientation)
- **Next.js** = a React framework; its **API routes** (files under `app/api/.../route.js`) run as serverless functions on Vercel — perfect for calling DynamoDB.
- **Environment variables** = secrets (your app AWS keys) stored in Vercel's settings, never in code. Your code reads them via `process.env`.
- Vercel deploys from your GitHub repo automatically on every push.

### Steps

**6.1 — Scaffold Next.js** (in your project root)
```bash
npx create-next-app@latest . --js --app --no-tailwind --no-src-dir --eslint
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```
Keep your existing `lib/` files; move them under the app if needed. Update `lib/ddb.js` to read creds from env:
```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
export const TABLE = "LedgerLock";
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.LL_ACCESS_KEY_ID,
    secretAccessKey: process.env.LL_SECRET_ACCESS_KEY,
  },
}));
```

**6.2 — API routes**
- `app/api/events/route.js` — `POST` calls `appendEvent`; `GET` runs a time-range Query (AP2).
- `app/api/verify/route.js` — `POST` calls `verifyChain`.
- `app/api/tenants/route.js` — `GET` returns the demo tenant list (hardcode for the demo).

`app/api/events/route.js`:
```js
import { appendEvent } from "@/lib/append";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "@/lib/ddb";

export async function POST(req) {
  const body = await req.json();
  try {
    const r = await appendEvent(body);                 // retries internally on seq collision
    return Response.json({ ok: true, ...r });
  } catch (e) {
    // appendEvent only throws 409 after exhausting retries (sustained contention),
    // or a real AWS error otherwise.
    const status = e.code === 409 ? 409 : 500;
    return Response.json({ ok: false, error: e.message || e.name }, { status });
  }
}

export async function GET(req) {
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
    ExpressionAttributeValues: { ":pk": `TENANT#${tenantId}`, ":p": "EVENT#" },
    ScanIndexForward: true,
  }));
  return Response.json({ items: res.Items });
}
```
`app/api/verify/route.js`:
```js
import { verifyChain } from "@/lib/verify";
export async function POST(req) {
  const { tenantId } = await req.json();
  return Response.json(await verifyChain(tenantId));
}
```

**6.3 — Local run**
Create `.env.local` (git-ignored):
```
LL_ACCESS_KEY_ID=<ledgerlock-app key>
LL_SECRET_ACCESS_KEY=<ledgerlock-app secret>
```
```bash
npm run dev
# test: curl -X POST localhost:3000/api/verify -H "content-type: application/json" -d '{"tenantId":"acme"}'
```

**6.4 — Push to GitHub + deploy on Vercel**
```bash
git add . && git commit -m "LedgerLock backend" && git push
```
- Vercel → Add New Project → import the repo → before deploying, open **Environment Variables** and add `LL_ACCESS_KEY_ID` and `LL_SECRET_ACCESS_KEY` (the app keys). Deploy.
- You get a URL like `https://ledgerlock.vercel.app`. Test: `curl -X POST https://<your-url>/api/verify -d '{"tenantId":"acme"}' -H "content-type: application/json"`.

### Checklist
- [ ] `npm run dev` works locally and `/api/verify` returns chain status.
- [ ] App uses the **least-privilege** keys (not admin) — confirm a delete path doesn't even exist in code.
- [ ] Live Vercel URL responds to `/api/events` (GET) and `/api/verify` (POST).
- [ ] Env vars are in Vercel settings, not in the repo.

### Common mistakes
- Hardcoding keys in code → leaked on GitHub. Always env vars.
- Using admin keys on Vercel — defeats the thesis and is unsafe. Use `ledgerlock-app`.
- Region mismatch between code (`ap-south-1`) and table. Keep aligned.

---

# PHASE 7 — The v0 frontend

### Goal
A premium, animated enterprise-security dashboard that visualizes the hash chain as a *living* chain — links draw in as events append, and on a tamper the chain visibly fractures and cascades red down the timeline. The animation isn't decoration; every motion dramatizes the data model, which is exactly the "design in deliberate relation to the backend" the rubric rewards. Keep it serious (these are database engineers, not a consumer crowd) but make the tamper moment cinematic.

### The detailed v0 prompt (paste this into v0.dev)

> Build a single-page enterprise compliance dashboard called **LedgerLock** in Next.js + Tailwind, using **Framer Motion** for animation. Aesthetic: serious security-grade fintech — background `zinc-950` with a very subtle radial vignette, card surfaces `zinc-900/80` with `zinc-800` hairline borders and soft shadows, off-white text, Inter for UI and JetBrains Mono for hashes. One accent only: **emerald-400** for verified/secure states. **Red-500** is reserved *exclusively* for tamper states so it feels rare and alarming when it appears. Premium, calm, high-trust — think Stripe-meets-security-console, never a colorful consumer app. Generous whitespace, restrained motion.
>
> **Layout:** fixed 260px left sidebar + main content area.
>
> **Sidebar:** LedgerLock wordmark with a shield icon that emits a subtle emerald pulse every few seconds (signals "live monitoring"). A "TENANT" label + dropdown: "Acme Health", "Northwind Bank", "Globex Insurance". A nav list with one active item "Audit Ledger" (emerald left-border when active). At the bottom, a "WORM Checkpoint" status card: a green dot, "S3 Object Lock · Synced", and a tiny JetBrains Mono Merkle-root snippet like `root: 7c2f…a91d` that fades-updates when a new checkpoint lands.
>
> **Top bar:** an `<h1>` "Audit Ledger" with a subtitle "{tenantName} · {n} events". On the right, a secondary "Append Event" button and a primary emerald "Verify Chain" button with a small lock icon. Buttons have a subtle scale-down on press.
>
> **Verification banner — the centerpiece, must be dramatic:**
> - *Verified state:* an emerald-tinted glassy strip with a shield-check icon that draws itself in via SVG path animation, text "Chain intact — {n} events verified against WORM checkpoint", and a faint emerald light-sweep that crosses the strip left-to-right when a verification completes.
> - *Verifying state:* a thin emerald scan-bar travels down the chain block by block (conveys "walking the chain"); the banner reads "Verifying chain…".
> - *Tamper state:* the strip snaps to red with a brief horizontal shake (~300ms, once — not looping), a broken-chain-link icon animates splitting into two halves, and text "⚠ TAMPER DETECTED at event #{seq} — hash mismatch; chain diverges from S3 checkpoint". Add a single subtle red flash on the viewport edge (inset box-shadow), once.
>
> **The chain (main panel) — make the data model visible and alive:** a vertical timeline of event blocks, newest at top, each connected to the next by an animated vertical "link" line so it reads as a literal chain. Each block (a `zinc-900` card) shows: a left rail with the seq number inside a circle and the connector line; a bold action label with a colored tag (PHI_READ = sky, RECORD_UPDATE = amber, EXPORT = violet, BREAK_THE_GLASS = red outline + small alert dot); actor and ISO timestamp in muted text; and a JetBrains Mono line `sha256: 9f2a…c41b` with `prev: 4d1e…` beneath it (truncate the middle). On hover, draw a faint cue connecting this block's `prev` to the previous block's `hash`, to show "this hash feeds the next."
> - *On append:* the new block slides in from the top and its link line draws downward to connect to the chain (motion = the chain extending).
> - *On verify success:* a quick emerald check ripples down the blocks top-to-bottom, ~120ms staggered.
> - *On tamper:* the offending block's connector line **snaps and splits** (animate the line breaking apart), the block gains a red border and a "HASH MISMATCH" pill that pops in, and then **every block below it animates a cascading faint-red left-border, one after another at ~150ms stagger** — visually proving the break propagates down the chain. This cascade is the demo's money shot; make it deliberate and legible.
>
> **Append modal:** a glassy centered modal (backdrop blur) with fields Actor (text input), Action (select: PHI_READ, RECORD_UPDATE, EXPORT, BREAK_THE_GLASS), and a "Flag for review" checkbox; a primary "Append" button. On submit, close the modal and the new block performs the slide-in + link-draw.
>
> **Micro-interactions:** clicking any hash copies it to the clipboard with a tiny "copied" toast; respect `prefers-reduced-motion` by disabling non-essential animation (keep the state changes, drop the movement).
>
> **Data wiring:** use React state only — no localStorage of any kind. Fetch `/api/events?tenantId=...` (GET → `{items:[...]}`) on tenant change; `/api/verify` (POST `{tenantId}` → `{intact, count, breaks:[{seq}]}`) on Verify; `/api/events` (POST the form fields) on Append. Drive the tamper cascade off the real response: if `intact` is false, treat `breaks[0].seq` as the broken block and apply the red cascade to that block and every block after it. Show the verifying scan-bar while the request is in flight. Optimize for desktop 1080p (this is the demo surface).

### Wiring notes (after v0 generates it)
- Install Framer Motion in your project if v0's export needs it: `npm install framer-motion`.
- Replace any mock data with real fetches to your Phase 6 routes.
- The event block fields map directly to DynamoDB attributes: `seq`, `action`, `actor`, `ts` (timestamp attribute), `hash`, `prevHash`. (Note: timestamp is the `ts` attribute now, not parsed from the SK — the SK is the padded seq.)
- **Make the tamper state real, not a toggle.** The cascade must fire from the actual `/api/verify` result, because a judge may click Verify themselves. The block to break is the one whose `seq === breaks[0].seq`.
- Say the rubric line out loud in your demo/writeup: the visual chain *is* the seq-ordered SK + hash links, the cascade *is* the hash dependency propagating, and the tenant switch *is* the partition key re-scoping every query.

### Checklist
- [ ] Dashboard loads real events from your live API; blocks slide in on append.
- [ ] Tenant switch re-scopes the chain (and visibly re-renders).
- [ ] Append adds a real event (confirm it also appears in the DynamoDB console).
- [ ] Verify flips the banner from the real API result and the **red cascade** highlights the correct block + everything after it.
- [ ] `prefers-reduced-motion` disables the heavy animation without breaking the states.

### Common mistakes
- Leaving the tamper banner/cascade as a fake toggle — judges may click around; wire it to the real verify response.
- Over-animating into "consumer toy" territory. Every motion should map to a data-model event (chain extending, fracturing, cascading). If a motion doesn't explain the data, cut it — restraint reads as enterprise trust to this panel.
- Forcing the timestamp out of the SK — remember the SK is the padded seq now; read `ts` from the attribute.

---

# PHASE 8 — Seed, rehearse, record

### Goal
Pre-load believable demo data, then rehearse and record the <3-minute video so the tamper-catch lands clearly.

### Steps

**8.1 — Seed script** — `scripts/seed.mjs`: loop `appendEvent` to create ~30 events each for `acme`, `northwind`, `globex`, with a realistic mix of actions and a couple of `flagged: true` (BREAK_THE_GLASS) events. Run it once against the live table. This also triggers checkpoints (every 10 events).

**8.2 — Rehearse the script** (from the build plan §8). Time it. The peak is: edit one item in the DynamoDB console → click Verify in the app → red banner + correct block. Practice the console edit so it's fast and obvious.

**8.3 — Record** with the timing:
- 0:00–0:25 problem · 0:25–1:00 model + tenant isolation + live append · 1:00–1:30 the IAM "no delete" screenshot + S3 COMPLIANCE bucket · 1:30–2:30 **tamper + catch** · 2:30–2:55 shippability + "Built on Amazon DynamoDB."
- Say the winning line on camera: *"Immutability isn't a rule we follow — it's a permission we don't have."*

### Checklist
- [ ] 3 tenants × ~30 events seeded; chains verify intact.
- [ ] At least one checkpoint per tenant in the WORM bucket.
- [ ] Full demo rehearsed under 3:00 by a stopwatch.
- [ ] Recording is clear at 1080p; console edit is legible on screen.

---

# PHASE 9 — Submit

### Goal
Package every required deliverable so you don't lose points on logistics.

### Checklist (Devpost submission)
- [ ] **Live Vercel URL** — public, pre-seeded, loads instantly.
- [ ] **<3-min video** — names DynamoDB, shows the app + tamper-catch, states problem/audience.
- [ ] **Architecture diagram** — the labeled directional one (frontend → API → DynamoDB → Streams → Lambda → S3 Object Lock), with the "PutItem + Query ONLY, no Update/Delete" labels.
- [ ] **DB-usage screenshot** — the IAM append-only policy + the DynamoDB items view showing the hash chain (and ideally the AccessDenied-on-delete screenshot).
- [ ] **Vercel Team ID** — from Vercel settings.
- [ ] **Bonus (+0.6):** a short blog post + video tagged **#H0Hackathon** — e.g. "Building a tamper-evident audit log on DynamoDB after QLDB's retirement." Write last; near-free points.
- [ ] Public GitHub repo linked, README with the architecture diagram and a one-paragraph "database thesis."

---

## Suggested order of work (so you never block yourself)
Phase 0 → 1 → 2 → 3 → 4 locally (this gets you the entire tamper-evidence story working from the command line before any cloud wiring or UI). Then 5 (the WORM layer), then 6 (deploy backend), then 7 (UI), then 8 (seed + record), then 9 (submit). If you run short on time, Phases 0–4 + 6 + 7 already make a complete, demoable product; Phase 5 is the differentiator that earns the originality points, so protect time for it.

## What to validate in the first 48 hours (don't skip)
1. Phase 2.4 — the app identity **can** PutItem but **cannot** DeleteItem (the whole thesis).
2. Phase 5.5 — a checkpoint lands in S3 and **cannot** be deleted.
3. Phase 4.3 + 8.2 — the tamper→verify demo reads clearly to someone who isn't you, in one watch, under 3 minutes.
