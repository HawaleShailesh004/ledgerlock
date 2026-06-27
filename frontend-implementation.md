# LedgerLock — Frontend Implementation

This document describes the **frontend work implemented in this project**: routes, UI architecture, components, API wiring, demo fallback, and design choices.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Recharts · Geist + IBM Plex Mono

---

## 1. Routes & pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.js` | Marketing landing page |
| `/dashboard` | `app/dashboard/page.js` | Main audit console (SPA-style, client state) |

### Landing page (`/`)

Server-rendered marketing page via `components/landing-page.js`:

- Hero with product pitch and tagline (*"Immutability isn't a rule we follow — it's a permission we don't have."*)
- Three immutability layers (conditional append, IAM, WORM)
- Architecture flow strip (Next.js → DynamoDB → Streams → Lambda → S3)
- Demo moment explanation
- CTAs to `/dashboard`

### Audit console (`/dashboard`)

Single client page (`"use client"`) that hosts three in-app views controlled by React state (`view`: `overview` | `ledger` | `checkpoints`):

- **Overview** — KPIs, charts, integrity summary, quick verify
- **Audit Ledger** — filterable event list, verify walk, append/export
- **Checkpoints** — WORM seal status, Merkle roots, cross-check panel

Navigation is handled by `components/sidebar.js` (no separate Next.js routes per view).

---

## 2. Design system

Defined in `app/globals.css` using Tailwind v4 `@theme inline` CSS variables.

### Palette (light compliance theme)

| Token | Hex | Usage |
|-------|-----|--------|
| `canvas` | `#f4f6f8` | Page background |
| `surface` | `#ffffff` | Cards, panels |
| `surface-2` | `#f9fafb` | Subtle fills |
| `line` | `#e4e8ed` | Borders, dividers |
| `primary` | `#1a2230` | Main text |
| `secondary` | `#586273` | Secondary text |
| `muted` | `#8b95a4` | Labels, captions |
| `accent` | `#0f7d6b` | Brand / verify / active |
| `verified` | `#15803d` | Intact chain |
| `tamper` | `#c1281f` | Tamper / breach (reserved for integrity failures) |
| `flagged` | `#b45309` | Review-worthy events |

### Typography

- **UI:** Geist (`next/font/google`) — `--font-geist`
- **Data:** IBM Plex Mono — hashes, seq numbers, timestamps, Merkle roots

### Motion

CSS keyframe animations in `globals.css` (not Framer Motion in components):

- `animate-scan` — verify cursor highlight on active row
- `animate-trail` — fading scan trail
- `animate-tick` — verified check pop
- `animate-tamper` — tamper cascade flash
- `animate-row-in` — new event entrance
- `animate-drawer` — inspector panel slide-in
- `animate-view` — view transitions

All animations respect `prefers-reduced-motion: reduce` (disabled or instant).

### Elevation

Utility classes: `shadow-card`, `shadow-raised`, `shadow-pop`, plus hero wash gradients (`hero-wash`, `hero-wash-verified`, `hero-wash-tamper`).

---

## 3. Component map

```
app/
├── layout.js              # Root layout, fonts, metadata
├── page.js                # Landing entry
├── globals.css            # Design tokens + animations
└── dashboard/
    ├── layout.js          # Dashboard metadata
    └── page.js            # Main console orchestrator

components/
├── landing-page.js        # Marketing page sections
├── sidebar.js             # Nav + tenant selector
├── overview-view.js       # Overview tab (charts, KPIs)
├── confidence-header.js   # Ledger tab header + verify banner
├── ledger-toolbar.js      # Search, filters, append/export actions
├── ledger-list.js         # Event list + verify walk driver
├── event-row.js           # Single ledger row
├── inspector.js           # Event detail modal (overlay)
├── checkpoints-view.js    # Checkpoints tab
├── append-modal.js        # Append event form modal
├── confidence-gauge.js    # Circular integrity gauge
├── sparkline.js           # Inline mini charts
├── toast.js               # Ephemeral notifications
├── icons.js               # SVG icon set
├── format.js              # Labels, hashes, dates, diffHex
└── utils.js               # Shared helpers
```

---

## 4. Dashboard features (by view)

### 4.1 Overview (`overview-view.js`)

- **KPI cards:** total events, flagged count, break-glass count, unique actors
- **Integrity gauge:** `confidence-gauge.js` — Ready / Scanning / 100% / partial on tamper
- **Charts (Recharts):**
  - Area chart — event volume over time
  - Bar chart — flagged events timeline
  - Pie chart — action type distribution
- **Recent activity** list with actor avatars and relative timestamps
- **Verify Chain** button — calls same handler as ledger view
- **Open Audit Ledger** shortcut

### 4.2 Audit Ledger (`ledger` view)

**Header (`confidence-header.js`)**

- Tenant label, event count, checkpoint seq, last verify time
- Stat cards with sparklines (volume, flagged)
- Status banner: idle / verified / tamper with contextual copy
- Primary **Verify Chain** action

**Toolbar (`ledger-toolbar.js`)**

- Full-text search (actor, action, hash fields)
- Action type filter (`PHI_READ`, `RECORD_UPDATE`, `EXPORT`, `BREAK_THE_GLASS`, all)
- Flagged-only toggle
- Result count
- **Log event** → opens append modal
- **Export report** → CSV download

**Event list (`ledger-list.js` + `event-row.js`)**

- Newest-first list with seq, actor avatar, action label, truncated hash, timestamp
- Row states during verify walk: idle → verifying (scan cursor) → verified
- Tamper cascade: broken row + downstream rows marked red with staggered animation
- Click row → opens inspector modal
- New appended rows animate in (`animate-row-in`)

**Inspector modal (`inspector.js`)**

- Fixed overlay with backdrop blur; slides in from the right
- Closes on backdrop click, **Escape**, or close button
- Shows: seq, action, actor, timestamp, source IP, flagged status
- **Cryptographic proof** (collapsible): prev hash, stored hash, recomputed hash with hex diff highlighting on mismatch
- **WORM cross-check** (collapsible): live Merkle root vs sealed checkpoint root

**Demo tamper bar** (demo mode only)

- **Simulate tampering** — alters a random in-memory event for safe demo without DynamoDB admin

### 4.3 Checkpoints (`checkpoints-view.js`)

- Latest WORM checkpoint metadata (count, last seq, timestamp)
- Progress toward next seal boundary
- Sealed Merkle root + last hash (copy to clipboard)
- Live vs WORM cross-check status after verify
- **Verify Chain** action

---

## 5. Modals & overlays

| Component | Trigger | z-index | Behavior |
|-----------|---------|---------|----------|
| `append-modal.js` | "Log event" | `z-[70]` | Centered form; Escape + backdrop close |
| `inspector.js` | Row click | `z-[60]` | Right sheet over dimmed ledger |

---

## 6. API integration

All live data flows through Next.js API routes. The dashboard passes **short tenant IDs** (`acme`, `northwind`, `globex`) — not display labels.

| Endpoint | Method | Used for |
|----------|--------|----------|
| `/api/tenants` | GET | Populate organization dropdown |
| `/api/events?tenantId=` | GET | Load ledger on tenant change |
| `/api/events` | POST | Append new event |
| `/api/verify` | POST | Chain integrity + `liveRootAtBoundary` |
| `/api/checkpoint?tenantId=` | GET | Latest WORM checkpoint from S3 |

### Tenant mapping

```js
{ id: "acme", label: "acme-health" }
{ id: "northwind", label: "northwind-bank" }
{ id: "globex", label: "globex-insurance" }
```

UI shows `label`; API calls use `id`.

### Verify flow (real backend)

1. User clicks **Verify Chain**
2. Parallel fetch: `POST /api/verify` + `GET /api/checkpoint`
3. Front-end **scan animation** walks rows oldest → newest (timing scales with event count)
4. Pass/fail and broken `seq` come from **`/api/verify` response** (`breaks[0].seq`)
5. WORM panel compares `liveRootAtBoundary` vs `checkpoint.merkleRoot`
6. On tamper: cascade marks broken row + all higher seq rows; inspector shows hash diff

---

## 7. Demo mode fallback

When `/api/events` returns empty or fails, the console enters **demo mode** (`lib/demo-ledger.js`):

- In-memory hash chain per tenant (Web Crypto SHA-256, same canonical serialization as server)
- Deterministic seed (~32 events per tenant) with realistic action mix
- Client-side verify, tamper simulation, and Merkle checkpoint for WORM UI
- Banner in ledger view + sidebar note
- **Simulate tampering** only available in demo mode

Demo state lives in React refs — **no localStorage**.

---

## 8. Client-side utilities

| Module | Role |
|--------|------|
| `lib/metrics.js` | Derives chart/KPI data from events (`computeMetrics`) |
| `lib/export-report.js` | Builds CSV compliance report + triggers browser download |
| `lib/demo-ledger.js` | Browser hash chain, seed, verify, tamper, recompute for demo |
| `components/format.js` | Action labels, `shortHash`, `seqLabel`, `diffHex`, time formatting |

### Action types

| Action | UI label | Tone |
|--------|----------|------|
| `PHI_READ` | Viewed patient record | neutral |
| `RECORD_UPDATE` | Updated a record | neutral |
| `EXPORT` | Exported data | flagged |
| `BREAK_THE_GLASS` | Break-the-glass access | tamper |

---

## 9. State management (`app/dashboard/page.js`)

Single page component holds all console state:

| State | Purpose |
|-------|---------|
| `tenants`, `tenant` | Organization list + selection |
| `events` | Current ledger (newest-first) |
| `checkpoint` | Latest WORM checkpoint object |
| `status` | `idle` \| `verifying` \| `verified` \| `tamper` |
| `brokenSeq` | First break from verify |
| `selectedSeq` | Inspector target |
| `recompute` | Per-row hash recompute for inspector |
| `worm` | Live vs checkpoint root comparison |
| `view` | Active tab |
| `query`, `actionFilter`, `flaggedOnly` | Ledger filters |
| `demo` | Demo mode flag |
| `appendOpen`, `toast` | Modal + notifications |

Refs (`demoStore`, `demoCheckpoints`, `demoActive`) persist demo chains across tenant switches without re-seeding.

---

## 10. Dependencies (frontend-relevant)

```json
{
  "next": "^16.2.9",
  "react": "^19.2.7",
  "tailwindcss": "^4.3.1",
  "@tailwindcss/postcss": "^4.3.1",
  "recharts": "^3.9.0",
  "framer-motion": "^12.42.0"
}
```

**Note:** `framer-motion` is installed but **not used** in components; motion is implemented with CSS animations in `globals.css`.

---

## 11. Deviations from build guide (Phase 7)

The phase guide specifies a dark “precision instrument” console (`#0B0C0E`, steel-cyan `#3FB6C4`, 64px icon rail). This project instead implements:

| Build guide spec | Implemented |
|------------------|-------------|
| Dark warm-black palette | Light compliance palette (teal accent) |
| 64px icon-only rail | 240px labeled sidebar with nav + tenant dropdown |
| No landing page | Landing page at `/` + console at `/dashboard` |
| Bottom telemetry bar | Status in header cards / banners |
| Framer Motion mechanical motion | CSS keyframe animations |
| Inline append panel in inspector | Centered append modal |

Core **functional** requirements from the guide **are implemented**: real API wiring, verify walk, tamper cascade from `breaks[0].seq`, WORM cross-check, tenant isolation, append, copy hash, `prefers-reduced-motion`.

---

## 12. Running locally

```bash
npm install
npm run dev
```

- Landing: http://localhost:3000/
- Console: http://localhost:3000/dashboard

Requires `.env.local` with AWS credentials for live DynamoDB/S3 data. Without backend data, demo mode activates automatically.

---

## 13. File checklist (implemented)

- [x] Landing page with architecture + CTAs
- [x] Multi-view audit console (overview, ledger, checkpoints)
- [x] Multi-tenant selector wired to API
- [x] Hash-chained event list with verify walk animation
- [x] Tamper cascade visualization
- [x] Event inspector as modal overlay
- [x] Append event modal
- [x] WORM checkpoint cross-check UI
- [x] Compliance CSV export
- [x] Demo mode fallback (offline / empty table)
- [x] Toast notifications
- [x] Responsive layout (inspector full-width on mobile)
- [x] Accessibility: dialog roles, aria labels, keyboard Escape on modals
