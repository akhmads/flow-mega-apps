// ============================================================
// FLOW Mega Apps — Internal Ticketing System
// v2 — Internal department use only (no external client tickets).
//      External tickets, type tabs, and public-submit link have been
//      removed. All ticket records get type: "internal" automatically.
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument, subscribeCollection, orderBy
} from "../firebase.js";
import {
  $, esc, toDateStr, friendlyDate, toast, badgeClass, downloadXLSX,
  today, confirmAction, generateTicketNumber, dateRange
} from "../utils.js";
import { listUsers, getCurrentProfile, getCurrentEmail } from "../roles.js";
import { createDropdown } from "../components/dropdown.js";
import { subscribeMasterData, addMasterItem } from "./master-data.js";

let allTickets = [];
let filteredTickets = [];
let unsub = null;
let editingId = null;
let allStaff = [];
let deptDropdown = null;
let deptList = [];

const STATUSES = ["Open", "In Progress", "Waiting", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export function initTickets() {
  if (unsub) unsub();
  bindEvents();
  loadStaff();
  unsub = subscribeCollection(COL.TICKETS, (rows) => {
    // Only show internal tickets (in case legacy data exists with type=external)
    allTickets = rows
      .filter(r => !r.type || r.type === "internal")
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    populateDeptFilter();
    populateAssigneeFilter();
    // Honor pending nav action from the dashboard (apply filter and/or
    // open a specific ticket's modal) AFTER filter dropdowns are populated.
    _consumePendingNavAction();
    applyFilters();
  }, orderBy("createdAt", "desc"));
}

/** Public hook called by app.js on every nav to this section. */
export function consumeTicketsNavAction() {
  _consumePendingNavAction();
}

/** Same pattern as daily-issue: dashboard sets window.__pendingNavAction
 *  before navigating here, we consume it to apply filters / open a ticket. */
function _consumePendingNavAction() {
  const action = window.__pendingNavAction;
  if (!action) return;
  window.__pendingNavAction = null;
  if (action.filters && typeof action.filters === "object") {
    for (const [id, value] of Object.entries(action.filters)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }
    // If we're filtering by status/priority but no explicit range was
    // requested, broaden the date range so users see what they expect.
    if (action.filters.tktStatus && !("tktRange" in action.filters)) {
      const r = document.getElementById("tktRange");
      if (r) r.value = "all";
    }
    setTimeout(() => applyFilters(), 0);
  }
  if (action.openId) {
    setTimeout(() => {
      Promise.resolve()
        .then(() => openModal(action.openId))
        .catch(e => console.warn("Could not open ticket modal:", e));
    }, 50);
  }
}

async function loadStaff() {
  try {
    const profile = getCurrentProfile();
    if (profile && (profile.role === "sales-admin" || profile.role === "ss-admin")) {
      allStaff = await listUsers();
    } else {
      allStaff = [];
    }
    populateAssigneeFilter();
  } catch (e) {
    console.warn("Couldn't load staff for assignee:", e);
    allStaff = [];
  }
}

function bindEvents() {
  $("ticketAddBtn").onclick = () => openModal();
  $("ticketExportBtn").onclick = exportExcel;
  $("tktApply").onclick = applyFilters;
  $("tktReset").onclick = resetFilters;
  $("tktStatus").onchange = applyFilters;
  $("tktPriority").onchange = applyFilters;
  $("tktDept").onchange = applyFilters;
  $("tktAssignee").onchange = applyFilters;
  $("tktRange").onchange = onRangeChange;
  $("tktFrom").onchange = applyFilters;
  $("tktTo").onchange = applyFilters;
  $("tktSearch").oninput = debounce(applyFilters, 250);

  $("ticketModalCancel").onclick = closeModal;
  $("ticketModalSave").onclick = saveTicket;
  $("tkm_commentAdd").onclick = addComment;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function onRangeChange() {
  const k = $("tktRange").value;
  const { start, end } = dateRange(
    k === "thisWeek" ? "week" : k === "thisMonth" ? "month" : k === "last30" ? "month" : k,
    $("tktFrom").value, $("tktTo").value
  );
  if (k !== "custom" && k !== "all") {
    $("tktFrom").value = start ? start.toISOString().slice(0, 10) : "";
    $("tktTo").value = end ? end.toISOString().slice(0, 10) : "";
  }
  applyFilters();
}

function populateDeptFilter() {
  const depts = [...new Set(allTickets.map(t => t.dept).filter(Boolean))].sort();
  const sel = $("tktDept");
  const cur = sel.value;
  sel.innerHTML = `<option value="">All</option>` + depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  sel.value = cur;
}

function populateAssigneeFilter() {
  const sel = $("tktAssignee");
  const cur = sel.value;
  const names = new Set();
  allStaff.forEach(s => s.name && names.add(s.name));
  allTickets.forEach(t => t.assignee && names.add(t.assignee));
  const list = [...names].filter(Boolean).sort();
  sel.innerHTML = `<option value="">All</option><option value="__unassigned__">— Unassigned —</option>` +
    list.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  sel.value = cur;
}

function applyFilters() {
  const status = $("tktStatus").value;
  const priority = $("tktPriority").value;
  const dept = $("tktDept").value;
  const assignee = $("tktAssignee").value;
  const from = $("tktFrom").value;
  const to = $("tktTo").value;
  const search = $("tktSearch").value.toLowerCase().trim();

  filteredTickets = allTickets.filter(t => {
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (dept && t.dept !== dept) return false;
    if (assignee) {
      if (assignee === "__unassigned__") {
        if (t.assignee) return false;
      } else if (t.assignee !== assignee) {
        return false;
      }
    }
    if (from || to) {
      const ts = toDateStr(t.createdAt);
      if (from && ts < from) return false;
      if (to && ts > to) return false;
    }
    if (search) {
      const blob = `${t.subject || ""} ${t.requester || ""} ${t.description || ""} ${t.number || ""} ${t.assignee || ""}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  renderTable();
  renderKPIs();
}

function resetFilters() {
  ["tktStatus", "tktPriority", "tktDept", "tktAssignee", "tktSearch", "tktFrom", "tktTo"].forEach(id => $(id).value = "");
  $("tktRange").value = "all";
  applyFilters();
}

function renderKPIs() {
  const total = filteredTickets.length;
  const open = filteredTickets.filter(t => t.status === "Open" || t.status === "In Progress").length;
  const urgent = filteredTickets.filter(t => t.priority === "Urgent").length;
  const resolved = filteredTickets.filter(t => t.status === "Resolved" || t.status === "Closed").length;
  $("tktKpiTotal").textContent = total;
  $("tktKpiOpen").textContent = open;
  $("tktKpiUrgent").textContent = urgent;
  $("tktKpiResolved").textContent = resolved;
}

function renderTable() {
  const tbody = $("ticketTable").querySelector("tbody");
  if (!filteredTickets.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">No tickets match the current filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filteredTickets.map(t => `
    <tr>
      <td><b>${esc(t.number || "—")}</b></td>
      <td>${esc(friendlyDate(toDateStr(t.createdAt)))}</td>
      <td>${esc(t.requester || "—")}</td>
      <td>${esc(t.dept || "—")}</td>
      <td class="long"><b>${esc(t.subject || "")}</b><br><span class="small">${esc(truncate(t.description, 100))}</span>${t.comments?.length ? `<br><span class="small" style="color:#7c3aed">💬 ${t.comments.length} comment${t.comments.length>1?"s":""}</span>` : ""}</td>
      <td><span class="${badgeClass(t.priority)}">${esc(t.priority || "—")}</span></td>
      <td><span class="${badgeClass(t.status)}">${esc(t.status || "—")}</span></td>
      <td>${esc(t.assignee || "—")}</td>
      <td>
        <button class="secondary iconBtn" data-edit="${t.id}">Open</button>
        <button class="danger iconBtn" data-del="${t.id}">Del</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => openModal(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => removeTicket(b.dataset.del)));
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function populateAssigneeSelect() {
  const sel = $("tkm_assignee");
  const names = new Set();
  allStaff.forEach(s => names.add(s.name));
  allTickets.forEach(t => t.assignee && names.add(t.assignee));
  const list = [...names].filter(Boolean).sort();
  sel.innerHTML = `<option value="">— Unassigned —</option>` +
    list.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
}

function openModal(id = null) {
  editingId = id;
  $("ticketModalTitle").textContent = id ? "Edit Internal Ticket" : "New Internal Ticket";

  populateAssigneeSelect();
  ensureDeptDropdown();

  if (id) {
    const t = allTickets.find(x => x.id === id);
    if (!t) return;
    $("tkm_priority").value = t.priority || "Medium";
    $("tkm_status").value = t.status || "Open";
    $("tkm_requester").value = t.requester || "";
    deptDropdown?.setValue(t.dept || "");
    if (t.assignee && !$("tkm_assignee").querySelector(`option[value="${cssEscape(t.assignee)}"]`)) {
      $("tkm_assignee").insertAdjacentHTML("beforeend", `<option value="${esc(t.assignee)}">${esc(t.assignee)}</option>`);
    }
    $("tkm_assignee").value = t.assignee || "";
    $("tkm_subject").value = t.subject || "";
    $("tkm_description").value = t.description || "";
    $("tkm_commentsWrap").classList.remove("hidden");
    renderComments(t.comments || []);
    $("tkm_commentInput").value = "";
  } else {
    $("tkm_priority").value = "Medium";
    $("tkm_status").value = "Open";
    const me = getCurrentProfile();
    $("tkm_requester").value = me?.name || "";
    deptDropdown?.setValue(me?.department || "");
    $("tkm_assignee").value = "";
    $("tkm_subject").value = "";
    $("tkm_description").value = "";
    $("tkm_commentsWrap").classList.add("hidden");
  }
  $("ticketModal").classList.remove("hidden");
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function ensureDeptDropdown() {
  if (deptDropdown) return;
  const container = $("tkm_dept_dd");
  if (!container) return;
  deptDropdown = createDropdown({
    container,
    hiddenInput: $("tkm_dept"),
    getItems: () => deptList,
    onAddNew: async (typedName) => {
      let name = typedName?.trim();
      if (!name) {
        name = prompt("New department name:");
        if (!name?.trim()) return null;
        name = name.trim();
      }
      try {
        await addMasterItem("departments", name);
        toast(`Department "${name}" added`, "success");
        return name;
      } catch (e) {
        if (e.message?.includes("exists")) return name;
        toast("Failed: " + e.message, "error");
        return null;
      }
    },
    placeholder: "Select or search department…",
    addNewLabel: "+ Add new department…",
    recentKey: "flow.recent.dept"
  });
  subscribeMasterData("departments", (items) => {
    deptList = items;
    deptDropdown?.refresh();
  });
}

function renderComments(comments) {
  const list = $("tkm_commentsList");
  if (!comments.length) {
    list.innerHTML = `<p class="small" style="color:var(--muted);font-style:italic">No comments yet. Be the first to add one.</p>`;
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="commentItem">
      <div class="commentMeta">
        <b>${esc(c.author || "Unknown")}</b>
        <span class="small" style="color:var(--muted)">${esc(friendlyDate(c.createdAt))}</span>
      </div>
      <div class="commentBody">${esc(c.text).replace(/\n/g, "<br>")}</div>
    </div>
  `).join("");
}

async function addComment() {
  if (!editingId) return toast("Save the ticket first before adding comments", "error");
  const text = $("tkm_commentInput").value.trim();
  if (!text) return toast("Comment is empty", "error");

  const t = allTickets.find(x => x.id === editingId);
  if (!t) return;

  const profile = getCurrentProfile();
  const newComment = {
    author: profile?.name || getCurrentEmail() || "Unknown",
    authorEmail: getCurrentEmail() || "",
    text,
    createdAt: new Date().toISOString()
  };
  const updatedComments = [...(t.comments || []), newComment];

  try {
    await updateDocument(COL.TICKETS, editingId, { comments: updatedComments });
    t.comments = updatedComments;
    renderComments(updatedComments);
    $("tkm_commentInput").value = "";
    toast("Comment added", "success");
  } catch (e) {
    console.error(e);
    toast("Failed to add comment: " + e.message, "error");
  }
}

function closeModal() {
  $("ticketModal").classList.add("hidden");
  editingId = null;
}

async function saveTicket() {
  const data = {
    type: "internal",                       // hard-coded — no more external
    priority: $("tkm_priority").value,
    status: $("tkm_status").value,
    requester: $("tkm_requester").value.trim(),
    dept: $("tkm_dept").value.trim(),
    assignee: $("tkm_assignee").value.trim(),
    subject: $("tkm_subject").value.trim(),
    description: $("tkm_description").value.trim(),
    createdAtMs: Date.now()
  };

  if (!data.requester) return toast("Requester required", "error");
  if (!data.dept) return toast("Department required", "error");
  if (!data.subject) return toast("Subject required", "error");
  if (!data.description) return toast("Description required", "error");

  try {
    if (editingId) {
      const existing = allTickets.find(t => t.id === editingId);
      data.number = existing?.number;
      data.comments = existing?.comments || [];
      data.source = existing?.source || "internal-app";
      await updateDocument(COL.TICKETS, editingId, data);
      toast("Ticket updated", "success");
    } else {
      const sameType = allTickets.length; // all are internal now
      data.number = generateTicketNumber("internal", sameType);
      data.comments = [];
      data.source = "internal-app";
      await addDocument(COL.TICKETS, data);
      toast(`Ticket ${data.number} created`, "success");
    }
    closeModal();
  } catch (e) {
    console.error(e);
    toast("Save failed: " + e.message, "error");
  }
}

async function removeTicket(id) {
  if (!confirmAction("Delete this ticket? This cannot be undone.")) return;
  try {
    await deleteDocument(COL.TICKETS, id);
    toast("Ticket deleted", "success");
  } catch (e) {
    toast("Delete failed", "error");
  }
}

function exportExcel() {
  if (!filteredTickets.length) return toast("No tickets to export", "error");
  const rows = [["#", "Created", "Requester", "Department", "Subject", "Description", "Priority", "Status", "Assignee", "Comments", "Created By"]];
  filteredTickets.forEach(t => rows.push([
    t.number || "",
    toDateStr(t.createdAt), t.requester || "", t.dept || "",
    t.subject || "", t.description || "",
    t.priority || "", t.status || "", t.assignee || "",
    (t.comments || []).length,
    t.createdBy || ""
  ]));
  const filename = `Flow_Internal_Tickets_${today()}.xlsx`;
  downloadXLSX(rows, filename, "Tickets");
  toast("Exported " + filename, "success");
}

// Dashboard summary
export function getTicketsSummary() {
  return {
    total: allTickets.length,
    open: allTickets.filter(t => t.status === "Open" || t.status === "In Progress").length,
    latest: allTickets.slice(0, 5)
  };
}
