# LedgerLock — Devpost Submission Package (final)

Reflects the **elite shipped version**: scalable since-seal verify, Merkle inclusion proofs, independent offline verifier, self-healing checkpointer, B2B embed. Everything below is copy-paste ready, in Devpost field order.

---

## 1. Project name (60 char limit)

```
LedgerLock
```
Gallery-friendly alt (if you want a descriptor): `LedgerLock — audit logs that prove they weren't altered` (54 chars).

---

## 2. Elevator pitch (200 char limit)

Primary:
```
A tamper-evident audit-trail API for regulated SaaS, on DynamoDB. Append-only writes, SHA-256 hash chains, and WORM-sealed Merkle proofs catch tampering — even from someone with full database admin.
```
*(197 chars)*

Backups:
```
Immutable audit logs for HIPAA/SOC2/SEC on DynamoDB. Immutability isn't a rule we follow — it's a permission we don't have. Bounded verify trusts the WORM seal and walks only the unsealed tail.
```
```
The audit log that catches its own tampering. Hash-chained DynamoDB + S3 Object Lock Merkle seals prove records were never altered, with O(log n) inclusion proofs a regulator can verify offline.
```

---

## 3. App Status field
Select **New** (built during the submission period). In the "what you updated" box, if asked:
```
Newly built during the submission period. Integrated Amazon DynamoDB (single-table design, Streams) with S3 Object Lock and Vercel from scratch for this hackathon.
```

---

## 4. Track
**Track 2 — Monetizable B2B app.** (Regulated-SaaS audit infrastructure; sold per-tenant as an API.)

---

## 5. Database field
Select **Amazon DynamoDB.**

---

## 6. Built with (space-separated array)

```
amazon-dynamodb aws-lambda amazon-s3 s3-object-lock dynamodb-streams aws-iam merkle-tree sha-256 next.js react vercel node.js tailwindcss recharts javascript aws-sdk
```

---

## 7. Project Story (the "About the project" markdown field)

> Paste verbatim. Written from your POV — simple, emotional, detailed, with diagrams. Elite judges, thousands of submissions: it earns attention fast, then rewards a closer read.

```markdown
## Inspiration

There's a quiet lie at the center of a lot of compliance software, and it bothered me for a long time.

Almost every regulated SaaS company says it keeps an *immutable* audit log. They write it in their SOC 2 report. They tell their healthcare and finance customers the access logs can't be tampered with. And then they store those logs in a normal database table — one that has an `UPDATE` statement and a `DELETE` statement, and an engineer with admin access who could quietly change a row at 2 a.m. and leave no trace.

HIPAA, SOC 2, and SEC Rule 17a-4 don't ask you to *promise* you didn't tamper with the record. They ask you to *prove* it. And "we don't touch it" is not proof. It's a policy. Policies fail audits.

What pushed me from annoyed to building was learning that AWS retired QLDB — its purpose-built ledger database. A lot of teams that relied on a real append-only ledger suddenly had nowhere obvious to go. That felt like a gap worth filling with the databases we *do* have.

So I kept circling one question:

> **What if immutability wasn't a rule you follow, but a permission you don't have?**

## What it does

LedgerLock is a drop-in, tamper-evident audit-trail API for regulated SaaS. A hospital app, a fintech, an insurer drops in one call — `ledger.append(event)` — and every access (a patient record viewed, a record updated, a break-the-glass emergency override) is written to a cryptographically tamper-evident ledger.

Four guarantees make it actually hold up under a hostile admin:

1. **Append-only at the data layer.** Every write is a DynamoDB `PutItem` with a condition that the record can't already exist. There is no update path and no delete path in the code — and the app's IAM role *literally does not have* `UpdateItem` or `DeleteItem` permission.
2. **A SHA-256 hash chain.** Each event's fingerprint includes the previous event's. Alter any past record and its fingerprint changes, which breaks every record after it — tampering cascades, it doesn't hide.
3. **WORM-sealed Merkle checkpoints.** Every 10 events, a Lambda triggered by DynamoDB Streams computes a Merkle root and seals it into S3 Object Lock (COMPLIANCE mode) — write-once storage no one can overwrite or delete, not even the AWS root account.
4. **Independent, portable proof.** Any single record can produce an **O(log n) Merkle inclusion proof** — a handful of sibling hashes that prove "this exact record belongs to sealed checkpoint #N," verifiable by a regulator *offline, with no access to our app or our AWS account.*

The moment that sells it: you tamper with a historical record directly in the DynamoDB console — full admin, bypassing the app entirely — then hit Verify. The integrity score drops, the altered record lights up, every record after it is invalidated, and the live Merkle root visibly diverges from the sealed WORM root it can never match.

## How we built it

The whole system is a single DynamoDB table behind a Next.js API on Vercel.

- **Single-table design.** `PK = TENANT#<id>` makes multi-tenant isolation *structural* — every query is physically scoped to one tenant, so one customer can never read another's events. `SK = EVENT#<zero-padded-seq>` keeps each tenant's chain strictly linear.
- **Append-only enforcement.** `PutItem` with `ConditionExpression: attribute_not_exists(SK)`, plus a least-privilege IAM role with only `PutItem` and `Query`. No update, no delete.
- **Tamper-evidence.** SHA-256 hash chain with a canonical JSON serialization so the same logical event always hashes identically.
- **WORM layer.** DynamoDB Streams → AWS Lambda → S3 Object Lock (COMPLIANCE) Merkle seals.
- **Scalable verification.** A full chain re-walk is `O(n)` — fine at 60 events, painful at 100k. Verification trusts the newest valid WORM seal and walks **only the unsealed tail** — bounded hash work, not linear. The WORM checkpoints exist to make that tail small under normal load.
- **Checkpointer lag visibility.** `GET /api/tenant-stats` exposes total events, sealed-through boundary, and pending seal count — surfaced in the dashboard during burst ingest.
- **Inclusion proofs.** `GET /api/proof?tenantId=&seq=` returns the `O(log n)` Merkle sibling path, validated byte-for-byte against the sealed root.
- **Sparse GSI.** Flagged events (break-the-glass, bulk export) carry a `GSI1PK`, so the compliance "review queue" queries *only* the sparse index — no scan, no filter.
- **Region:** ap-south-1 (Mumbai), so the live demo is fast.

Here's the shape of it:

```
   Regulated SaaS app                LedgerLock (Vercel / Next.js)              AWS
 ┌────────────────────┐            ┌──────────────────────────────┐
 │  ledger.append(e)  │ ─────────▶ │  POST /api/events  (append)   │ ─────▶  DynamoDB single table
 │  (one line embed)  │            │  POST /api/verify  (since-seal)│         PK=TENANT#  SK=EVENT#seq
 └────────────────────┘            │  GET  /api/proof   (Merkle)    │         append-only · hash chain
                                   │  GET  /api/alerts  (sparse GSI)│              │
                                   └──────────────────────────────┘              │ Streams (NEW_IMAGE)
                                                                                  ▼
                                                                          Lambda — checkpointer
                                                                          Merkle root every 10
                                                                                  │
                                                                                  ▼
                                                                          S3 Object Lock (COMPLIANCE)
                                                                          write-once Merkle seal
                       app IAM role:  ✓ PutItem  ✓ Query  ✗ Update  ✗ Delete
```

## Challenges we ran into

**The chain could silently fork — the bug that nearly broke the whole premise.** My first design used a random ID in the sort key, so two events written at the same instant both succeeded — and I'd get two records both claiming the same position in the chain. A tamper-evident ledger that quietly breaks itself under normal concurrent load is worse than useless. The fix was to make the *sequence number itself* the uniqueness constraint: now two simultaneous writes collide on the exact same key, one wins, the other retries. It's optimistic concurrency control with a single conditional write — no locks, no queue — and it's what keeps the chain trustworthy.

**Verification didn't scale, and I had to be honest about it.** A full chain walk is `O(n)`. At a few thousand events it's already sluggish. The answer was to make the WORM seals *load-bearing* for verification, not just for proof: verify forward from the last sealed Merkle root, never from genesis. That turned "verify the whole history" into "verify a small bounded tail."

**The checkpointer fell behind under burst load — and that turned out to be a feature.** When I bulk-seeded to stress-test scale, I generated writes faster than the Streams→Lambda checkpointer could seal them. For a while the ledger had thousands of valid events not yet covered by a WORM seal. My first instinct was to hide it. Then I realized: *that is exactly what a real audit pipeline does under a write burst* — it stays correct, the unsealed tail is clearly marked, and the checkpointer catches up and self-heals. So instead of hiding it, LedgerLock surfaces it: "sealed through #N · M events pending seal · catching up." A system that degrades safely and recovers is more convincing than one that pretends bursts never happen.

## Accomplishments that we're proud of

- Immutability enforced by **the absence of a permission**, not by good intentions — you can watch a delete get denied.
- Tamper caught **even against a database admin**, because the proof lives in write-once storage that can't be edited to match.
- **Bounded verification** — at 100k events with the checkpointer caught up, verify trusts the WORM seal through #100,000 and skips re-hashing the sealed prefix; when the sealer lags under burst load, only the unsealed tail is walked.
- **Regulator-grade portability** — an `O(log n)` Merkle inclusion proof plus an *offline* verifier that re-checks an exported ledger with zero access to our app or AWS. Don't trust us — verify it yourself.
- It ships: live on Vercel, real DynamoDB and S3 behind it, embeddable in one line.

## What we learned

I learned how much of "immutability" in the wild is really just a promise, and how different it feels when it's a *property of the system* instead. I learned to model DynamoDB access-pattern-first — design the keys around the questions before writing app code, and the isolation and the queries fall out for free. And I got a real appreciation for how DynamoDB Streams, Lambda, and S3 Object Lock compose into an audit pipeline that's genuinely hard to forge — and how the right data structure (a Merkle tree) turns "trust our dashboard" into "verify it yourself, offline."

## What's next for LedgerLock

- A published client SDK so any app embeds it in one line.
- Multi-region reads via DynamoDB Global Tables for low-latency global audit access — while writes stay single-region per tenant, because the hash chain needs one global order per tenant (a deliberate, defensible trade).
- A hosted public-root endpoint so auditors verify inclusion proofs against our sealed roots without any account at all.
- A second backend option on Aurora DSQL for teams that want strongly-consistent multi-region writes alongside the audit trail.
```

---

## 8. Project media — which images to upload (3:2, up to 15)

Upload in this order (first image is your gallery thumbnail):

1. **The thumbnail** (one of the AI prompts below) — the hook.
2. **The tamper-catch — Overview "Broken" state** (your image 2): 95% integrity ring red, "Breach at #0057". The money shot.
3. **The WORM cross-check drawer** (your image 5): live Merkle root in red diverging from the sealed root + per-record hash mismatch. Your single best technical artifact.
4. **The Audit Ledger with the red cascade** (your image 3): Tampered + Chain-broken rows. Shows tamper propagation.
5. **The Checkpoints / Seals page** (your image 1): "Root mismatch — tampering detected", sealed Merkle root vs recomputed.
6. **The architecture diagram** (the SVG/PNG in this folder).
7. **DynamoDB console — the table with seq-keyed SKs** (your image 6): proves the single-table, append-only, `EVENT#000…` design is real.
8. **The IAM policy + AccessDenied-on-delete** screenshot (capture this): `PutItem`+`Query` only; delete denied. Your thesis, proven.
9. **The scale beat**: tenant `scale-100k` with 100,000 events — chain intact, WORM sealed through 100k; show lag indicator during seed, then caught up after backfill.
10. **The inclusion-proof view**: the event inspector showing the O(log n) sibling path validating against the sealed root.
11. **The independent offline verifier** terminal: `verify-export.mjs` re-checking an exported ledger with no AWS creds.
12. **The /integrate page**: a third-party app calling `POST /api/events` — the B2B embed story.
13. **The review queue** (sparse GSI alerts): flagged break-the-glass events.
14. **The self-healing checkpointer indicator**: "sealed through #N · M pending · catching up."

(Drop any you don't have time to capture; 1–8 are the priority set.)

---

## 9. Thumbnail prompts (3:2) — 5 options for your AI image model

Your model renders text perfectly, so these lean on a few precise words.

**Prompt 1 — The hero claim (light, brand-matched to your console):**
```
A 3:2 enterprise software hero image, clean off-white background (#F4F6F8) with a faint teal radial glow top-right. Large bold near-black sans-serif headline, left-aligned: "Audit logs that prove they weren't altered." Smaller muted-gray subline beneath: "Tamper-evident · DynamoDB · WORM-sealed Merkle proofs". Lower-right: a precise minimalist vertical hash-chain of small rounded rectangles linked by thin lines; one link near the bottom is broken and glows a single alarm-red (#C1281F), the links above calm teal (#0F7D6B). Top-left: a small teal shield-with-chain-link logo. Flat, sharp, premium fintech, generous whitespace, IBM Plex Mono for tiny labels. No photographic elements.
```

**Prompt 2 — The product moment (the 95% breach, brand-matched):**
```
A 3:2 product image for compliance software, light theme on white. Center: a clean dashboard card showing a large circular integrity gauge reading "95%" in alarm-red (#C1281F) with "INTEGRITY" beneath, and red text "Integrity breach at event #0057". Around it, a faint vertical list of audit rows — two tinted red with small mono "Tampered" pills, the rest calm with green "Verified" ticks. Top-left teal shield-and-chain logo with wordmark "LedgerLock". Crisp, precise, Bloomberg-terminal-meets-Stripe, lots of whitespace, sharp typography, no photos.
```

**Prompt 3 — The metaphor (dark, dramatic, for contrast):**
```
A 3:2 cinematic tech illustration on warm near-black (#0B0C0E). A glowing vertical cryptographic chain of interlinked hexagonal hash blocks top to bottom in desaturated steel-cyan (#3FB6C4), each block showing a tiny fragment of a monospace SHA-256 hash. One block mid-chain is fractured; from the break downward the chain glows hot signal-orange-red (#FF5A3C), tampering cascading down. Small uppercase mono label above: "TAMPER DETECTED · #0057". Teal shield logo top-left with "LedgerLock". Precise, technical, high-contrast, instrument-grade, no people.
```

**Prompt 4 — The WORM seal (the "even an admin can't" idea):**
```
A 3:2 conceptual image, warm near-black background. Left: a vertical hash chain of small glowing teal blocks. Right: a heavy official circular seal embossed "WORM CHECKPOINT · SEALED" with a small lock icon, in steel-cyan and white, conveying write-once permanence. A thin line connects chain to seal. Below, mono caption: "The live root no longer matches the sealed root." Top-left: teal shield-and-chain "LedgerLock" logo. Minimal, regulatory, high-end, sharp vector look, no photographic texture.
```

**Prompt 5 — The one-line pitch (clean brand card, light):**
```
A 3:2 minimalist brand image, clean white-to-pale-teal gradient. Centered: a teal rounded-square shield containing two interlocked white chain links with a small cyan dot at center. Below it, bold near-black wordmark "LedgerLock", and under that, muted-gray IBM Plex Mono tagline: "Immutability isn't a rule we follow — it's a permission we don't have." Very generous whitespace, premium, calm, enterprise-trustworthy, flat design, razor-sharp typography, nothing else.
```

---

## 10. Architecture diagram — AI generation prompts (alternative styles)

You have a clean vector diagram in this folder. If you want a stylistic variant for the gallery, try one of these:

**Style A — Hand-drawn / whiteboard (engineer's notebook feel):**
```
A 3:2 hand-drawn architecture diagram on off-white paper, black ink sketch style with one teal highlight color, like a senior engineer's whiteboard. Boxes hand-lettered left to right: "Regulated SaaS app — ledger.append()" → "LedgerLock API (Vercel/Next.js)" → "DynamoDB single-table  PK=TENANT#  SK=EVENT#seq  append-only". A branch downward: "DynamoDB Streams" → "Lambda checkpointer (Merkle root /10)" → "S3 Object Lock (WORM, COMPLIANCE)". A small boxed note in teal: "IAM role: PutItem + Query ONLY — no Update, no Delete". A dashed arrow from S3 back to the API labeled "verify since last seal · O(log n) proof". Neat hand-lettering, clear arrows, slightly imperfect lines, one accent color only.
```

**Style B — Blueprint (technical, authoritative):**
```
A 3:2 technical blueprint-style architecture diagram, deep navy background with thin cyan line-work and white labels, like an engineering schematic. Left-to-right flow: client app → "LedgerLock API (Vercel)" → "Amazon DynamoDB — single table, hash-chained, append-only". Downward pipeline: "Streams → Lambda → S3 Object Lock (write-once Merkle seal)". Callout box: "Immutability = absent permission (no Update / no Delete)". Dashed return path labeled "bounded verify + Merkle inclusion proof". Precise, monospace labels, grid background, crisp.
```

**Style C — Clean isometric (modern, premium):**
```
A 3:2 clean isometric architecture diagram on a light background, soft shadows, teal-and-slate palette. Isometric blocks: a phone/app emitting "append(event)", flowing into a Vercel/Next.js block, into a DynamoDB block (labeled single-table, append-only). A side pipeline of three blocks: Streams, Lambda, S3 Object Lock (drawn as a small vault). Thin labeled connectors; a gold padlock on the S3 vault for write-once. Minimal, premium, modern SaaS explainer aesthetic.
```

---

## 11. What to SHOW in the demo video (described; script comes later)

Lead with emotion, then prove the depth. Rough beats (full script later):

1. **The problem (~20s):** the "everyone claims immutable, nobody proves it" hook — open on the console.
2. **The model + isolation (~25s):** single-table, switch tenants (partition-key isolation visible), append a live event onto the chain.
3. **The guarantee (~20s):** the IAM policy screenshot — `PutItem`+`Query` only — and a `DeleteItem` returning AccessDenied. Say the line: *immutability is a permission we don't have.*
4. **THE PEAK — tamper + catch (~50s):** edit a record **live in the DynamoDB console** (acme, seq 6, inside the sealed prefix), back to the app, Verify → integrity drops, the record lights up, the cascade runs, and the **WORM cross-check shows the live root diverging from the sealed root**. This is the money shot.
5. **It holds at scale (~25s):** tenant `scale-100k` — 100,000 events on real DynamoDB, WORM sealed through 100k. Show the **checkpointer lag indicator** during burst seed ("58k pending seal"), then **caught up** after backfill. When the sealer is behind, since-seal walks only the unsealed tail; when caught up, it trusts the full sealed prefix.
6. **Don't trust us — verify it yourself (~20s):** the **Merkle inclusion proof** in the inspector, and the **offline verifier** re-checking an exported ledger with no AWS creds.
7. **It's a service, not a dashboard (~10s):** the `/integrate` page — a third-party app calling `POST /api/events`.
8. **Close (~10s):** "Built on Amazon DynamoDB — single-table, Streams, S3 Object Lock," + the logo and tagline.

Names DynamoDB out loud (required), shows the working app (required), states the problem/audience (required). Under 3:00 — trim beats 5–7 before the tamper if you run long; never trim the tamper.

---

## 12. Submission-form quick reference

- **Track:** Track 2 (Monetizable B2B).
- **Database:** Amazon DynamoDB.
- **Published Vercel link:** https://ledgerlock-vert.vercel.app
- **Vercel Team ID:** from Vercel → your team → Settings → General → Team ID (`team_xxxxx`).
- **Architecture diagram:** `architecture-diagram (1).svg` (this folder).
- **DB-usage screenshot:** the DynamoDB console table (image 6/7) AND/OR the IAM no-delete policy. Use the IAM one if you can only pick one — it's the thesis.
- **App Status:** New.
- **Testing instructions for judges:** see §13.
- **Bonus content URL:** your dev.to article (must include the hackathon-disclosure line + #H0Hackathon).

---

## 13. Testing instructions for judges (paste into that field)

```
LedgerLock — tamper-evident audit trail on Amazon DynamoDB.

1. Open the live console and select tenant "acme-health". You'll see a hash-chained audit ledger.
2. Click "Verify chain integrity" — the chain verifies against the WORM-sealed Merkle root (bounded "since last seal" verify).
3. To see tamper detection: open any event in the inspector to view its cryptographic proof (previous / stored / recomputed hash) and its O(log n) Merkle inclusion proof against the sealed root.
4. The Checkpoints page shows the WORM seals (S3 Object Lock) and the live-vs-sealed root cross-check.
5. The "Review queue" shows flagged break-the-glass events (queried via a sparse GSI).
6. Scale: tenant "scale-100k" holds 100,000 events; WORM sealed through 100k. Checkpoints page shows seal status. During bulk ingest the checkpointer can lag — the dashboard shows pending seal count until caught up.

Architecture: Next.js API on Vercel → DynamoDB single-table (PK=TENANT#, SK=EVENT#<seq>, append-only, hash-chained) → Streams → Lambda → S3 Object Lock (COMPLIANCE) Merkle seals. The app's IAM role has PutItem + Query only — no Update, no Delete.
```

---

## 14. Pre-submit checklist
- [ ] Clean data (no CHECKPOINT_TEST/system) — re-seeded.
- [ ] WORM backfilled so the since-seal tail is small at 100k.
- [ ] Architecture diagram + IAM/DynamoDB screenshots exported.
- [ ] <3-min video on YouTube (public), names DynamoDB, shows tamper + scale + offline verify.
- [ ] dev.to article published (public, hackathon-disclosure line, #H0Hashtag).
- [ ] Vercel Team ID copied.
- [ ] Testing instructions pasted.
