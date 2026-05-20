# FLOW Mega Apps

Internal tooling for Flowgistik Indonesia.

## 🚀 Run locally in 30 seconds

No Firebase setup required — the app ships with `PREVIEW_MODE = true`. Every feature works locally against an in-memory + localStorage data store (creating issues, tickets, users, master data, etc.). Data persists across reloads. Wipe it with `localStorage.clear()` in the browser console if you want a fresh start.

**macOS / Linux:**
```bash
./start.sh           # or ./start.sh 9000 to use a different port
```

**Windows:**
```cmd
start.bat
```

**Any OS, manual:**
```bash
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

A browser tab opens automatically. On the login screen, **click any yellow demo button** — no typing needed. Try each role to feel the v3.8 permission model:

| Demo account | Role | Can do |
|---|---|---|
| `admin@demo` | 👁️ Admin | **See everything · cannot edit** (read-only) |
| `supervisor.sales@demo` | ✏️ Supervisor (Sales) | Full edit power · creates users |
| `supervisor.ss@demo` | ✏️ Supervisor (SS) | Full edit power · creates users |
| `user.sales@demo` | 👤 User (Sales) | Limited — own records only |
| `user.ss@demo` | 👤 User (SS) | Limited — own records only |

(All demo passwords are `demo`.)

**Adding more users for testing:** sign in as a supervisor → **User Management** → **+ Add User**. Set their email, name, role, department, and a password. They can log in immediately. Reset passwords from the same page.

> ⚠️ The app **must** be served over HTTP — opening `index.html` directly via `file://` will fail because ES modules require HTTP. The launcher script handles this automatically.

---

A single web app that combines:
- **Dashboard** — live KPIs and latest issues/tickets
- **Daily Issue Tracker** ⭐ — root-cause analysis log (matches your SS Daily Issue sheet schema)
- **Daily Tracker (Sales)** — daily tasks per sales rep
- **Daily Tracker (Sales Support)** — daily/projection/improvement tasks per SS rep
- **Internal Tickets** — department-wide ticket system (Sales ↔ SS ↔ Ops ↔ Tech ↔ Finance)
- **Revenue Calculator** — port of the B2B Revenue Calculator with Firestore scenario storage
- **Projection Management** — client onboarding projects (timeline · people · requirements), real-time multi-user
- **Merge System** (legacy v21) — merge orders/Excel/PDF
- **Transaction** (legacy v21) — master item generator, screening stock, SKU replacement
- **Daily Reconcile** (legacy v21) — 3-source reconcile with catch-up SLA
- **Weekly Report Generator** (legacy v21) — inbound/outbound volume Excel generator

The legacy modules are imported as-is from the previous `preview__1_.html` and run entirely in the browser (no Firebase, no persistence needed — they just process inputs into outputs).

## Roles & Permissions (v3.8)

| Role | Sees | Edits / Creates | Deletes | Manages users |
|---|---|---|---|---|
| **Admin** (Bryan, Prayoga) | ✅ Everything (org-wide) | ❌ **Read-only** | ❌ No | ✅ Yes (assign roles) |
| **Supervisor** (Dimas, Yoga, Farah, Asih, Fauzi, Gratia, …) | ✅ Everything | ✅ **Anything** | ✅ Anything | ❌ No |
| **User** (limited) | Own team | ✅ Own records only | ❌ No | ❌ No |

**🔑 Key change in v3.8:** Admin is now a **read-only oversight role**. Only **Supervisors** can edit operational data. The previous model (admin = edit + delete + manage users; supervisor = edit own) is replaced. Legacy role names (`sales-admin`, `ss-admin`, `sales`, `ss`) are kept as aliases — they map to Admin and Supervisor respectively.

**Why this model:** Admins (the CEO and senior leads) want to *see* what's happening across every team without accidentally clobbering data. Supervisors run the day-to-day. User Management (assigning roles) is the one admin-only edit — it's an org function, not data ops.

**Module-level access:**
- **Daily Tracker (Sales)** → Sales team + admins + supervisors
- **Daily Tracker (SS)** → SS team + admins + supervisors
- **Daily Issue Tracker** → SS team + admins + supervisors (Sales can't see customer complaints)
- **Tickets, Revenue Calc, Projection Mgmt, Merge System, Transaction, Daily Reconcile, Weekly Report Generator** → everyone
- **1-on-1 Summarizer, Master Data** → admins (view) + supervisors (edit)
- **👤 User Management** → admins only

Front-end visibility is enforced by the role system; the **real** security comes from Firestore rules (see `firestore.rules` and step 3 below).

---

## What's new in v3.8 — Sales Support Mega Apps v21 tools

The four "Tools (Legacy)" menus now ship the **v21 revamp** of the standalone Sales Support Mega Apps:

- **Merge System** — Merge Orders (with chosen separator: `;`, `,`, `/`), Excell Generator (merge + split), PDF Generator (merge + split).
- **Transaction** — Master Item Generator (screening master item, screening dimensi product) + Orders Generator (Import orders TikTok/Shopee → WMS, Inventory Stock, Screening Stock, Merger SKU, Convert bulking SKU).
- **Daily Reconcile** — 3-source reconcile (Metabase + Ginee + Desty) with auto lookup, OMS/WMS status, catch-up SLA export.
- **Weekly Report Generator** (NEW menu) — Inbound Volume Generator + Outbound Volume Generator. Includes the v13 outbound compact-template engine and the v14 chunked ExcelJS export (handles 300k+ rows without stack overflow).

These tools live under `js/legacy/` and are loaded on-demand by `js/legacy/legacy-loader.js`. Their UI is scoped to `.premium-ui-v3` via `css/revamp.css`, so the v21 styles don't leak onto the rest of the app.

---

---

## Quick Setup (15 minutes)

### 0. Preview mode (no Firebase needed)

If you just want to click through the UI before doing the full setup, open `js/app.js` and confirm:

```js
const PREVIEW_MODE = true;
const PREVIEW_ROLE = "sales-admin";   // try "sales-admin" | "ss-admin" | "sales" | "ss"
```

Then serve the folder locally (`python3 -m http.server 8080`) and open `http://localhost:8080`. You'll be auto-logged-in as the fake role. Try different `PREVIEW_ROLE` values to see how the nav changes per role.

**⚠️ Set `PREVIEW_MODE = false` before deploying for real.**

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> → **Add project**.
2. Name it e.g. `flow-mega-apps`. Disable Google Analytics if you want (optional).
3. Inside the project: **Build → Authentication → Get started → Email/Password** (toggle on).
4. Inside the project: **Build → Firestore Database → Create database → Production mode → asia-southeast2 (Jakarta)** or whichever region you prefer.

### 2. Get your Firebase config

1. Project Overview → **⚙️ → Project settings → Your apps → Add app (web)**.
2. Register the app (no hosting needed yet). Copy the `firebaseConfig` object.
3. Open `js/firebase.js` in this repo and **replace** the placeholder `firebaseConfig`:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "flow-mega-apps.firebaseapp.com",
  projectId: "flow-mega-apps",
  storageBucket: "flow-mega-apps.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

### 3. Add Firestore security rules

The v3.8 rules implement the new permission model (admin = read-only, supervisor = full edit, user = own records only). Copy the full ruleset from **`firestore.rules`** in this repo (don't paste an old version — this is the source of truth).

Two ways to deploy:

**A) CLI (recommended once you've run `firebase init`):**
```bash
firebase deploy --only firestore:rules
```

**B) Console:** open **Firestore Database → Rules** in Firebase Console, paste the contents of `firestore.rules`, click **Publish**.

> Server-side rules are the real security boundary — they enforce the model even if the front-end is compromised. The client-side write guard in `js/firebase.js` is just a UX nicety that fails fast with a readable error before the request even hits Firestore.

### 4. Create your first admin user

This is a **2-step process** in Firebase Console:

**Step A** — Create the Firebase Auth account:
**Authentication → Users → Add user** → enter email (e.g. `bryan@flowgistik.id`) + temporary password → Add user.

**Step B** — Create the role profile in Firestore:
**Firestore Database → Start collection** → ID `users` → Add document:
- Document ID: `bryan@flowgistik.id` (must match the email exactly)
- Fields:
  - `email` (string) = `bryan@flowgistik.id`
  - `name` (string) = `Bryan`
  - `role` (string) = `sales-admin`

Save. Now Bryan can log in and see the **👤 User Management** menu, from which he can add roles for everyone else (Dimas, Yoga, Farah, etc.). For each new staff member you still need Step A above (create the Auth account in Firebase Console) — the in-app User Management only assigns the role.

### 5. Deploy

Pick one:

#### Option A — Firebase Hosting (recommended; free)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# When asked for public dir, enter "." (current dir)
# When asked if SPA, say No (we're a multi-section app)
firebase deploy --only hosting
```

#### Option B — Your own server / Nginx
Just upload the whole folder. It's static — no build step. Serve `index.html` as the entry.

#### Option C — Vercel / Netlify
Drag-and-drop the folder. Done.

### 6. Bulk-import the existing 5,200+ Daily Issues

1. Sign in, navigate to **Daily Issue Tracker**.
2. Click **Import from Excel** and select your existing `.xlsx` exported from the Google Sheet.
3. The importer fuzzy-matches column headers (works with `Complain Date`, `Update By`, `Categori Complain`, etc.). It skips rows missing a Complain Date.

---

## File Structure

```
flow-mega-apps/
├── index.html              Entry HTML — login gate + all section markup
├── firestore.rules         Server-side security rules (v3.8 permission model)
├── css/
│   ├── styles.css          Flow brand styling (purple/cyan glassmorphic)
│   └── revamp.css          Sales Support v21 styles, scoped to .premium-ui-v3
├── js/
│   ├── app.js              Main router + module bootstrapper
│   ├── auth.js             Firebase Email/Password auth
│   ├── firebase.js         Firebase init + Firestore helpers + write guard
│   ├── roles.js            Role + permission helpers (v3.8 — admin = read-only)
│   ├── utils.js            Shared utility functions
│   ├── modules/
│   │   ├── dashboard.js          Live KPIs, latest issues/tickets
│   │   ├── daily-issue.js   ⭐   Daily Issue Tracker (priority feature)
│   │   ├── daily-tracker.js      Daily Tracker (handles both Sales & SS)
│   │   ├── ticketing.js          Internal tickets
│   │   ├── revenue-calc.js       Revenue Calculator with saved scenarios
│   │   ├── projection.js         Projection Management (Firebase multi-user)
│   │   ├── weekly-report.js      Weekly TASK report (per-person tasks/day)
│   │   ├── master-data.js        Departments, clients, issue categories
│   │   ├── one-on-one.js         1-on-1 summarizer
│   │   └── users.js              User Management (admin only)
│   └── legacy/
│       ├── legacy-global.js      Consolidated v21 JS (Merge/Transaction/Reconcile/WeeklyReportGen)
│       └── legacy-loader.js      Injects v21 HTML into host divs, scopes premium-ui-v3
└── README.md
```

---

## Daily Issue schema (matches your SS Daily Issue sheet)

| Field | Type | Required | Notes |
|---|---|---|---|
| updateBy | string | ✅ | The SS staff who logged the issue (Yoga, Farah, Asih, Fauzi, Gratia, etc.) |
| client | string | ✅ | Client name (PERO, Kintakun, SummerID, etc.) |
| complainDate | date | ✅ | When the complaint was received |
| solvingDate | date | | When the issue was solved (auto-set to today on Close) |
| years | number | (auto) | Year extracted from complainDate |
| week | number | (auto) | ISO week number from complainDate |
| orderCode | string | | e.g. `FLOW_240126UDXDAYMB` |
| issueSite | enum | ✅ | One of: Outbound, Commercial, Lastmile, Technology, Inbound, Buyer, Client, Inventory, Marketplace |
| categoriComplain | string | ✅ | e.g. "Customer received wrong SKU" |
| detailsComplain | string | | Detailed description |
| rootCause | string | | Why this happened |
| shortTermSolution | string | | Immediate fix |
| longTermSolution | string | | Permanent prevention |
| status | enum | ✅ | `Open` or `Close` |
| notes | string | | Anything else |

---

## Projection Management schema

Each project is one Firestore document in `projections`. Edits auto-save to Firestore (~600ms debounce) so multiple users can edit in real-time.

```
{
  name: string,              // Project name
  clientName: string,        // PT Gaon Indonesia, etc.
  picSales: string,          // Bryan, Dimas, etc.
  picSalesSupport: string,   // Farah, Asih, etc.
  openDate: date,
  closedDate: date,
  status: enum,              // Open | Onboarding | Active | Done | On Hold

  tasks: [                   // 35 default tasks auto-populated from PM_TEMPLATE
    { stakeholder, task, status, targetDate, actualDate, notes }
  ],

  people: {
    flowgistik: [{ nama, role, phone }],  // pre-seeded with Bryan, Dimas, Prayoga, etc.
    client: [{ nama, role, phone }]
  },

  clientInfo: {              // 15 fields: Client Name, Brand, Category, Order/day, etc.
    "Client Name": string, ...
  },
  inbound: {                 // 9 fields: QC, Repacking, Bundling, Barcode, etc.
    "Inbound QC": string, ...
  },
  outbound: { ... },         // 4 fields
  inventory: { ... },        // 2 fields
  workingInstruction: { ... } // 2 fields (URL input files)
}
```

The 35-task default template covers the full client-onboarding flow from "Agreement Signed" → "Volume Growth monitoring 3 bulan." Edit per project as needed.

---

## Firestore Collections

| Collection | Used by | Notes |
|---|---|---|
| `daily_issues` | Daily Issue Tracker | The 5,200+ rows |
| `daily_tasks_sales` | Daily Tracker (Sales) | One doc per task |
| `daily_tasks_ss` | Daily Tracker (SS) | One doc per task |
| `tickets` | Ticketing | Internal + external |
| `revenue_scenarios` | Revenue Calculator | Saved client scenarios |
| `projections` | Projection Management | One doc per client project, including tasks + people + requirements |

Every document automatically gets `createdAt`, `createdBy`, `updatedAt`, `updatedBy` fields.

---

## Pending / Known Limitations

- **Visual style**: Kept the Flow brand purple/cyan glassmorphic look from `preview__1_.html`. If you want to match a different look (e.g. PackTrack), share a screenshot and I'll restyle.
- **Role-based access**: Currently any signed-in user can read/write everything. Add custom claims or a `users/{uid}` doc with role flags if you want per-team restrictions.
- **Pagination**: The Daily Issue table caps at 500 visible rows (use filters to narrow, or export Excel to see all). Firestore reads everything into memory — for >50K rows you'd want to paginate.
- **Sales Daily Tracker columns**: I built it with `person, date, task, status, notes`. Confirm this matches what you want for Bryan/Dimas/Gratia/etc. If their sheets have additional columns, send me a sample and I'll extend.
- **Migrating old Projection Management data**: If you have existing projects in your team's browser localStorage (from the old `preview__1_.html`), they won't automatically appear in the new Firestore-backed module. To migrate: open the old HTML, copy data from `localStorage.getItem("flowgistik_projection_management_v2")`, then bulk-import (or just recreate the projects — there are typically <20).

---

## Adding a new user

In Firebase Console → **Authentication → Users → Add user**. Email + temp password. Done.

To remove access: same place → click the user → **Disable account** (or Delete).

---

## Backup / Export

Every module has an **Export Excel** button that downloads the filtered view. Combine with the **Import from Excel** in Daily Issue for round-trip.

For a full Firestore backup: Firebase Console → Firestore → ⋮ → Export.

---

## Support

Built for Flow / Flowgistik Indonesia. Internal use only.

---

## v3.9.8 Changelog (May 2026)

### ➕ New legacy module: Forecast Orders Generator
Ported from Sales Support Mega Apps v21 (Revamp). Accessible from the sidebar under "📊 Forecast Orders Generator" (between Weekly Report Generator and the Tools group). Features:
- Upload outbound forecast Excel — auto-detects header row, normalizes column names (`foNormKey` + `foPickKey` cover variants like "Tanggal Order", "Date", "Tgl", "Client / Brand", etc.)
- Stat cards: Total Volume, Total Brand, Total Date, Top Date
- Mini insight panel with auto-generated takeaway
- Bar chart by date (canvas-rendered, no chart library dependency — uses `foDrawBarChart` + `foRoundRect`)
- Grouped tables: volume per date × client, summary by date
- Export the whole summary to Excel
- Download a starter template

Integration touches: `legacy-loader.js` (HTML map + `initForecastOrdersGen` export), `legacy-global.js` (17 new `fo*` functions + helpers), `revamp.css` (chart wrap, mini insight, responsive grids), `app.js` (PAGES registry + import), `roles.js` (visibility — shared with all signed-in users), `index.html` (nav button + host section).

### 🐛 Latent bug fix: `getOrderSeparator` was missing
The Merger module's separator-select dropdown calls `getOrderSeparator()` in 4 places (`legacy-global.js` lines 97, 102, 112, 119) but the helper itself was never ported into mega-apps. Result: every batch was joined with whatever the default fallback returned, ignoring the user's choice in the dropdown. The helper is now defined just above the new Forecast block.

---

## v3.9.7 Changelog (May 2026)

### 🔒 Security & privacy
- **`/one_on_ones` is no longer world-readable.** Previously fell under the catch-all rule that allowed any signed-in user to read every collection — meaning anyone in the org could read everyone's 1-on-1 transcripts (workload complaints, manager feedback, etc.). Now restricted to: supervisors, admins, and the subject of the session (where `memberEmail` matches the requester).
- **`/audit_log` createdBy can no longer be spoofed.** Writes now require the incoming `createdBy` (when present) to match the authenticated email.
- **Limited users can no longer rewrite `createdBy` on their own docs.** The update rule now also asserts `request.resource.data.createdBy == resource.data.createdBy`, preventing a user from changing ownership to escape future `ownsDoc()` checks.
- Header comment table in `firestore.rules` corrected — it now reflects v3.9.2's reality that supervisors manage `/users`.

### 🔁 Audit trail completeness
- `cascadeRename` in Master Data now routes through `updateDocument` instead of raw `updateDoc`, so cascaded field renames properly stamp `updatedAt` / `updatedBy` on every touched row. Previously a department or client rename left cascaded docs looking pristine.

### 📥 Importer: string-form Excel serials
- `parseDate("45320")` used to fall through to `new Date()` and produce `"+045320-01"` (year 45320). Affected CSV exports and any sheet where the date column is typed as Text. Now correctly returns `"2024-01-29"`.
- Added a guard so any 5+ digit string that isn't a recognized Excel serial returns empty rather than getting silently coerced into a year-N date.

### 💬 1-on-1 Summarizer
- **Sessions now snapshot the question list at save time** (`questionsSnapshot.personal` / `.work`). Editing a question in Master Data no longer orphans the answer indexes in past saved sessions — every record stays self-contained and human-readable forever.
- **Step 4 no longer re-fires the Anthropic API on every visit.** Going back to step 3 to tweak an answer and forward to step 4 used to burn a fresh call each time; now it only regenerates when the inputs (member + ratings + answers) actually changed.
- **Anthropic fetch now has a 30-second timeout.** A hung API call falls through to the template fallback instead of leaving the UI stuck on "Generating summary…" forever. Toast message also includes the failure reason.

---

## v3.9.6 Changelog (May 2026)

### 📅 Preview now shows real dates (not Excel serials)
- Excel stores dates internally as integers ("serial numbers" — days since 30 Dec 1899). The xlsx library hands those raw to JavaScript, so the import preview used to show meaningless numbers like `45320` in date columns even though the actual import was converting them correctly to ISO dates behind the scenes.
- The preview now shows the **parsed real date inline**: `2024-01-29 (45320)`. Real date in dark text, raw cell value in muted gray so you can sanity-check what we'll save.
- If you change the column mapping for Complain Date or Solving Date via the dropdowns, the preview rows re-render so the formatting follows your new choice.

---

## v3.9.5 Changelog (May 2026)

### 📥 Importer: bulletproof against invisible characters
- Hardened the column-header normalizer for the Daily Issue importer to strip a longer list of "invisible" characters that real-world spreadsheets often contain: BOM (`\uFEFF`), zero-width spaces (`\u200B`–`\u200D`, `\u2060`), non-breaking space (`\u00A0`), narrow no-break space (`\u202F`), line/paragraph separators. These show up routinely in Google Sheets exports and were causing the importer to silently fail to match headers that looked correct.
- Also strip common punctuation noise — apostrophes, asterisks, quotes, exclamation marks — so headers like `"Orders Code*"`, `"Status?"`, or `"Notes (optional)"` map cleanly.
- Verified end-to-end: a sheet with `"Short  Terms  Solution"` (double space), `" Long Terms Solution "` (leading/trailing space), `"\uFEFFStatus"` (BOM), `"Notes\u00A0"` (trailing nbsp) still auto-detects every field correctly.
- Added a small diagnostic log: while the import preview is open, the browser console prints the normalized header list. If a column still won't auto-match, share that log and I'll know exactly which alias to add.
- Expanded the alias list for Short Term / Long Term / Status / Notes with more Indonesian + English variants (`tindakan cepat`, `tindakan permanen`, `keterangan tambahan`, `quick fix`, `improvement`, `progress`, etc.).

### Sheet → app field map (your sheet's columns map exactly like this)
| Your column           | App field                  |
|------------------------|----------------------------|
| Orders Code            | Order Code(s)              |
| Issue Site             | Issue Site                 |
| Categori Complain      | Category Complain (req'd)  |
| Details Complain       | Details / Description      |
| Root Cause             | Root Cause                 |
| Short Terms Solution   | Short Term Solution        |
| Long Terms Solution    | Long Term Solution         |
| Status                 | Status                     |
| Notes                  | Notes                      |

---

## v3.9.4 Changelog (May 2026)

### 🎯 Dashboard is now fully clickable
- Every **KPI tile** on the dashboard deep-links into the right page with the right filter applied:
  - **Open Issues** → Daily Issue Tracker · Status=Open · Range=All Time
  - **Critical (High)** → Daily Issue Tracker · Status=Open · Issue Site=Outbound
  - **Open Tickets** → Internal Tickets · Status=Open
  - **Tasks (range)** → your team's Daily Tracker (Sales or SS, picked from your department)
- Every row in **Latest Issues** and **Latest Tickets** is clickable — click an issue, the Daily Issue Tracker opens and the edit modal pops up pre-filled with that issue's data. Same for tickets.
- Pointer cursor + hover state + keyboard support (Enter/Space) on every clickable element.
- Built on a small `window.__pendingNavAction` signal that target modules consume via a new `onShow` hook fired on every navigation (previously, modules only ran their init the first time — now post-init hooks fire on every nav, which fixes a wider class of "I navigated back here and nothing happened" bugs).

---

## v3.9.3 Changelog (May 2026)

### 📥 Bulletproof Daily Issue importer
- Reworked the **Import from Excel** flow in the Daily Issue Tracker. Now handles any sheet layout, including Indonesian column names.
- **Auto-detects columns** against a wide alias list — `Klien`/`Client`, `Tgl Complain`/`Complain Date`, `Kategori Komplain`/`Categori Complain`/`Category`, `Akar Masalah`/`Root Cause`, `Solusi Cepat`/`Short Term Solution`, `Catatan`/`Notes`, plus abbreviations and underscored/dashed variants.
- **Preview modal before import** — shows file name, sheet name, row count, the auto-detected column mapping (every column is a dropdown so you can fix mis-detections), and the first 10 rows. Required fields highlighted; "Import N rows" button stays disabled until the mapping is valid.
- **Sheet picker** — if the workbook has multiple tabs, you pick which one. (Useful when your file has separate "Daily Issue" and "Analisis" tabs.)
- **Header-row detection** — handles sheets with a title or empty row above the headers (scans first 5 rows for the best match).
- **Date format tolerant** — accepts `2026-05-12`, `11/5/2026`, `5-May-2026`, Excel serial numbers.
- **Multiple order codes per row** split correctly (`FLOW_001, FLOW_002` → 2 order codes counted in `orderCount`).
- **Rows without a Complain Date are skipped**, with the count shown in the preview.

### 🧪 Preview banner on the dashboard
- A purple info card now appears at the top of the dashboard when running in preview mode, explaining that all features work locally and offering a one-click **Wipe demo data** button.

---

## v3.9.2 Changelog (May 2026)

### 🧪 Preview mode is now fully functional
- New `js/preview-store.js` — in-memory + localStorage Firestore mock. Every CRUD operation (create/read/update/delete/subscribe) works locally without a Firebase project.
- Data persists across page reloads in the browser's localStorage.
- First-time load seeds the store with realistic demo data (issues, tickets, tasks, master data, team roster) so the app looks alive immediately.
- The console no longer shows "Firebase not configured / writes will fail silently" — replaced with a single positive log line.

### 👥 Supervisors can manage users
- Supervisors now see **User Management** and can: create accounts, assign roles, edit profiles, **reset passwords**, delete users.
- New accounts created by supervisors (with a password) can log in immediately in preview mode.
- In production, the same UI sets the role profile in Firestore; the actual Firebase Auth account (with the real password) is still created in Firebase Console per Firebase's client-SDK security model — the UI explains this distinction inline.
- `canManageUsers()` now returns `isAdmin() || isSupervisor()` (was admin-only).
- `firestore.rules` updated to match — supervisors can read/write `/users/`.

### 🔒 Login screen tightened
- Removed the **Forgot password** button. Self-service password reset is gone; supervisors reset passwords on the user's behalf via User Management.
- Updated copy on the login screen to direct lost-password users to ask a supervisor.

### Other
- Revenue Calculator hidden from Sales Support users (Sales-only, plus admin/supervisor cross-team oversight).
- The legacy `_previewMode` branches in `roles.js` removed — all user operations go through the unified Firestore wrapper, which auto-routes to either real Firestore or the preview store.

---

## v3.8 Changelog (May 2026)

### 🔑 Permission model flipped
- **Admin → read-only super-viewer.** Sees everything org-wide. Cannot edit, create, or delete operational data. Keeps the User Management privilege (assigning roles is an org function, not data ops).
- **Supervisor → the editor.** Now the only role with create/update/delete power across the app.
- **User → unchanged.** Own records only.
- Enforced both client-side (`js/roles.js` + new write guard in `js/firebase.js`) and server-side (`firestore.rules`). The server is the real boundary.

### v21 Sales Support tools merged in
- **Merge System** — refreshed UI; separator picker (`;` / `,` / `/`); merge & split for Excel and PDF.
- **Transaction** (was "Order Processing") — adds **Master Item Generator** (screening master item + screening dimensi product against Metabase) and an **Import Orders → WMS** flow for TikTok/Shopee.
- **Daily Reconcile** — adds **Export catch-up SLA**.
- **Weekly Report Generator** (NEW menu) — Inbound + Outbound Volume Generator. Includes v13 compact-template engine and v14 chunked ExcelJS export for 300k+ rows without stack overflow.
- All four tools are scoped under `.premium-ui-v3` via `css/revamp.css` so their styles don't leak into the modular shell.

### Wiring
- `js/legacy/legacy-loader.js` now exports `initMerger`, `initOrderProcessing`, `initDailyReconcile`, `initWeeklyReportGen`.
- `js/legacy/legacy-global.js` consolidated from the v21 source (4,109 lines, 232 top-level functions + the v13/v14 IIFE fixes).
- ExcelJS CDN added to `index.html`.
- The legacy localStorage `pmInit()` auto-init is disabled — the Firebase-backed Projection Management module owns `#pmRoot`.

---

## v2 Changelog (May 2026)

### Daily Issue Tracker
- **Order Count column** — Both in the table view and Excel export. When a single issue covers 40 orders, the report shows the count (`40`) instead of stuffing 40 codes into one cell.
- **Quick-close checkbox** — Tick the ✓ column on any row to close the issue; solving date auto-sets to today.
- **Client name validation** — Fuzzy-matches typed client names against your existing client list. Warns on case mismatch ("PERO" vs "pero"), suggests likely typos ("Kintakkun" → "Kintakun"), and flags genuinely new clients before saving.
- **Chart export** — Every chart card now has 📷 PNG and 📊 Excel buttons in the corner.
- **Summary tab** — New tab next to "Detail View" showing:
  - **Executive card**: hero KPIs (Total / Open / Closed / WoW trend), top client/site/category/PIC, oldest unresolved alert.
  - **Aggregated table**: group-by selector (client, PIC, site, category, status) with Open/Closed split, orders impacted, unique clients/PICs, and avg resolution per group. Exportable.

### Ticketing → Internal Tickets
- **Internal-only** — Removed the External (client) ticket type and the public submit page. All tickets are now internal department tickets.
- **Repositioned in nav** — Moved out of the "Sales Support" group into a new "Department" group, since it spans all teams.
- **Simpler modal** — No more Type dropdown or dynamic "Department / Client" label. Just Department.
