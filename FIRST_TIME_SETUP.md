# First-Time Setup — Connecting to Real Firebase

This zip ships with `firebase-applet-config.json` pre-wired for the `flow-fe96c` project. Before the app fully works in REAL mode (not preview), you need to do **three things** in the Firebase Console.

## 1. Enable Email/Password authentication (5 minutes)

Without this, the login form will fail with `CONFIGURATION_NOT_FOUND`.

1. Open https://console.firebase.google.com/project/flow-fe96c/authentication/providers
2. Click **Get started** (if it's your first visit) or scroll to **Sign-in method**
3. Find **Email/Password** in the provider list → click it → toggle **Enable** → **Save**

## 2. Create your first user (Auth + Firestore profile)

You need **both** an Auth account (for the password) and a Firestore `/users/{email}` doc (for the role).

### A. Create the Auth account
1. https://console.firebase.google.com/project/flow-fe96c/authentication/users
2. **Add user** → email: `teddy@flowgistik.id` (or whatever you prefer) → set a password → **Add**

### B. Create the role profile in Firestore
1. https://console.firebase.google.com/project/flow-fe96c/firestore/data
2. If prompted to create the database first, pick **Start in test mode** (so you can deploy rules later without locking yourself out immediately)
3. Click **Start collection** → Collection ID: `users` → **Next**
4. Document ID: use the **same email** as the Auth account (e.g., `teddy@flowgistik.id`)
5. Add these fields:

| Field | Type | Value |
|---|---|---|
| email | string | `teddy@flowgistik.id` |
| name | string | `Teddy` |
| role | string | `supervisor` |
| department | string | `Operations` (or whichever) |

→ **Save**

> Why `supervisor` and not `admin`? Per v3.8's model, supervisors do all the operational writes. Admin is read-only oversight. Start as supervisor so you can actually edit data.

## 3. Deploy the Firestore security rules

Without this, the app will run on Firebase's default rules (test mode — open for 30 days, then locks everything).

```bash
# One-time: install the Firebase CLI if you don't have it
npm install -g firebase-tools

# Log in
firebase login

# From the project root, link this folder to flow-fe96c
firebase use --add
# pick flow-fe96c when prompted, alias: default

# Deploy just the rules (not hosting/functions)
firebase deploy --only firestore:rules
```

You should see `✔  firestore: released rules firestore.rules to cloud.firestore`.

## 4. Run the app

```bash
# Linux/macOS
./start.sh

# Windows
start.bat
```

Then open the printed URL (usually `http://localhost:8080`) in **InPrivate Edge** to avoid cache issues.

Log in with the email + password from step 2A.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `auth/configuration-not-found` on login | Email/Password not enabled | Redo step 1 |
| `auth/user-not-found` | No Auth account created | Redo step 2A |
| Logs in but everything is empty / "Permission denied" toasts | Role doc missing or rules not deployed | Redo step 2B + step 3 |
| Stuck on "Connecting..." | Browser cache from previous preview-mode session | Hard reload (Ctrl+Shift+R) or use a fresh InPrivate window |
| Login works but you're a "sales" user instead of supervisor | The auto-create logic stamped the default role because the /users doc didn't exist when you logged in | Manually edit `/users/{your-email}.role` to `supervisor` in Firestore Console, then refresh |

## Switching back to preview mode

If you want to test offline again without Firebase:

1. Open `firebase-applet-config.json`
2. Replace its contents with `{}`
3. Hard-reload the app

The preview store (localStorage) kicks in automatically and seeds demo data.
