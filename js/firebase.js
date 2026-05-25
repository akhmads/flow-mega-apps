// ============================================================
// FLOW Mega Apps — Firebase Initialization (v3.9.2)
//
// Dual-mode bootstrap:
//
//   • REAL MODE — when firebase-applet-config.json has a real apiKey,
//     all Firestore operations go through Google's Firestore SDK with
//     the network-resilient settings below (auto long-polling fallback,
//     offline IndexedDB cache, multi-tab safe).
//
//   • PREVIEW MODE — when the config is empty (no apiKey), the same
//     export surface is provided by js/preview-store.js, which is an
//     in-memory + localStorage Firestore mock. Lets the whole app run
//     end-to-end with no Firebase project — create issues, edit master
//     data, etc. — and data persists across reloads.
//
//   Modules import {collection, addDoc, …} from this file and never
//   need to know which mode they're in.
//
// FIRESTORE RULES (production):
//   See /firestore.rules. Deploy with:
//     firebase deploy --only firestore:rules
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import * as fsReal from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import * as fsPreview from "./preview-store.js";

// ============================================================
// LOAD CONFIG FROM JSON FILE
// ============================================================
let firebaseConfig = {};
try {
  const res = await fetch("./firebase-applet-config.json");
  if (res.ok) {
    firebaseConfig = await res.json();
  }
} catch (e) {
  // Silent — preview mode is the default and is logged once below.
}

// Has the dev filled in a real apiKey?
export const isFirebaseConfigured = !!firebaseConfig.apiKey;

// Pick the Firestore implementation up front
const fs = isFirebaseConfigured ? fsReal : fsPreview;

let _app = null;
let _auth = null;
let _db = null;

if (isFirebaseConfigured) {
  _app = initializeApp(firebaseConfig);
  _auth = getAuth(_app);

  // Network-resilient Firestore settings
  const firestoreSettings = {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
    localCache: fsReal.persistentLocalCache({
      tabManager: fsReal.persistentMultipleTabManager(),
    }),
  };

  try {
    _db = firebaseConfig.firestoreDatabaseId
      ? fsReal.initializeFirestore(_app, firestoreSettings, firebaseConfig.firestoreDatabaseId)
      : fsReal.initializeFirestore(_app, firestoreSettings);
  } catch (e) {
    console.warn("[Firebase] initializeFirestore failed, falling back to getFirestore:", e.message);
    _db = fsReal.getFirestore(_app);
  }

  console.log("[Firebase] Initialized: long-polling auto-detect ON, offline cache ON ");
  console.log("[Firebase] Project: " + firebaseConfig.projectId + (firebaseConfig.firestoreDatabaseId ? " (db: " + firebaseConfig.firestoreDatabaseId + ")" : ""));

  (async () => {
    try {
      await fsReal.getDocFromServer(fsReal.doc(_db, "_test", "_connection"));
      console.log("[Firebase] Connection verified ");
    } catch (e) {
      if (e?.message?.includes("offline")) {
        console.warn("[Firebase] Offline mode — writes will queue and sync when connection returns.");
      } else if (e?.code === "permission-denied") {
        console.log("[Firebase] Connected (permission rules active) ");
      } else {
        console.warn("[Firebase] Initial connection test result:", e?.message || e);
      }
    }
  })();
} else {
  // PREVIEW MODE — in-memory + localStorage mock.
  _db = { __isPreview: true };   // truthy sentinel so requireDb() passes
  console.log("%cPREVIEW MODE — data persists in your browser (localStorage). No Firebase required.", "color:#7c3aed;font-weight:bold");
  // Seed the store with a handful of demo rows on first visit so the
  // app looks alive instead of empty. Safe to call repeatedly — only
  // seeds collections that are still empty.
  try { fsPreview.seedDemoData("demo@flowgistik.id"); } catch (e) { console.warn(e); }
}

export const auth = _auth;
export const db = _db;
export { firebaseConfig };

// ============================================================
// Re-export Firestore helpers (route through real OR preview mock).
// Wrapping these as functions instead of `export {…}` so the choice
// happens at call-time, not module-load time.
//
// Note on the `collection(db, name)` / `doc(db, col, id)` signatures:
// existing modules sometimes pass `db` as the first arg, and other
// places call collection("name") directly. We accept both — if the
// first arg looks like a db handle, we drop it and use our own.
// ============================================================
function _stripDbArg(args) {
  if (args.length && (args[0] === _db || (args[0] && args[0].__isPreview === true))) {
    return args.slice(1);
  }
  return args;
}
export const collection       = (...a) => fs.collection(_db, ..._stripDbArg(a));
export const doc              = (...a) => fs.doc(_db, ..._stripDbArg(a));
export const addDoc           = (...a) => fs.addDoc(...a);
export const setDoc           = (...a) => fs.setDoc(...a);
export const updateDoc        = (...a) => fs.updateDoc(...a);
export const deleteDoc        = (...a) => fs.deleteDoc(...a);
export const getDoc           = (...a) => fs.getDoc(...a);
export const getDocs          = (...a) => fs.getDocs(...a);
export const onSnapshot       = (...a) => fs.onSnapshot(...a);
export const query            = (...a) => fs.query(...a);
export const where            = (...a) => fs.where(...a);
export const orderBy          = (...a) => fs.orderBy(...a);
export const limit            = (...a) => fs.limit(...a);
export const serverTimestamp  = (...a) => fs.serverTimestamp(...a);
export const Timestamp        = fs.Timestamp;

// Auth helpers — only meaningful in real mode; preview uses demo
// accounts in app.js without ever touching these.
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail };

// ============================================================
// CRUD HELPERS — thin wrappers used everywhere
// ============================================================

// Write guard — set by roles.js after roles load. Default: allow.
let _writeGuard = () => null;
export function setWriteGuard(fn) { _writeGuard = (typeof fn === "function") ? fn : () => null; }
function assertCanWrite(opLabel, colName) {
  const reason = _writeGuard(colName);
  if (reason) {
    throw new Error(`Cannot ${opLabel}: ${reason}`);
  }
}

function requireDb(action) {
  if (!_db) {
    throw new Error(`Cannot ${action}: data store not initialized.`);
  }
}

// ============================================================
// SLOW-OP TIMING — surfaces sluggish reads/writes in the Debug
// Panel. Best-effort; never affects the operation itself.
// ============================================================
const SLOW_OP_MS = 3000;
function _recordOp(label, ms) {
  if (ms < SLOW_OP_MS || typeof window === "undefined") return;
  const list = (window.__flowSlowOps = window.__flowSlowOps || []);
  list.unshift({ op: label, ms: Math.round(ms), at: new Date().toLocaleTimeString() });
  if (list.length > 20) list.pop();
}

/** Best-effort current user email (real auth or preview). */
function _currentEmail() {
  return _auth?.currentUser?.email
    || (typeof window !== "undefined" && window.__previewUserEmail)
    || "anonymous";
}

// ============================================================
// AUDIT TRAIL — every create/update/delete is recorded centrally
// here so the Activity Log shows a complete history with zero
// changes to individual modules. Best-effort: a failed audit
// write never blocks (or fails) the real operation.
// ============================================================
function _auditSummary(data) {
  if (!data || typeof data !== "object") return "";
  return String(
    data.subject || data.client || data.task || data.name ||
    data.number || data.poNumber || data.clientName || data.text || ""
  ).slice(0, 80);
}
function writeAudit(colName, action, docId, data) {
  if (colName === "audit_log") return;          // never audit the audit log
  Promise.resolve().then(() =>
    addDoc(collection("audit_log"), {
      kind: colName,
      action,                                    // "create" | "update" | "delete"
      docId: docId || null,
      summary: _auditSummary(data),
      at: serverTimestamp(),
      by: _currentEmail()
    })
  ).catch(() => { /* non-critical */ });
}

/** Convenience to expose the preview-store reset for debug tooling */
export const _resetPreviewStore = isFirebaseConfigured
  ? () => { throw new Error("Reset is only available in preview mode."); }
  : fsPreview._resetPreviewStore;

/** Add a document with auto-id + createdAt + createdBy */
export async function addDocument(colName, data) {
  const _t0 = performance.now();
  try {
    requireDb("write");
    assertCanWrite("write", colName);
    const user = _auth?.currentUser;
    // In preview mode, "current user" is set by app.js via window
    const currentEmail = user?.email || (typeof window !== "undefined" && window.__previewUserEmail) || "anonymous";
    const ref = await addDoc(collection(colName), {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: currentEmail
    });
    writeAudit(colName, "create", ref.id, data);
    return ref.id;
  } finally {
    _recordOp("add " + colName, performance.now() - _t0);
  }
}

/** Get all docs in a collection (optionally with constraints) */
export async function getDocuments(colName, ...constraints) {
  if (!_db) return [];
  const _t0 = performance.now();
  try {
    const q = constraints.length
      ? query(collection(colName), ...constraints)
      : collection(colName);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } finally {
    _recordOp("read " + colName, performance.now() - _t0);
  }
}

/** Update a doc by ID */
export async function updateDocument(colName, id, data) {
  const _t0 = performance.now();
  try {
    requireDb("update");
    assertCanWrite("update", colName);
    const user = _auth?.currentUser;
    const currentEmail = user?.email || (typeof window !== "undefined" && window.__previewUserEmail) || "anonymous";
    const result = await updateDoc(doc(colName, id), {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: currentEmail
    });
    writeAudit(colName, "update", id, data);
    return result;
  } finally {
    _recordOp("update " + colName, performance.now() - _t0);
  }
}

/** Delete a doc by ID */
export async function deleteDocument(colName, id) {
  const _t0 = performance.now();
  try {
    requireDb("delete");
    assertCanWrite("delete", colName);
    const result = await deleteDoc(doc(colName, id));
    writeAudit(colName, "delete", id, null);
    return result;
  } finally {
    _recordOp("delete " + colName, performance.now() - _t0);
  }
}

/** Subscribe to a collection in real-time. Returns unsubscribe fn. */
export function subscribeCollection(colName, callback, ...constraints) {
  if (!_db) {
    setTimeout(() => callback([]), 0);
    return () => {};
  }
  const q = constraints.length
    ? query(collection(colName), ...constraints)
    : collection(colName);
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(rows);
  });
}

// ============================================================
// COLLECTION NAMES (single source of truth)
// ============================================================
export const COL = {
  ISSUES: "daily_issues",
  TASKS_SALES: "daily_tasks_sales",
  TASKS_SS: "daily_tasks_ss",
  TASKS_OPS: "daily_tasks_ops",
  INBOUND: "inbound_monitoring",
  TASKS_GA: "daily_tasks_ga",
  TICKETS: "tickets",
  REVENUE_SCENARIOS: "revenue_scenarios",
  PROJECTIONS: "projections",
  CLIENTS: "clients",                       // master data — clients
  DEPARTMENTS: "departments",               // master data — departments
  ISSUE_CATEGORIES: "issue_categories",     // master data — issue categories
  ONE_ON_ONE_QUESTIONS: "one_on_one_questions",  // master data — 1-on-1 questions
  AUDIT_LOG: "audit_log",                   // who changed what, when
  ONE_ON_ONES: "one_on_ones",               // 1-on-1 session records
  USERS: "users"
};
