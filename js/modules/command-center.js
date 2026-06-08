// ============================================================
// FLOW Mega Apps — Command Center (Management → Workspace launcher)
//
// A team-shared launcher for every external tool the org uses:
//   • Departments (Operations, Sales, Engineering, …)
//   • Apps inside each dept (Gmail, Metabase, GitHub, …)
//
// Permissions (matches the v3.8 model in roles.js):
//   • master            — full power (add/edit/delete dept + app)
//   • supervisor/admin  — full power (add/edit/delete dept + app)
//   • user (limited)    — can ADD apps only. No edit, no delete,
//                         no department changes.
//
// Storage:
//   • command_center_depts — { name, order, createdAt, createdBy, ... }
//   • command_center_apps  — { deptId, name, url, desc, icon, color,
//                              order, createdAt, createdBy, ... }
//
// Activity: every create/update/delete is recorded automatically by
// the central audit-trail in firebase.js (writeAudit), so the
// Activity Log already shows who did what to which app/dept.
// ============================================================

import {
  addDocument, updateDocument, deleteDocument, subscribeCollection,
  doc, updateDoc
} from "../firebase.js";
import { $, esc, toast, confirmAction } from "../utils.js";
import {
  isMaster, isAdmin, isSupervisor, getCurrentEmail
} from "../roles.js";
import { t } from "../i18n.js";

// Collection names — kept literal here so we don't have to edit
// firebase.js/COL just for this module.
const COL_DEPTS = "command_center_depts";
const COL_APPS  = "command_center_apps";

// ============================================================
// PERMISSIONS
// ============================================================
function canAddApp()      { return !!getCurrentEmail(); }                 // every signed-in user
function canEditApp()     { return isMaster() || isAdmin() || isSupervisor(); }
function canDeleteApp()   { return isMaster() || isAdmin() || isSupervisor(); }
function canManageDept()  { return isMaster() || isAdmin() || isSupervisor(); }
// Sorting is treated as an edit — limited users (who can only ADD) don't
// get to rearrange the shared launcher. Supervisors/admins/master can drag.
function canSortApp()     { return canEditApp(); }
function canSortDept()    { return canManageDept(); }

// ============================================================
// STATE
// ============================================================
let allDepts = [];   // [{id, name, order, ...}]
let allApps  = [];   // [{id, deptId, name, url, desc, icon, color, order, ...}]
let editingAppId  = null;     // current app being edited (null = adding)
let editingDeptId = null;     // current dept being edited (null = adding)
let activeDeptId  = null;     // dept whose "+ Add app" form is open
let unsubDepts = null;
let unsubApps  = null;
let _seedingDepts = false;

// Default colour palette
const SWATCHES = [
  "#6337D8","#27BEDC","#0F9D58","#4285F4","#EA4335","#F59E0B",
  "#9B59B6","#EF4444","#24292E","#0EA5E9","#10B981","#F97316",
  "#EC4899","#6366F1","#14B8A6","#8B5CF6","#509EE3","#12b886"
];

// Seed departments — created once on first visit if the collection is
// empty so the page doesn't look broken before anyone has added anything.
const SEED_DEPTS = ["Operations", "Sales & CRM", "Data & Analytics", "Engineering"];

// Light icon library — used by the auto-pick + colour swatches in the
// modal. Each entry is { icon: "emoji or letter", color: hex }.
const ICON_MAP = {
  "gmail":          { icon:"✉",  color:"#EA4335" },
  "mail":           { icon:"✉",  color:"#EA4335" },
  "drive":          { icon:"▲",  color:"#4285F4" },
  "sheets":         { icon:"⊞",  color:"#0F9D58" },
  "docs":           { icon:"📄", color:"#4285F4" },
  "calendar":       { icon:"📅", color:"#4285F4" },
  "meet":           { icon:"🎥", color:"#00897B" },
  "youtube":        { icon:"▶",  color:"#FF0000" },
  "github":         { icon:"⌥",  color:"#24292E" },
  "gitlab":         { icon:"⌥",  color:"#FC6D26" },
  "notion":         { icon:"N",  color:"#000000" },
  "slack":          { icon:"#",  color:"#4A154B" },
  "figma":          { icon:"F",  color:"#F24E1E" },
  "trello":         { icon:"☰",  color:"#0052CC" },
  "jira":           { icon:"J",  color:"#0052CC" },
  "asana":          { icon:"A",  color:"#F06A6A" },
  "linear":         { icon:"L",  color:"#5E6AD2" },
  "discord":        { icon:"D",  color:"#5865F2" },
  "whatsapp":       { icon:"W",  color:"#25D366" },
  "telegram":       { icon:"T",  color:"#2AABEE" },
  "zoom":           { icon:"Z",  color:"#2D8CFF" },
  "teams":          { icon:"T",  color:"#6264A7" },
  "outlook":        { icon:"O",  color:"#0078D4" },
  "dropbox":        { icon:"⬚",  color:"#0061FF" },
  "aws":            { icon:"☁",  color:"#FF9900" },
  "vercel":         { icon:"▲",  color:"#000000" },
  "netlify":        { icon:"◆",  color:"#00C7B7" },
  "firebase":       { icon:"🔥", color:"#FFCA28" },
  "supabase":       { icon:"S",  color:"#3ECF8E" },
  "neon":           { icon:"⛁",  color:"#12b886" },
  "postgres":       { icon:"⛁",  color:"#336791" },
  "mongodb":        { icon:"⛁",  color:"#47A248" },
  "metabase":       { icon:"📊", color:"#509EE3" },
  "tableau":        { icon:"📈", color:"#E97627" },
  "looker":         { icon:"📈", color:"#4285F4" },
  "grafana":        { icon:"📊", color:"#F46800" },
  "stripe":         { icon:"$",  color:"#635BFF" },
  "shopify":        { icon:"S",  color:"#96BF48" },
  "hubspot":        { icon:"H",  color:"#FF7A59" },
  "salesforce":     { icon:"☁",  color:"#00A1E0" },
  "qontak":         { icon:"Q",  color:"#9B59B6" },
  "odoo":           { icon:"O",  color:"#714B67" },
  "packtrack":      { icon:"📦", color:"#EF4444" },
  "biteship":       { icon:"🚚", color:"#F59E0B" },
  "wordpress":      { icon:"W",  color:"#21759B" },
  "instagram":      { icon:"⌘",  color:"#E1306C" },
  "twitter":        { icon:"X",  color:"#1DA1F2" },
  "linkedin":       { icon:"in", color:"#0A66C2" },
  "facebook":       { icon:"f",  color:"#1877F2" },
  "tiktok":         { icon:"♪",  color:"#000000" },
  "shopee":         { icon:"🛒", color:"#EE4D2D" },
  "tokopedia":      { icon:"🛍", color:"#03AC0E" },
  "flow":           { icon:"⚡", color:"#6337D8" }
};

function autoIcon(name = "") {
  const n = name.toLowerCase().trim();
  if (!n) return { icon: "•", color: "#6337D8" };
  if (ICON_MAP[n]) return ICON_MAP[n];
  for (const [key, val] of Object.entries(ICON_MAP)) {
    if (n.includes(key)) return val;
  }
  // Fallback: first letter on a deterministic palette colour
  const idx = n.charCodeAt(0) % SWATCHES.length;
  return { icon: n[0].toUpperCase(), color: SWATCHES[idx] };
}

// ============================================================
// ENTRY
// ============================================================
export function initCommandCenter() {
  const root = $("commandCenterRoot");
  if (!root) return;
  root.innerHTML = renderShell();
  bindEvents();

  // Subscribe to depts (ordered by `order` ascending — falls back to name)
  if (unsubDepts) unsubDepts();
  unsubDepts = subscribeCollection(COL_DEPTS, async rows => {
    allDepts = rows.slice().sort((a, b) => {
      const ao = a.order ?? 999, bo = b.order ?? 999;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });

    // Seed on first load if completely empty (only supervisors/admins
    // are allowed to write — silently skip for limited users).
    if (rows.length === 0 && !_seedingDepts && canManageDept()) {
      _seedingDepts = true;
      try { await seedDepartments(); }
      catch (e) { console.warn("[CommandCenter] seed depts failed:", e); }
      finally { _seedingDepts = false; }
    }
    render();
  });

  if (unsubApps) unsubApps();
  unsubApps = subscribeCollection(COL_APPS, rows => {
    allApps = rows.slice().sort((a, b) => {
      const ao = a.order ?? 999, bo = b.order ?? 999;
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });
    render();
  });
}

async function seedDepartments() {
  for (let i = 0; i < SEED_DEPTS.length; i++) {
    await addDocument(COL_DEPTS, { name: SEED_DEPTS[i], order: i });
  }
}

// ============================================================
// SHELL
// ============================================================
function renderShell() {
  return `
    <div class="card cc-header-card">
      <div class="pmHeaderActions">
        <div class="left"></div>
        <div class="right">
          <input type="search" id="ccSearch" placeholder="${esc(t("cc.search"))}" class="cc-search"/>
          ${canAddApp()  ? `<button class="primary"  id="ccAddAppBtn">${esc(t("cc.addApp"))}</button>` : ""}
          ${canManageDept() ? `<button class="secondary" id="ccAddDeptBtn">${esc(t("cc.addDept"))}</button>` : ""}
        </div>
      </div>
    </div>

    <div id="ccBoard" class="cc-board"></div>

    <!-- App modal — add / edit -->
    <div id="ccAppModal" class="modal hidden">
      <div class="modalBox" style="max-width:560px">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2 id="ccAppModalTitle">${esc(t("cc.modal.appAdd"))}</h2>
        <div class="form-grid">
          <div class="field">
            <label>${esc(t("cc.modal.appName"))}</label>
            <input type="text" id="ccAppName" maxlength="60" placeholder="e.g. Metabase"/>
          </div>
          <div class="field">
            <label>${esc(t("cc.modal.appDept"))}</label>
            <select id="ccAppDept"></select>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>${esc(t("cc.modal.appUrl"))}</label>
            <input type="url" id="ccAppUrl" placeholder="https://…" autocomplete="off"/>
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>${esc(t("cc.modal.appDesc"))} <span class="small" style="color:var(--muted)">${esc(t("cc.modal.appDescHint"))}</span></label>
            <input type="text" id="ccAppDesc" maxlength="80"/>
          </div>
          <div class="field">
            <label>${esc(t("cc.modal.appIcon"))} <span class="small" style="color:var(--muted)">${esc(t("cc.modal.appIconHint"))}</span></label>
            <div class="cc-icon-row">
              <div class="cc-icon-preview" id="ccIconPreview">•</div>
              <input type="text" id="ccAppIcon" maxlength="2" placeholder="•"/>
            </div>
          </div>
          <div class="field">
            <label>${esc(t("cc.modal.appColor"))}</label>
            <div class="cc-swatches" id="ccAppSwatches"></div>
          </div>
        </div>
        <div class="btns" style="justify-content:space-between;margin-top:14px">
          <button class="iconBtn danger" id="ccAppDelete" style="display:none">${esc(t("cc.btn.delete"))}</button>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="secondary" id="ccAppCancel">${esc(t("cc.btn.cancel"))}</button>
            <button class="primary"   id="ccAppSave">${esc(t("cc.btn.save"))}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Dept modal — add / rename -->
    <div id="ccDeptModal" class="modal hidden">
      <div class="modalBox" style="max-width:420px">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2 id="ccDeptModalTitle">${esc(t("cc.modal.deptAdd"))}</h2>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1">
            <label>${esc(t("cc.modal.deptName"))}</label>
            <input type="text" id="ccDeptName" maxlength="40" placeholder="e.g. Finance"/>
          </div>
        </div>
        <div class="btns" style="justify-content:space-between;margin-top:14px">
          <button class="iconBtn danger" id="ccDeptDelete" style="display:none">${esc(t("cc.modal.deptDelete"))}</button>
          <div style="display:flex;gap:8px;margin-left:auto">
            <button class="secondary" id="ccDeptCancel">${esc(t("cc.btn.cancel"))}</button>
            <button class="primary"   id="ccDeptSave">${esc(t("cc.btn.save"))}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// EVENT WIRING
// ============================================================
function bindEvents() {
  // Top-bar buttons
  const addAppBtn  = $("ccAddAppBtn");
  const addDeptBtn = $("ccAddDeptBtn");
  if (addAppBtn)  addAppBtn.onclick  = () => openAppModal(null);
  if (addDeptBtn) addDeptBtn.onclick = () => openDeptModal(null);

  // Search
  $("ccSearch").addEventListener("input", () => render());

  // App modal
  const appModal = $("ccAppModal");
  appModal.addEventListener("click", e => {
    if (e.target === appModal || e.target.classList.contains("modalClose")) closeAppModal();
  });
  $("ccAppCancel").onclick = closeAppModal;
  $("ccAppSave").onclick   = saveApp;
  $("ccAppDelete").onclick = () => editingAppId && removeApp(editingAppId);
  $("ccAppName").addEventListener("input", autoFillFromName);
  $("ccAppIcon").addEventListener("input", updateIconPreview);

  // Dept modal
  const deptModal = $("ccDeptModal");
  deptModal.addEventListener("click", e => {
    if (e.target === deptModal || e.target.classList.contains("modalClose")) closeDeptModal();
  });
  $("ccDeptCancel").onclick = closeDeptModal;
  $("ccDeptSave").onclick   = saveDept;
  $("ccDeptDelete").onclick = () => editingDeptId && removeDept(editingDeptId);
}

// ============================================================
// RENDER
// ============================================================
function render() {
  const board = $("ccBoard");
  if (!board) return;
  const search = ($("ccSearch")?.value || "").toLowerCase().trim();

  if (!allDepts.length) {
    board.innerHTML = `<div class="card"><p style="color:var(--muted);margin:0">
      ${canManageDept() ? t("cc.empty.noDepts.sup") : t("cc.empty.noDepts.user")}
    </p></div>`;
    return;
  }

  const sortDepts = canSortDept();
  const sortApps  = canSortApp();

  board.innerHTML = allDepts.map(dept => {
    let apps = allApps.filter(a => a.deptId === dept.id);
    if (search) {
      apps = apps.filter(a =>
        (a.name || "").toLowerCase().includes(search) ||
        (a.desc || "").toLowerCase().includes(search) ||
        (a.url  || "").toLowerCase().includes(search));
    }
    return `
      <section class="cc-section" data-dept-id="${esc(dept.id)}">
        <div class="cc-section-header">
          <div class="cc-section-title">
            ${sortDepts ? `<span class="cc-drag cc-drag-dept" title="${esc(t("cc.dragDept"))}" data-dept-handle="${esc(dept.id)}">⠿</span>` : ""}
            <span>${esc(dept.name)}</span>
            <span class="cc-section-badge">${apps.length}</span>
          </div>
          <div class="cc-section-actions">
            ${canAddApp() ? `<button class="cc-mini" data-cc-add-app="${esc(dept.id)}" title="${esc(t("cc.addApp"))} → ${esc(dept.name)}">${esc(t("cc.addAppShort"))}</button>` : ""}
            ${canManageDept() ? `
              <button class="cc-mini cc-mini-ghost" data-cc-edit-dept="${esc(dept.id)}" title="${esc(t("cc.editDept"))}">✎</button>
            ` : ""}
          </div>
        </div>
        <div class="cc-grid" data-dept-grid="${esc(dept.id)}">
          ${apps.length === 0
            ? `<div class="cc-empty">${t("cc.empty.noApps")}${canAddApp() ? t("cc.empty.noApps.cta") : ``}.</div>`
            : apps.map(a => renderAppCard(a, sortApps)).join("")}
        </div>
      </section>
    `;
  }).join("");

  // Wire dept and app row buttons
  board.querySelectorAll("[data-cc-add-app]").forEach(btn => {
    btn.onclick = () => openAppModal(null, btn.dataset.ccAddApp);
  });
  board.querySelectorAll("[data-cc-edit-dept]").forEach(btn => {
    btn.onclick = () => openDeptModal(btn.dataset.ccEditDept);
  });
  board.querySelectorAll("[data-cc-edit-app]").forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      openAppModal(btn.dataset.ccEditApp);
    };
  });

  // Drag-and-drop wiring
  if (sortApps)  wireAppDragAndDrop(board);
  if (sortDepts) wireDeptDragAndDrop(board);
}

function renderAppCard(app, draggable) {
  const icon  = app.icon  || "•";
  const color = app.color || "#6337D8";
  const url   = app.url   || "#";
  const editBtn = canEditApp()
    ? `<button class="cc-card-edit" data-cc-edit-app="${esc(app.id)}" title="${esc(t("cc.btn.editTitle"))}">✎</button>`
    : "";
  const dragHandle = draggable
    ? `<span class="cc-drag cc-drag-app" title="${esc(t("cc.dragApp"))}">⠿</span>`
    : "";
  return `
    <a class="cc-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer"
       data-app-id="${esc(app.id)}" data-dept-id="${esc(app.deptId || "")}"
       ${draggable ? 'draggable="true"' : ""}>
      ${dragHandle}
      ${editBtn}
      <div class="cc-card-icon" style="background:${esc(color)}">${esc(icon)}</div>
      <div class="cc-card-body">
        <div class="cc-card-name">${esc(app.name || t("cc.untitled"))}</div>
        ${app.desc ? `<div class="cc-card-desc">${esc(app.desc)}</div>` : ""}
      </div>
    </a>
  `;
}

// ============================================================
// APP MODAL
// ============================================================
function openAppModal(id, preselectDeptId) {
  // Limited users can ADD but not EDIT
  if (id && !canEditApp()) {
    toast(t("cc.toast.editPermission"), "error");
    return;
  }
  if (!id && !canAddApp()) {
    toast(t("cc.toast.signin"), "error");
    return;
  }

  editingAppId = id;

  // Populate dept dropdown
  const deptSel = $("ccAppDept");
  deptSel.innerHTML = allDepts.map(d =>
    `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");

  if (id) {
    const a = allApps.find(x => x.id === id);
    if (!a) { editingAppId = null; return; }
    $("ccAppModalTitle").textContent = t("cc.modal.appEdit");
    $("ccAppName").value = a.name || "";
    $("ccAppUrl").value  = a.url  || "";
    $("ccAppDesc").value = a.desc || "";
    $("ccAppIcon").value = a.icon || "";
    deptSel.value = a.deptId || (allDepts[0]?.id || "");
    setSelectedColor(a.color || "#6337D8");
    $("ccAppDelete").style.display = canDeleteApp() ? "" : "none";
  } else {
    $("ccAppModalTitle").textContent = t("cc.modal.appAdd");
    $("ccAppName").value = "";
    $("ccAppUrl").value  = "";
    $("ccAppDesc").value = "";
    $("ccAppIcon").value = "";
    deptSel.value = preselectDeptId || (allDepts[0]?.id || "");
    setSelectedColor("#6337D8");
    $("ccAppDelete").style.display = "none";
  }
  buildSwatches();
  updateIconPreview();

  $("ccAppModal").classList.remove("hidden");
  setTimeout(() => $("ccAppName").focus(), 50);
}

function closeAppModal() {
  $("ccAppModal").classList.add("hidden");
  editingAppId = null;
}

async function saveApp() {
  const name = $("ccAppName").value.trim();
  const url  = $("ccAppUrl").value.trim();
  const desc = $("ccAppDesc").value.trim();
  const icon = ($("ccAppIcon").value.trim() || autoIcon(name).icon).slice(0, 2);
  const color = _selectedColor;
  const deptId = $("ccAppDept").value;

  if (!name)   return toast(t("cc.toast.nameRequired"), "error");
  if (!url)    return toast(t("cc.toast.urlRequired"), "error");
  if (!deptId) return toast(t("cc.toast.deptRequired"), "error");
  if (!/^https?:\/\//i.test(url)) return toast(t("cc.toast.urlInvalid"), "error");

  // Re-check permissions in case role changed mid-session
  if (editingAppId && !canEditApp()) return toast(t("cc.toast.editPermission"), "error");
  if (!editingAppId && !canAddApp()) return toast(t("cc.toast.addPermission"), "error");

  try {
    const payload = { deptId, name, url, desc, icon, color };
    if (editingAppId) {
      await updateDocument(COL_APPS, editingAppId, payload);
      toast(t("cc.toast.saved", { name }), "success");
    } else {
      payload.order = nextOrder(allApps.filter(a => a.deptId === deptId));
      await addDocument(COL_APPS, payload);
      toast(t("cc.toast.added", { name }), "success");
    }
    closeAppModal();
  } catch (e) {
    toast(t("cc.toast.saveFailed", { msg: e.message || e }), "error");
  }
}

async function removeApp(id) {
  if (!canDeleteApp()) return toast(t("cc.toast.deletePermission"), "error");
  const a = allApps.find(x => x.id === id);
  if (!a) return;
  if (!confirmAction(t("cc.confirm.deleteApp", { name: a.name }))) return;
  try {
    await deleteDocument(COL_APPS, id);
    toast(t("cc.toast.appDeleted"), "success");
    closeAppModal();
  } catch (e) {
    toast(t("cc.toast.deleteFailed", { msg: e.message || e }), "error");
  }
}

// ============================================================
// DEPT MODAL
// ============================================================
function openDeptModal(id) {
  if (!canManageDept()) {
    toast(t("cc.toast.deptPermission"), "error");
    return;
  }
  editingDeptId = id;
  if (id) {
    const d = allDepts.find(x => x.id === id);
    if (!d) { editingDeptId = null; return; }
    $("ccDeptModalTitle").textContent = t("cc.modal.deptEdit");
    $("ccDeptName").value = d.name || "";
    $("ccDeptDelete").style.display = "";
  } else {
    $("ccDeptModalTitle").textContent = t("cc.modal.deptAdd");
    $("ccDeptName").value = "";
    $("ccDeptDelete").style.display = "none";
  }
  $("ccDeptModal").classList.remove("hidden");
  setTimeout(() => $("ccDeptName").focus(), 50);
}

function closeDeptModal() {
  $("ccDeptModal").classList.add("hidden");
  editingDeptId = null;
}

async function saveDept() {
  if (!canManageDept()) return toast(t("cc.toast.deptPermission"), "error");
  const name = $("ccDeptName").value.trim();
  if (!name) return toast(t("cc.toast.deptNameRequired"), "error");

  // Block dupes (case-insensitive) — only when adding or renaming to a
  // different name than the current one.
  const dup = allDepts.find(d =>
    d.name && d.name.toLowerCase() === name.toLowerCase() && d.id !== editingDeptId);
  if (dup) return toast(t("cc.toast.deptDup", { name }), "error");

  try {
    if (editingDeptId) {
      await updateDocument(COL_DEPTS, editingDeptId, { name });
      toast(t("cc.toast.saved", { name }), "success");
    } else {
      await addDocument(COL_DEPTS, { name, order: nextOrder(allDepts) });
      toast(t("cc.toast.added", { name }), "success");
    }
    closeDeptModal();
  } catch (e) {
    toast(t("cc.toast.saveFailed", { msg: e.message || e }), "error");
  }
}

async function removeDept(id) {
  if (!canManageDept()) return toast(t("cc.toast.deptPermission"), "error");
  const d = allDepts.find(x => x.id === id);
  if (!d) return;
  const appsInside = allApps.filter(a => a.deptId === id);
  const extra = appsInside.length
    ? t("cc.confirm.deleteDeptExtra", { count: appsInside.length, plural: appsInside.length === 1 ? "" : "s" })
    : "";
  if (!confirmAction(t("cc.confirm.deleteDept", { name: d.name, extra }))) return;
  try {
    // Delete inner apps first (best-effort; each goes through audit log)
    for (const a of appsInside) {
      try { await deleteDocument(COL_APPS, a.id); } catch (_) { /* keep going */ }
    }
    await deleteDocument(COL_DEPTS, id);
    toast(t("cc.toast.deptDeleted"), "success");
    closeDeptModal();
  } catch (e) {
    toast(t("cc.toast.deleteFailed", { msg: e.message || e }), "error");
  }
}

// ============================================================
// HELPERS
// ============================================================
let _selectedColor = "#6337D8";

function setSelectedColor(c) {
  _selectedColor = c || "#6337D8";
}

function buildSwatches() {
  const root = $("ccAppSwatches");
  if (!root) return;
  root.innerHTML = SWATCHES.map(c =>
    `<button type="button" class="cc-swatch ${c === _selectedColor ? "selected" : ""}"
       data-color="${esc(c)}" style="background:${esc(c)}" title="${esc(c)}"></button>`
  ).join("");
  root.querySelectorAll(".cc-swatch").forEach(s => {
    s.onclick = () => {
      _selectedColor = s.dataset.color;
      buildSwatches();
      updateIconPreview();
    };
  });
}

function updateIconPreview() {
  const prev = $("ccIconPreview");
  if (!prev) return;
  const v = $("ccAppIcon").value.trim() || autoIcon($("ccAppName").value).icon;
  prev.textContent = v;
  prev.style.background = _selectedColor;
}

function autoFillFromName() {
  // Only auto-pick icon/colour while the user hasn't manually set them
  const iconEl = $("ccAppIcon");
  if (iconEl.value.trim()) { updateIconPreview(); return; }
  const result = autoIcon($("ccAppName").value);
  _selectedColor = result.color;
  buildSwatches();
  updateIconPreview();
}

function nextOrder(list) {
  let max = -1;
  for (const x of list) if (typeof x.order === "number" && x.order > max) max = x.order;
  return max + 1;
}

// ============================================================
// DRAG & DROP
//
// Cards can move within or across departments; sections can move
// up/down. Both are gated by canSortApp() / canSortDept(); limited
// users see no drag handles and no draggable attributes.
//
// Reorder writes go through raw updateDoc (NOT updateDocument) so the
// Activity Log stays clean of one-row-per-card noise. Genuine edits
// (name, URL, colour) still go through updateDocument and ARE audited.
// ============================================================

// Card-drag state
let _dragAppId = null;
let _dragFromDept = null;

function wireAppDragAndDrop(board) {
  const cards = board.querySelectorAll(".cc-card[draggable='true']");
  const grids = board.querySelectorAll(".cc-grid[data-dept-grid]");

  cards.forEach(card => {
    card.addEventListener("dragstart", e => {
      _dragAppId = card.dataset.appId;
      _dragFromDept = card.dataset.deptId;
      card.classList.add("cc-dragging");
      // Use 'move' so the cursor signals the right intent
      e.dataTransfer.effectAllowed = "move";
      // Required for Firefox to start the drag
      try { e.dataTransfer.setData("text/plain", _dragAppId); } catch (_) {}
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("cc-dragging");
      _dragAppId = null;
      _dragFromDept = null;
      board.querySelectorAll(".cc-drop-ind").forEach(el => el.remove());
    });
    // Suppress the link click that fires on drag completion in some browsers
    card.addEventListener("click", e => {
      if (card.classList.contains("cc-dragging")) {
        e.preventDefault();
      }
    });
  });

  grids.forEach(grid => {
    grid.addEventListener("dragover", e => {
      if (_dragAppId == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      placeAppDropIndicator(grid, e.clientX, e.clientY);
    });
    grid.addEventListener("dragleave", e => {
      if (!grid.contains(e.relatedTarget)) {
        grid.querySelectorAll(".cc-drop-ind").forEach(el => el.remove());
      }
    });
    grid.addEventListener("drop", e => {
      if (_dragAppId == null) return;
      e.preventDefault();
      const targetDeptId = grid.dataset.deptGrid;
      const indPos = findIndicatorPosition(grid);
      grid.querySelectorAll(".cc-drop-ind").forEach(el => el.remove());
      handleAppDrop(_dragAppId, _dragFromDept, targetDeptId, indPos);
    });
  });
}

function placeAppDropIndicator(grid, x, y) {
  // Find which existing card the cursor is to the left/above of
  const cards = [...grid.querySelectorAll(".cc-card:not(.cc-dragging)")];
  // Remove any existing indicator
  grid.querySelectorAll(".cc-drop-ind").forEach(el => el.remove());
  const ind = document.createElement("div");
  ind.className = "cc-drop-ind";

  let insertBefore = null;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    const midX = r.left + r.width / 2;
    // Use vertical midpoint first (each row), then horizontal midpoint within the row
    if (y < midY || (y < r.bottom && x < midX)) { insertBefore = c; break; }
  }
  if (insertBefore) grid.insertBefore(ind, insertBefore);
  else grid.appendChild(ind);
}

function findIndicatorPosition(grid) {
  // Returns the index in the filtered child list AFTER the indicator
  // (i.e. how many real cards come before it).
  const nodes = [...grid.children];
  const indIdx = nodes.findIndex(n => n.classList?.contains("cc-drop-ind"));
  if (indIdx === -1) return nodes.filter(n => n.classList?.contains("cc-card")).length;
  let count = 0;
  for (let i = 0; i < indIdx; i++) if (nodes[i].classList?.contains("cc-card")) count++;
  return count;
}

async function handleAppDrop(appId, fromDept, toDept, insertAt) {
  const moving = allApps.find(a => a.id === appId);
  if (!moving) return;

  // Build the destination list (current order, with moving removed)
  const destList = allApps
    .filter(a => a.deptId === toDept && a.id !== appId)
    .sort(byOrder);
  destList.splice(insertAt, 0, moving);

  // If cross-dept, also need to recompute orders in the source dept
  // (gaps left behind are fine but we'll renumber for cleanliness).
  const sourceList = (fromDept === toDept)
    ? null
    : allApps.filter(a => a.deptId === fromDept && a.id !== appId).sort(byOrder);

  try {
    const ops = [];
    destList.forEach((a, i) => {
      const newOrder = i;
      const sameDept = (a.deptId === toDept);
      const orderChanged = (a.order !== newOrder);
      if (a.id === appId && (!sameDept || orderChanged)) {
        ops.push(rawUpdate("command_center_apps", a.id, { deptId: toDept, order: newOrder }));
      } else if (orderChanged) {
        ops.push(rawUpdate("command_center_apps", a.id, { order: newOrder }));
      }
    });
    if (sourceList) {
      sourceList.forEach((a, i) => {
        if (a.order !== i) {
          ops.push(rawUpdate("command_center_apps", a.id, { order: i }));
        }
      });
    }
    await Promise.all(ops);
  } catch (e) {
    toast(t("cc.toast.reorderFailed", { msg: e.message || e }), "error");
  }
}

// Dept-drag state
let _dragDeptId = null;

function wireDeptDragAndDrop(board) {
  // Sections are NOT draggable by default — only when the user grabs
  // the dept drag handle. This way, dragging from inside the card grid
  // never accidentally drags the whole section.
  board.querySelectorAll("[data-dept-handle]").forEach(handle => {
    const sec = handle.closest(".cc-section");
    if (!sec) return;
    handle.addEventListener("mousedown", () => { sec.setAttribute("draggable", "true"); });
    // Pointerup/leave clear it in case the user clicked but didn't drag.
    handle.addEventListener("mouseup",   () => { sec.removeAttribute("draggable"); });
    handle.addEventListener("mouseleave", () => { /* keep — drag may have started */ });
  });

  board.querySelectorAll(".cc-section").forEach(sec => {
    sec.addEventListener("dragstart", e => {
      // Only fire when this section is currently flagged draggable AND
      // the gesture didn't start inside a card (which has its own drag).
      if (sec.getAttribute("draggable") !== "true") return;
      if (e.target.closest(".cc-card")) return;
      _dragDeptId = sec.dataset.deptId;
      sec.classList.add("cc-dragging-dept");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", _dragDeptId); } catch (_) {}
    });
    sec.addEventListener("dragend", () => {
      sec.classList.remove("cc-dragging-dept");
      sec.removeAttribute("draggable");
      _dragDeptId = null;
      board.querySelectorAll(".cc-drop-ind-dept").forEach(el => el.remove());
    });
    sec.addEventListener("dragover", e => {
      if (_dragDeptId == null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      placeDeptDropIndicator(board, sec, e.clientY);
    });
    sec.addEventListener("drop", e => {
      if (_dragDeptId == null) return;
      e.preventDefault();
      const indPos = findDeptIndicatorPosition(board);
      board.querySelectorAll(".cc-drop-ind-dept").forEach(el => el.remove());
      handleDeptDrop(_dragDeptId, indPos);
    });
  });
}

function placeDeptDropIndicator(board, overSection, y) {
  board.querySelectorAll(".cc-drop-ind-dept").forEach(el => el.remove());
  const r = overSection.getBoundingClientRect();
  const midY = r.top + r.height / 2;
  const ind = document.createElement("div");
  ind.className = "cc-drop-ind-dept";
  if (y < midY) board.insertBefore(ind, overSection);
  else if (overSection.nextSibling) board.insertBefore(ind, overSection.nextSibling);
  else board.appendChild(ind);
}

function findDeptIndicatorPosition(board) {
  const nodes = [...board.children];
  const indIdx = nodes.findIndex(n => n.classList?.contains("cc-drop-ind-dept"));
  if (indIdx === -1) return nodes.filter(n => n.classList?.contains("cc-section")).length;
  let count = 0;
  for (let i = 0; i < indIdx; i++) if (nodes[i].classList?.contains("cc-section")) count++;
  return count;
}

async function handleDeptDrop(deptId, insertAt) {
  const moving = allDepts.find(d => d.id === deptId);
  if (!moving) return;
  const rest = allDepts.filter(d => d.id !== deptId).sort(byOrder);
  rest.splice(insertAt, 0, moving);
  try {
    const ops = [];
    rest.forEach((d, i) => {
      if (d.order !== i) {
        ops.push(rawUpdate("command_center_depts", d.id, { order: i }));
      }
    });
    await Promise.all(ops);
  } catch (e) {
    toast(t("cc.toast.reorderFailed", { msg: e.message || e }), "error");
  }
}

function byOrder(a, b) {
  const ao = a.order ?? 999, bo = b.order ?? 999;
  if (ao !== bo) return ao - bo;
  return (a.name || "").localeCompare(b.name || "");
}

// Raw Firestore update — skips the firebase.js audit-log + updatedBy
// stamp. Used for high-frequency reorder writes to keep Activity Log
// readable. Real edits (name/URL/colour) still go through
// updateDocument and ARE audited.
function rawUpdate(colName, id, patch) {
  return updateDoc(doc(colName, id), patch);
}
