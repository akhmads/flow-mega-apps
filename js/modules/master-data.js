// ============================================================
// FLOW Mega Apps — Master Data Module (Admin Only)
//
// Single source of truth for:
//   • Departments  (used by users + internal tickets)
//   • Clients      (used by daily issues) — with default Sales/SS PIC
//   • Issue Categories (used by daily issues)
//
// Features:
//   • Add / rename / archive (soft-delete)
//   • Bulk paste import (newline-separated)
//   • Cascade rename — renaming a Client also updates all
//     historical issue records that reference it
//   • Audit log entries on every change (collection: audit_log)
//   • Auto-seed Departments on first load (from your Workspace)
//   • Auto-backfill Clients + Categories from existing issues
//
// Read by the rest of the app via:
//   subscribeMasterData(kind, callback)
//   getMasterData(kind) — synchronous snapshot
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument, subscribeCollection, getDocuments,
  serverTimestamp, db, doc, updateDoc, query, where, getDocs, collection, addDoc
} from "../firebase.js";
import {
  $, esc, toast, friendlyDate, confirmAction
} from "../utils.js";
import {
  canManageUsers, canEditMasterData, canHardDelete, getCurrentEmail, getCurrentProfile, getStaffForTeam
} from "../roles.js";
import { findNearestMatch } from "../components/dropdown.js";

// ============================================================
// IN-MEMORY CACHE — read by other modules via getMasterData()
// ============================================================
const cache = {
  departments: [],   // Array<{id, name, archived, createdAt, ...}>
  clients: [],       // Array<{id, name, defaultSalesPic, defaultSsPic, archived, ...}>
  issueCategories: [],
  oneOnOneQuestions: [], // v3.8 — Array<{id, text, type: "personal"|"work", department, order, archived}>
  marketplaces: []   // v3.10 — Array<{id, name, archived, ...}> for Client Marketplace Links module
};

const subscribers = { departments: [], clients: [], issueCategories: [], oneOnOneQuestions: [], marketplaces: [] };

let _bootstrapped = false;

// Seed lists — used if collections are completely empty
const SEED_DEPARTMENTS = [
  "Sales", "Sales Support", "Operations", "Finance", "Tech",
  "IT", "HR", "Legal", "General Affairs", "HSE",
  "Marketing", "Quality Management"
];

// v3.10 — seeded once, then SS team curates via Master Data UI.
const SEED_MARKETPLACES = [
  "Shopee", "TikTok Shop", "Tokopedia", "Lazada", "Blibli",
  "Bukalapak", "JD.ID", "Zalora", "Instagram", "WhatsApp",
  "Website (own)", "Other"
];

// ============================================================
// PUBLIC API — used by daily-issue.js, ticketing.js, users.js
// ============================================================
export function subscribeMasterData(kind, callback) {
  if (!subscribers[kind]) return () => {};
  subscribers[kind].push(callback);
  // Fire immediately with current data
  callback(getActiveItems(kind));
  return () => {
    const i = subscribers[kind].indexOf(callback);
    if (i >= 0) subscribers[kind].splice(i, 1);
  };
}

export function getMasterData(kind) {
  return getActiveItems(kind);
}

export function getMasterDataAll(kind) {
  return [...(cache[kind] || [])];
}

export function getClientByName(name) {
  if (!name) return null;
  return cache.clients.find(c => c.name === name) || null;
}

function getActiveItems(kind) {
  return (cache[kind] || [])
    .filter(x => !x.archived)
    .map(x => x.name)
    .sort((a, b) => a.localeCompare(b));
}

function notify(kind) {
  const data = getActiveItems(kind);
  subscribers[kind].forEach(cb => {
    try { cb(data); } catch (e) { console.error(e); }
  });
}

// ============================================================
// BOOTSTRAP — call once at app startup (from app.js).
// Subscribes to all 3 collections + auto-seeds Departments
// on first use + auto-backfills Clients/Categories.
// ============================================================
export function bootstrapMasterData() {
  if (_bootstrapped) return;
  _bootstrapped = true;

  subscribeCollection(COL.DEPARTMENTS, async rows => {
    cache.departments = rows;
    notify("departments");
    // Auto-seed if completely empty (one-time)
    if (rows.length === 0 && !window._seedingDepts) {
      window._seedingDepts = true;
      try { await seedDepartments(); } catch (e) { console.warn("Seed depts failed:", e); }
      finally { window._seedingDepts = false; }
    }
  });

  subscribeCollection(COL.CLIENTS, async rows => {
    cache.clients = rows;
    notify("clients");
    // Auto-backfill from existing issues (one-time, only if empty)
    if (rows.length === 0 && !window._backfillingClients) {
      window._backfillingClients = true;
      try { await backfillFromIssues("client", "clients"); }
      catch (e) { console.warn("Backfill clients failed:", e); }
      finally { window._backfillingClients = false; }
    }
  });

  subscribeCollection(COL.ISSUE_CATEGORIES, async rows => {
    cache.issueCategories = rows;
    notify("issueCategories");
    if (rows.length === 0 && !window._backfillingCats) {
      window._backfillingCats = true;
      try { await backfillFromIssues("categoriComplain", "issueCategories"); }
      catch (e) { console.warn("Backfill cats failed:", e); }
      finally { window._backfillingCats = false; }
    }
  });

  // v3.8 — 1-on-1 questions
  subscribeCollection(COL.ONE_ON_ONE_QUESTIONS, async rows => {
    cache.oneOnOneQuestions = rows;
    notify("oneOnOneQuestions");
    // Auto-seed defaults if empty
    if (rows.length === 0 && !window._seedingQuestions) {
      window._seedingQuestions = true;
      try { await seedOneOnOneQuestions(); }
      catch (e) { console.warn("Seed 1-on-1 questions failed:", e); }
      finally { window._seedingQuestions = false; }
    }
  });

  // v3.10 — marketplaces (used by Client Marketplace Links module)
  subscribeCollection(COL.MARKETPLACES, async rows => {
    cache.marketplaces = rows;
    notify("marketplaces");
    if (rows.length === 0 && !window._seedingMarketplaces) {
      window._seedingMarketplaces = true;
      try { await seedMarketplaces(); }
      catch (e) { console.warn("Seed marketplaces failed:", e); }
      finally { window._seedingMarketplaces = false; }
    }
  });
}

async function seedMarketplaces() {
  for (const name of SEED_MARKETPLACES) {
    try { await addDocument(COL.MARKETPLACES, { name, archived: false, _seeded: true }); }
    catch (e) { /* ignore */ }
  }
  await logAudit("marketplaces", "seed", null, { count: SEED_MARKETPLACES.length });
}

async function seedDepartments() {
  for (const name of SEED_DEPARTMENTS) {
    try { await addDocument(COL.DEPARTMENTS, { name, archived: false, _seeded: true }); }
    catch (e) { /* ignore */ }
  }
  await logAudit("departments", "seed", null, { count: SEED_DEPARTMENTS.length });
}

async function backfillFromIssues(fieldName, kind) {
  const collectionName = kind === "clients" ? COL.CLIENTS : COL.ISSUE_CATEGORIES;
  try {
    const issues = await getDocuments(COL.ISSUES);
    const unique = [...new Set(issues.map(i => i[fieldName]).filter(Boolean))];
    if (!unique.length) return;
    for (const name of unique) {
      try { await addDocument(collectionName, { name, archived: false, _backfilled: true }); }
      catch (e) { /* ignore */ }
    }
    await logAudit(kind, "backfill", null, { count: unique.length });
  } catch (e) {
    console.warn(`Backfill ${kind} skipped:`, e.message);
  }
}

// ============================================================
// v3.8 — 1-on-1 QUESTIONS (seed defaults + CRUD)
// ============================================================
const SEED_PERSONAL_QUESTIONS = [
  "Bagaimana kondisi kamu secara keseluruhan belakangan ini?",
  "Bagaimana keseimbangan antara pekerjaan dan kehidupan pribadi kamu saat ini?",
  "Apa yang paling membuatmu semangat datang kerja belakangan ini?",
  "Adakah hal di luar pekerjaan yang sedang memengaruhi fokus atau energimu?",
  "Hal baru apa yang sedang kamu pelajari atau minati?",
  "Bagaimana hubungan kamu dengan rekan-rekan tim saat ini?",
  "Apakah ada yang bisa saya lakukan lebih baik untuk mendukung kamu?"
];
const SEED_WORK_QUESTIONS_BY_DEPT = {
  "Sales": [
    "Bagaimana kondisi pipeline sales kamu saat ini? Ada deals prioritas?",
    "Seberapa jauh pencapaianmu terhadap target bulan ini? Apa rencana untuk gap yang ada?",
    "Apa tantangan terbesar dalam closing deals belakangan ini?",
    "Adakah klien atau prospek yang berisiko lost? Apa strateginya?",
    "Bagaimana kamu mengelola follow-up dengan leads dari marketing?",
    "Adakah support atau resource tambahan yang kamu butuhkan?",
    "Apa strategi utamamu untuk quarter berikutnya?",
    "Skill apa yang ingin kamu kembangkan untuk naik level dalam sales?",
    "Adakah feedback dari klien mengenai produk/layanan yang perlu disampaikan?"
  ],
  "Sales Support": [
    "Bagaimana workload kamu saat ini? Apakah ada yang terasa terlalu berat?",
    "Adakah proses atau prosedur yang perlu diperbaiki untuk efisiensi lebih baik?",
    "Bagaimana koordinasimu dengan tim Sales? Adakah friction yang perlu diselesaikan?",
    "Apa hambatan paling sering dalam mendukung aktivitas Sales sehari-hari?",
    "Apakah tools atau sistem yang digunakan sudah cukup mendukung pekerjaanmu?",
    "Bagaimana kamu memprioritaskan pekerjaan ketika ada banyak permintaan bersamaan?",
    "Apakah ada feedback dari tim Sales tentang support yang kamu berikan?",
    "Bagaimana kamu memastikan akurasi data dan dokumen yang kamu proses?",
    "Skill atau pengetahuan apa yang ingin kamu tingkatkan dalam peranmu saat ini?"
  ],
  "Marketing": [
    "Bagaimana performa campaign digital bulan ini dibanding target? Channel mana terbaik?",
    "Adakah insight dari analytics yang perlu kita tindaklanjuti?",
    "Bagaimana kualitas leads yang dihasilkan menurut feedback Sales?",
    "Konten atau format apa yang perform baik? Ada eksperimen baru yang ingin dicoba?",
    "Tren digital marketing terbaru apa yang relevan dan ingin kamu terapkan?",
    "Apa tantangan terbesar dalam eksekusi campaign saat ini?",
    "Apakah budget dan resource sudah cukup untuk mencapai target?",
    "Bagaimana kamu memastikan konsistensi brand di semua channel digital?",
    "Sertifikasi, tool, atau skill digital apa yang ingin kamu kuasai berikutnya?"
  ]
};

async function seedOneOnOneQuestions() {
  let order = 0;
  for (const text of SEED_PERSONAL_QUESTIONS) {
    try {
      await addDocument(COL.ONE_ON_ONE_QUESTIONS, {
        text, type: "personal", department: "", order: order++, archived: false, _seeded: true
      });
    } catch (e) { /* ignore */ }
  }
  for (const [dept, questions] of Object.entries(SEED_WORK_QUESTIONS_BY_DEPT)) {
    order = 0;
    for (const text of questions) {
      try {
        await addDocument(COL.ONE_ON_ONE_QUESTIONS, {
          text, type: "work", department: dept, order: order++, archived: false, _seeded: true
        });
      } catch (e) { /* ignore */ }
    }
  }
  await logAudit("oneOnOneQuestions", "seed", null, { count: "defaults" });
}

/** Public API — returns filtered active questions. Used by one-on-one.js. */
export function getOneOnOneQuestions({ type, department } = {}) {
  let qs = cache.oneOnOneQuestions.filter(q => !q.archived);
  if (type) qs = qs.filter(q => q.type === type);
  if (department !== undefined) qs = qs.filter(q => (q.department || "") === department);
  return qs.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function addOneOnOneQuestion({ text, type, department }) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const cleanText = String(text).trim();
  if (!cleanText) throw new Error("Question text required");
  // Determine next order within this scope
  const sameScope = cache.oneOnOneQuestions.filter(q =>
    q.type === type && (q.department || "") === (department || ""));
  const nextOrder = sameScope.length ? Math.max(...sameScope.map(q => q.order || 0)) + 1 : 0;
  const id = await addDocument(COL.ONE_ON_ONE_QUESTIONS, {
    text: cleanText, type, department: department || "", order: nextOrder, archived: false
  });
  await logAudit("oneOnOneQuestions", "add", null, { text: cleanText, type, department });
  return id;
}

export async function editOneOnOneQuestion(id, newText) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const cleanText = String(newText).trim();
  if (!cleanText) throw new Error("Question text required");
  const item = cache.oneOnOneQuestions.find(q => q.id === id);
  if (!item) throw new Error("Question not found");
  await updateDocument(COL.ONE_ON_ONE_QUESTIONS, id, { text: cleanText });
  await logAudit("oneOnOneQuestions", "edit", item.text, cleanText);
}

export async function archiveOneOnOneQuestion(id) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const item = cache.oneOnOneQuestions.find(q => q.id === id);
  if (!item) throw new Error("Question not found");
  await updateDocument(COL.ONE_ON_ONE_QUESTIONS, id, { archived: true });
  await logAudit("oneOnOneQuestions", "archive", item.text, null);
}

export async function unarchiveOneOnOneQuestion(id) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  await updateDocument(COL.ONE_ON_ONE_QUESTIONS, id, { archived: false });
}

export async function hardDeleteOneOnOneQuestion(id) {
  if (!canHardDelete()) throw new Error("Only Admins can permanently delete questions");
  const item = cache.oneOnOneQuestions.find(q => q.id === id);
  if (!item) throw new Error("Question not found");
  await deleteDocument(COL.ONE_ON_ONE_QUESTIONS, id);
  await logAudit("oneOnOneQuestions", "harddelete", item.text, null);
}

// ============================================================
// CRUD — add / rename / archive
// ============================================================
export async function addMasterItem(kind, name, extra = {}) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const cleanName = String(name).trim();
  if (!cleanName) throw new Error("Name required");

  const existing = cache[kind].find(x => x.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    if (existing.archived) {
      // Un-archive instead of duplicating
      await updateDocument(getColName(kind), existing.id, { archived: false });
      await logAudit(kind, "unarchive", existing.name, null);
      return existing.id;
    }
    throw new Error(`"${cleanName}" already exists`);
  }

  const id = await addDocument(getColName(kind), {
    name: cleanName,
    archived: false,
    ...extra
  });
  await logAudit(kind, "add", null, { name: cleanName, ...extra });
  return id;
}

export async function renameMasterItem(kind, id, newName) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const item = cache[kind].find(x => x.id === id);
  if (!item) throw new Error("Item not found");
  const oldName = item.name;
  const cleanNew = String(newName).trim();
  if (!cleanNew) throw new Error("Name required");
  if (cleanNew === oldName) return;

  // Check duplicate
  if (cache[kind].some(x => x.id !== id && x.name.toLowerCase() === cleanNew.toLowerCase())) {
    throw new Error(`"${cleanNew}" already exists`);
  }

  await updateDocument(getColName(kind), id, { name: cleanNew });

  // CASCADE: update historical records that reference this name
  let cascadeCount = 0;
  try {
    if (kind === "clients") {
      cascadeCount = await cascadeRename(COL.ISSUES, "client", oldName, cleanNew);
    } else if (kind === "issueCategories") {
      cascadeCount = await cascadeRename(COL.ISSUES, "categoriComplain", oldName, cleanNew);
    } else if (kind === "departments") {
      cascadeCount += await cascadeRename(COL.TICKETS, "dept", oldName, cleanNew);
      cascadeCount += await cascadeRename(COL.USERS, "department", oldName, cleanNew);
    }
  } catch (e) {
    console.warn("Cascade rename partial failure:", e);
  }

  await logAudit(kind, "rename", oldName, { newName: cleanNew, cascadeCount });
  return cascadeCount;
}

async function cascadeRename(colName, field, oldVal, newVal) {
  try {
    const q = query(collection(db, colName), where(field, "==", oldVal));
    const snap = await getDocs(q);
    let count = 0;
    for (const docSnap of snap.docs) {
      // Route through updateDocument (not raw updateDoc) so each
      // cascaded row gets stamped with updatedAt/updatedBy. Otherwise
      // the rename leaves touched docs looking pristine, breaking
      // "recently updated" sorts and per-row audit trails.
      await updateDocument(colName, docSnap.id, { [field]: newVal });
      count++;
    }
    return count;
  } catch (e) {
    console.warn(`Cascade in ${colName}.${field} failed:`, e.message);
    return 0;
  }
}

export async function archiveMasterItem(kind, id) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const item = cache[kind].find(x => x.id === id);
  if (!item) throw new Error("Item not found");
  await updateDocument(getColName(kind), id, { archived: true });
  await logAudit(kind, "archive", item.name, null);
}

export async function unarchiveMasterItem(kind, id) {
  if (!canEditMasterData()) throw new Error("You don't have permission to edit master data");
  const item = cache[kind].find(x => x.id === id);
  if (!item) throw new Error("Item not found");
  await updateDocument(getColName(kind), id, { archived: false });
  await logAudit(kind, "unarchive", item.name, null);
}

// HARD DELETE — permanently remove from DB. Only super-admins can do this.
// Item must already be archived (two-step safety).
// Does NOT cascade-delete historical references — orphans will keep
// the old name in their records (better than silently corrupting data).
export async function hardDeleteMasterItem(kind, id) {
  if (!canHardDelete()) throw new Error("Only Super Admin can permanently delete");
  const item = cache[kind].find(x => x.id === id);
  if (!item) throw new Error("Item not found");
  if (!item.archived) throw new Error("Archive first before permanently deleting");
  await deleteDocument(getColName(kind), id);
  await logAudit(kind, "hardDelete", item.name, null);
}

export async function updateClientPics(id, defaultSalesPic, defaultSsPic) {
  const item = cache.clients.find(x => x.id === id);
  if (!item) throw new Error("Client not found");
  await updateDocument(COL.CLIENTS, id, { defaultSalesPic, defaultSsPic });
  await logAudit("clients", "updatePICs", item.name, { defaultSalesPic, defaultSsPic });
}

function getColName(kind) {
  return { departments: COL.DEPARTMENTS, clients: COL.CLIENTS, issueCategories: COL.ISSUE_CATEGORIES, oneOnOneQuestions: COL.ONE_ON_ONE_QUESTIONS, marketplaces: COL.MARKETPLACES }[kind];
}

// ============================================================
// AUDIT LOG
// ============================================================
async function logAudit(kind, action, oldValue, newValue) {
  try {
    await addDoc(collection(db, COL.AUDIT_LOG), {
      kind, action, oldValue, newValue,
      at: serverTimestamp(),
      by: getCurrentEmail() || "system"
    });
  } catch (e) { /* non-critical */ }
}

// ============================================================
// UI — Master Data Page
// ============================================================
let currentTab = "departments";
let salesStaff = [], ssStaff = [];

export async function initMasterData() {
  // Anyone logged in can view. Edit is gated below per-action.
  $("masterDataRoot").innerHTML = renderShell();
  bindEvents();

  // Pre-load staff lists for the Client PIC pickers (only useful when editing)
  if (canEditMasterData()) {
    try {
      salesStaff = await getStaffForTeam("sales");
      ssStaff = await getStaffForTeam("ss");
    } catch (e) { console.warn("Staff load failed:", e); }
  }

  // Subscribe to master data — re-render on changes
  subscribeMasterData("departments", () => { if (currentTab === "departments") renderDeptsTable(); });
  subscribeMasterData("clients",     () => { if (currentTab === "clients")     renderClientsTable(); });
  subscribeMasterData("issueCategories", () => { if (currentTab === "issueCategories") renderCatsTable(); });
  subscribeMasterData("oneOnOneQuestions", () => { if (currentTab === "oneOnOneQuestions") renderQuestionsTable(); });
  subscribeMasterData("marketplaces", () => { if (currentTab === "marketplaces") renderMarketplacesTable(); });

  switchTab("departments");
}

function renderShell() {
  const readOnly = !canEditMasterData();
  return `
    <div class="card">
      ${readOnly ? `<div style="margin-bottom:10px"><span class="badge badge-on-hold">View-Only — ask an Admin or Supervisor to edit</span></div>` : ''}
      <div class="tabs" id="mdTabs">
        <button class="active" data-mdtab="departments">Departments</button>
        <button data-mdtab="clients">Clients</button>
        <button data-mdtab="issueCategories">Issue Categories</button>
        <button data-mdtab="oneOnOneQuestions">1-on-1 Questions</button>
        <button data-mdtab="marketplaces">Marketplaces</button>
      </div>
    </div>

    <div id="mdContent"></div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-mdtab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.mdtab));
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll("[data-mdtab]").forEach(b => {
    b.classList.toggle("active", b.dataset.mdtab === tab);
  });
  if (tab === "departments") renderDeptsPane();
  if (tab === "clients") renderClientsPane();
  if (tab === "issueCategories") renderCatsPane();
  if (tab === "oneOnOneQuestions") renderQuestionsPane();
  if (tab === "marketplaces") renderMarketplacesPane();
}

// ---------------- DEPARTMENTS PANE ----------------
function renderDeptsPane() {
  const editable = canEditMasterData();
  $("mdContent").innerHTML = `
    <div class="card">
      <h2>Departments</h2>
      <p class="small" style="color:var(--muted)">Used in user profiles, internal tickets, and filtering.</p>
      ${editable ? `
        <div class="mdAddRow">
          <input type="text" id="md_deptInput" placeholder="e.g. Procurement"/>
          <button class="primary" id="md_deptAdd">+ Add</button>
          <button class="secondary" onclick="document.getElementById('md_deptBulk').classList.toggle('hidden')">Bulk paste</button>
        </div>
        <div id="md_deptBulk" class="mdBulk hidden">
          <textarea id="md_deptBulkInput" rows="4" placeholder="Paste one department per line…"></textarea>
          <button class="primary" id="md_deptBulkAdd">Add All</button>
          <button class="secondary" onclick="document.getElementById('md_deptBulk').classList.add('hidden')">Cancel</button>
        </div>
      ` : `<p class="small" style="color:var(--muted);font-style:italic;margin-top:10px">View-only mode — contact your Admin or Supervisor to add or modify departments.</p>`}
      <div class="tableWrap" style="margin-top:14px">
        <table id="md_deptTable">
          <thead><tr><th>Department</th><th>Status</th>${editable ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  if (editable) {
    $("md_deptAdd").onclick = async () => {
    const name = $("md_deptInput").value.trim();
    if (!name) return toast("Enter a name", "error");
    try {
      await addMasterItem("departments", name);
      $("md_deptInput").value = "";
      toast("Department added", "success");
    } catch (e) { toast(e.message, "error"); }
  };
  $("md_deptBulkAdd").onclick = async () => {
    const lines = $("md_deptBulkInput").value.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return toast("Paste at least one name", "error");
    let ok = 0, dup = 0;
    for (const name of lines) {
      try { await addMasterItem("departments", name); ok++; }
      catch (e) { if (e.message?.includes("exists")) dup++; }
    }
    $("md_deptBulkInput").value = "";
    $("md_deptBulk").classList.add("hidden");
    toast(`Added ${ok}${dup ? ` · ${dup} duplicates skipped` : ""}`, "success");
  };
  } // end if(editable)
  renderDeptsTable();
}

function renderDeptsTable() {
  const tbody = $("md_deptTable")?.querySelector("tbody");
  if (!tbody) return;
  const items = [...cache.departments].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const editable = canEditMasterData();
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${editable ? 3 : 2}" style="text-align:center;color:var(--muted);padding:24px">No departments yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(d => `
    <tr class="${d.archived ? "rowArchived" : ""}">
      <td><b>${esc(d.name)}</b></td>
      <td>${d.archived ? '<span class="badge badge-on-hold">Archived</span>' : '<span class="badge badge-active">Active</span>'}</td>
      ${editable ? `<td style="text-align:right">
        <button class="secondary iconBtn" data-rename="${d.id}">Rename</button>
        ${d.archived
          ? `<button class="secondary iconBtn" data-unarchive="${d.id}">Restore</button>${canHardDelete() ? ` <button class="btnHardDelete" data-harddel="${d.id}">Delete Forever</button>` : ""}`
          : `<button class="danger iconBtn" data-archive="${d.id}">Archive</button>`}
      </td>` : ''}
    </tr>
  `).join("");
  if (editable) wireRowActions("departments", tbody);
}

// ---------------- MARKETPLACES PANE (v3.10) ----------------
function renderMarketplacesPane() {
  const editable = canEditMasterData();
  $("mdContent").innerHTML = `
    <div class="card">
      <h2>Marketplaces</h2>
      <p class="small" style="color:var(--muted)">Used by the Marketplace Hub. Add new platforms (e.g. Lazmall, TikTok Live) so SS can pick them when adding a store.</p>
      ${editable ? `
        <div class="mdAddRow">
          <input type="text" id="md_mpInput" placeholder="e.g. Lazmall"/>
          <button class="primary" id="md_mpAdd">+ Add</button>
          <button class="secondary" onclick="document.getElementById('md_mpBulk').classList.toggle('hidden')">Bulk paste</button>
        </div>
        <div id="md_mpBulk" class="mdBulk hidden">
          <textarea id="md_mpBulkInput" rows="4" placeholder="Paste one marketplace per line…"></textarea>
          <button class="primary" id="md_mpBulkAdd">Add All</button>
          <button class="secondary" onclick="document.getElementById('md_mpBulk').classList.add('hidden')">Cancel</button>
        </div>
      ` : `<p class="small" style="color:var(--muted);font-style:italic;margin-top:10px">View-only mode — contact your Admin or Supervisor to add or modify marketplaces.</p>`}
      <div class="tableWrap" style="margin-top:14px">
        <table id="md_mpTable">
          <thead><tr><th>Marketplace</th><th>Status</th>${editable ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  if (editable) {
    $("md_mpAdd").onclick = async () => {
      const name = $("md_mpInput").value.trim();
      if (!name) return toast("Enter a marketplace name", "error");
      try {
        await addMasterItem("marketplaces", name);
        $("md_mpInput").value = "";
        toast("Marketplace added", "success");
      } catch (e) { toast(e.message, "error"); }
    };
    $("md_mpBulkAdd").onclick = async () => {
      const lines = $("md_mpBulkInput").value.split(/\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) return toast("Paste at least one name", "error");
      let ok = 0, dup = 0;
      for (const name of lines) {
        try { await addMasterItem("marketplaces", name); ok++; }
        catch (e) { if (e.message?.includes("exists")) dup++; }
      }
      $("md_mpBulkInput").value = "";
      $("md_mpBulk").classList.add("hidden");
      toast(`Added ${ok}${dup ? ` · ${dup} duplicates skipped` : ""}`, "success");
    };
  }
  renderMarketplacesTable();
}

function renderMarketplacesTable() {
  const tbody = $("md_mpTable")?.querySelector("tbody");
  if (!tbody) return;
  const items = [...cache.marketplaces].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const editable = canEditMasterData();
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${editable ? 3 : 2}" style="text-align:center;color:var(--muted);padding:24px">No marketplaces yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(m => `
    <tr class="${m.archived ? "rowArchived" : ""}">
      <td><b>${esc(m.name)}</b></td>
      <td>${m.archived ? '<span class="badge badge-on-hold">Archived</span>' : '<span class="badge badge-active">Active</span>'}</td>
      ${editable ? `<td style="text-align:right">
        <button class="secondary iconBtn" data-rename="${m.id}">Rename</button>
        ${m.archived
          ? `<button class="secondary iconBtn" data-unarchive="${m.id}">Restore</button>${canHardDelete() ? ` <button class="btnHardDelete" data-harddel="${m.id}">Delete Forever</button>` : ""}`
          : `<button class="danger iconBtn" data-archive="${m.id}">Archive</button>`}
      </td>` : ''}
    </tr>
  `).join("");
  if (editable) wireRowActions("marketplaces", tbody);
}

// ---------------- CLIENTS PANE ----------------
function renderClientsPane() {
  const editable = canEditMasterData();
  $("mdContent").innerHTML = `
    <div class="card">
      <h2>Clients</h2>
      <p class="small" style="color:var(--muted)">Set a default Sales PIC and SS PIC per client to auto-fill when logging issues.</p>
      ${editable ? `
        <div class="mdAddRow">
          <input type="text" id="md_cliInput" placeholder="e.g. PERO"/>
          <button class="primary" id="md_cliAdd">+ Add</button>
          <button class="secondary" onclick="document.getElementById('md_cliBulk').classList.toggle('hidden')">Bulk paste</button>
        </div>
        <div id="md_cliBulk" class="mdBulk hidden">
          <textarea id="md_cliBulkInput" rows="4" placeholder="Paste one client per line…"></textarea>
          <button class="primary" id="md_cliBulkAdd">Add All</button>
          <button class="secondary" onclick="document.getElementById('md_cliBulk').classList.add('hidden')">Cancel</button>
        </div>
      ` : `<p class="small" style="color:var(--muted);font-style:italic;margin-top:10px">View-only mode — contact your Admin or Supervisor to add or modify clients.</p>`}
      <div class="tableWrap" style="margin-top:14px">
        <table id="md_cliTable">
          <thead><tr><th>Client</th><th>Default Sales PIC</th><th>Default SS PIC</th><th>Status</th>${editable ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  if (editable) {
    $("md_cliAdd").onclick = async () => {
      const name = $("md_cliInput").value.trim();
      if (!name) return toast("Enter a name", "error");
      // Fuzzy check for near-duplicates
      const activeNames = cache.clients.filter(c => !c.archived).map(c => c.name);
      const near = findNearestMatch(name, activeNames);
      if (near && near.name.toLowerCase() !== name.toLowerCase()) {
        if (!confirm(`Warning: similar client "${near.name}" already exists.\n\nCreate "${name}" anyway?`)) return;
      }
      try {
        await addMasterItem("clients", name);
        $("md_cliInput").value = "";
        toast("Client added", "success");
      } catch (e) { toast(e.message, "error"); }
    };
    $("md_cliBulkAdd").onclick = async () => {
      const lines = $("md_cliBulkInput").value.split(/\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) return toast("Paste at least one name", "error");
      let ok = 0, dup = 0;
      for (const name of lines) {
        try { await addMasterItem("clients", name); ok++; }
        catch (e) { if (e.message?.includes("exists")) dup++; }
      }
      $("md_cliBulkInput").value = "";
      $("md_cliBulk").classList.add("hidden");
      toast(`Added ${ok}${dup ? ` · ${dup} duplicates skipped` : ""}`, "success");
    };
  }
  renderClientsTable();
}

function renderClientsTable() {
  const tbody = $("md_cliTable")?.querySelector("tbody");
  if (!tbody) return;
  const editable = canEditMasterData();
  const items = [...cache.clients].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  const colCount = editable ? 5 : 4;
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;color:var(--muted);padding:24px">No clients yet.${editable ? ' Add some or bulk-paste.' : ''}</td></tr>`;
    return;
  }
  const salesOpts = `<option value="">— None —</option>` +
    salesStaff.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  const ssOpts = `<option value="">— None —</option>` +
    ssStaff.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");

  tbody.innerHTML = items.map(c => `
    <tr class="${c.archived ? "rowArchived" : ""}">
      <td><b>${esc(c.name)}</b></td>
      <td><select data-clientpic-sales="${c.id}" ${c.archived || !editable ? "disabled" : ""}>${salesOpts.replace(`value="${esc(c.defaultSalesPic || "")}"`, `value="${esc(c.defaultSalesPic || "")}" selected`)}</select></td>
      <td><select data-clientpic-ss="${c.id}" ${c.archived || !editable ? "disabled" : ""}>${ssOpts.replace(`value="${esc(c.defaultSsPic || "")}"`, `value="${esc(c.defaultSsPic || "")}" selected`)}</select></td>
      <td>${c.archived ? '<span class="badge badge-on-hold">Archived</span>' : '<span class="badge badge-active">Active</span>'}</td>
      ${editable ? `<td style="text-align:right">
        <button class="secondary iconBtn" data-rename="${c.id}">Rename</button>
        ${c.archived
          ? `<button class="secondary iconBtn" data-unarchive="${c.id}">Restore</button>${canHardDelete() ? ` <button class="btnHardDelete" data-harddel="${c.id}">Delete Forever</button>` : ""}`
          : `<button class="danger iconBtn" data-archive="${c.id}">Archive</button>`}
      </td>` : ''}
    </tr>
  `).join("");

  if (editable) {
    // PIC selectors auto-save on change
    tbody.querySelectorAll("[data-clientpic-sales]").forEach(sel => {
      sel.addEventListener("change", async () => {
        const id = sel.dataset.clientpicSales;
        const client = cache.clients.find(c => c.id === id);
        try {
          await updateClientPics(id, sel.value, client?.defaultSsPic || "");
          toast(`PIC updated for ${client?.name}`, "success");
        } catch (e) { toast(e.message, "error"); }
      });
    });
    tbody.querySelectorAll("[data-clientpic-ss]").forEach(sel => {
      sel.addEventListener("change", async () => {
        const id = sel.dataset.clientpicSs;
        const client = cache.clients.find(c => c.id === id);
        try {
          await updateClientPics(id, client?.defaultSalesPic || "", sel.value);
          toast(`PIC updated for ${client?.name}`, "success");
        } catch (e) { toast(e.message, "error"); }
      });
    });

    wireRowActions("clients", tbody);
  }
}

// ---------------- ISSUE CATEGORIES PANE ----------------
function renderCatsPane() {
  $("mdContent").innerHTML = `
    <div class="card">
      <h2>Issue Categories</h2>
      <p class="small" style="color:var(--muted)">Standardize how complaints are tagged for cleaner reports. Renaming cascades to all historical issues.</p>
      <div class="mdAddRow">
        <input type="text" id="md_catInput" placeholder="e.g. Wrong SKU shipped"/>
        <button class="primary" id="md_catAdd">+ Add</button>
        <button class="secondary" onclick="document.getElementById('md_catBulk').classList.toggle('hidden')">Bulk paste</button>
      </div>
      <div id="md_catBulk" class="mdBulk hidden">
        <textarea id="md_catBulkInput" rows="4" placeholder="Paste one category per line…"></textarea>
        <button class="primary" id="md_catBulkAdd">Add All</button>
        <button class="secondary" onclick="document.getElementById('md_catBulk').classList.add('hidden')">Cancel</button>
      </div>
      <div class="tableWrap" style="margin-top:14px">
        <table id="md_catTable">
          <thead><tr><th>Category</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  $("md_catAdd").onclick = async () => {
    const name = $("md_catInput").value.trim();
    if (!name) return toast("Enter a name", "error");
    try {
      await addMasterItem("issueCategories", name);
      $("md_catInput").value = "";
      toast("Category added", "success");
    } catch (e) { toast(e.message, "error"); }
  };
  $("md_catBulkAdd").onclick = async () => {
    const lines = $("md_catBulkInput").value.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return toast("Paste at least one name", "error");
    let ok = 0, dup = 0;
    for (const name of lines) {
      try { await addMasterItem("issueCategories", name); ok++; }
      catch (e) { if (e.message?.includes("exists")) dup++; }
    }
    $("md_catBulkInput").value = "";
    $("md_catBulk").classList.add("hidden");
    toast(`Added ${ok}${dup ? ` · ${dup} duplicates skipped` : ""}`, "success");
  };
  renderCatsTable();
}

function renderCatsTable() {
  const tbody = $("md_catTable")?.querySelector("tbody");
  if (!tbody) return;
  const items = [...cache.issueCategories].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:24px">No categories yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(c => `
    <tr class="${c.archived ? "rowArchived" : ""}">
      <td><b>${esc(c.name)}</b></td>
      <td>${c.archived ? '<span class="badge badge-on-hold">Archived</span>' : '<span class="badge badge-active">Active</span>'}</td>
      <td style="text-align:right">
        <button class="secondary iconBtn" data-rename="${c.id}">Rename</button>
        ${c.archived
          ? `<button class="secondary iconBtn" data-unarchive="${c.id}">Restore</button>${canHardDelete() ? ` <button class="btnHardDelete" data-harddel="${c.id}">Delete Forever</button>` : ""}`
          : `<button class="danger iconBtn" data-archive="${c.id}">Archive</button>`}
      </td>
    </tr>
  `).join("");
  wireRowActions("issueCategories", tbody);
}

// ---------------- SHARED ROW ACTIONS ----------------
function wireRowActions(kind, tbody) {
  tbody.querySelectorAll("[data-rename]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = b.dataset.rename;
      const item = cache[kind].find(x => x.id === id);
      const newName = prompt(`Rename "${item.name}" to:`, item.name);
      if (!newName || newName === item.name) return;
      try {
        const cascadeCount = await renameMasterItem(kind, id, newName);
        toast(`Renamed${cascadeCount ? ` · ${cascadeCount} historical records updated` : ""}`, "success");
      } catch (e) { toast(e.message, "error"); }
    }));
  tbody.querySelectorAll("[data-archive]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = b.dataset.archive;
      const item = cache[kind].find(x => x.id === id);
      if (!confirmAction(`Archive "${item.name}"? It will be hidden from selection but historical records keep this label.`)) return;
      try { await archiveMasterItem(kind, id); toast("Archived", "success"); }
      catch (e) { toast(e.message, "error"); }
    }));
  tbody.querySelectorAll("[data-unarchive]").forEach(b =>
    b.addEventListener("click", async () => {
      try { await unarchiveMasterItem(kind, b.dataset.unarchive); toast("Restored", "success"); }
      catch (e) { toast(e.message, "error"); }
    }));
  tbody.querySelectorAll("[data-harddel]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = b.dataset.harddel;
      const item = cache[kind].find(x => x.id === id);
      const kindLabel = { departments: "department", clients: "client", issueCategories: "category" }[kind];
      const typed = prompt(
        `PERMANENT DELETE\n\nThis will remove the ${kindLabel} "${item.name}" from the database forever.\n\nHistorical records (issues, tickets, users) that referenced it will keep the name as a string but lose the link to the master record.\n\nType the ${kindLabel} name to confirm:`,
        ""
      );
      if (typed === null) return;
      if (typed.trim() !== item.name) return toast("Name didn't match — cancelled", "error");
      try {
        await hardDeleteMasterItem(kind, id);
        toast(`Permanently deleted "${item.name}"`, "success");
      } catch (e) { toast(e.message, "error"); }
    }));
}

// ============================================================
// v3.8 — 1-on-1 QUESTIONS PANE
// ============================================================
let _qPaneScope = { type: "personal", department: "" };

function renderQuestionsPane() {
  const editable = canEditMasterData();
  const allDepts = getMasterData("departments");

  $("mdContent").innerHTML = `
    <div class="card">
      <h2>1-on-1 Questions</h2>
      <p class="small" style="color:var(--muted)">
        Questions used in the 1-on-1 Summarizer. <b>Personal</b> questions are shared across all departments;
        <b>Work</b> questions are per-department.
      </p>

      <!-- Scope selector -->
      <div class="filterGrid" style="margin-top:14px;grid-template-columns:1fr 1fr">
        <div>
          <label class="pmLabel">Type</label>
          <select id="md_q_type">
            <option value="personal">Personal (shared)</option>
            <option value="work">Work (per department)</option>
          </select>
        </div>
        <div id="md_q_deptWrap">
          <label class="pmLabel">Department</label>
          <select id="md_q_dept">
            ${allDepts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
          </select>
        </div>
      </div>

      ${editable ? `
        <div class="mdAddRow" style="margin-top:14px">
          <input type="text" id="md_q_input" placeholder="Type a new question…" style="flex:1"/>
          <button class="primary" id="md_q_add">+ Add Question</button>
          <button class="secondary" onclick="document.getElementById('md_q_bulk').classList.toggle('hidden')">Bulk paste</button>
        </div>
        <div id="md_q_bulk" class="mdBulk hidden">
          <textarea id="md_q_bulkInput" rows="6" placeholder="Paste one question per line…"></textarea>
          <button class="primary" id="md_q_bulkAdd">Add All</button>
          <button class="secondary" onclick="document.getElementById('md_q_bulk').classList.add('hidden')">Cancel</button>
        </div>
      ` : `<p class="small" style="color:var(--muted);font-style:italic;margin-top:10px">View-only mode — contact your Admin or Supervisor to manage 1-on-1 questions.</p>`}

      <div class="tableWrap" style="margin-top:14px">
        <table id="md_q_table">
          <thead><tr><th style="width:46px">#</th><th>Question</th><th>Status</th>${editable ? '<th style="text-align:right">Actions</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  // Default selections
  $("md_q_type").value = _qPaneScope.type;
  toggleDeptVisibility();
  if (_qPaneScope.type === "work" && allDepts.length) {
    $("md_q_dept").value = _qPaneScope.department || allDepts[0];
    _qPaneScope.department = $("md_q_dept").value;
  }

  // Wire up
  $("md_q_type").onchange = () => {
    _qPaneScope.type = $("md_q_type").value;
    _qPaneScope.department = _qPaneScope.type === "personal" ? "" : ($("md_q_dept").value || allDepts[0] || "");
    toggleDeptVisibility();
    renderQuestionsTable();
  };
  if ($("md_q_dept")) {
    $("md_q_dept").onchange = () => {
      _qPaneScope.department = $("md_q_dept").value;
      renderQuestionsTable();
    };
  }

  if (editable) {
    $("md_q_add").onclick = async () => {
      const text = $("md_q_input").value.trim();
      if (!text) return toast("Type a question first", "error");
      try {
        await addOneOnOneQuestion({ text, type: _qPaneScope.type, department: _qPaneScope.department });
        $("md_q_input").value = "";
        toast("Question added", "success");
      } catch (e) { toast(e.message, "error"); }
    };
    $("md_q_bulkAdd").onclick = async () => {
      const lines = $("md_q_bulkInput").value.split(/\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) return toast("Paste at least one question", "error");
      let ok = 0;
      for (const text of lines) {
        try { await addOneOnOneQuestion({ text, type: _qPaneScope.type, department: _qPaneScope.department }); ok++; }
        catch (e) { /* skip */ }
      }
      $("md_q_bulkInput").value = "";
      $("md_q_bulk").classList.add("hidden");
      toast(`Added ${ok} questions`, "success");
    };
  }

  renderQuestionsTable();
}

function toggleDeptVisibility() {
  const wrap = $("md_q_deptWrap");
  if (!wrap) return;
  wrap.style.display = _qPaneScope.type === "work" ? "" : "none";
}

function renderQuestionsTable() {
  const tbody = $("md_q_table")?.querySelector("tbody");
  if (!tbody) return;
  const editable = canEditMasterData();

  // Use ALL items (including archived) so we can show "Archived" badge + Restore
  const items = cache.oneOnOneQuestions
    .filter(q => q.type === _qPaneScope.type && (q.department || "") === (_qPaneScope.department || ""))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${editable ? 4 : 3}" style="text-align:center;color:var(--muted);padding:24px">
      No questions yet for this scope.${editable ? ' Add one above.' : ''}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((q, i) => `
    <tr class="${q.archived ? "rowArchived" : ""}">
      <td>${i + 1}</td>
      <td>${esc(q.text)}</td>
      <td>${q.archived ? '<span class="badge badge-on-hold">Archived</span>' : '<span class="badge badge-active">Active</span>'}</td>
      ${editable ? `<td style="text-align:right">
        <button class="secondary iconBtn" data-q-edit="${q.id}">Edit</button>
        ${q.archived
          ? `<button class="secondary iconBtn" data-q-unarchive="${q.id}">Restore</button>${canHardDelete() ? ` <button class="btnHardDelete" data-q-harddel="${q.id}"></button>` : ""}`
          : `<button class="danger iconBtn" data-q-archive="${q.id}">Archive</button>`}
      </td>` : ''}
    </tr>
  `).join("");

  if (!editable) return;

  tbody.querySelectorAll("[data-q-edit]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = b.dataset.qEdit;
      const item = cache.oneOnOneQuestions.find(x => x.id === id);
      const newText = prompt(`Edit question:`, item.text);
      if (!newText || newText === item.text) return;
      try { await editOneOnOneQuestion(id, newText); toast("Question updated", "success"); }
      catch (e) { toast(e.message, "error"); }
    }));
  tbody.querySelectorAll("[data-q-archive]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = b.dataset.qArchive;
      const item = cache.oneOnOneQuestions.find(x => x.id === id);
      if (!confirmAction(`Archive this question? It will be hidden from future 1-on-1 sessions.\n\n"${item.text.slice(0, 80)}…"`)) return;
      try { await archiveOneOnOneQuestion(id); toast("Archived", "success"); }
      catch (e) { toast(e.message, "error"); }
    }));
  tbody.querySelectorAll("[data-q-unarchive]").forEach(b =>
    b.addEventListener("click", async () => {
      try { await unarchiveOneOnOneQuestion(b.dataset.qUnarchive); toast("Restored", "success"); }
      catch (e) { toast(e.message, "error"); }
    }));
  tbody.querySelectorAll("[data-q-harddel]").forEach(b =>
    b.addEventListener("click", async () => {
      const id = b.dataset.qHarddel;
      const item = cache.oneOnOneQuestions.find(x => x.id === id);
      if (!confirmAction(`PERMANENTLY delete this question?\n\n"${item.text.slice(0, 80)}…"\n\nThis cannot be undone.`)) return;
      try { await hardDeleteOneOnOneQuestion(id); toast("Permanently deleted", "success"); }
      catch (e) { toast(e.message, "error"); }
    }));
}
