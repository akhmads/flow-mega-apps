# FLOW Mega Apps — Deployment Guide

> **For:** Bryan's dev. This is the internal tooling for Flowgistik Indonesia.
> Static SPA, no build step required (vanilla ES modules + CDN imports).
> Backed by Firebase Auth + Firestore.

---

## 0. Launch checklist (start here)

The file **`firebase-applet-config.json`** is the mode switch:

| Contents of that file | Mode | Data |
|---|---|---|
| Empty `{}` | **Demo** | Browser localStorage — isolated per browser |
| Real Firebase config | **Production** | Shared live Firestore database |

**Current local state:** `firebase-applet-config.json` is empty (`{}`) so the
app runs in demo mode for local testing. The real config is saved in
`firebase-applet-config.prod.json`.

### Test locally (demo mode) — no setup

Serve the folder over HTTP (not `file://`) and log in with a built-in account —
password is `demo` for all:

- `admin@demo` — full access, best for a feature walkthrough
- `supervisor.ops@demo` / `.sales@demo` / `.ss@demo` / `.ga@demo` — create/edit/delete + User Management
- `user.ops@demo` / `.sales@demo` / `.ss@demo` / `.ga@demo` — view-only

### Go live (production) — do these in order

- [ ] **Swap in the real config** before uploading to the server:
      ```powershell
      Copy-Item firebase-applet-config.prod.json firebase-applet-config.json -Force
      ```
      Confirm the file now has the real `apiKey` — if it is still `{}` the
      server runs in demo mode and nobody shares data.
- [ ] **Enable Email/Password login** — Firebase Console → Authentication →
      Sign-in method → Email/Password → Enable.
      *(Skipping this causes the `auth/configuration-not-found` login error.)*
- [ ] **Create the first supervisor's Auth account** — Console → Authentication
      → Users → Add user (email + password). This login bootstraps everyone else.
- [ ] **Give that account the supervisor role** — Console → Firestore →
      collection `users` → add a doc with **Document ID = that exact email**:

      | Field | Type | Value |
      |---|---|---|
      | `email` | string | the same email |
      | `name` | string | display name |
      | `role` | string | `supervisor` |
      | `department` | string | e.g. `Operations` |

      Required once: security rules let only an existing admin/supervisor
      create `users` docs, so the first one is placed by hand.
- [ ] **Deploy the security rules** — `firebase deploy --only firestore:rules`
- [ ] **Onboard the team** — log in as the supervisor, then for each person:
      add their Auth account in the Console, and add their email + role +
      department in the app's User Management page.

> An account that logs in without a `users` doc defaults to **user**
> (view-only) — it cannot self-promote.

> Do not commit the empty `{}` config to the launch branch, or the server
> ships in demo mode.

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
