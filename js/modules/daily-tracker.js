// ============================================================
// FLOW Mega Apps — Daily Tracker
// Used for both Sales and Sales Support teams.
// Sales tracker has: Person, Date, Task, Status, Notes
// SS tracker adds: Week, Tag (Daily/Projection/Improvement), URL
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument, subscribeCollection, orderBy
} from "../firebase.js";
import {
  $, esc, toDateStr, friendlyDate, dayName, getISOWeek,
  dateRange, toast, badgeClass, downloadXLSX, today, confirmAction
} from "../utils.js";
import { getStaffForTeam, getCurrentProfile } from "../roles.js";

const SALES_STATUSES = ["Open", "In Progress", "Done", "Pending", "Follow Up", "Hold"];
const SS_STATUSES = ["Open", "Progress", "Done", "Hold"];
const SS_TAGS = ["Daily", "Projection", "Improvement"];

const trackers = {
  sales: {
    col: COL.TASKS_SALES,
    statuses: SALES_STATUSES,
    hasTag: false,
    hasURL: false,
    tableId: "trkSalesTable",
    personSel: "trkSalesPerson",
    statusSel: "trkSalesStatus",
    rangeSel: "trkSalesRange",
    fromInput: "trkSalesFrom",
    toInput: "trkSalesTo",
    kpiTotal: "trkSalesTotal",
    kpiDone: "trkSalesDone",
    kpiOpen: "trkSalesOpen",
    kpiPct: "trkSalesPct",
    addBtn: "trkSalesAddBtn",
    exportBtn: "trkSalesExportBtn",
    applyBtn: "trkSalesApply",
    resetBtn: "trkSalesReset",
    all: [],
    filtered: [],
    unsub: null,
    editingId: null
  },
  ss: {
    col: COL.TASKS_SS,
    statuses: SS_STATUSES,
    hasTag: true,
    hasURL: true,
    tableId: "trkSSTable",
    personSel: "trkSSPerson",
    statusSel: "trkSSStatus",
    tagSel: "trkSSTag",
    rangeSel: "trkSSRange",
    fromInput: "trkSSFrom",
    toInput: "trkSSTo",
    kpiTotal: "trkSSTotal",
    kpiDone: "trkSSDone",
    kpiDaily: "trkSSDaily",
    kpiProj: "trkSSProj",
    addBtn: "trkSSAddBtn",
    exportBtn: "trkSSExportBtn",
    applyBtn: "trkSSApply",
    resetBtn: "trkSSReset",
    all: [],
    filtered: [],
    unsub: null,
    editingId: null
  }
};

let modalContext = null; // "sales" or "ss"

// ============================================================
// INIT
// ============================================================
export function initSalesTracker() { initTracker("sales"); }
export function initSSTracker() { initTracker("ss"); }

function initTracker(kind) {
  const t = trackers[kind];
  if (t.unsub) t.unsub();

  // Bind events (idempotent — re-binding is fine)
  $(t.addBtn).onclick = () => openModal(kind);
  $(t.exportBtn).onclick = () => exportExcel(kind);
  $(t.applyBtn).onclick = () => applyFilters(kind);
  $(t.resetBtn).onclick = () => resetFilters(kind);
  $(t.rangeSel).onchange = () => applyFilters(kind);
  $(t.personSel).onchange = () => applyFilters(kind);
  $(t.statusSel).onchange = () => applyFilters(kind);
  if (t.tagSel) $(t.tagSel).onchange = () => applyFilters(kind);
  $(t.fromInput).onchange = () => applyFilters(kind);
  $(t.toInput).onchange = () => applyFilters(kind);

  // Bind modal once
  bindTaskModal();

  // Subscribe to real-time
  t.unsub = subscribeCollection(t.col, rows => {
    t.all = rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    populatePersonFilter(kind);
    applyFilters(kind);
  }, orderBy("date", "desc"));
}

// ============================================================
// FILTERS
// ============================================================
function populatePersonFilter(kind) {
  const t = trackers[kind];
  const sel = $(t.personSel);
  const current = sel.value;
  const people = [...new Set(t.all.map(r => r.person).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All</option>' +
    people.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  sel.value = current;
}

function applyFilters(kind) {
  const t = trackers[kind];
  const person = $(t.personSel).value;
  const status = $(t.statusSel).value;
  const tag = t.tagSel ? $(t.tagSel).value : "";
  const rangeKey = $(t.rangeSel).value;
  const from = $(t.fromInput).value;
  const to = $(t.toInput).value;
  const { start, end } = dateRange(rangeKey, from, to);

  t.filtered = t.all.filter(r => {
    if (person && r.person !== person) return false;
    if (status && r.status !== status) return false;
    if (tag && r.tag !== tag) return false;
    if (start || end) {
      const d = r.date ? new Date(r.date) : null;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    return true;
  });

  renderTable(kind);
  renderKPIs(kind);
}

function resetFilters(kind) {
  const t = trackers[kind];
  [t.personSel, t.statusSel, t.fromInput, t.toInput].forEach(id => $(id).value = "");
  if (t.tagSel) $(t.tagSel).value = "";
  $(t.rangeSel).value = "all";
  applyFilters(kind);
}

// ============================================================
// KPIs
// ============================================================
function renderKPIs(kind) {
  const t = trackers[kind];
  const total = t.filtered.length;
  const done = t.filtered.filter(r => r.status === "Done").length;

  if (kind === "sales") {
    const openProg = t.filtered.filter(r => r.status === "Open" || r.status === "In Progress").length;
    $(t.kpiTotal).textContent = total;
    $(t.kpiDone).textContent = done;
    $(t.kpiOpen).textContent = openProg;
    $(t.kpiPct).textContent = total ? Math.round(done / total * 100) + "%" : "0%";
  } else {
    const daily = t.filtered.filter(r => r.tag === "Daily").length;
    const proj = t.filtered.filter(r => r.tag === "Projection").length;
    $(t.kpiTotal).textContent = total;
    $(t.kpiDone).textContent = done;
    $(t.kpiDaily).textContent = daily;
    $(t.kpiProj).textContent = proj;
  }
}

// ============================================================
// TABLE
// ============================================================
function renderTable(kind) {
  const t = trackers[kind];
  const tbody = $(t.tableId).querySelector("tbody");

  if (!t.filtered.length) {
    const cols = kind === "ss" ? 10 : 7;
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:var(--muted);padding:32px">No tasks match the current filters.</td></tr>`;
    return;
  }

  if (kind === "sales") {
    tbody.innerHTML = t.filtered.map(r => {
      const isDone = r.status === "Done";
      return `
      <tr>
        <td>${esc(friendlyDate(r.date))}</td>
        <td>${esc(r.day || dayName(r.date))}</td>
        <td><b>${esc(r.person || "")}</b></td>
        <td class="long">${esc(r.task || "")}</td>
        <td><span class="${badgeClass(r.status)}">${esc(r.status || "")}</span></td>
        <td class="long">${esc(r.notes || "")}</td>
        <td>
          ${isDone
            ? `<button class="secondary iconBtn" data-reopen="${r.id}" title="Re-open this task">↻ Re-open</button>`
            : `<button class="primary iconBtn" data-done="${r.id}" title="Mark as Done + set closed date to today">✓ Done</button>`}
          <button class="secondary iconBtn" data-edit="${r.id}">Edit</button>
          <button class="danger iconBtn" data-del="${r.id}">Del</button>
        </td>
      </tr>`;
    }).join("");
  } else {
    tbody.innerHTML = t.filtered.map(r => {
      const wk = r.week || (r.date ? "W" + getISOWeek(new Date(r.date)) : "");
      const url = r.url ? `<a href="${esc(r.url)}" target="_blank">link</a>` : "—";
      const isDone = r.status === "Done";
      return `
        <tr>
          <td>${esc(wk)}</td>
          <td>${esc(friendlyDate(r.date))}</td>
          <td>${esc(friendlyDate(r.closedDate))}</td>
          <td><b>${esc(r.person || "")}</b></td>
          <td class="long">${esc(r.task || "")}</td>
          <td><span class="${badgeClass(r.tag)}">${esc(r.tag || "")}</span></td>
          <td><span class="${badgeClass(r.status)}">${esc(r.status || "")}</span></td>
          <td>${url}</td>
          <td class="long">${esc(r.notes || "")}</td>
          <td>
            ${isDone
              ? `<button class="secondary iconBtn" data-reopen="${r.id}" title="Re-open this task">↻ Re-open</button>`
              : `<button class="primary iconBtn" data-done="${r.id}" title="Mark as Done + set closed date to today">✓ Done</button>`}
            <button class="secondary iconBtn" data-edit="${r.id}">Edit</button>
            <button class="danger iconBtn" data-del="${r.id}">Del</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  tbody.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => openModal(kind, b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => removeTask(kind, b.dataset.del)));
  tbody.querySelectorAll("[data-done]").forEach(b =>
    b.addEventListener("click", () => quickClose(kind, b.dataset.done)));
  tbody.querySelectorAll("[data-reopen]").forEach(b =>
    b.addEventListener("click", () => quickReopen(kind, b.dataset.reopen)));
}

async function quickClose(kind, id) {
  try {
    await updateDocument(trackers[kind].col, id, { status: "Done", closedDate: today() });
    toast("Task marked Done · closed date = today", "success");
  } catch (e) { toast("Failed: " + e.message, "error"); }
}

async function quickReopen(kind, id) {
  try {
    await updateDocument(trackers[kind].col, id, { status: "Open", closedDate: null });
    toast("Task re-opened", "success");
  } catch (e) { toast("Failed: " + e.message, "error"); }
}

// ============================================================
// MODAL (shared between sales & SS)
// ============================================================
let modalBound = false;
function bindTaskModal() {
  if (modalBound) return;
  modalBound = true;
  $("taskModalCancel").addEventListener("click", closeModal);
  $("taskModalSave").addEventListener("click", saveTask);
}

async function openModal(kind, id = null) {
  modalContext = kind;
  const t = trackers[kind];
  t.editingId = id;

  // Configure status dropdown
  $("tm_status").innerHTML = t.statuses.map(s => `<option>${s}</option>`).join("");

  // Show/hide tag and URL fields based on kind
  document.querySelectorAll(".tm-tag-field").forEach(el => el.classList.toggle("hidden", !t.hasTag));
  document.querySelectorAll(".tm-url-field").forEach(el => el.classList.toggle("hidden", !t.hasURL));

  $("taskModalTitle").textContent = (id ? "Edit" : "New") + " Task — " + (kind === "sales" ? "Sales" : "Sales Support");

  // Populate Person dropdown — filtered to current team
  let staff = [];
  try { staff = await getStaffForTeam(kind); } catch (e) { console.warn(e); }
  const me = getCurrentProfile();
  $("tm_person").innerHTML =
    `<option value="">— Select person —</option>` +
    staff.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");

  if (id) {
    const r = t.all.find(x => x.id === id);
    if (!r) return;
    $("tm_person").value = r.person || "";
    $("tm_date").value = toDateStr(r.date) || today();
    $("tm_status").value = r.status || t.statuses[0];
    if (t.hasTag) $("tm_tag").value = r.tag || "Daily";
    $("tm_task").value = r.task || "";
    $("tm_notes").value = r.notes || "";
    if (t.hasURL) $("tm_url").value = r.url || "";
  } else {
    // Default to current user's name IF they're in this team
    const myStaff = staff.find(s => s.email === me?.email);
    $("tm_person").value = myStaff?.name || "";
    $("tm_date").value = today();
    $("tm_status").value = t.statuses[0];
    if (t.hasTag) $("tm_tag").value = "Daily";
    $("tm_task").value = "";
    $("tm_notes").value = "";
    if (t.hasURL) $("tm_url").value = "";
  }
  $("taskModal").classList.remove("hidden");
}

function closeModal() {
  $("taskModal").classList.add("hidden");
}

async function saveTask() {
  const kind = modalContext;
  const t = trackers[kind];
  const data = {
    person: $("tm_person").value.trim(),
    date: $("tm_date").value,
    day: dayName($("tm_date").value),
    status: $("tm_status").value,
    task: $("tm_task").value.trim(),
    notes: $("tm_notes").value.trim()
  };
  if (t.hasTag) data.tag = $("tm_tag").value;
  if (t.hasURL) data.url = $("tm_url").value.trim();
  if (kind === "ss" && data.date) data.week = "W" + getISOWeek(new Date(data.date));
  if (data.status === "Done") data.closedDate = data.date;

  if (!data.person) return toast("Person required", "error");
  if (!data.task) return toast("Task required", "error");

  // v3.5 — URL validation: if URL is provided, it must be a valid http(s) link
  if (t.hasURL && data.url) {
    if (!/^https?:\/\/.+\..+/i.test(data.url)) {
      return toast("URL must be a valid link starting with http:// or https://", "error");
    }
    try { new URL(data.url); }
    catch { return toast("Invalid URL format", "error"); }
  }

  try {
    if (t.editingId) {
      await updateDocument(t.col, t.editingId, data);
      toast("Task updated", "success");
    } else {
      await addDocument(t.col, data);
      toast("Task created", "success");
    }
    closeModal();
  } catch (e) {
    console.error(e);
    toast("Save failed: " + e.message, "error");
  }
}

async function removeTask(kind, id) {
  if (!confirmAction("Delete this task?")) return;
  try {
    await deleteDocument(trackers[kind].col, id);
    toast("Task deleted", "success");
  } catch (e) {
    toast("Delete failed", "error");
  }
}

// ============================================================
// EXPORT
// ============================================================
function exportExcel(kind) {
  const t = trackers[kind];
  if (!t.filtered.length) return toast("Nothing to export", "error");

  let rows;
  if (kind === "sales") {
    rows = [["Date", "Day", "Person", "Task", "Status", "Notes"]];
    t.filtered.forEach(r => rows.push([
      toDateStr(r.date), r.day || "", r.person || "", r.task || "", r.status || "", r.notes || ""
    ]));
  } else {
    rows = [["Week", "Open Date", "Closed Date", "Person", "Task", "Tag", "Status", "URL", "Notes"]];
    t.filtered.forEach(r => rows.push([
      r.week || "", toDateStr(r.date), toDateStr(r.closedDate),
      r.person || "", r.task || "", r.tag || "", r.status || "",
      r.url || "", r.notes || ""
    ]));
  }
  const filename = `Flow_Daily_Tracker_${kind === "sales" ? "Sales" : "SS"}_${today()}.xlsx`;
  downloadXLSX(rows, filename, "Daily Tasks");
  toast("Exported " + filename, "success");
}

// ============================================================
// Dashboard summary
// ============================================================
export function getTasksTodayCount() {
  const t = today();
  return [...trackers.sales.all, ...trackers.ss.all].filter(r => toDateStr(r.date) === t).length;
}
