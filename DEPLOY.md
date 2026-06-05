# FLOW Mega Apps — Deployment Guide (v3.10)

> **For:** Bryan's dev. This is the internal tooling for Flowgistik Indonesia.
> Static SPA, no build step required (vanilla ES modules + CDN imports).
> Backed by Firebase Auth + Firestore.

---

## 🚀 v3.10 — what's new in this drop

- **Master account** (`allen@flowgistik.id`) — top-level role above admin/supervisor. Single hardcoded credential gives full org-wide control via the new **Master Console** (mode toggle, broadcast banner, maintenance lock, force-refresh-all, feature kill switches, impersonation, org-wide AI key, role promotions, DB backup, audit feed).
- **Production config activated** — `firebase-applet-config.json` now contains the real `flow-fe96c` Firebase keys. Server runs in production mode out-of-the-box.
- **Updated Firestore rules** — adds master role + `/app_settings/global` collection (settings doc used by Master Console). **Must be re-deployed** (`firebase deploy --only firestore:rules`).
- **Reset-password hierarchy** in User Management — Master/Admin/Supervisor with proper guard rails; supervisors must re-enter their own password to reset a user's. New password shown ONCE in a reveal modal with Copy button.
- **AI key is org-wide** — set once in Master Console → AI. The per-user API Key button on the 1-on-1 page has been removed.
- **Login screen QoL** — eye-icon toggle to show/hide password; Remember Me checkbox actually persists state now.

## 0. Launch checklist (start here)

The file **`firebase-applet-config.json`** controls the runtime mode:

| Contents of that file | Mode | Data |
|---|---|---|
| Empty `{}` | **Demo** | Browser localStorage — isolated per browser |
| Real Firebase config | **Production** | Shared live Firestore database |

**Current state of this drop:** `firebase-applet-config.json` already has the
real Firebase config. The app will boot in production mode immediately. The
empty version is saved in `firebase-applet-config.example.json` if you ever
need to revert to demo for local poking.

### Test locally (demo mode) — temporarily

If you want to click through without touching Firestore:

```powershell
Copy-Item firebase-applet-config.example.json firebase-applet-config.json -Force
```

Serve the folder over HTTP (not `file://`) and log in with a built-in demo
account — password is `demo` for all:

- `admin@demo` — full access, best for a feature walkthrough
- `supervisor.ops@demo` / `.sales@demo` / `.ss@demo` / `.ga@demo` — create/edit/delete + User Management
- `user.ops@demo` / `.sales@demo` / `.ss@demo` / `.ga@demo` — view-only

When done testing, swap the real config back in:
```powershell
Copy-Item firebase-applet-config.prod.json firebase-applet-config.json -Force
```

### Go live (production) — do these in order

- [ ] **Confirm the live config is correct** — `firebase-applet-config.json`
      should contain the real `apiKey: "AIzaSy..."` (it already does in this
      drop). If it shows `{}` the server runs in demo mode and nobody shares
      data.
- [ ] **Enable Email/Password login** — Firebase Console → Authentication →
      Sign-in method → Email/Password → Enable.
      *(Skipping this causes the `auth/configuration-not-found` login error.)*
- [ ] **Create the MASTER Auth account** — Console → Authentication → Users →
      Add user. **Email + password MUST match the hardcoded constant**:

      | Field | Value |
      |---|---|
      | Email | `allen@flowgistik.id` |
      | Password | `Allen!Flow2026` |

      The role doc (`/users/allen@flowgistik.id` with `role: "master"`) is
      auto-created on first login — no manual Firestore step needed.
- [ ] **Create the first supervisor's Auth account** — Console → Authentication
      → Users → Add user (email + password). This is one of Bryan / Dimas /
      Farah / etc. so they can onboard everyone else.
- [ ] **Give that account the supervisor role** — Console → Firestore →
      collection `users` → add a doc with **Document ID = that exact email**:

      | Field | Type | Value |
      |---|---|---|
      | `email` | string | the same email |
      | `name` | string | display name |
      | `role` | string | `supervisor` |
      | `department` | string | e.g. `Operations` |

      Required once: security rules let only an existing admin/supervisor/master
      create `users` docs, so the first non-master one is placed by hand. After
      this, the supervisor uses the in-app User Management page for everyone else.
- [ ] **Deploy the updated security rules** —
      ```bash
      firebase deploy --only firestore:rules
      ```
      The v3.10 rules add the `master` role + `/app_settings/global` collection.
      Without this deploy, the Master Console will hit permission-denied when
      it tries to save settings.
- [ ] **(Optional) Set the org-wide Gemini API key** — log in as master →
      Master Console → AI → paste your `AIza…` or `AQ.…` key → Save. Get a free
      key at https://aistudio.google.com/apikey. Every supervisor's 1-on-1
      Summarizer will use it automatically. Skip if you're not using AI
      summaries yet.
- [ ] **Onboard the team** — log in as the supervisor, then for each person:
      add their Auth account in the Firebase Console, and add their email +
      role + department in the app's User Management page.

> An account that logs in without a `users` doc defaults to **user**
> (view-only) — it cannot self-promote. The master is the only exception
> (self-bootstraps as master).

> Do not commit the empty `{}` config to the launch branch, or the server
> ships in demo mode.

### After-launch quick check

1. Open the live URL in an **incognito window** and log in as `allen@flowgistik.id`.
2. Open a **second browser** and log in as the supervisor.
3. In one browser, add a user via User Management.
4. In the other browser, refresh — the new user should appear in the same list.
   If they don't, the server is still in demo mode (check
   `firebase-applet-config.json` on the server is not `{}`).

The sections below are the full reference for each step.

---

## 1. Plug in Firebase credentials

Edit **`firebase-applet-config.json`** in the project root with your project's config:

```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "flowgistik-mega-apps.firebaseapp.com",
  "projectId": "flowgistik-mega-apps",
  "storageBucket": "flowgistik-mega-apps.appspot.com",
  "messagingSenderId": "1234567890",
  "appId": "1:1234567890:web:abcdef",
  "firestoreDatabaseId": ""
}
```

- Get these from **Firebase Console → Project Settings → Your Apps → Web Config**.
- Leave `firestoreDatabaseId` empty unless using a non-default Firestore database (Firebase supports multi-database; PackTrack uses this).
- Reference: `firebase-applet-config.example.json`.

**Empty config (`{}`)** = offline / preview mode. Safe for local testing without writing to production data.

---

## 2. Deploy Firestore rules

```bash
firebase login
firebase init firestore       # First time only — pick the existing project
firebase deploy --only firestore:rules
```

The included `firestore.rules` allows any authenticated user to read/write. Tighten with custom claims (admin / supervisor / user) when ready — see comments in the file.

---

## 3. Enable Firebase services

In **Firebase Console** for the project:

- **Authentication** → Sign-in method → enable **Email/Password**
- **Cloud Firestore** → create database (production mode, region: `asia-southeast2` for Jakarta)

---

## 4. Seed the first user

After enabling Auth, create one Email/Password user in Firebase Console → Authentication → Users.

The app reads the user's role from a Firestore doc at `users/{email}`. Create that document manually first time:

```
Collection: users
Document ID: bryan@flowgistik.id  (use the email as doc ID)
Fields:
  email:      "bryan@flowgistik.id"
  name:       "Bryan"
  role:       "supervisor"
  department: "Operations"
```

Recommended role for the bootstrap account is **`supervisor`** — it can both
manage user accounts AND create/edit/delete operational data. `admin` can
manage users but is read-only on data. After this the account can log in and
manage everyone else through the User Management UI.

---

## 5. Host it

Any static host works. Easiest options:

### Firebase Hosting (recommended — same project)
```bash
firebase init hosting          # Pick the project, set public dir to "."
firebase deploy --only hosting
```

### Netlify / Vercel / GitHub Pages
Drag-and-drop the folder. No build step. `index.html` is the entry point.

### Plain Nginx / Apache
Serve the folder root. Make sure `firebase-applet-config.json` is reachable via `GET /firebase-applet-config.json` (the app loads it at runtime).

---

## 6. Verify

Open the deployed URL → DevTools console should show:

```
[Firebase] Initialized: long-polling auto-detect ON, offline cache ON ✓
[Firebase] Project: flowgistik-mega-apps
[Firebase] Connection verified ✓
```

If you see `⚠️ No config detected`, the JSON file isn't being served. Check path / CORS / hosting config.

---

## File structure (no build)

```
flow-mega-apps-v2/
├── index.html                      # entry
├── firebase-applet-config.json     # <-- EDIT THIS
├── firebase-applet-config.example.json
├── firestore.rules                 # deploy with firebase CLI
├── DEPLOY.md                       # this file
├── css/styles.css
└── js/
    ├── app.js                      # bootstrap + nav
    ├── firebase.js                 # config loader + CRUD helpers
    ├── roles.js                    # auth + permissions
    ├── utils.js
    ├── debug-panel.js
    ├── components/dropdown.js
    └── modules/
        ├── dashboard.js
        ├── daily-issue.js
        ├── daily-tracker.js
        ├── ticketing.js
        ├── projection.js
        ├── revenue-calc.js
        ├── weekly-report.js
        ├── users.js
        ├── master-data.js
        ├── one-on-one.js
        └── ...
```

No `node_modules`, no bundler. Just upload the folder.

---

## Switching environments

To run a staging/dev database separately, keep two config JSONs:
- `firebase-applet-config.staging.json`
- `firebase-applet-config.prod.json`

And copy the right one to `firebase-applet-config.json` at deploy time. Or use the `firestoreDatabaseId` field to point staging at a non-default Firestore database within the same Firebase project.

---

## Questions?

Bryan has the full context. For technical issues, check the **🐛 Debug Panel** (bottom-right of the app, Admin+Supervisor only) → it shows current env, master data counts, recent errors, and a "Copy Diagnostics" button.
