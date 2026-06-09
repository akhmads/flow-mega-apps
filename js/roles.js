// ============================================================
// FLOW Mega Apps — Role & Permission System
//
// Roles:
//   - "sales-admin"  → Bryan (can manage users, see/edit/delete anything)
//   - "ss-admin"     → Prayoga (can manage users, see/edit/delete anything)
//   - "sales"        → Dimas, Gratia, etc. (Sales data only, edit own, no delete)
//   - "ss"           → Yoga, Farah, Asih, Fauzi (SS data only, edit own, no delete)
//
// User docs live in Firestore: collection "users", doc id = user email.
//   { email, name, role, createdAt }
//
// IMPORTANT: Front-end role checks are UX only.
// True security comes from Firestore security rules (see README).
// ============================================================

import {
  auth, db, COL, setWriteGuard, isFirebaseConfigured, createAuthUser, recordAudit,
  doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, serverTimestamp
} from "./firebase.js";

// State
let currentUser = null;      // Firebase auth user
let currentRole = null;      // "master" | "admin" | "supervisor" | "user" (+ legacy aliases) | null
let currentProfile = null;   // { email, name, role }
let _previewMode = false;    // true when setPreviewUser is called

// Hardcoded master email — must match MASTER_ACCOUNT.email in js/app.js
// AND the MASTER_EMAIL() helper in firestore.rules. Keep all 3 in sync.
const MASTER_EMAIL = "allen@flowgistik.id";

// ============================================================
// WRITE GUARD WIRING (v3.8 permission model)
//
// Plug a guard into firebase.js so addDocument / updateDocument /
// deleteDocument REFUSE to run for read-only roles (admin). The
// Firestore security rules are still the real source of truth on the
// server — this is just a client-side belt-and-braces that gives
// callers a clean, immediate error instead of a confusing async
// permission-denied from Firestore.
//
// Returns null when the write is allowed, or a string reason when
// blocked. The collection name is passed so we can carve out the one
// admin exception: managing /users (assigning roles) is an admin
// function, not an operational data edit.
// ============================================================
const USERS_COLLECTION = "users";  // mirrors COL.USERS — kept literal to avoid TDZ at module-eval time
// Command Center collections — admins are explicitly allowed to manage
// these (the rest of the app keeps admin as read-only).
const COMMAND_CENTER_COLLECTIONS = ["command_center_depts", "command_center_apps"];
setWriteGuard((colName) => {
  const role = currentRole;
  // Master: full write power everywhere, always. No guard.
  if (role === "master") return null;
  // PREVIEW MODE sandbox: admin is normally read-only on operational
  // data, but in preview/demo mode that makes the sandbox feel broken
  // (debug generator fails, auto-seeds can't run, etc.). Relax the
  // restriction so an admin can fully drive the demo. Production
  // behavior (real Firebase) is unchanged.
  if (typeof window !== "undefined" && window.PREVIEW_MODE_INTERNAL === true) {
    if (role === "admin" || role === "sales-admin" || role === "ss-admin") {
      return null;
    }
  }
  // Admin: read-only on operational data, but can still write to /users
  // (assigning roles — an org-admin function) AND the Command Center
  // launcher (per product spec — admins curate the team app list too).
  if (role === "admin" || role === "sales-admin" || role === "ss-admin") {
    if (colName === USERS_COLLECTION) return null;        // allowed
    if (COMMAND_CENTER_COLLECTIONS.includes(colName)) return null;  // allowed
    return "Admin is read-only. Ask a Supervisor to make this change.";
  }
  // Supervisor: full edit power EVERYWHERE — including /users.
  // Supervisors handle onboarding, role assignment, password resets.
  if (role === "supervisor" || role === "sales" || role === "ss") {
    return null;                                          // allowed
  }
  // Limited user / anonymous: helpers allow it; per-record + Firestore
  // rules still apply.
  return null;
});

// ============================================================
// DEMO STAFF — used in preview mode to populate dropdowns.
// In production, real staff come from Firestore /users collection.
// ============================================================
const DEMO_STAFF = [
  { email: "bryan@flowgistik.id",   name: "Bryan",   role: "admin",       department: "Operations" },
  { email: "prayoga@flowgistik.id", name: "Prayoga", role: "admin",       department: "Sales Support" },
  { email: "dimas@flowgistik.id",   name: "Dimas",   role: "supervisor",  department: "Sales" },
  { email: "gratia@flowgistik.id",  name: "Gratia",  role: "supervisor",  department: "Sales" },
  { email: "yoga@flowgistik.id",    name: "Yoga",    role: "supervisor",  department: "Sales Support" },
  { email: "farah@flowgistik.id",   name: "Farah",   role: "supervisor",  department: "Sales Support" },
  { email: "asih@flowgistik.id",    name: "Asih",    role: "supervisor",  department: "Sales Support" },
  { email: "fauzi@flowgistik.id",   name: "Fauzi",   role: "supervisor",  department: "Sales Support" },
  { email: "steve@flowgistik.id",   name: "Steve",   role: "supervisor",  department: "Marketing" },
  { email: "andi@flowgistik.id",    name: "Andi",    role: "supervisor",  department: "Operations" },
  { email: "rina@flowgistik.id",    name: "Rina",    role: "supervisor",  department: "Operations" },
  { email: "budi@flowgistik.id",    name: "Budi",    role: "supervisor",  department: "General Affairs" },
  { email: "sari@flowgistik.id",    name: "Sari",    role: "supervisor",  department: "General Affairs" }
];

// ============================================================
// PREVIEW MODE — used only when PREVIEW_MODE=true in app.js.
// Lets us set a fake current user without touching Firebase.
// ============================================================
export function setPreviewUser({ email, name, role, department }) {
  currentUser = { email };
  currentRole = role;
  // Try to enrich with DEMO_STAFF entry (which has department) first
  const fromStaff = DEMO_STAFF.find(s => s.email === email);
  currentProfile = fromStaff
    ? { id: email, ...fromStaff }
    : { id: email, email, name, role, department: department || "" };
  _previewMode = true;
  // Expose globally so firebase.js wrappers can stamp createdBy/updatedBy
  // with the current preview user's email.
  if (typeof window !== "undefined") {
    window.__previewUserEmail = email;
  }
}

// ============================================================
// LOAD CURRENT USER ROLE
//
// On master self-bootstrap (production): if Firebase Auth user email
// matches MASTER_EMAIL, we force role to "master" regardless of what's
// stored in /users, and auto-create the /users doc with role:"master"
// if missing. This pairs with the firestore.rules carve-out that lets
// the master email create their own doc as long as role:"master".
// ============================================================
export async function loadCurrentUserRole(firebaseUser) {
  currentUser = firebaseUser;
  if (!firebaseUser) {
    currentRole = null;
    currentProfile = null;
    return null;
  }
  const isMasterEmail = (firebaseUser.email || "").toLowerCase() === MASTER_EMAIL.toLowerCase();

  // Look up user in /users/{email}
  const userRef = doc(db, COL.USERS, firebaseUser.email);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    currentProfile = { id: snap.id, ...snap.data() };
    currentRole = currentProfile.role || "user"; // safe default — lowest privileges
    // Master email always wins over whatever's stored — protects against
    // someone editing the doc to demote the master.
    if (isMasterEmail) {
      currentRole = "master";
      currentProfile.role = "master";
    }
  } else {
    // User exists in Auth but not in /users. Create a minimal profile.
    // Master self-bootstraps as master; everyone else as "user" until
    // a supervisor/admin promotes them via User Management.
    const role = isMasterEmail ? "master" : "user";
    const name = isMasterEmail ? "Allen (Master)" : firebaseUser.email.split("@")[0];
    currentProfile = {
      id: firebaseUser.email,
      email: firebaseUser.email,
      name,
      role,
      department: isMasterEmail ? "Master" : ""
    };
    try {
      await setDoc(userRef, {
        ...currentProfile,
        createdAt: serverTimestamp(),
        autoCreated: true
      });
    } catch (e) {
      console.warn("Could not create user profile:", e);
    }
    currentRole = role;
  }
  return currentRole;
}

// ============================================================
// GETTERS
// ============================================================
export function getCurrentUser() { return currentUser; }
export function getCurrentRole() { return currentRole; }
export function getCurrentProfile() { return currentProfile; }
export function getCurrentEmail() { return currentUser?.email || null; }

// ============================================================
// PERMISSION HELPERS — used everywhere
//
// PERMISSION MODEL (v3.8):
//
//   ┌─────────────┬────────┬───────────────────────┬────────┬───────┐
//   │  Role       │  View  │  Create / Edit / Save │ Delete │ Users │
//   ├─────────────┼────────┼───────────────────────┼────────┼───────┤
//   │ admin       │ ALL    │ NO (read-only)      │   │  │
//   │ supervisor  │ ALL    │ YES (full power)    │   │  │
//   │ user        │ team   │ own records only       │   │  │
//   └─────────────┴────────┴───────────────────────┴────────┴───────┘
//
//   Admin: sees everything across the org (audit/oversight) but cannot
//          modify any data. Can still manage user accounts (assign roles)
//          since that's an org-admin function, not a data-edit function.
//   Supervisor: the only role that can create, edit, save, or delete
//          operational data anywhere in the app.
//   User: limited to their own team and own records.
//
//   This is enforced both client-side (here) AND server-side
//   (firestore.rules). The Firestore rules are the source of truth.
// ============================================================

/** Is current user THE master? Single hardcoded account (Master Console
 *  access, mode toggle, override everything). Above admin. */
export function isMaster() {
  return currentRole === "master";
}

/** Is current user an admin (read-only super-viewer)?
 *  Master inherits admin privileges. */
export function isAdmin() {
  return currentRole === "admin"
      || currentRole === "sales-admin"
      || currentRole === "ss-admin"
      || currentRole === "master";    // master ⊇ admin
}

/** Is current user a supervisor (full edit power)?
 *  Master inherits supervisor privileges so every write path lights up. */
export function isSupervisor() {
  return currentRole === "supervisor"
      || currentRole === "sales"      // legacy alias
      || currentRole === "ss"         // legacy alias
      || currentRole === "master";    // master ⊇ supervisor
}

/** Is current user a limited "user" (the lowest tier)? */
export function isLimitedUser() {
  return currentRole === "user";
}

/** Can user manage other user accounts (create, edit, reset password,
 *  delete)? Admin + Supervisor — supervisors run day-to-day onboarding
 *  so they need this power. Admin retains it for org-level oversight.
 *  Limited users cannot. */
export function canManageUsers() {
  return isAdmin() || isSupervisor();
}

/** Can user edit master data? Supervisor + Admin (and Master via supervisor).
 *  Admin was previously read-only across master data; they now share
 *  full edit power with supervisor so org-level oversight can curate
 *  departments/clients/categories without needing a supervisor sign-in. */
export function canEditMasterData() {
  return isSupervisor() || isAdmin();
}

/** Can user view master data? Everyone logged in. */
export function canViewMasterData() {
  return isAdmin() || isSupervisor() || isLimitedUser();
}

/** Can user access the 1-on-1 summarizer? Admins (view) + Supervisors (edit). */
export function canAccess1on1() {
  return isAdmin() || isSupervisor();
}

/** Can user delete records? SUPERVISOR ONLY. */
export function canDelete() {
  return isSupervisor();
}

/** Can user hard-delete master data (irreversible)? Supervisor + Admin.
 *  Two-step safety still applies: callers must archive the row first. */
export function canHardDelete() {
  return isSupervisor() || isAdmin();
}

/** Can current user create new records anywhere? Supervisor only.
 *  Users can still create their own records via canEditRecord-driven UIs. */
export function canCreate() {
  return isSupervisor();
}

/** Can current user save / update any record? Supervisor only across the board.
 *  Users get a separate path via canEditRecord() (own records).
 *  Admins NEVER save anything — they are read-only. */
export function canEditAnything() {
  return isSupervisor();
}

/** Is current user part of the Sales team?
 *  Admin (read-only) + Supervisor see ALL.
 *  Otherwise: matches role or department. */
export function isSalesTeam() {
  if (isAdmin() || isSupervisor()) return true;
  if (currentRole === "sales" || currentRole === "sales-admin") return true;
  return (currentProfile?.department || "").toLowerCase() === "sales";
}

/** Is current user part of the Sales Support team?
 *  Admin + Supervisor see ALL. */
export function isSSTeam() {
  if (isAdmin() || isSupervisor()) return true;
  if (currentRole === "ss" || currentRole === "ss-admin") return true;
  return (currentProfile?.department || "").toLowerCase() === "sales support";
}

/** Is current user part of the Operations team? */
export function isOpsTeam() {
  if (isAdmin() || isSupervisor()) return true;
  return (currentProfile?.department || "").toLowerCase() === "operations";
}

/** Is current user part of the General Affairs team? */
export function isGATeam() {
  if (isAdmin() || isSupervisor()) return true;
  return (currentProfile?.department || "").toLowerCase() === "general affairs";
}

/** Can current user see a given module? */
export function canViewModule(moduleId) {
  // Master Console — hardcoded master only. Hidden from everyone else.
  if (moduleId === "masterConsole") return isMaster();

  // Master sees every other module (incl. disabled ones — needed to
  // manage the kill switch from Master Console).
  if (isMaster()) return true;

  // Org-wide module kill switch — master can hide any module from
  // non-master users via Master Console → Module Visibility. List is
  // populated from /app_settings/global.disabledModules and cached on
  // window.__flowDisabledModules.
  const disabled = (typeof window !== "undefined" && Array.isArray(window.__flowDisabledModules))
    ? window.__flowDisabledModules : [];
  if (disabled.includes(moduleId)) return false;

  if (isAdmin()) return true;          // admin sees everything else
  if (isSupervisor()) return true;     // supervisor sees everything else
  // Custom department trackers (added via Master Console → Sidebar Editor):
  // visible to users whose own department matches the tracker's dept key.
  if (typeof moduleId === "string" && moduleId.startsWith("tracker:")) {
    const wantDept = moduleId.slice("tracker:".length).toLowerCase();
    const myDept = (currentProfile?.department || "").toLowerCase();
    // Match either by slug (kebab/snake) or the dept's full name
    return myDept === wantDept
        || myDept.replace(/\s+/g, "-") === wantDept
        || myDept.replace(/\s+/g, "_") === wantDept;
  }
  const rules = {
    dashboard: true,
    dailyTrackerSales: isSalesTeam(),
    dailyTrackerSS: isSSTeam(),
    inboundMonitoring: isOpsTeam(),
    mpForecasting: isOpsTeam(),
    dailyTrackerGA: isGATeam(),
    dailyIssue: isSSTeam(),            // SS only
    ticketing: true,                   // shared across all departments
    revenueCalc: isSalesTeam(),        // Sales only
    salesToolkit: isSalesTeam(),       // Sales only
    projectManagement: isSalesTeam() || isSSTeam(),  // Sales + SS
    mergerSystem: true,                // shared tool
    orderProcessing: true,             // shared tool
    dailyReconcile: true,              // shared tool
    weeklyReportGen: true,             // shared tool
    forecastOrdersGen: true,           // shared tool
    clientLinks: true,                 // marketplace URL directory — everyone signed in
    commandCenter: true,               // team-shared app launcher — everyone signed in (limited users can add apps, supervisors edit/delete)
    oneOnOne: false,                   // supervisor+admin only
    masterData: canViewMasterData(),   // everyone (view)
    auditLog: false,                   // supervisor+admin only
    users: false                       // admin only
  };
  return rules[moduleId] ?? false;
}

/** Can the current user edit a record they didn't create?
 *  Only supervisors. Admins are READ-ONLY (no editing of others' or own). */
export function canEditOthers() {
  return isSupervisor();
}

/** Can the current user edit this specific record?
 *  - Master: always (overrides admin read-only).
 *  - Supervisor: always.
 *  - Admin: NEVER (read-only).
 *  - User: only their own records. */
export function canEditRecord(record) {
  if (isMaster()) return true;         // master overrides everything
  if (isSupervisor()) return true;
  if (isAdmin()) return false;         // admin is read-only
  if (!record) return false;
  return record.createdBy === currentUser?.email;
}

// ============================================================
// USER MANAGEMENT
//   Read: admin + supervisor (needed for 1-on-1 picker, ticketing
//         assignee dropdown, master-data PIC lists, etc.)
//   Write: admin only (upsert/delete enforce canManageUsers())
// ============================================================

/** List all users in Firestore /users collection (read-only).
 *  Allowed for admin AND supervisor — both need the team roster for
 *  dropdowns and pickers. Limited users can still call this to see
 *  their team. */
export async function listUsers() {
  if (!isAdmin() && !isSupervisor() && !isLimitedUser()) {
    throw new Error("Permission denied");
  }
  const snap = await getDocs(collection(COL.USERS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get list of staff for a given team — used by dropdowns
 * in Daily Tracker and Daily Issue.
 *
 * @param {"sales"|"ss"} team
 * @returns {Promise<Array<{email,name,role}>>}
 */
export async function getStaffForTeam(team) {
  // Works in both real Firestore and preview store (auto-routed via firebase.js)
  const allUsersSnap = await getDocs(collection(COL.USERS));
  const all = allUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (team === "sales") {
    return all.filter(u =>
      (u.department || "").toLowerCase() === "sales" ||
      u.role === "sales" || u.role === "sales-admin");
  }
  if (team === "ss") {
    return all.filter(u =>
      (u.department || "").toLowerCase() === "sales support" ||
      u.role === "ss" || u.role === "ss-admin");
  }
  if (team === "operations") {
    return all.filter(u =>
      (u.department || "").toLowerCase() === "operations");
  }
  if (team === "ga") {
    return all.filter(u =>
      (u.department || "").toLowerCase() === "general affairs");
  }
  // Fallback: case-insensitive match against the user's department field.
  // Used by custom-dept Daily Tracker — passes the dept label/name (e.g.
  // "Finance", "Legal") and gets back users assigned to that department.
  if (team && typeof team === "string") {
    const want = team.toLowerCase();
    return all.filter(u => (u.department || "").toLowerCase() === want);
  }
  return all;
}

/**
 * Add/update a user profile (role + department, and optionally
 * a temporary password in preview mode).
 *
 * In production: this writes the role profile only. The Firebase
 * Auth account must be created separately (Firebase Console or the
 * Admin SDK) — Firebase doesn't allow client-side account creation
 * for security reasons.
 *
 * In preview mode (no Firebase config): this also stores a
 * `previewPassword` on the user doc so the demo login flow can
 * validate it. Supervisors create accounts end-to-end here.
 */
export async function upsertUserProfile({ email, name, role, department, password }) {
  if (!canManageUsers()) throw new Error("Permission denied");
  if (!email) throw new Error("Email required");
  const acceptedRoles = ["master", "admin", "supervisor", "user", "sales-admin", "ss-admin", "sales", "ss"];
  if (!acceptedRoles.includes(role)) {
    throw new Error("Invalid role");
  }

  // Detect CREATE vs UPDATE — if no /users doc exists for this email yet,
  // and we're in production with a password, also create the Firebase Auth
  // account so the user can actually log in (no separate Console step needed).
  let isCreate = false;
  try {
    const existing = await getDoc(doc(COL.USERS, email));
    isCreate = !existing.exists();
  } catch (e) {
    // Fall back to "treat as create" if the read fails — Auth creation
    // is idempotent-friendly: if email exists Firebase throws and we surface that.
    isCreate = true;
  }

  if (isCreate && isFirebaseConfigured && password && password.trim()) {
    try {
      await createAuthUser(email, password.trim());
    } catch (e) {
      // Firebase Auth errors: surface a friendly message.
      const code = e?.code || "";
      if (code === "auth/email-already-in-use") {
        throw new Error("This email already has a login account in Firebase Auth. You can still save the role profile — just leave the password field blank.");
      }
      if (code === "auth/weak-password") {
        throw new Error("Password too weak. Use at least 6 characters.");
      }
      if (code === "auth/invalid-email") {
        throw new Error("Invalid email format.");
      }
      throw new Error("Could not create login account: " + (e.message || code));
    }
  }

  const profile = {
    email,
    name: name || email.split("@")[0],
    role,
    department: department || "",
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || "system"
  };
  // Only stamp the preview password when one is provided (preview mode only)
  if (!isFirebaseConfigured && password && password.trim()) {
    profile.previewPassword = password.trim();
  }
  await setDoc(doc(COL.USERS, email), profile, { merge: true });
  // Activity Log entry — User Management writes raw setDoc, so it has
  // to opt-in to the audit trail explicitly.
  recordAudit(COL.USERS, isCreate ? "create" : "update", email, {
    name: profile.name, role: profile.role, department: profile.department
  });
}

/** Reset a user's preview-mode password. Real production passwords
 *  live in Firebase Auth and must be reset via the Admin SDK or
 *  Firebase Console — this is for preview mode only. */
export async function resetUserPassword(email, newPassword) {
  if (!canManageUsers()) throw new Error("Permission denied");
  if (!email) throw new Error("Email required");
  if (!newPassword || !newPassword.trim()) throw new Error("New password required");
  await setDoc(doc(COL.USERS, email), {
    previewPassword: newPassword.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || "system"
  }, { merge: true });
  recordAudit(COL.USERS, "update", email, { name: "Password reset" });
}

/** Delete a user's profile. In production, this does NOT delete
 *  the Firebase Auth account — only the role/profile doc. */
export async function deleteUserProfile(email) {
  if (!canManageUsers()) throw new Error("Permission denied");
  if (email === currentUser?.email) {
    throw new Error("You cannot delete your own account");
  }
  await deleteDoc(doc(COL.USERS, email));
  recordAudit(COL.USERS, "delete", email, { name: email });
}

// ============================================================
// HUMAN-READABLE ROLE LABEL
// ============================================================
export function roleLabel(role) {
  return {
    "master":       "Master",
    "admin":        "Admin",
    "supervisor":   "Supervisor",
    "user":         "User",
    // Legacy aliases — kept so existing data still renders correctly
    "sales-admin":  "Admin",
    "ss-admin":     "Admin",
    "sales":        "Supervisor",
    "ss":           "Supervisor"
  }[role] || role || "—";
}

export function roleBadgeClass(role) {
  return {
    "master":       "badge badge-master",
    "admin":        "badge badge-admin",
    "supervisor":   "badge badge-supervisor",
    "user":         "badge badge-user",
    "sales-admin":  "badge badge-admin",
    "ss-admin":     "badge badge-admin",
    "sales":        "badge badge-supervisor",
    "ss":           "badge badge-supervisor"
  }[role] || "badge";
}
