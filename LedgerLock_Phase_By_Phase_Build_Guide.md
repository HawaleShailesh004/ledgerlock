# LedgerLock - Phase-by-Phase Build Guide (from scratch)

**Read this first.** This guide assumes you have never used AWS or Vercel before. Every command is explained. Every console action is spelled out click by click. Do the phases **in order** - each one ends with a checklist you must pass before moving on. Don't skip ahead to the UI; the hard part (and the part that wins) is the database layer in Phases 2–5.

**The golden rule of this project:** _Immutability isn't a rule we follow - it's a permission we don't have._ Everything you build should serve that sentence.

---

## Phase map (what you're building and why each phase exists)

| Phase | Name                      | Goal                                           | Why it matters                               |
| ----- | ------------------------- | ---------------------------------------------- | -------------------------------------------- |
| 0     | Accounts & local tooling  | Get AWS + Vercel + your laptop ready           | Can't build on platforms you can't reach     |
| 1     | The table                 | Create the DynamoDB single-table + Streams     | The spine everything hangs off               |
| 2     | Least-privilege identity  | Create the IAM user/role with NO update/delete | This _is_ the product - prove immutability   |
| 3     | The append + hash chain   | Write events that chain cryptographically      | The tamper-evidence mechanism                |
| 4     | The verifier              | Walk the chain, detect tampering               | The demo's payoff                            |
| 5     | WORM checkpoints          | Streams → Lambda → S3 Object Lock              | Regulator-grade proof; the originality point |
| 6     | The Next.js API on Vercel | Deploy the live, judge-clickable backend       | A submission requirement                     |
| 7     | The v0 frontend           | Build + wire the dashboard UI                  | Design rubric + the demo surface             |
| 8     | Seed, rehearse, record    | Demo data + the <3-min video                   | Demo clarity is a scored differentiator      |
| 9     | Submit                    | Package all deliverables                       | Don't lose points on logistics               |

Each phase below has: **Goal · Concepts (for newcomers) · Steps · Checklist · Common mistakes.**

---

# PHASE 0 - Accounts & local tooling

### Goal

A working AWS account, a Vercel account, and a laptop that can run Node.js and talk to AWS from the command line.

### Concepts (newcomer orientation)

- **AWS** = Amazon's cloud. You'll use three services: **DynamoDB** (the database), **Lambda** (tiny serverless functions), **S3** (file storage with a write-once lock). A **region** is a physical location; you'll use `ap-south-1` (Mumbai) because it's closest to you and DynamoDB is fully available there.
- **The AWS Console** = the website (web UI) where you click things. **The AWS CLI** = a command-line tool that does the same things by typing. We'll use both; the CLI is faster and reproducible.
- **Vercel** = where your Next.js website runs, with a public URL. It connects to AWS over the internet using access keys.
- **Credentials** = an Access Key ID + Secret Access Key. Think of them as a username/password for the CLI and for your app. Treat the secret like a password - never commit it to GitHub.

### Steps

**0.1 - Create an AWS account**

1. Go to aws.amazon.com → "Create an AWS Account." You'll need a card (this build costs cents, but AWS requires one).
2. Once in, top-right corner: set your region to **Asia Pacific (Mumbai) ap-south-1**. Do this now and leave it.

**0.2 - Create an admin user for yourself (don't use the root login for daily work)**

1. In the console search bar, type **IAM** → open it.
2. Left menu → **Users** → **Create user**. Name it `ledgerlock-admin`.
3. "Provide user access to the AWS Management Console" - optional; you can skip console access for this user.
4. Permissions → **Attach policies directly** → check **AdministratorAccess** (this is your build identity; the _app_ identity in Phase 2 will be locked down - different thing).
5. Create user → click into it → **Security credentials** tab → **Create access key** → choose **Command Line Interface (CLI)** → confirm → **download the .csv**. This has your Access Key ID + Secret. Keep it safe.

**0.3 - Install Node.js and the AWS CLI on your laptop**

- Node.js: install the LTS version from nodejs.org. Verify: `node -v` (should print v20+).
- AWS CLI v2: follow aws.amazon.com/cli for your OS. Verify: `aws --version`.

**0.4 - Connect the CLI to your account**

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

**0.5 - Create a Vercel account**

- Go to vercel.com → sign up with GitHub (easiest, since you'll deploy from a repo later). No build needed yet.

**0.6 - Make a project folder + git repo**

```bash
mkdir ledgerlock && cd ledgerlock
git init
node -v && aws sts get-caller-identity   # final sanity check
```

### Checklist (must all pass)

- [ ] `aws sts get-caller-identity` prints your account - CLI works.
- [ ] Region is `ap-south-1` everywhere (console top-right + `aws configure`).
- [ ] `node -v` is v20 or higher.
- [ ] Vercel account exists and is linked to GitHub.
- [ ] You have your access key .csv stored somewhere safe (NOT in the project folder).

### Common mistakes

- Leaving the region as `us-east-1`. If your table is in Mumbai and your code says `us-east-1`, nothing connects. Be consistent.
- Committing credentials to git. Add a `.gitignore` now: create a file `.gitignore` containing `.env*` and `node_modules` and the `.csv`.

---

# PHASE 1 - The table

### Goal

Create the `LedgerLock` DynamoDB table with the right key schema, one sparse GSI, and Streams turned on.

### Concepts (newcomer orientation)

- **DynamoDB** stores **items** (like rows) in **tables**. Unlike SQL, there are no joins and no fixed columns - each item is a bag of attributes.
- **Partition key (PK)** + **Sort key (SK)** together identify an item. All items with the same PK live together and are sorted by SK. We use `PK = TENANT#<id>` so each customer's events are grouped, and `SK = EVENT#<zero-padded-seq>` (e.g. `EVENT#0000000006`) so they're in strict sequence order. **Using the sequence number - not a timestamp+random ID - as the sort key is a deliberate choice that prevents the chain from forking under concurrent writes** (explained in Phase 3). The human-readable timestamp lives in a separate `ts` attribute.
- **GSI (Global Secondary Index)** = a second "view" of the table with a different key, so you can query a different way. Ours indexes only _flagged_ events (a "sparse" index - items without the GSI key simply don't appear in it, which is efficient and cheap).
- **Streams** = a live feed of every change to the table. We'll later attach a Lambda to it. Turn it on now (it must be on before anything writes, to capture from the start). We use `NEW_IMAGE` so the stream carries the full new item.
- **Billing mode PAY_PER_REQUEST** = on-demand; you pay per request and it scales to zero. Perfect for a hackathon - no idle cost, no capacity planning.

### Steps

**1.1 - Create the table** (run this exactly; explanation follows)

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

- `--attribute-definitions` - you only declare attributes used in keys. `S` = string. (Other attributes like `actor`, `payload` are NOT declared - DynamoDB is schemaless for non-key fields.)
- `--key-schema` - `HASH` means partition key, `RANGE` means sort key.
- `--global-secondary-indexes` - defines GSI1 on the two GSI attributes. `Projection ALL` = copy all attributes into the index so queries on it return full items.

**1.2 - Wait until it's active**

```bash
aws dynamodb describe-table --table-name LedgerLock --region ap-south-1 \
  --query "Table.TableStatus"
```

Repeat until it prints `"ACTIVE"` (usually ~10–30 seconds).

**1.3 - Capture the Stream ARN (you need it in Phase 5)**

```bash
aws dynamodb describe-table --table-name LedgerLock --region ap-south-1 \
  --query "Table.LatestStreamArn" --output text
```

Copy the output (looks like `arn:aws:dynamodb:ap-south-1:...:table/LedgerLock/stream/2026-...`). Paste it into a notes file.

**1.4 - Verify in the console (newcomer confidence check)**

- Console → DynamoDB → Tables → LedgerLock. You should see the table, "Exports and streams" tab showing DynamoDB stream **On** with view type **New image**, and an "Indexes" tab showing **GSI1**.

### Checklist

- [ ] `TableStatus` is `ACTIVE`.
- [ ] `LatestStreamArn` returned a value and you saved it.
- [ ] Console shows GSI1 present and Streams = On (New image).

### Common mistakes

- Declaring non-key attributes in `--attribute-definitions` → error. Only key attributes go there.
- Forgetting Streams now and turning them on later - you'll miss early events. Turn on at creation.

---

# PHASE 2 - Least-privilege identity (the product itself)

### Goal

Create a _separate_ AWS identity that your app will use, with permission to **append and read only** - explicitly **no UpdateItem, no DeleteItem**. This is the architectural heart of LedgerLock.

### Concepts (newcomer orientation)

- An **IAM policy** is a JSON document listing exactly which actions an identity may perform. If an action isn't listed, it's denied by default.
- Your _admin_ user (Phase 0) can do anything - that's for building. The _app_ identity here can only `PutItem` and `Query`. So even if your app's keys leak, an attacker cannot alter or delete history. That's the guarantee you demo.
- We'll make an **IAM user** with access keys for the app (simplest path for Vercel). The policy is what you screenshot for the submission's "DB usage" requirement.

### Steps

**2.1 - Write the policy file** (create `iam/append-policy.json` in your project)

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

**2.2 - Create the policy in AWS**

```bash
aws iam create-policy \
  --policy-name LedgerLockAppendOnly \
  --policy-document file://iam/append-policy.json
```

Copy the returned policy `Arn`.

**2.3 - Create the app user and attach the policy**

```bash
aws iam create-user --user-name ledgerlock-app

aws iam attach-user-policy \
  --user-name ledgerlock-app \
  --policy-arn <the policy Arn from 2.2>

aws iam create-access-key --user-name ledgerlock-app
```

The last command prints an **AccessKeyId** and **SecretAccessKey** for the _app_. Save them - these go into Vercel later (Phase 6), NOT into git.

**2.4 - Prove the lock works (the test that matters)**
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

You should get `AccessDeniedException ... not authorized to perform: dynamodb:DeleteItem`. **Screenshot this denial - it's gold for your demo and writeup.** Then clean up the test item using your _admin_ profile (default):

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

- Putting `dynamodb:*` "just to get it working." That destroys the entire thesis. Resist it. If a later step fails on permissions, add the _specific_ read action (e.g. `dynamodb:Query`), never the wildcard.
- Confusing the admin identity with the app identity. Admin builds; app runs. Keep them separate.

---

# PHASE 3 - The append endpoint + hash chain

### Goal

A function that appends an event to a tenant's chain, where each event's hash cryptographically depends on the previous one. This is the tamper-evidence mechanism.

### Concepts (newcomer orientation)

- A **hash** (SHA-256) turns any text into a fixed fingerprint. Change one character of input → completely different fingerprint. We store each event's fingerprint.
- A **hash chain**: each event's fingerprint includes the _previous_ event's fingerprint. So if someone alters event #5, its fingerprint changes, which breaks #6's expected previous-fingerprint, which breaks #7… the whole tail is invalidated. That's what makes tampering _detectable_.
- **Canonical JSON**: to hash an object reliably, we must serialize it the same way every time (keys sorted), or the fingerprint would vary meaninglessly.
- **Why the sort key is the sequence number (the critical design decision):** It's tempting to make the SK a timestamp plus a random ID (a ULID). **Don't** - it creates a silent, fatal bug. The `attribute_not_exists(SK)` guard only protects the _exact key_. If two appends happen at once and each gets a different random ID, both keys are unique, so _both writes succeed_ - and now you have two events both claiming sequence 6, both pointing at the same previous hash. Your chain has **forked into two branches**, and the verifier will report a break under normal concurrent load. The fix: make the SK the zero-padded sequence number itself (`EVENT#0000000006`). Now two concurrent appends target the _same_ key, the conditional write lets exactly one through, and the loser retries. This is called **optimistic concurrency control**, and doing it with a single conditional write (no locks, no queue) is exactly the kind of engine-level detail these database judges respect.
- **Conditional write**: `PutItem` with `ConditionExpression: attribute_not_exists(SK)` means "only create if this exact key doesn't already exist." With a seq-based key this does double duty: it enforces append-only _and_ prevents chain forks.

### Steps

**3.1 - Initialise the Node project + dependencies**

```bash
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

- `@aws-sdk/client-dynamodb` + `lib-dynamodb` = the AWS SDK for talking to DynamoDB (the `lib-dynamodb` "Document client" lets you use plain JS objects instead of the verbose `{"S":"..."}` format).
- (No ULID package - we removed it deliberately. The sort key is the sequence number, not a random ID; see the concept note above.)

**3.2 - The shared chain util** - create `lib/chain.js`

```js
import crypto from "crypto";

// Deterministic serialization: same logical object => same string, always.
export function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") +
    "}"
  );
}

// hash = SHA256( canonical(event-without-hash) + prevHash )
export function computeHash(eventWithoutHash, prevHash) {
  return crypto
    .createHash("sha256")
    .update(canonical(eventWithoutHash) + prevHash)
    .digest("hex");
}

// Merkle root over an ordered list of leaf hashes.
// Used by the verifier (live root) and mirrored in the Lambda (WORM root) - the two
// copies must stay byte-identical or the live-vs-WORM cross-check will falsely diverge.
export function merkleRoot(hashes) {
  if (hashes.length === 0)
    return crypto.createHash("sha256").update("EMPTY").digest("hex");
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i],
        b = level[i + 1] ?? level[i]; // duplicate last if odd
      next.push(
        crypto
          .createHash("sha256")
          .update(a + b)
          .digest("hex"),
      );
    }
    level = next;
  }
  return level[0];
}
```

**3.3 - A reusable DynamoDB client** - create `lib/ddb.js`

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE = "LedgerLock";
export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "ap-south-1" }),
);
```

**3.4 - The append logic** - create `lib/append.js`

The sort key is `EVENT#<padded-seq>`, and the function retries on collision. Read the concept note above if you skipped it - this structure is the whole reason the ledger is safe under concurrent writes.

```js
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash } from "./chain.js";

const MAX_RETRIES = 5;

export async function appendEvent({
  tenantId,
  actor,
  action,
  payload,
  flagged = false,
}) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // AP3: read the tenant's most recent event to chain onto it
    const last = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
        ExpressionAttributeValues: {
          ":pk": `TENANT#${tenantId}`,
          ":p": "EVENT#",
        },
        ScanIndexForward: false, // newest (highest seq) first
        Limit: 1,
      }),
    );
    const prev = last.Items?.[0];
    const prevHash = prev ? prev.hash : "GENESIS";
    const seq = prev ? prev.seq + 1 : 0;

    const ts = new Date().toISOString();
    const sk = `EVENT#${String(seq).padStart(10, "0")}`; // seq IS the uniqueness constraint
    // ts is a normal attribute (for display + time queries) and IS part of the hash
    const base = {
      PK: `TENANT#${tenantId}`,
      SK: sk,
      seq,
      prevHash,
      actor,
      action,
      payload,
      flagged,
      ts,
    };
    const hash = computeHash(base, prevHash);

    const item = { ...base, hash };
    if (flagged) {
      item.GSI1PK = `ALERT#${tenantId}`;
      item.GSI1SK = `EVENT#${ts}`;
    } // sparse index

    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: item,
          ConditionExpression: "attribute_not_exists(SK)", // append-only AND fork-prevention
        }),
      );
      return { seq, hash, sk, attempts: attempt + 1 };
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        // another writer claimed this seq first - wait briefly, re-read tail, recompute
        await new Promise((r) =>
          setTimeout(r, 20 * (attempt + 1) + Math.random() * 20),
        );
        continue;
      }
      throw e; // a real error, not a race
    }
  }
  const err = new Error("append_conflict_exhausted"); // sustained contention (rare here)
  err.code = 409;
  throw err;
}
```

**What the retry loop does:** if two requests race for sequence 6, one wins and the other's `PutItem` throws `ConditionalCheckFailedException`. Instead of failing, it loops: re-reads the tail (now at seq 6), recomputes its hash against the _real_ new previous hash, and writes seq 7. The chain stays perfectly linear. At audit-log write rates you'll almost never see a retry, but the safety is there and it's a great thing to mention in your writeup.

**3.5 - Quick local test** - create `scripts/test-append.mjs`

```js
import { appendEvent } from "../lib/append.js";

const r1 = await appendEvent({
  tenantId: "acme",
  actor: "dr.smith",
  action: "PHI_READ",
  payload: { patient: "p-001" },
});
const r2 = await appendEvent({
  tenantId: "acme",
  actor: "dr.smith",
  action: "RECORD_UPDATE",
  payload: { patient: "p-001", field: "dosage" },
});
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
- [ ] Re-running appends new events with incrementing seq (1, 2, 3…) - it never overwrites.
- [ ] The SK of each item looks like `EVENT#0000000000`, `EVENT#0000000001`, … (padded seq, no random ID).

### Common mistakes

- **Putting a timestamp+ULID in the sort key.** This is the one fatal mistake. Random keys let concurrent writes both succeed and fork the chain. The SK must be the zero-padded `seq`. (See the concept note in this phase.)
- Hashing the item _including_ its own `hash` field - circular. Always hash the event _without_ the hash, then attach the hash.
- Forgetting `"type": "module"` → `import` errors. Add it.
- Including `GSI1PK`/`GSI1SK` in the hashed `base` - don't; they're index plumbing, not audited content. (The verifier in Phase 4 strips them too - keep both sides consistent.) Note `ts` and `seq` ARE hashed, so the verifier keeps them.

---

# PHASE 4 - The verifier

### Goal

A function that walks a tenant's entire chain, recomputes every hash, and returns the exact event where tampering occurred (if any). This produces the demo's payoff.

### Concepts (newcomer orientation)

- Verification = replay the chain from the start. For each event: (a) does its stored `prevHash` match the actual previous event's hash? (chain continuity) and (b) does recomputing its hash from its own contents match its stored hash? (content integrity). If either fails, that event was tampered with.
- We walk forward using the **stored** hash as the link to the next event, so a single tampered event surfaces as a clean break at exactly that `seq`.

### Steps

**4.1 - The verify logic** - create `lib/verify.js`

```js
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb.js";
import { computeHash, merkleRoot } from "./chain.js";

const CHECKPOINT_EVERY = 10; // must match the Lambda cadence

export async function verifyChain(tenantId) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: {
        ":pk": `TENANT#${tenantId}`,
        ":p": "EVENT#",
      },
      ScanIndexForward: true, // oldest first
    }),
  );

  let prevHash = "GENESIS";
  let expectedSeq = 0;
  const breaks = [];
  for (const it of res.Items) {
    const { hash, GSI1PK, GSI1SK, ...rest } = it; // strip stored hash + index attrs (ts/seq stay - they were hashed)
    const recomputed = computeHash(rest, prevHash);
    const linkOk = it.prevHash === prevHash; // continuity
    const hashOk = recomputed === hash; // integrity
    const seqOk = it.seq === expectedSeq; // no fork, no deletion gap
    if (!linkOk || !hashOk || !seqOk) {
      breaks.push({ seq: it.seq, SK: it.SK, linkOk, hashOk, seqOk });
    }
    prevHash = hash; // advance using stored hash
    expectedSeq = it.seq + 1;
  }

  // Live Merkle root at the latest checkpoint boundary, over CURRENT stored hashes.
  // Compared by the UI against the immutable WORM root from S3 (/api/checkpoint).
  const n = res.Items.length;
  const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
  const liveRootAtBoundary =
    boundary > 0
      ? merkleRoot(res.Items.slice(0, boundary).map((i) => i.hash))
      : null;

  return {
    intact: breaks.length === 0,
    count: n,
    breaks,
    boundary,
    liveRootAtBoundary,
  };
}
```

The `seqOk` check catches a _fork_ (two events with the same seq) or a _deletion gap_, in addition to hash tampering. `liveRootAtBoundary` is the live fingerprint of the first `boundary` events (e.g. first 30) - the UI compares it to the WORM checkpoint's root for the same 30. They match when untouched; a tamper inside that prefix makes them diverge, and the WORM root can't be changed to match (Object Lock).

**4.2 - Tamper test** - create `scripts/test-verify.mjs`

```js
import { verifyChain } from "../lib/verify.js";
console.log(JSON.stringify(await verifyChain("acme"), null, 2));
```

Run it - should report `intact: true`.

**4.3 - Now simulate a malicious admin.** In the DynamoDB console: Explore items → LedgerLock → open event seq 0 for `TENANT#acme` → edit the `payload` (e.g. change the patient id) → Save. (You're using _admin_ rights here, deliberately bypassing the app - that's the threat model: an insider with database access.) Re-run:

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
- Querying with `ScanIndexForward: false` here - verification must go oldest→newest.

---

# PHASE 5 - WORM checkpoints (Streams → Lambda → S3 Object Lock)

### Goal

Every N appends, a Lambda computes a Merkle root of the chain and writes it to an S3 bucket locked in **COMPLIANCE mode** - so even a full-admin tamperer can't make the chain match the independent, un-deletable checkpoint.

### Concepts (newcomer orientation)

- **Lambda** = your code that AWS runs automatically when triggered - here, triggered by the table's Stream. No server to manage.
- **Merkle root** = a single fingerprint summarizing many hashes (a tree of hashes). Storing just the root proves the whole set at that moment.
- **S3 Object Lock, COMPLIANCE mode** = once written, an object cannot be deleted or overwritten by anyone (including the AWS root account) until its retention period expires. This is the regulator-grade "write once" layer. Object Lock **must** be enabled when the bucket is created, and versioning is auto-enabled with it.
- **Demo footgun:** COMPLIANCE objects are truly un-deletable till retention ends. Use a **1-day** retention while building so you don't accumulate permanent junk. Show a longer value only as a screenshot for "production."

### Steps

**5.1 - Create the WORM bucket** (name must be globally unique - add a suffix)

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

**5.2 - The Lambda code** - create `lambda/checkpointer.mjs`

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "ap-south-1" }),
);
const s3 = new S3Client({ region: "ap-south-1" });
const TABLE = "LedgerLock";
const BUCKET = process.env.WORM_BUCKET;
const CHECKPOINT_EVERY = 10;

// ⚠ keep this byte-identical to merkleRoot() in lib/chain.js, or the live-vs-WORM
// cross-check in the UI will always falsely diverge. (Lambda is a separate deploy
// package, so it can't import from @/lib - hence the duplicated copy.)
function merkleRoot(hashes) {
  if (hashes.length === 0)
    return crypto.createHash("sha256").update("EMPTY").digest("hex");
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i],
        b = level[i + 1] ?? level[i];
      next.push(
        crypto
          .createHash("sha256")
          .update(a + b)
          .digest("hex"),
      );
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
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
        ExpressionAttributeValues: { ":pk": pk, ":p": "EVENT#" },
        ScanIndexForward: true,
      }),
    );
    const n = res.Items.length;
    if (n === 0) continue;

    // Use a BOUNDARY, not a modulo. `n % 10 === 0` silently breaks when a
    // Stream batch jumps the count past a multiple of 10 (e.g. 9 -> 24).
    // The boundary = highest multiple of 10 reached, so bursts still checkpoint.
    const boundary = Math.floor(n / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;
    if (boundary === 0) continue; // fewer than 10 events yet

    // IDEMPOTENT by design: the S3 key is a pure function of `boundary`, so if
    // Streams retries or parallel shards re-run this, they write the SAME object
    // instead of racing. No tracker item -> no second read-then-write conflict.
    const upTo = res.Items.slice(0, boundary); // checkpoint the boundary prefix
    const last = upTo[upTo.length - 1];
    const checkpoint = {
      tenant: pk,
      count: boundary,
      lastSeq: last.seq,
      lastHash: last.hash,
      merkleRoot: merkleRoot(upTo.map((i) => i.hash)),
      ts: new Date().toISOString(),
    };
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${pk.replace("#", "_")}/checkpoint-${boundary}.json`,
        Body: JSON.stringify(checkpoint),
        ContentType: "application/json",
      }),
    );
  }
  return { statusCode: 200 };
};
```

> **Why not a counter/tracker item?** A separate "last-checkpointed" item in DynamoDB would also fix the skip, but DynamoDB Streams can run multiple shards in parallel, so two Lambda invocations could read the same counter and race on updating it - the same read-then-write fork we eliminated in Phase 3. The boundary approach avoids it entirely because the output key is derived purely from the event count; concurrent runs converge instead of conflict. A missed boundary self-heals on the next event.

**5.3 - Package + create the Lambda role + function**

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

**5.4 - Wire the Stream to the Lambda**

```bash
aws lambda create-event-source-mapping \
  --function-name ledgerlock-checkpointer \
  --event-source-arn "<the Stream ARN from Phase 1.3>" \
  --starting-position LATEST --batch-size 100 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures \
  --region ap-south-1
```

**5.5 - Test it.** Append 10 events for a tenant (loop `appendEvent` or run the seed script from Phase 8). Then:

```bash
aws s3api list-objects-v2 --bucket ledgerlock-worm-<same-name>
```

You should see a `checkpoint-10.json`. Try to delete it - it should be **denied** (COMPLIANCE lock):

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

- Forgetting `--object-lock-enabled-for-bucket` at creation - you cannot add Object Lock to an existing bucket. Recreate if you missed it.
- Setting retention to years during testing - you'll be stuck with permanent objects. Keep it at 1 day.
- Lambda missing S3/Query permissions → check CloudWatch Logs; add the _specific_ action.

---

# PHASE 6 - The Next.js API on Vercel (the live backend)

### Goal

Wrap the append/verify/query logic in Next.js API routes and deploy to a live, judge-clickable Vercel URL using the _app_ (least-privilege) credentials.

### Concepts (newcomer orientation)

- **Next.js** = a React framework; its **API routes** (files under `app/api/.../route.js`) run as serverless functions on Vercel - perfect for calling DynamoDB.
- **Environment variables** = secrets (your app AWS keys) stored in Vercel's settings, never in code. Your code reads them via `process.env`.
- Vercel deploys from your GitHub repo automatically on every push.

### Steps

**6.1 - Scaffold Next.js** (in your project root)

```bash
npx create-next-app@latest . --js --app --no-tailwind --no-src-dir --eslint
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

Keep your existing `lib/` files; move them under the app if needed. Update `lib/ddb.js` to read creds from env:

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
export const TABLE = "LedgerLock";
export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "ap-south-1",
    credentials: {
      accessKeyId: process.env.LL_ACCESS_KEY_ID,
      secretAccessKey: process.env.LL_SECRET_ACCESS_KEY,
    },
  }),
);
```

**6.2 - API routes**

- `app/api/events/route.js` - `POST` calls `appendEvent`; `GET` runs a time-range Query (AP2).
- `app/api/verify/route.js` - `POST` calls `verifyChain`.
- `app/api/tenants/route.js` - `GET` returns the demo tenant list (hardcode for the demo).

`app/api/events/route.js`:

```js
import { appendEvent } from "@/lib/append";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "@/lib/ddb";

export async function POST(req) {
  const body = await req.json();
  try {
    const r = await appendEvent(body); // retries internally on seq collision
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
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :p)",
      ExpressionAttributeValues: {
        ":pk": `TENANT#${tenantId}`,
        ":p": "EVENT#",
      },
      ScanIndexForward: true,
    }),
  );
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

`app/api/checkpoint/route.js` (reads the immutable WORM root from S3 for the cross-check):

```js
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.LL_ACCESS_KEY_ID,
    secretAccessKey: process.env.LL_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.WORM_BUCKET;

export async function GET(req) {
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  const prefix = `TENANT_${tenantId}/`;
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }),
  );
  const keys = (list.Contents || [])
    .map((o) => o.Key)
    .filter((k) => k.endsWith(".json"))
    .sort(
      (a, b) =>
        Number(b.match(/checkpoint-(\d+)\.json/)?.[1] || 0) -
        Number(a.match(/checkpoint-(\d+)\.json/)?.[1] || 0),
    );
  if (keys.length === 0) return Response.json({ checkpoint: null });
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: keys[0] }),
  );
  const body = await obj.Body.transformToString();
  return Response.json({ checkpoint: JSON.parse(body) });
}
```

You'll need the AWS S3 SDK: `npm install @aws-sdk/client-s3`. And the app user needs **read-only** S3 on the WORM bucket - go back to Phase 2 and add this statement to `iam/append-policy.json`, then re-run the policy update (`aws iam create-policy-version` or recreate). Read only - the app must never be able to write/delete the WORM layer:

```json
{
  "Sid": "ReadOnlyWormCheckpoints",
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:ListBucket"],
  "Resource": [
    "arn:aws:s3:::ledgerlock-worm-<same-name>",
    "arn:aws:s3:::ledgerlock-worm-<same-name>/*"
  ]
}
```

**6.3 - Local run**
Create `.env.local` (git-ignored):

```
LL_ACCESS_KEY_ID=<ledgerlock-app key>
LL_SECRET_ACCESS_KEY=<ledgerlock-app secret>
WORM_BUCKET=ledgerlock-worm-<same-name>
```

```bash
npm run dev
# test verify:     curl -X POST localhost:3000/api/verify -H "content-type: application/json" -d '{"tenantId":"acme"}'
# test checkpoint: curl "localhost:3000/api/checkpoint?tenantId=acme"
```

**6.4 - Push to GitHub + deploy on Vercel**

```bash
git add . && git commit -m "LedgerLock backend" && git push
```

- Vercel → Add New Project → import the repo → before deploying, open **Environment Variables** and add `LL_ACCESS_KEY_ID`, `LL_SECRET_ACCESS_KEY` (the app keys), and `WORM_BUCKET` (your bucket name). Deploy.
- You get a URL like `https://ledgerlock.vercel.app`. Test: `curl -X POST https://<your-url>/api/verify -d '{"tenantId":"acme"}' -H "content-type: application/json"` and `curl "https://<your-url>/api/checkpoint?tenantId=acme"`.

### Checklist

- [ ] `npm run dev` works locally and `/api/verify` returns chain status **plus** `liveRootAtBoundary` + `boundary`.
- [ ] `/api/checkpoint?tenantId=...` returns the latest WORM checkpoint JSON (with `merkleRoot`).
- [ ] When the chain is intact, `verify.liveRootAtBoundary === checkpoint.merkleRoot` for the same boundary.
- [ ] App uses the **least-privilege** keys (not admin); it can read S3 but has no write/delete on the bucket and no Update/Delete on DynamoDB.
- [ ] Live Vercel URL responds to `/api/events` (GET), `/api/verify` (POST), `/api/checkpoint` (GET).
- [ ] `LL_ACCESS_KEY_ID`, `LL_SECRET_ACCESS_KEY`, `WORM_BUCKET` are in Vercel settings, not in the repo.

### Common mistakes

- Hardcoding keys in code → leaked on GitHub. Always env vars.
- Using admin keys on Vercel - defeats the thesis and is unsafe. Use `ledgerlock-app`.
- Region mismatch between code (`ap-south-1`) and table/bucket. Keep aligned.
- Giving the app S3 write/delete "to make it work." It needs **read-only** on the WORM bucket; write access would let the app weaken the immutability layer it's supposed to prove.
- The verifier's `merkleRoot` and the Lambda's `merkleRoot` drifting apart → the cross-check falsely diverges on a clean chain. Keep them byte-identical.

---

# PHASE 7 - The v0 frontend

### Goal

Production-grade software that looks like a **precision instrument**, not a demo. The design language is the database itself made legible: the data (sequence numbers, hashes, the chain) is the hero and is rendered with obvious care; the chrome (nav, labels, buttons) recedes to hairlines and muted text. No landing page, no "how it works," no marketing - you open straight into the working tool, the way a real auditor's console would. Motion is mechanical and exact: things **lock** into place, nothing bounces. Color is almost entirely absent until it carries meaning.

### The design system (commit to this - it's the whole identity)

**Concept word: INSTRUMENT.** The reference points are a Bloomberg terminal, an oscilloscope, a flight instrument - screens that feel serious because they are _exact_, dense, and data-forward, not because they are decorated. Every choice below serves "this is a precision tool a professional trusts."

**Color - a warm-black instrument palette, not stock zinc:**

- Canvas: `#0B0C0E` (a near-black with a faint cool undertone - deliberately _not_ Tailwind `zinc-950`, which every v0 demo uses). Panels one step up: `#111317`. Raised surfaces: `#16181D`.
- Hairlines and dividers: `#23262C` (1px, used a lot - instruments are full of fine rules).
- Text: primary `#E7E9EC` (soft white, never pure `#FFF`), secondary `#8A9099`, tertiary/labels `#5A6069` (small uppercase tracked labels).
- **Verified accent - desaturated steel-cyan, not emerald:** `#3FB6C4` used sparingly (a verified tick, an active row indicator). It reads as "instrument/infrastructure," not "success toast." Keep it low-saturation and low-coverage.
- **Tamper signal - one high-saturation alarm color, reserved 100% for tampering:** `#FF5A3C` (a hot signal-orange-red, more alarming and more specific than generic error-red). It must appear _nowhere_ else in the entire UI, so when it shows up the eye knows instantly something is wrong.
- Action tags use _muted_ dot indicators, not bright fills: PHI_READ `#6B8AFD`, RECORD_UPDATE `#C9A24B`, EXPORT `#9B7BD4`, BREAK_THE_GLASS uses the tamper signal `#FF5A3C` as a hollow ring. All low-key - they're metadata, not decoration.

**Typography - the data is the hero, and nothing is Inter/JetBrains-default:**

- UI face: a tight, authoritative grotesque - use **Geist** or **Söhne**-style; if only Google Fonts are available in v0, use **`Geist`** or fall back to **`Hanken Grotesk`** / **`Archivo`** (avoid plain Inter - it's the ecosystem default and reads as "ungesigned"). Set labels in small caps, ~11px, letter-spacing +0.08em, in the tertiary text color.
- Mono (the hero typeface): hashes, sequence numbers, timestamps, Merkle roots all in a _characterful_ mono - **`IBM Plex Mono`** or **`Space Mono`** (both on Google Fonts; avoid JetBrains Mono, the default). The mono data should be **larger and brighter than the surrounding UI labels** - invert the usual hierarchy so the fingerprints dominate. A hash isn't a caption here; it's the subject.
- The seq number is set large in mono as the visual anchor of each event row.

**Layout - dense and instrument-like, the chain as the structural spine:**

- No generic 260px-sidebar-+-content shell. Instead a **three-zone instrument layout**: a slim left rail (~64px, icon-only, no labels - pure tool chrome), a central **ledger column** that is the dominant element (the chain runs down it as the literal backbone of the screen), and a right **inspector panel** (~320px) that shows the full detail of the selected event (every attribute, full untruncated hashes, the recompute view).
- Density over whitespace: tight, accountable spacing, fine hairline rules between rows, a persistent top status strip and a persistent bottom "telemetry" bar (event count, last checkpoint seq, verify status) - like a real terminal has a status line. This density is the signal that says "real tool," not "marketing site."
- A small monospace tenant selector lives in the top strip (not a big sidebar dropdown) - `tenant: acme-health ▾` in mono, understated.

**Motion - mechanical, exact, cryptographic. Nothing bounces:**

- Transitions are crisp and fast (120–180ms), linear or sharp ease-out, **no spring overshoot**. The feeling is a tumbler clicking, a relay switching - deterministic, not playful.
- A hash "locks in" by snapping into alignment, not fading softly.
- Use `framer-motion` but with tight, non-springy transitions (`ease: [0.2, 0, 0, 1]`, short durations).

### The detailed v0 prompt (paste this into v0.dev)

> Build a production-grade, single-screen audit-ledger console called **LedgerLock** in Next.js + Tailwind with **Framer Motion**. This is a working internal tool for compliance officers - open directly into the tool, NO landing page, NO hero, NO "how it works", NO marketing copy. The design language is "precision instrument" - think Bloomberg terminal / oscilloscope: dense, exact, data-forward, serious. The data (sequence numbers, SHA-256 hashes, Merkle roots) is the visual hero; chrome recedes.
>
> **Exact palette (use these hex values, not Tailwind defaults):** canvas `#0B0C0E`; panels `#111317`; raised `#16181D`; hairlines `#23262C` (1px, used liberally); text primary `#E7E9EC`, secondary `#8A9099`, label `#5A6069` (small uppercase, letter-spacing 0.08em). Verified/active accent: desaturated steel-cyan `#3FB6C4`, used sparingly. **Tamper signal `#FF5A3C` (hot orange-red) is reserved EXCLUSIVELY for tamper states and must appear nowhere else in the UI.** Action dot colors, all muted: PHI_READ `#6B8AFD`, RECORD_UPDATE `#C9A24B`, EXPORT `#9B7BD4`, BREAK_THE_GLASS = hollow `#FF5A3C` ring.
>
> **Typography:** UI font `Geist` (or `Hanken Grotesk` if unavailable) - NOT Inter. Mono font `IBM Plex Mono` (or `Space Mono`) for ALL hashes, seq numbers, timestamps, roots - NOT JetBrains Mono. Critically: the mono data should be LARGER and BRIGHTER than the UI labels around it - invert the usual hierarchy so the fingerprints and sequence numbers dominate each row. Labels are small (11px), uppercase, tracked, in `#5A6069`.
>
> **Layout - three zones, dense, no big sidebar:**
>
> - A slim 64px left rail, icon-only (shield mark at top, a couple of nav glyphs, a status dot at bottom). No text labels in the rail.
> - A persistent top status strip (32px): left shows a mono tenant selector `tenant: acme-health ▾` (dropdown: acme-health, northwind-bank, globex-insurance); right shows live status chips in mono - `events: 32`, `checkpoint: #30`, and a verify-state chip.
> - The center **ledger column** is the dominant element: the hash chain runs vertically down it as the literal spine of the screen.
> - A right **inspector panel** (320px) showing the full detail of the selected event: every attribute, the FULL untruncated `hash` and `prevHash` in mono (wrapped), actor, action, timestamp, seq, and a "Recompute" view (described below).
> - A persistent bottom telemetry bar (28px) in mono: `last verify: intact · 32/32` etc - like a terminal status line.
>
> **The ledger column (the chain):** each event is a tight row (not a fat card), separated by hairline rules. Each row: a large mono **seq number** on the left as the anchor (`0006`), a small muted action dot + action name, the actor, a mono truncated hash `9f2a…c41b`, and a mono timestamp at the right edge. The active/selected row gets a 2px steel-cyan left edge and a slightly raised background. Down the left of the column runs a continuous 1px vertical "chain line" threading through every seq anchor - the literal chain. On hover of a row, briefly illuminate the segment of chain line connecting this row's `prev` up to the previous row, showing the hash dependency.
>
> - _On append:_ the new row snaps in at the bottom (sharp, 140ms, no bounce) and the chain line extends down to it with a quick draw.
>
> **Verification - make it a visible computation, not a banner flip.** When the user clicks "Verify Chain", a steel-cyan cursor travels DOWN the chain line row by row (fast, ~60ms per row). As it passes each row, that row's hash briefly shows it being recomputed and then "locks" - a crisp snap to a verified state with a small steel-cyan tick. In the right inspector, show the active recompute for the row under the cursor: `prevHash + content → SHA256 → hash`, with the recomputed value snapping into alignment with the stored value when they match. When the cursor reaches a tampered row, the recomputed hash and the stored hash are shown **side by side in mono, with the differing hex characters highlighted in `#FF5A3C`**, and they refuse to lock. The chain line below that point turns `#FF5A3C`.
>
> **Tamper cascade + WORM proof:** the tampered row gets a `#FF5A3C` left edge and a mono `HASH MISMATCH` tag; then every row below it takes a `#FF5A3C` chain-line segment in sequence, ~120ms stagger, showing the break propagating downstream. Simultaneously the top status verify-chip flips to `#FF5A3C` `TAMPER @ #6`, and the inspector shows a **WORM cross-check**: the Merkle root recomputed from live (tampered) data vs the independent root from the S3 Object Lock checkpoint, side by side in mono, not matching - with a line "live root diverges from WORM checkpoint #30". This is the money shot; make it precise and legible, not flashy.
>
> **Append:** a compact inline panel (not a big modal) that slides from the right inspector: fields Actor (text), Action (select), "flag for review" toggle, and an "Append" button. On submit it closes and the new row snaps into the chain.
>
> **Motion rules:** everything is crisp and mechanical - durations 120–180ms, sharp ease-out `cubic-bezier(0.2,0,0,1)`, NO spring, NO overshoot, NO soft fades for state changes (state changes SNAP). The emotional target is a precision instrument switching states, not a friendly app. Respect `prefers-reduced-motion` (keep snaps as instant state changes, drop the traveling cursor).
>
> **Micro:** clicking any hash copies the full value (mono "copied" confirmation). No localStorage. React state only. Optimize for a 1440px desktop - density is intended.
>
> **Data wiring:** fetch `/api/events?tenantId=...` (GET → `{items:[...]}`) on tenant change; `/api/verify` (POST `{tenantId}` → `{intact, count, breaks:[{seq}]}`) on Verify; `/api/events` (POST form fields) on Append. The verify cursor walk can be a timed front-end animation, but the PASS/FAIL result and the broken `seq` MUST come from the real `/api/verify` response - drive the cascade off `breaks[0].seq` and mark that row and every row after it.
> **API contract (use exactly - no mock data):**
>
> - `GET /api/tenants` → `{ tenants: [{ id, label }] }`. Show `label` in dropdown; pass `id` (`acme`, `northwind`, `globex`) as `tenantId` to all other calls.
> - `GET /api/events?tenantId=<id>` → `{ items: [...] }`. Each item: `seq`, `action`, `actor`, `ts`, `hash`, `prevHash`, `flagged`, `payload`.
> - `POST /api/verify` body `{ tenantId }` → `{ intact, count, breaks: [{ seq, hashOk, linkOk, seqOk }], boundary, liveRootAtBoundary }`.
> - `GET /api/checkpoint?tenantId=<id>` → `{ checkpoint: { count, merkleRoot, lastSeq, lastHash, ts } | null }`.
> - `POST /api/events` body `{ tenantId, actor, action, payload, flagged }` → `{ ok, seq, hash, sk }`; then re-fetch events.
>
> **On tenant change:** fetch events + checkpoint. Status chip `checkpoint: #${checkpoint.count}` (or `-` if null).
>
> **On Verify click:** call verify + checkpoint in parallel. Cursor walk is front-end animation only; pass/fail and broken row come from `breaks[0].seq`. Cascade red from that seq downward.
> **WORM panel:** compare `liveRootAtBoundary` (verify) vs `checkpoint.merkleRoot` (S3). If different, show side-by-side mono roots + "live root diverges from WORM checkpoint #${checkpoint.count}". On clean chain they must match.
> **Verify button:** primary "Verify Chain" in top status strip (steel-cyan `#3FB6C4`).

### Wiring notes (after v0 generates it)

- Install Framer Motion: `npm install framer-motion`.
- Load the fonts: add `Geist` (or `Hanken Grotesk`) and `IBM Plex Mono` (or `Space Mono`) via `next/font/google`. Do NOT leave it on Inter/JetBrains Mono - the non-default fonts are part of the identity.
- **Tenant ID mapping (or the demo silently shows no data):** the backend partition keys use the short IDs the seed script writes - `acme`, `northwind`, `globex`. The UI shows friendlier labels (`acme-health`, etc.). Make the dropdown map label → ID and send the **short ID** as `tenantId` to every API call. Concretely: `const TENANTS = [{ id: "acme", label: "acme-health" }, { id: "northwind", label: "northwind-bank" }, { id: "globex", label: "globex-insurance" }]` and pass `tenant.id`. If you'd rather seed the long IDs, change `TENANTS` in `scripts/seed.mjs` instead - just keep the two sides identical.
- Replace any mock data with real fetches to your Phase 6 routes.
- The event row fields map to DynamoDB attributes: `seq`, `action`, `actor`, `ts` (timestamp attribute), `hash`, `prevHash`. Timestamp is the `ts` attribute, not parsed from the SK (the SK is the padded seq).
- **The WORM cross-check needs one more endpoint.** Add `GET /api/checkpoint?tenantId=...` that reads the latest checkpoint JSON from the S3 bucket (the Lambda writes `merkleRoot` + `count` there) and returns it. The inspector's "live root vs WORM root" comparison reads the live root from `/api/verify` (have the verifier also return the recomputed Merkle root) and the WORM root from this endpoint. This is the half of your originality story that's currently only told in the writeup - showing it is much stronger.
- **Make the tamper state real, not a toggle.** The cascade and the WORM-root divergence must fire from the actual `/api/verify` + `/api/checkpoint` results, because a judge may click Verify themselves. The row to break is the one whose `seq === breaks[0].seq`.
- Say the rubric line out loud in your demo/writeup: the chain spine _is_ the seq-ordered keys + hash links, the recompute walk _is_ the verifier running, the cascade _is_ the hash dependency propagating, the WORM-root divergence _is_ the Object Lock guarantee, and the tenant switch _is_ the partition key re-scoping every query.

### Checklist

- [ ] Fonts are Geist/Plex-Mono (or the named fallbacks), NOT Inter/JetBrains - the data (hashes, seq) is visibly the hero (larger/brighter than labels).
- [ ] Palette uses the exact instrument hexes; `#FF5A3C` appears ONLY on tamper, nowhere else.
- [ ] Three-zone layout: 64px rail, ledger spine, inspector - dense, with top status strip + bottom telemetry bar.
- [ ] Verify runs as a visible **cursor walk** down the chain with per-row lock-in, driven by the real `/api/verify` result for pass/fail.
- [ ] On tamper: side-by-side hash mismatch (differing hex highlighted), red chain-line cascade from `breaks[0].seq` down, AND the WORM-root divergence in the inspector (from `/api/checkpoint`).
- [ ] Motion is snappy/mechanical (no spring/bounce); `prefers-reduced-motion` reduces to instant state changes.
- [ ] Tenant switch re-scopes everything; append snaps a new row into the spine and it appears in the DynamoDB console.

### Common mistakes

- Falling back to Inter + JetBrains Mono + zinc-950 because they're the v0 defaults. That's the exact generic look you're trying to beat - hold the line on the instrument palette and fonts.
- Treating hashes/seq as muted captions. In this design they are the hero typography - bigger and brighter than the labels. If the labels are louder than the data, the hierarchy is inverted wrong.
- Spring/bounce motion. It makes a precision tool feel like a consumer app and undercuts the whole "instrument" identity. Snappy, linear, deterministic only.
- Faking the WORM cross-check or the tamper result. Wire both to the real endpoints - a database judge will try to break it.
- Over-spacing into "marketing site" airiness. Density is correct here; it signals "real tool."

---

# PHASE 8 - Seed, rehearse, record

### Goal

Pre-load believable demo data, then rehearse and record the <3-minute video so the tamper-catch lands clearly.

### Steps

**8.1 - Seed script** - create `scripts/seed.mjs`. It creates 36 events for each of the three demo tenants - past the checkpoint boundary at 30, so each tenant has a real WORM checkpoint to diverge from. The mix is realistic (mostly reads, some updates/exports, a couple of flagged BREAK_THE_GLASS events), and it's deterministic so your demo looks the same every run.

```js
// scripts/seed.mjs - run once against the live table (uses your admin creds locally)
import { appendEvent } from "../lib/append.js";

const TENANTS = ["acme", "northwind", "globex"];
const EVENTS_PER_TENANT = 36; // > 30 so each tenant has a checkpoint at boundary 30

const ACTORS = {
  acme: ["dr.smith", "dr.lee", "nurse.patel", "admin.ops"],
  northwind: ["teller.gomez", "analyst.wu", "compliance.ray", "admin.ops"],
  globex: ["adjuster.khan", "agent.diaz", "auditor.fox", "admin.ops"],
};

// weighted action mix: reads dominate, updates/exports occasional, break-the-glass rare
function pickAction(i) {
  if (i === 7 || i === 23) return { action: "BREAK_THE_GLASS", flagged: true }; // 2 flagged, inside the 0–29 prefix
  const r = i % 10;
  if (r === 0 || r === 5) return { action: "RECORD_UPDATE", flagged: false };
  if (r === 8) return { action: "EXPORT", flagged: false };
  return { action: "PHI_READ", flagged: false };
}

function payloadFor(tenant, action, i) {
  const subject = `${tenant.slice(0, 2).toUpperCase()}-${String(1000 + (i % 25)).padStart(4, "0")}`;
  switch (action) {
    case "RECORD_UPDATE":
      return {
        subject,
        field: ["status", "dosage", "balance", "tier"][i % 4],
        note: "field updated",
      };
    case "EXPORT":
      return { subject, scope: "full-record", dest: "compliance-archive" };
    case "BREAK_THE_GLASS":
      return {
        subject,
        reason: "emergency access",
        approver: "supervisor.on-call",
      };
    default:
      return { subject, view: "summary" };
  }
}

for (const tenant of TENANTS) {
  console.log(`\nSeeding ${tenant}...`);
  for (let i = 0; i < EVENTS_PER_TENANT; i++) {
    const { action, flagged } = pickAction(i);
    const actor = ACTORS[tenant][i % ACTORS[tenant].length];
    const r = await appendEvent({
      tenantId: tenant,
      actor,
      action,
      payload: payloadFor(tenant, action, i),
      flagged,
    });
    process.stdout.write(
      `  seq ${String(r.seq).padStart(2, "0")} ${action}${flagged ? " *" : ""}\r`,
    );
  }
  console.log(`  done - ${EVENTS_PER_TENANT} events`);
}
console.log(
  "\nSeed complete. Each tenant has a checkpoint at boundary 30 (events 0–29).",
);
```

Run it once:

```bash
node scripts/seed.mjs
```

After it finishes, give DynamoDB Streams a few seconds, then confirm the checkpoints landed:

```bash
aws s3api list-objects-v2 --bucket ledgerlock-worm-<same-name> --query "Contents[].Key"
# expect TENANT_acme/checkpoint-30.json, TENANT_northwind/checkpoint-30.json, TENANT_globex/checkpoint-30.json
```

> **Pick your tamper target now (this matters for the demo).** When you tamper for the demo, edit an event with **seq between 0 and 29** - i.e. _inside_ the checkpointed prefix - for example acme **seq 6**. That way a single edit fires _both_ proofs at once: the hash-chain cascade (every row after 6 goes red) **and** the WORM-root divergence (the live root of events 0–29 no longer matches `checkpoint-30.json`). If you instead tamper with seq 30–35 (past the boundary), the chain cascade still fires but the WORM panel won't move, because those events aren't checkpointed yet - a weaker demo. Tamper inside the prefix.

**8.2 - Rehearse the script** (timing from the build plan §8). The peak is: edit acme seq 6 in the DynamoDB console → click Verify in the app → the recompute cursor walks down, stalls at seq 6 with the side-by-side hash mismatch, the red cascade runs, and the inspector shows the live root diverging from the WORM checkpoint. Practice the console edit so it's fast and legible on screen.

**8.3 - Record** with the timing:

- 0:00–0:25 problem · 0:25–1:00 model + tenant isolation + live append · 1:00–1:30 the IAM "no delete" screenshot + S3 COMPLIANCE bucket · 1:30–2:30 **tamper + catch** · 2:30–2:55 shippability + "Built on Amazon DynamoDB."
- Say the winning line on camera: _"Immutability isn't a rule we follow - it's a permission we don't have."_

### Checklist

- [ ] 3 tenants × 36 events seeded; all three chains verify `intact: true` before any tampering.
- [ ] `checkpoint-30.json` exists in the WORM bucket for each tenant (Streams may take a few seconds).
- [ ] On a clean chain, `/api/verify`.`liveRootAtBoundary` equals `/api/checkpoint`.`merkleRoot` for each tenant.
- [ ] Your chosen tamper target is inside the checkpointed prefix (seq 0–29, e.g. acme seq 6), so the demo fires both the cascade and the WORM-root divergence.
- [ ] Full demo rehearsed under 3:00 by a stopwatch.
- [ ] Recording is clear at 1080p; the console edit and the side-by-side hash mismatch are legible.

---

# PHASE 9 - Submit

### Goal

Package every required deliverable so you don't lose points on logistics.

### Checklist (Devpost submission)

- [ ] **Live Vercel URL** - public, pre-seeded, loads instantly.
- [ ] **<3-min video** - names DynamoDB, shows the app + tamper-catch, states problem/audience.
- [ ] **Architecture diagram** - the labeled directional one (frontend → API → DynamoDB → Streams → Lambda → S3 Object Lock), with the "PutItem + Query ONLY, no Update/Delete" labels.
- [ ] **DB-usage screenshot** - the IAM append-only policy + the DynamoDB items view showing the hash chain (and ideally the AccessDenied-on-delete screenshot).
- [ ] **Vercel Team ID** - from Vercel settings.
- [ ] **Bonus (+0.6):** a short blog post + video tagged **#H0Hackathon** - e.g. "Building a tamper-evident audit log on DynamoDB after QLDB's retirement." Write last; near-free points.
- [ ] Public GitHub repo linked, README with the architecture diagram and a one-paragraph "database thesis."

---

## Suggested order of work (so you never block yourself)

Phase 0 → 1 → 2 → 3 → 4 locally (this gets you the entire tamper-evidence story working from the command line before any cloud wiring or UI). Then 5 (the WORM layer), then 6 (deploy backend), then 7 (UI), then 8 (seed + record), then 9 (submit). If you run short on time, Phases 0–4 + 6 + 7 already make a complete, demoable product; Phase 5 is the differentiator that earns the originality points, so protect time for it.

## What to validate in the first 48 hours (don't skip)

1. Phase 2.4 - the app identity **can** PutItem but **cannot** DeleteItem (the whole thesis).
2. Phase 5.5 - a checkpoint lands in S3 and **cannot** be deleted.
3. Phase 4.3 + 8.2 - the tamper→verify demo reads clearly to someone who isn't you, in one watch, under 3 minutes.
