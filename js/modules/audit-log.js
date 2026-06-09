// ============================================================
// FLOW Mega Apps — Activity Log (audit trail viewer)
//
// Reads the `audit_log` collection. Entries come from two places:
//   • firebase.js — every create/update/delete app-wide (central)
//   • master-data.js — legacy master-data change entries
// Both shapes are handled. Supervisors + admins only.
// ============================================================

import { COL, subscribeCollection, orderBy } from "../firebase.js";
import { $, esc, downloadXLSX, today } from "../utils.js";

let allEntries = [];
let unsub = null;

// Collection name → friendly label
const KIND_LABELS = {
  daily_issues: "Daily Issue",
  tickets: "Ticket",
  daily_tasks_sales: "Sales Task",
  daily_tasks_ss: "SS Task",
  daily_tasks_ops: "Ops Task",
  daily_tasks_ga: "GA Task",
  inbound_monitoring: "Inbound",
  revenue_scenarios: "Revenue Scenario",
  projections: "Projection",
  clients: "Client",
  departments: "Department",
  issue_categories: "Issue Category",
  issueCategories: "Issue Category",
  oneOnOneQuestions: "1-on-1 Question",
  one_on_one_questions: "1-on-1 Question",
  one_on_ones: "1-on-1 Session",
  users: "User",
  command_center_depts: "Command Center · Department",
  command_center_apps: "Command Center · App",
  app_settings: "Master Settings"
};

const ACTION_LABELS = {
  create: "Created", update: "Updated", delete: "Deleted",
  add: "Added", edit: "Edited", rename: "Renamed", archive: "Archived",
  unarchive: "Restored", harddelete: "Hard-deleted", hardDelete: "Hard-deleted",
  seed: "Seeded", backfill: "Backfilled", updatePICs: "Updated PICs"
};

export function initAuditLog() {
  const root = $("auditLogRoot");
  if (!root) return;
  root.innerHTML = renderShell();
  bindEvents();

  if (unsub) unsub();
  unsub = subscribeCollection(COL.AUDIT_LOG, rows => {
    allEntries = rows.sort((a, b) => tsToMs(b.at) - tsToMs(a.at));
    populateKindFilter();
    render();
  }, orderBy("at", "desc"));
}

function renderShell() {
  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left"></div>
        <div class="right">
          <button class="secondary" id="auditExportBtn">Export Excel</button>
        </div>
      </div>
      <div class="filterGrid" style="margin-top:14px">
        <div><label class="pmLabel">Action</label>
          <select id="auditAction">
            <option value="">All</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
          </select>
        </div>
        <div><label class="pmLabel">Module</label>
          <select id="auditKind"><option value="">All</option></select>
        </div>
        <div style="grid-column:span 2"><label class="pmLabel">Search</label>
          <input type="text" id="auditSearch" placeholder="Search user, detail…"/>
        </div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><b id="auditKpiTotal">0</b><span>Total Events</span></div>
      <div class="kpi"><b id="auditKpiToday">0</b><span>Today</span></div>
      <div class="kpi"><b id="auditKpiUsers">0</b><span>Active Users</span></div>
    </div>

    <div class="card">
      <h2>History</h2>
      <div class="tableWrap">
        <table id="auditTable">
          <thead><tr>
            <th>When</th><th>User</th><th>Module</th><th>Action</th><th>Detail</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="small" id="auditCount">0 events</p>
    </div>
  `;
}

function bindEvents() {
  $("auditAction").onchange = render;
  $("auditKind").onchange = render;
  $("auditSearch").oninput = debounce(render, 200);
  $("auditExportBtn").onclick = exportExcel;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function populateKindFilter() {
  const sel = $("auditKind");
  if (!sel) return;
  const cur = sel.value;
  const kinds = [...new Set(allEntries.map(e => e.kind).filter(Boolean))]
    .sort((a, b) => kindLabel(a).localeCompare(kindLabel(b)));
  sel.innerHTML = `<option value="">All</option>` +
    kinds.map(k => `<option value="${esc(k)}">${esc(kindLabel(k))}</option>`).join("");
  sel.value = cur;
}

function filtered() {
  const action = $("auditAction").value;
  const kind = $("auditKind").value;
  const search = $("auditSearch").value.toLowerCase().trim();
  return allEntries.filter(e => {
    if (action && normAction(e.action) !== action) return false;
    if (kind && e.kind !== kind) return false;
    if (search) {
      const blob = `${e.by || ""} ${detailText(e)} ${kindLabel(e.kind)} ${e.action || ""}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

function render() {
  const rows = filtered();
  const tbody = $("auditTable").querySelector("tbody");

  const todayStr = today();
  $("auditKpiTotal").textContent = allEntries.length;
  $("auditKpiToday").textContent = allEntries.filter(e => msToDateStr(tsToMs(e.at)) === todayStr).length;
  $("auditKpiUsers").textContent = new Set(allEntries.map(e => e.by).filter(Boolean)).size;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px">No activity matches the current filters.</td></tr>`;
    $("auditCount").textContent = "0 events";
    return;
  }

  tbody.innerHTML = rows.slice(0, 500).map(e => `
    <tr>
      <td class="small">${esc(fmtDateTime(tsToMs(e.at)))}</td>
      <td>${esc(e.by || "—")}</td>
      <td>${esc(kindLabel(e.kind))}</td>
      <td><span class="${actionBadge(e.action)}">${esc(actionLabel(e.action))}</span></td>
      <td class="long">${esc(detailText(e))}</td>
    </tr>
  `).join("");

  $("auditCount").textContent = rows.length > 500
    ? `Showing 500 of ${rows.length} events`
    : `${rows.length} event${rows.length === 1 ? "" : "s"}`;
}

// ----- helpers ---------------------------------------------------------
function kindLabel(k) { return KIND_LABELS[k] || k || "—"; }
function actionLabel(a) { return ACTION_LABELS[a] || a || "—"; }
function normAction(a) {
  a = String(a || "").toLowerCase();
  if (["create", "add", "seed", "backfill"].includes(a)) return "create";
  if (["delete", "harddelete", "archive"].includes(a)) return "delete";
  if (["update", "edit", "rename", "unarchive", "updatepics"].includes(a)) return "update";
  return a;
}
function actionBadge(a) {
  const n = normAction(a);
  return "badge badge-" + (n === "create" ? "open" : n === "delete" ? "urgent" : "in-progress");
}

/** Build a readable detail string for either entry shape. */
function detailText(e) {
  if (e.summary) return e.summary;
  // Legacy master-data shape: oldValue / newValue
  const ov = stringifyVal(e.oldValue);
  const nv = stringifyVal(e.newValue);
  if (ov && nv) return `${ov} → ${nv}`;
  return nv || ov || (e.docId ? `#${e.docId}` : "—");
}
function stringifyVal(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(", ");
  }
  return String(v);
}

function tsToMs(t) {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  const p = Date.parse(t);
  return isNaN(p) ? 0 : p;
}
function msToDateStr(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}
function fmtDateTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function exportExcel() {
  const rows = filtered();
  if (!rows.length) return;
  const out = [["When", "User", "Module", "Action", "Detail"]];
  rows.forEach(e => out.push([
    fmtDateTime(tsToMs(e.at)), e.by || "", kindLabel(e.kind),
    actionLabel(e.action), detailText(e)
  ]));
  downloadXLSX(out, `Flow_Activity_Log_${today()}.xlsx`, "Activity Log");
}
