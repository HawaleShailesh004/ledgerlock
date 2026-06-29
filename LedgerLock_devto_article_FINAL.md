---
title: "I built an audit log that catches its own tampering — and proves it at scale, offline"
published: false
description: "How I built LedgerLock on DynamoDB + Vercel: append-only hash chains, WORM-sealed Merkle checkpoints, bounded verification, and O(log n) inclusion proofs a regulator can check without trusting me."
tags: aws, dynamodb, vercel, webdev
cover_image: ""
---

> I built this project for the **#H0Hackathon** (Hack the Zero Stack with Vercel and AWS Databases). This post covers how I built it using Amazon DynamoDB and Vercel.

There's a quiet lie at the center of a lot of compliance software.

Almost every regulated SaaS company says it keeps an *immutable* audit log. It's in their SOC 2 report. They tell their healthcare and finance customers the access logs can't be tampered with. And then they store those logs in a normal database table — one with an `UPDATE` statement and a `DELETE` statement, and an engineer with admin access who could quietly change a row at 2 a.m. and leave no trace.

HIPAA, SOC 2, and SEC Rule 17a-4 don't ask you to *promise* you didn't tamper. They ask you to *prove* it. "We don't touch it" is not proof. It's a policy. Policies fail audits.

What pushed me from annoyed to building was learning AWS retired QLDB, its purpose-built ledger database. Teams that relied on a real append-only ledger suddenly had nowhere obvious to go. So I asked one stubborn question:

> **What if immutability wasn't a rule you follow, but a permission you don't have?**

LedgerLock is the answer. This is how I built it — and the bugs and scale problems that taught me the most.

## The core: immutability as an absent permission

LedgerLock is a drop-in audit API. A hospital app, a fintech, an insurer calls one line — `ledger.append(event)` — and every access is written to a tamper-evident ledger on DynamoDB.

The data model is a single table:

```
PK = TENANT#<tenantId>        // partition key = the tenant
SK = EVENT#<zero-padded-seq>  // sort key = a strict sequence number
```

The partition key does something quietly powerful: every query is scoped to one partition key, so **multi-tenant isolation is structural** — one tenant's query physically cannot return another's events.

The append is one conditional write:

```js
await ddb.send(new PutCommand({
  TableName: TABLE,
  Item: item,
  ConditionExpression: "attribute_not_exists(SK)", // append-only guard
}));
```

And the part the whole thesis rests on — the IAM policy:

```json
{
  "Effect": "Allow",
  "Action": ["dynamodb:PutItem", "dynamodb:Query"],
  "Resource": "arn:aws:dynamodb:ap-south-1:...:table/LedgerLock"
}
```

No `UpdateItem`. No `DeleteItem`. When the app tries to delete, AWS refuses with `AccessDeniedException`. You can't misuse a capability you were never granted. *Immutability isn't a rule we follow — it's a permission we don't have.*

Each event also stores `hash = SHA256(canonical(event) + prevHash)`, so altering any past record breaks every record after it. Tampering cascades; it doesn't hide.

## Bug #1: the chain could silently fork

This is the bug that almost killed the project, and it passed every casual test.

My first design used a random ID in the sort key. Two users trigger an event at the same millisecond. Both read "the last event is #5." Both write #6 — but with *different* random IDs, so both `attribute_not_exists(SK)` conditions pass. **Both writes succeed.** Now two records both claim to be #6. The chain forked, and the verifier would flag the ledger as broken under completely normal load.

A tamper-evident ledger that breaks itself is worse than useless. The fix: make the sequence number *itself* the uniqueness constraint:

```js
const seq = prev ? prev.seq + 1 : 0;
const sk = `EVENT#${String(seq).padStart(10, "0")}`;
```

Now two concurrent writes target the *same key*, `EVENT#0000000006`. DynamoDB's conditional write lets exactly one win; the loser retries, re-reads the new tail, and writes #7. That's optimistic concurrency control with a single conditional write — no locks, no queue.

## The WORM layer: catching a tampering admin

Here's the scenario the hash chain alone can't handle: what if the attacker has full DynamoDB admin? They alter a record *and* rewrite every later hash to make the chain internally consistent. It would verify clean.

So every **10 events**, DynamoDB Streams trigger a Lambda that computes a **Merkle root** over the sealed range and writes it to **S3 Object Lock in COMPLIANCE mode** — write-once storage no one can overwrite or delete, not even the AWS root account, until retention expires.

```
DynamoDB Streams → Lambda → S3 Object Lock (COMPLIANCE)
```

Now even a full rewrite of the live chain won't match the independent Merkle root sealed in S3. The forgery is caught against a record the attacker could never touch. (This is the same Object Lock mechanism AWS has had assessed for SEC 17a-4 and FINRA recordkeeping.)

## Bug #2: verification didn't scale, and I had to be honest

A full chain walk is `O(n)`. At 60 events, instant. At the "millions of events" I was claiming as production, infeasible. A database engineer knows this immediately.

The fix made the WORM seals *load-bearing for verification*, not just for proof. You don't re-verify from genesis — you trust the newest valid sealed Merkle root and walk only the **tail since that seal**:

```
verifyChainSinceSeal:  trust newest valid S3 seal → walk tail only → O(tail), not O(n)
```

Full verify of a large tenant re-hashes every event from genesis. Since-seal verify trusts the newest valid WORM seal and walks **only the unsealed tail** — when the checkpointer is caught up, the hash walk is skipped entirely for the sealed prefix.

At 100k events on our bench (fully sealed, tail = 0), both modes take ~22–23s because **loading 100k rows from DynamoDB** dominates the time; the hash-walk savings are real but small once the chain is fully sealed. The dramatic win shows up when the sealer **lags under burst load**: e.g. 62k events pending seal — since-seal walks ~59k hashes while full verify walks 100k, and the dashboard surfaces the lag honestly.

## Bug #3: the checkpointer fell behind — and that became a feature

When I bulk-seeded to stress-test scale, I generated writes faster than the Streams→Lambda checkpointer could seal them. For a while the ledger had thousands of valid events not yet covered by a WORM seal.

My first instinct was to hide it. Then I realized: **that is exactly what a real audit pipeline does under a write burst.** It stays correct, the unsealed tail is clearly bounded and marked, and the checkpointer catches up and self-heals. So instead of hiding it, LedgerLock surfaces it:

> `sealed through #N · M events pending seal · catching up`

A system that degrades safely and recovers under load is far more convincing than one that pretends bursts never happen. The accident became one of the most production-credible parts of the project.

## Don't trust me — verify it yourself

The last piece is what makes it regulator-grade rather than just clever. The Merkle tree I already had for the WORM seals can produce, for any single event, an **O(log n) inclusion proof** — the handful of sibling hashes that prove "this exact record belongs to sealed checkpoint #N," without revealing any other record.

```
GET /api/proof?tenantId=&seq=  →  O(log n) sibling path, validated against the sealed root
```

A customer can hand a regulator one record + a short proof + the public sealed root, and the regulator verifies it belongs — **offline, with no access to my app or my AWS account.** I built a standalone verifier (`verify-export.mjs`) that does exactly this with zero AWS credentials. The guarantee doesn't depend on trusting LedgerLock.

## What I'd tell someone building on DynamoDB

- **Model access patterns first.** Design the keys around the questions; isolation and queries fall out for free.
- **Conditional writes are more powerful than they look** — `attribute_not_exists` gave me append-only *and* optimistic concurrency control from one expression.
- **Make your checkpoints load-bearing.** The Merkle seals weren't just proof — they're what made verification bounded and made inclusion proofs possible.
- **Let the failure modes show.** The self-healing-under-burst behavior became a strength precisely because I stopped hiding it.
- **IAM is architecture.** The most convincing security property in the whole project is something the app *can't do.*

## What's next

A published one-line client SDK; multi-region reads via Global Tables (writes stay single-region per tenant, because the chain needs one global order — a deliberate trade); and a hosted public-root endpoint so auditors verify inclusion proofs against the sealed roots with no account at all.

But the core lesson is the one I started with. There's a real difference between *promising* your audit log is immutable and *building a system where altering it is detectable* — even by the people who run it, provable at scale, verifiable by a stranger offline. That difference is the whole product.

---

*Built for the #H0Hackathon with Amazon DynamoDB, AWS Lambda, S3 Object Lock, and Vercel. Thanks for reading.*
