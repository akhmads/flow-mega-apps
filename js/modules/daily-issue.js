// ============================================================
// FLOW Mega Apps — Daily Issue Tracker (PRIORITY MODULE)
// v2 — Adds: Order Count column, quick-close checkbox,
//            client name validation, chart export (PNG + Excel),
//            Summary tab (aggregated table + executive card)
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument, subscribeCollection,
  orderBy, getDocuments
} from "../firebase.js";
import {
  $, esc, toDateStr, friendlyDate, dateRange, toast,
  badgeClass, downloadXLSX, today, confirmAction, getISOWeek, slaAge,
  generateTicketNumber
} from "../utils.js";
import { getStaffForTeam, getCurrentProfile } from "../roles.js";
import { createDropdown, findNearestMatch } from "../components/dropdown.js";
import {
  subscribeMasterData, addMasterItem, getClientByName, getMasterData
} from "./master-data.js";
import { createAttachmentField } from "../components/attachments.js";
import { FEATURES } from "../features.js";

let allIssues = [];
let filteredIssues = [];
let unsub = null;
let charts = {};
let editingId = null;
let currentTab = "detail"; // "detail" | "summary"
let issueAttachField = null;  // attachment widget (created on first modal open)

const ISSUE_SITES = ["Outbound", "Commercial", "Lastmile", "Technology", "Inbound", "Buyer", "Client", "Inventory", "Marketplace"];

// ============================================================
// INIT
// ============================================================
export function initIssues() {
  bindEvents();
  if (unsub) unsub();
  unsub = subscribeCollection(COL.ISSUES, (rows) => {
    allIssues = rows.sort((a, b) => (b.complainDate || "").localeCompare(a.complainDate || ""));
    populateDatalists();
    populateFilters();
    // Consume a pending navigation action (e.g. from a dashboard KPI tile
    // or a Latest Issues row click) AFTER filter dropdowns exist —
    // otherwise setting their values does nothing.
    _consumePendingNavAction();
    applyFilters();
  }, orderBy("complainDate", "desc"));
  // Refresh filter dropdowns whenever master data changes (clients, categories)
  subscribeMasterData("clients", () => populateFilters());
  subscribeMasterData("issueCategories", () => populateFilters());
}

/** Public hook called by app.js on every navigation to this section.
 *  Lets the dashboard pass instructions ("open this issue", "apply
 *  this filter") via window.__pendingNavAction without us having to
 *  re-run the whole init each time. */
export function consumeIssuesNavAction() {
  _consumePendingNavAction();
}

/** If the dashboard (or any other module) set window.__pendingNavAction
 *  before navigating here, honor it: apply any pre-set filters, then
 *  optionally open a specific issue's edit modal. Runs once per nav. */
function _consumePendingNavAction() {
  const action = window.__pendingNavAction;
  if (!action) return;
  window.__pendingNavAction = null; // consume — don't re-fire
  // Apply filters first. We accept any of the fltXxx ids we have inputs for.
  if (action.filters && typeof action.filters === "object") {
    for (const [id, value] of Object.entries(action.filters)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = value;
      // If the user set a status/site filter and didn't explicitly pick a
      // range, default to "all" so they actually see the records they
      // clicked through to (otherwise "This Month" can hide everything).
      if (!("fltRange" in action.filters) && (id === "fltStatus" || id === "fltIssueSite")) {
        const r = document.getElementById("fltRange");
        if (r) r.value = "all";
      }
    }
    // Trigger a re-render once filters are seated
    setTimeout(() => applyFilters(), 0);
  }
  // Open a specific issue's modal if asked
  if (action.openId) {
    // Wait one tick so the table has rendered, then open. openModal is
    // async — chain .catch on the returned promise (try/catch around the
    // call itself wouldn't catch errors thrown inside the async body).
    setTimeout(() => {
      Promise.resolve()
        .then(() => openModal(action.openId))
        .catch(e => console.warn("Could not open issue modal:", e));
    }, 50);
  }
}

function bindEvents() {
  $("issueAddBtn").addEventListener("click", () => openModal());
  $("issueExportBtn").addEventListener("click", exportExcel);
  $("issuePicReportBtn").addEventListener("click", exportPicReport);
  $("issueMbrBtn").addEventListener("click", exportMBR);
  $("issueImportBtn").addEventListener("click", () => $("issueImportFile").click());
  $("issueImportFile").addEventListener("change", importExcel);

  $("fltApplyBtn").addEventListener("click", applyFilters);
  $("fltResetBtn").addEventListener("click", resetFilters);

  ["fltClient", "fltPic", "fltIssueSite", "fltCategori", "fltStatus", "fltYear", "fltRange", "fltFrom", "fltTo"]
    .forEach(id => $(id).addEventListener("change", applyFilters));
  $("fltSearch").addEventListener("input", debounce(applyFilters, 250));

  $("issueModalCancel").addEventListener("click", closeModal);
  $("issueModalSave").addEventListener("click", saveIssue);

  // Tab switching (Detail vs Summary)
  document.querySelectorAll("[data-issuetab]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.issuetab;
      document.querySelectorAll("[data-issuetab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll("[data-issuepane]").forEach(p => p.classList.add("hidden"));
      const pane = document.querySelector(`[data-issuepane="${currentTab}"]`);
      if (pane) pane.classList.remove("hidden");
      if (currentTab === "summary") renderSummary();
    });
  });
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ============================================================
// FILTERS & DATALISTS
// ============================================================
function getKnownClients() {
  return [...new Set(allIssues.map(i => i.client).filter(Boolean))].sort();
}

function populateDatalists() {
  const clients = getKnownClients();
  const pics = [...new Set(allIssues.map(i => i.updateBy).filter(Boolean))].sort();
  const cats = [...new Set(allIssues.map(i => i.categoriComplain).filter(Boolean))].sort();
  $("clientsList").innerHTML = clients.map(c => `<option value="${esc(c)}">`).join("");
  $("picsList").innerHTML = pics.map(p => `<option value="${esc(p)}">`).join("");
  $("categoriList").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");
}

function populateFilters() {
  // v3.4 — Prefer master data when available, fall back to values derived from existing issues
  const masterClients = getMasterData("clients");
  const masterCats = getMasterData("issueCategories");
  const clients = masterClients.length ? masterClients : [...new Set(allIssues.map(i => i.client).filter(Boolean))].sort();
  const pics = [...new Set(allIssues.map(i => i.updateBy).filter(Boolean))].sort();
  const cats = masterCats.length ? masterCats : [...new Set(allIssues.map(i => i.categoriComplain).filter(Boolean))].sort();
  const years = [...new Set(allIssues.map(i => i.years).filter(Boolean))].sort();
  populateSelect("fltClient", clients, "All Clients");
  populateSelect("fltPic", pics, "All PICs");
  populateSelect("fltCategori", cats, "All");
  populateSelect("fltYear", years, "All");
}

function populateSelect(id, options, allLabel) {
  const sel = $(id);
  const current = sel.value;
  sel.innerHTML = `<option value="">${allLabel}</option>` +
    options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
  sel.value = current;
}

function applyFilters() {
  const client = $("fltClient").value;
  const pic = $("fltPic").value;
  const site = $("fltIssueSite").value;
  const categori = $("fltCategori").value;
  const status = $("fltStatus").value;
  const year = $("fltYear").value;
  const search = $("fltSearch").value.toLowerCase().trim();
  const rangeKey = $("fltRange").value;
  const from = $("fltFrom").value;
  const to = $("fltTo").value;
  const { start, end } = dateRange(rangeKey, from, to);

  filteredIssues = allIssues.filter(i => {
    if (client && i.client !== client) return false;
    if (pic && i.updateBy !== pic) return false;
    if (site && i.issueSite !== site) return false;
    if (categori && i.categoriComplain !== categori) return false;
    if (status && i.status !== status) return false;
    if (year && String(i.years) !== String(year)) return false;
    if (search) {
      const codesStr = Array.isArray(i.orderCodes) ? i.orderCodes.join(" ") : (i.orderCode || "");
      const blob = [i.client, codesStr, i.categoriComplain, i.detailsComplain,
                    i.rootCause, i.shortTermSolution, i.longTermSolution, i.notes, i.updateBy]
                    .map(x => x || "").join(" ").toLowerCase();
      if (!blob.includes(search)) return false;
    }
    if (start || end) {
      const d = i.complainDate ? new Date(i.complainDate) : null;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    return true;
  });

  renderTable();
  renderKPIs();
  renderDataHealth();
  renderCharts();
  if (currentTab === "summary") renderSummary();
}

function resetFilters() {
  ["fltClient", "fltPic", "fltIssueSite", "fltCategori", "fltStatus", "fltYear",
   "fltSearch", "fltFrom", "fltTo"].forEach(id => $(id).value = "");
  $("fltRange").value = "all";
  applyFilters();
}

// ============================================================
// KPIs
// ============================================================
function renderKPIs() {
  const total = filteredIssues.length;
  const open = filteredIssues.filter(i => i.status === "Open").length;
  const close = filteredIssues.filter(i => i.status === "Close").length;
  const resDays = filteredIssues
    .filter(i => i.status === "Close" && i.complainDate && i.solvingDate)
    .map(i => Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
  const avg = resDays.length ? Math.round(resDays.reduce((a, b) => a + b, 0) / resDays.length) : null;

  $("issueKpiTotal").textContent = total;
  $("issueKpiOpen").textContent = open;
  $("issueKpiClose").textContent = close;
  $("issueKpiAvgRes").textContent = avg !== null ? avg : "—";
  $("issueTableCount").textContent = `${total} issues`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ============================================================
// CHARTS
// ============================================================
function renderCharts() {
  const siteCounts = countBy(filteredIssues, "issueSite", ISSUE_SITES);
  renderChart("chartIssueSite", "site", {
    type: "bar",
    data: {
      labels: Object.keys(siteCounts),
      datasets: [{ label: "Issues", data: Object.values(siteCounts), backgroundColor: "rgba(124,58,237,.7)", borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  const pics = [...new Set(filteredIssues.map(i => i.updateBy).filter(Boolean))].sort();
  const picOpen = pics.map(p => filteredIssues.filter(i => i.updateBy === p && i.status === "Open").length);
  const picClose = pics.map(p => filteredIssues.filter(i => i.updateBy === p && i.status === "Close").length);
  renderChart("chartPic", "pic", {
    type: "bar",
    data: {
      labels: pics,
      datasets: [
        { label: "Open", data: picOpen, backgroundColor: "#ef4444" },
        { label: "Close", data: picClose, backgroundColor: "#22c55e" }
      ]
    },
    options: {
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  const byClient = {};
  filteredIssues.forEach(i => { const c = i.client || "—"; byClient[c] = (byClient[c] || 0) + 1; });
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderChart("chartClient", "client", {
    type: "bar",
    data: { labels: topClients.map(t => t[0]), datasets: [{ label: "Issues", data: topClients.map(t => t[1]), backgroundColor: "rgba(34,211,238,.75)", borderRadius: 6 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  const byWeek = {};
  filteredIssues.forEach(i => {
    if (!i.years || !i.week) return;
    const key = `${i.years}-W${String(i.week).padStart(2, "0")}`;
    byWeek[key] = (byWeek[key] || 0) + 1;
  });
  const weekKeys = Object.keys(byWeek).sort().slice(-20);
  renderChart("chartTrend", "trend", {
    type: "line",
    data: {
      labels: weekKeys,
      datasets: [{
        label: "Issues", data: weekKeys.map(k => byWeek[k]),
        borderColor: "#d946ef", backgroundColor: "rgba(217,70,239,.18)",
        fill: true, tension: 0.3, pointRadius: 3
      }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  const byCat = {};
  filteredIssues.forEach(i => { const c = i.categoriComplain || "—"; byCat[c] = (byCat[c] || 0) + 1; });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderChart("chartCategori", "categori", {
    type: "bar",
    data: { labels: topCats.map(t => t[0]), datasets: [{ label: "Count", data: topCats.map(t => t[1]), backgroundColor: "rgba(245,158,11,.75)", borderRadius: 6 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function countBy(arr, key, knownKeys = []) {
  const m = {};
  knownKeys.forEach(k => m[k] = 0);
  arr.forEach(item => { const v = item[key] || "—"; m[v] = (m[v] || 0) + 1; });
  return m;
}

function renderChart(canvasId, key, config) {
  const canvas = $(canvasId);
  if (!canvas) return;
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart(canvas.getContext("2d"), config);
}

// ============================================================
// CHART EXPORT — PNG + Excel
// Wired via global window.exportChart so inline onclick works
// ============================================================
window.exportChart = function (key, format) {
  const chart = charts[key];
  if (!chart) return toast("Chart not ready", "error");
  if (format === "png") {
    const url = chart.toBase64Image("image/png", 1);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Flow_Chart_${key}_${today()}.png`;
    a.click();
    toast("Chart PNG exported", "success");
  } else if (format === "excel") {
    const labels = chart.data.labels || [];
    const datasets = chart.data.datasets || [];
    const rows = [["Label", ...datasets.map(d => d.label || "Value")]];
    labels.forEach((l, i) => {
      rows.push([l, ...datasets.map(d => d.data[i] ?? 0)]);
    });
    const filename = `Flow_Chart_${key}_${today()}.xlsx`;
    downloadXLSX(rows, filename, key);
    toast("Chart data exported", "success");
  }
};

// ============================================================
// TABLE (Detail tab)
// New columns: [] checklist (quick-close) + Order Count
// ============================================================
function renderTable() {
  const tbody = $("issueTable").querySelector("tbody");
  if (!filteredIssues.length) {
    tbody.innerHTML = `<tr><td colspan="18" style="text-align:center;color:var(--muted);padding:32px">No issues match the current filters.</td></tr>`;
    return;
  }
  const display = filteredIssues.slice(0, 500);
  tbody.innerHTML = display.map(i => {
    const orderQty = toOrderCodesArray(i).length;
    const isClosed = i.status === "Close";
    // Aging / SLA — only meaningful for still-open issues.
    const age = (!isClosed && FEATURES.slaHighlight) ? slaAge(i.complainDate) : { level: "", label: "", days: 0 };
    const rowCls = (age.level === "warn" || age.level === "stale") ? ` class="sla-${age.level}"` : "";
    const agePill = (age.days >= 1) ? ` <span class="agePill ${age.level}">${esc(age.label)}</span>` : "";
    const attachTag = (i.attachments && i.attachments.length)
      ? ` <span class="small" title="${i.attachments.length} attachment(s)">📎 ${i.attachments.length}</span>` : "";
    const ticketBtn = !FEATURES.issueToTicket ? ""
      : i.linkedTicketId
        ? `<span class="small" title="Converted to Internal Ticket" style="color:var(--primary)">🎫 ${esc(i.linkedTicketNumber || "linked")}</span>`
        : `<button class="secondary iconBtn" data-totkt="${i.id}" title="Create an Internal Ticket from this issue">→ Ticket</button>`;
    return `
    <tr${rowCls}>
      <td style="text-align:center">
        <input type="checkbox" class="quickCloseChk" data-id="${i.id}" ${isClosed ? "checked" : ""} title="${isClosed ? "Reopen this issue" : "Close & auto-set solving date to today"}"/>
      </td>
      <td>${esc(i.updateBy || "")}</td>
      <td>${esc(friendlyDate(i.complainDate))}</td>
      <td>${esc(friendlyDate(i.solvingDate))}</td>
      <td>${esc(i.years || "")}</td>
      <td>${esc(i.week || "")}</td>
      <td><b>${esc(i.client || "—")}</b></td>
      <td class="small">${esc(orderCodesDisplay(i))}</td>
      <td style="text-align:center"><b>${orderQty}</b></td>
      <td>${esc(i.issueSite || "")}</td>
      <td class="long">${esc(i.categoriComplain || "")}</td>
      <td class="long">${esc(i.detailsComplain || "")}</td>
      <td class="long">${esc(i.rootCause || "")}</td>
      <td class="long">${esc(i.shortTermSolution || "")}</td>
      <td class="long">${esc(i.longTermSolution || "")}</td>
      <td><span class="${badgeClass(isClosed ? "resolved" : "open")}">${esc(i.status || "")}</span>${agePill}</td>
      <td class="long">${esc(i.notes || "")}${attachTag}</td>
      <td>
        <button class="secondary iconBtn" data-edit="${i.id}">Edit</button>
        ${ticketBtn}
        <button class="danger iconBtn" data-del="${i.id}">Del</button>
      </td>
    </tr>`;
  }).join("");
  if (filteredIssues.length > 500) {
    tbody.innerHTML += `<tr><td colspan="18" style="text-align:center;color:var(--muted);padding:14px">Showing 500 of ${filteredIssues.length}. Filter to narrow down, or export to see all.</td></tr>`;
  }

  tbody.querySelectorAll(".quickCloseChk").forEach(chk =>
    chk.addEventListener("change", () => quickToggleClose(chk.dataset.id, chk.checked)));
  tbody.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => openModal(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => removeIssue(b.dataset.del)));
  tbody.querySelectorAll("[data-totkt]").forEach(b =>
    b.addEventListener("click", () => convertToTicket(b.dataset.totkt)));
}

// ============================================================
// ISSUE → TICKET — spin an issue into an Internal Ticket so it
// can be routed to another team. Links both records together.
// ============================================================
async function convertToTicket(id) {
  const i = allIssues.find(x => x.id === id);
  if (!i) return;
  if (i.linkedTicketId) return toast("This issue already has a linked ticket", "error");
  if (!confirmAction(`Create an Internal Ticket from this ${i.client || ""} issue?`)) return;

  const me = getCurrentProfile();
  const codes = toOrderCodesArray(i);
  const description = [
    `Converted from Daily Issue Tracker.`,
    `Client: ${i.client || "—"}`,
    `Issue site: ${i.issueSite || "—"}`,
    `Complain date: ${friendlyDate(i.complainDate)}`,
    codes.length ? `Order code(s): ${codes.join(", ")}` : "",
    i.detailsComplain ? `\nDetails: ${i.detailsComplain}` : "",
    i.rootCause ? `Root cause: ${i.rootCause}` : ""
  ].filter(Boolean).join("\n");

  try {
    // Ticket number needs a running count of existing tickets.
    let count = 0;
    try { count = (await getDocuments(COL.TICKETS)).length; } catch (e) { /* best effort */ }

    const ticket = {
      type: "internal",
      priority: "Medium",
      status: "Open",
      requester: me?.name || i.updateBy || "—",
      dept: i.issueSite || "Operations",
      assignee: "",
      subject: `Issue: ${i.client || "—"} — ${i.categoriComplain || i.issueSite || "complaint"}`,
      description,
      comments: [],
      number: generateTicketNumber("internal", count),
      source: "from-issue",
      linkedIssueId: i.id,
      createdAtMs: Date.now()
    };
    const ticketId = await addDocument(COL.TICKETS, ticket);
    await updateDocument(COL.ISSUES, id, {
      linkedTicketId: ticketId,
      linkedTicketNumber: ticket.number
    });
    toast(`Ticket ${ticket.number} created from this issue`, "success");
  } catch (e) {
    console.error(e);
    toast("Could not create ticket: " + e.message, "error");
  }
}

// Quick-close / re-open from the checkbox column.
// On close: auto-set solvingDate = today if empty.
// On reopen: keep solvingDate for audit trail.
async function quickToggleClose(id, isClosed) {
  const issue = allIssues.find(x => x.id === id);
  if (!issue) return;
  const newStatus = isClosed ? "Close" : "Open";
  const update = { status: newStatus };
  if (isClosed && !issue.solvingDate) {
    update.solvingDate = today();
  }
  // Recompute resolutionDays on status change
  if (isClosed && issue.complainDate) {
    const solving = update.solvingDate || issue.solvingDate;
    if (solving) update.resolutionDays = Math.max(0, daysBetween(issue.complainDate, solving));
  }
  if (!isClosed) {
    update.resolutionDays = null;
  }
  try {
    await updateDocument(COL.ISSUES, id, update);
    toast(`Issue ${isClosed ? "closed (solving date set to today)" : "reopened"}`, "success");
  } catch (e) {
    console.error(e);
    toast("Update failed: " + e.message, "error");
  }
}

// ============================================================
// DROPDOWN INSTANCES — built once in openModal()
// ============================================================
let clientDropdown = null;
let categoryDropdown = null;

function ensureDropdowns() {
  // Client dropdown
  if (!clientDropdown) {
    const container = $("im_client_dd");
    if (container) {
      clientDropdown = createDropdown({
        container,
        hiddenInput: $("im_client"),
        getItems: () => clientList,
        onChange: async (val) => {
          // Auto-fill PIC from client master record (if set)
          const c = getClientByName(val);
          if (c?.defaultSsPic && !$("im_updateBy").value) {
            $("im_updateBy").value = c.defaultSsPic;
          }
        },
        onAddNew: addNewClientInline,
        placeholder: "Select or search client…",
        addNewLabel: "+ Add new client…",
        recentKey: "flow.recent.client"
      });
      // Subscribe to master data changes — refresh dropdown items
      subscribeMasterData("clients", (items) => {
        clientList = items;
        clientDropdown?.refresh();
      });
    }
  }

  // Category dropdown
  if (!categoryDropdown) {
    const container = $("im_categori_dd");
    if (container) {
      categoryDropdown = createDropdown({
        container,
        hiddenInput: $("im_categori"),
        getItems: () => categoryList,
        onAddNew: addNewCategoryInline,
        placeholder: "Select or search category…",
        addNewLabel: "+ Add new category…",
        recentKey: "flow.recent.category"
      });
      subscribeMasterData("issueCategories", (items) => {
        categoryList = items;
        categoryDropdown?.refresh();
      });
    }
  }
}

let clientList = [];
let categoryList = [];

async function addNewClientInline(typedName) {
  let name = typedName?.trim();
  if (!name) {
    name = prompt("New client name:");
    if (!name?.trim()) return null;
    name = name.trim();
  }
  // Fuzzy-check for near-duplicates before creating
  const near = findNearestMatch(name, clientList);
  if (near && near.name.toLowerCase() !== name.toLowerCase()) {
    const useExisting = confirm(`A similar client already exists: "${near.name}"\n\nPress OK to use "${near.name}" instead, or Cancel to create "${name}" as a new client.`);
    if (useExisting) return near.name;
  }
  try {
    await addMasterItem("clients", name);
    toast(`Client "${name}" added to master list`, "success");
    return name;
  } catch (e) {
    if (e.message?.includes("exists")) {
      toast(`"${name}" already exists — selecting it`, "");
      return name;
    }
    toast("Failed to add client: " + e.message, "error");
    return null;
  }
}

async function addNewCategoryInline(typedName) {
  let name = typedName?.trim();
  if (!name) {
    name = prompt("New category name:");
    if (!name?.trim()) return null;
    name = name.trim();
  }
  const near = findNearestMatch(name, categoryList);
  if (near && near.name.toLowerCase() !== name.toLowerCase()) {
    const useExisting = confirm(`A similar category already exists: "${near.name}"\n\nPress OK to use "${near.name}" instead, or Cancel to create "${name}" as a new category.`);
    if (useExisting) return near.name;
  }
  try {
    await addMasterItem("issueCategories", name);
    toast(`Category "${name}" added`, "success");
    return name;
  } catch (e) {
    if (e.message?.includes("exists")) return name;
    toast("Failed: " + e.message, "error");
    return null;
  }
}

// ============================================================
// SUMMARY TAB — aggregated table + executive card
// ============================================================
function renderSummary() {
  renderExecutiveCard();
  renderSummaryTable();
}

function renderExecutiveCard() {
  const el = $("issueSummaryExec");
  if (!el) return;
  const total = filteredIssues.length;
  if (!total) {
    el.innerHTML = `<p style="color:var(--muted)">No issues match the current filters.</p>`;
    return;
  }
  const open = filteredIssues.filter(i => i.status === "Open").length;
  const close = filteredIssues.filter(i => i.status === "Close").length;
  const openPct = total ? Math.round(open / total * 100) : 0;

  const topClient = topN(filteredIssues, "client", 1)[0];
  const topSite = topN(filteredIssues, "issueSite", 1)[0];
  const topCat = topN(filteredIssues, "categoriComplain", 1)[0];
  const topPic = topN(filteredIssues, "updateBy", 1)[0];

  const ordersImpacted = filteredIssues.reduce((s, i) => s + toOrderCodesArray(i).length, 0);

  const resDays = filteredIssues
    .filter(i => i.status === "Close" && i.complainDate && i.solvingDate)
    .map(i => Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
  const avgRes = resDays.length ? Math.round(resDays.reduce((a, b) => a + b, 0) / resDays.length) : null;

  const stalest = filteredIssues
    .filter(i => i.status === "Open" && i.complainDate)
    .sort((a, b) => a.complainDate.localeCompare(b.complainDate))[0];
  const stalestDays = stalest ? daysBetween(stalest.complainDate, today()) : null;

  const trend = buildTrendDelta(filteredIssues);

  el.innerHTML = `
    <div class="execHero">
      <div>
        <div class="execLabel">Total Issues</div>
        <div class="execVal">${total}</div>
        <div class="execSub">${ordersImpacted} order(s) impacted</div>
      </div>
      <div>
        <div class="execLabel">Open</div>
        <div class="execVal" style="color:#ef4444">${open}</div>
        <div class="execSub">${openPct}% of total</div>
      </div>
      <div>
        <div class="execLabel">Closed</div>
        <div class="execVal" style="color:#22c55e">${close}</div>
        <div class="execSub">${avgRes !== null ? avgRes + " days avg resolution" : "—"}</div>
      </div>
      <div>
        <div class="execLabel">Trend WoW</div>
        <div class="execVal" style="color:${trend.delta > 0 ? "#ef4444" : trend.delta < 0 ? "#22c55e" : "#64748b"}">
          ${trend.delta > 0 ? "▲" : trend.delta < 0 ? "▼" : "—"} ${Math.abs(trend.delta)}
        </div>
        <div class="execSub">${trend.thisWeek} this wk · ${trend.lastWeek} last wk</div>
      </div>
    </div>
    <div class="execGrid">
      <div class="execItem">
        <span class="execLabel">Top Client</span>
        <b>${esc(topClient ? topClient.key : "—")}</b>
        <span class="execSub">${topClient ? topClient.count + " issues" : ""}</span>
      </div>
      <div class="execItem">
        <span class="execLabel">Top Site</span>
        <b>${esc(topSite ? topSite.key : "—")}</b>
        <span class="execSub">${topSite ? topSite.count + " issues" : ""}</span>
      </div>
      <div class="execItem">
        <span class="execLabel">Top Category</span>
        <b>${esc(topCat ? topCat.key : "—")}</b>
        <span class="execSub">${topCat ? topCat.count + " issues" : ""}</span>
      </div>
      <div class="execItem">
        <span class="execLabel">Top PIC</span>
        <b>${esc(topPic ? topPic.key : "—")}</b>
        <span class="execSub">${topPic ? topPic.count + " issues" : ""}</span>
      </div>
    </div>
    ${stalest ? `
    <div class="execAlert">
      <b>Oldest unresolved:</b> ${esc(stalest.client || "—")} — "${esc((stalest.categoriComplain || "").slice(0, 60))}" · open for <b>${stalestDays}</b> day(s) · PIC: ${esc(stalest.updateBy || "—")}
    </div>` : ""}
  `;
}

function topN(arr, key, n) {
  const m = {};
  arr.forEach(i => { const v = i[key] || ""; if (v) m[v] = (m[v] || 0) + 1; });
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, c]) => ({ key: k, count: c }));
}

function buildTrendDelta(arr) {
  const now = new Date();
  const thisWeekYrW = `${now.getFullYear()}-${getISOWeek(now)}`;
  const lastWeekDate = new Date(now.getTime() - 7 * 86400000);
  const lastWeekYrW = `${lastWeekDate.getFullYear()}-${getISOWeek(lastWeekDate)}`;
  let thisWeek = 0, lastWeek = 0;
  arr.forEach(i => {
    if (!i.years || !i.week) return;
    const key = `${i.years}-${i.week}`;
    if (key === thisWeekYrW) thisWeek++;
    if (key === lastWeekYrW) lastWeek++;
  });
  return { thisWeek, lastWeek, delta: thisWeek - lastWeek };
}

function renderSummaryTable() {
  const groupBy = $("summaryGroupBy")?.value || "client";
  const tbody = $("summaryTable")?.querySelector("tbody");
  if (!tbody) return;
  const grouped = {};
  filteredIssues.forEach(i => {
    const key = i[groupBy] || "—";
    if (!grouped[key]) grouped[key] = { total: 0, open: 0, close: 0, orders: 0, days: [], clients: new Set(), pics: new Set() };
    grouped[key].total++;
    if (i.status === "Open") grouped[key].open++;
    if (i.status === "Close") grouped[key].close++;
    grouped[key].orders += toOrderCodesArray(i).length;
    if (i.client) grouped[key].clients.add(i.client);
    if (i.updateBy) grouped[key].pics.add(i.updateBy);
    if (i.status === "Close" && i.complainDate && i.solvingDate) {
      grouped[key].days.push(Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
    }
  });
  const rows = Object.entries(grouped)
    .map(([k, v]) => ({
      key: k, ...v,
      avgRes: v.days.length ? Math.round(v.days.reduce((a, b) => a + b, 0) / v.days.length) : null,
      clientCount: v.clients.size,
      picCount: v.pics.size
    }))
    .sort((a, b) => b.total - a.total);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">No data.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><b>${esc(r.key)}</b></td>
      <td style="text-align:center">${r.total}</td>
      <td style="text-align:center;color:#ef4444"><b>${r.open}</b></td>
      <td style="text-align:center;color:#22c55e">${r.close}</td>
      <td style="text-align:center">${r.orders}</td>
      <td style="text-align:center">${r.clientCount}</td>
      <td style="text-align:center">${r.picCount}</td>
      <td style="text-align:center">${r.avgRes !== null ? r.avgRes + "d" : "—"}</td>
    </tr>`).join("");
}

window.refreshIssueSummary = renderSummaryTable;
window.exportIssueSummary = function () {
  const groupBy = $("summaryGroupBy")?.value || "client";
  const out = [["Group By: " + groupBy], [], [groupBy, "Total Issues", "Open", "Closed", "Orders Impacted", "Unique Clients", "Unique PICs", "Avg Resolution (days)"]];
  const grouped = {};
  filteredIssues.forEach(i => {
    const key = i[groupBy] || "—";
    if (!grouped[key]) grouped[key] = { total: 0, open: 0, close: 0, orders: 0, days: [], clients: new Set(), pics: new Set() };
    grouped[key].total++;
    if (i.status === "Open") grouped[key].open++;
    if (i.status === "Close") grouped[key].close++;
    grouped[key].orders += toOrderCodesArray(i).length;
    if (i.client) grouped[key].clients.add(i.client);
    if (i.updateBy) grouped[key].pics.add(i.updateBy);
    if (i.status === "Close" && i.complainDate && i.solvingDate) {
      grouped[key].days.push(Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
    }
  });
  Object.entries(grouped)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([k, v]) => {
      const avg = v.days.length ? Math.round(v.days.reduce((a, b) => a + b, 0) / v.days.length) : "";
      out.push([k, v.total, v.open, v.close, v.orders, v.clients.size, v.pics.size, avg]);
    });
  const filename = `Flow_Issue_Summary_${groupBy}_${today()}.xlsx`;
  downloadXLSX(out, filename, "Summary");
  toast("Summary exported", "success");
};

// ============================================================
// MODAL CRUD
// ============================================================
/** Build the attachment widget once and reveal its block.
 *  No-op when the feature is disabled in features.js. */
function ensureAttachField() {
  const block = $("im_attachBlock");
  if (!block) return;
  if (!FEATURES.attachments) { block.classList.add("hidden"); return; }
  block.classList.remove("hidden");
  if (!issueAttachField) {
    issueAttachField = createAttachmentField($("im_attachments"));
  }
}

async function openModal(id = null) {
  editingId = id;
  $("issueModalTitle").textContent = id ? "Edit Issue" : "New Issue";

  let staff = [];
  try { staff = await getStaffForTeam("ss"); } catch (e) { console.warn(e); }
  const me = getCurrentProfile();
  $("im_updateBy").innerHTML =
    `<option value="">— Select PIC —</option>` +
    staff.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");

  ensureDropdowns();
  ensureAttachField();

  if (id) {
    const i = allIssues.find(x => x.id === id);
    if (!i) return;
    issueAttachField?.setItems(i.attachments || []);
    $("im_updateBy").value = i.updateBy || "";
    clientDropdown?.setValue(i.client || "");
    $("im_complainDate").value = toDateStr(i.complainDate) || today();
    $("im_solvingDate").value = toDateStr(i.solvingDate) || "";
    $("im_status").value = i.status || "Open";
    setOrderCodes(toOrderCodesArray(i));
    $("im_issueSite").value = i.issueSite || "Outbound";
    categoryDropdown?.setValue(i.categoriComplain || "");
    $("im_details").value = i.detailsComplain || "";
    $("im_rootCause").value = i.rootCause || "";
    $("im_shortTerm").value = i.shortTermSolution || "";
    $("im_longTerm").value = i.longTermSolution || "";
    $("im_notes").value = i.notes || "";
  } else {
    issueAttachField?.clear();
    const myStaff = staff.find(s => s.email === me?.email);
    $("im_updateBy").value = myStaff?.name || "";
    clientDropdown?.setValue("");
    $("im_complainDate").value = today();
    $("im_solvingDate").value = "";
    $("im_status").value = "Open";
    setOrderCodes([]);
    $("im_issueSite").value = "Outbound";
    categoryDropdown?.setValue("");
    $("im_details").value = "";
    $("im_rootCause").value = "";
    $("im_shortTerm").value = "";
    $("im_longTerm").value = "";
    $("im_notes").value = "";
  }
  setupChipInput();
  $("issueModal").classList.remove("hidden");
}

let currentOrderCodes = [];

function toOrderCodesArray(i) {
  if (Array.isArray(i.orderCodes) && i.orderCodes.length) return i.orderCodes;
  if (i.orderCode) {
    return String(i.orderCode).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function orderCodesDisplay(i) {
  const arr = toOrderCodesArray(i);
  if (!arr.length) return "—";
  if (arr.length === 1) return arr[0];
  return `${arr[0]} +${arr.length - 1} more`;
}

function setOrderCodes(codes) {
  currentOrderCodes = [...codes];
  renderChips();
}

function renderChips() {
  const wrap = $("im_orderCodesWrap");
  if (!wrap) return;
  const input = $("im_orderCodeInput");
  [...wrap.querySelectorAll(".chip")].forEach(c => c.remove());
  currentOrderCodes.forEach((code, idx) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${esc(code)}<button type="button" class="chipDel" data-i="${idx}">×</button>`;
    wrap.insertBefore(chip, input);
  });
  wrap.querySelectorAll(".chipDel").forEach(b =>
    b.addEventListener("click", () => {
      currentOrderCodes.splice(parseInt(b.dataset.i), 1);
      renderChips();
    })
  );
  const countEl = $("im_orderCodeCount");
  if (countEl) countEl.textContent = `${currentOrderCodes.length} order(s)`;
}

function setupChipInput() {
  const input = $("im_orderCodeInput");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChipFromInput();
    } else if (e.key === "Backspace" && !input.value && currentOrderCodes.length) {
      currentOrderCodes.pop();
      renderChips();
    }
  });
  input.addEventListener("blur", addChipFromInput);
}

function addChipFromInput() {
  const input = $("im_orderCodeInput");
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const codes = raw.split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean);
  codes.forEach(c => {
    if (!currentOrderCodes.includes(c)) currentOrderCodes.push(c);
  });
  input.value = "";
  renderChips();
}

function closeModal() {
  $("issueModal").classList.add("hidden");
  editingId = null;
}

async function saveIssue() {
  const complainDate = $("im_complainDate").value;
  const solvingDate = $("im_solvingDate").value;
  const status = $("im_status").value;
  let finalSolving = solvingDate;
  if (status === "Close" && !finalSolving) finalSolving = today();
  const cDate = complainDate ? new Date(complainDate) : null;

  addChipFromInput();

  const clientValue = $("im_client").value.trim();

  const data = {
    updateBy: $("im_updateBy").value.trim(),
    client: clientValue,
    complainDate,
    solvingDate: finalSolving || null,
    years: cDate ? cDate.getFullYear() : null,
    week: cDate ? getISOWeek(cDate) : null,
    orderCodes: [...currentOrderCodes],
    orderCode: currentOrderCodes.join(", "),
    orderCount: currentOrderCodes.length,
    issueSite: $("im_issueSite").value,
    categoriComplain: $("im_categori").value.trim(),
    detailsComplain: $("im_details").value.trim(),
    rootCause: $("im_rootCause").value.trim(),
    shortTermSolution: $("im_shortTerm").value.trim(),
    longTermSolution: $("im_longTerm").value.trim(),
    notes: $("im_notes").value.trim(),
    status
  };

  if (!data.updateBy) return toast("Update By (PIC) is required", "error");
  if (!data.client) return toast("Client is required", "error");
  if (!data.complainDate) return toast("Complain Date is required", "error");
  if (!data.categoriComplain) return toast("Categori Complain is required", "error");

  // Date sanity checks — catch typos and accidental future dates
  if (cDate && cDate > new Date()) {
    return toast("Complain Date cannot be in the future", "error");
  }
  if (data.solvingDate && cDate) {
    const sDate = new Date(data.solvingDate);
    if (sDate < cDate) {
      return toast("Solving Date cannot be before Complain Date", "error");
    }
  }

  // Compute resolution days for SLA tracking (only when both dates exist)
  if (data.complainDate && data.solvingDate) {
    data.resolutionDays = Math.max(0, daysBetween(data.complainDate, data.solvingDate));
  } else {
    data.resolutionDays = null;
  }

  // Optional attachments
  if (FEATURES.attachments && issueAttachField) {
    data.attachments = issueAttachField.getItems();
  }

  try {
    if (editingId) {
      await updateDocument(COL.ISSUES, editingId, data);
      toast("Issue updated", "success");
    } else {
      await addDocument(COL.ISSUES, data);
      toast("Issue created", "success");
    }
    closeModal();
  } catch (e) {
    console.error(e);
    toast("Save failed: " + e.message, "error");
  }
}

async function removeIssue(id) {
  if (!confirmAction("Delete this issue? This cannot be undone.")) return;
  try {
    await deleteDocument(COL.ISSUES, id);
    toast("Issue deleted", "success");
  } catch (e) {
    toast("Delete failed", "error");
  }
}

// ============================================================
// EXPORT — PIC Report (Farah style — unchanged behavior)
// ============================================================
function exportPicReport() {
  if (!filteredIssues.length) return toast("No issues match current filters", "error");
  if (typeof XLSX === "undefined") return toast("XLSX library missing", "error");

  const byPic = {};
  filteredIssues.forEach(i => {
    const pic = i.updateBy || "Unassigned";
    if (!byPic[pic]) byPic[pic] = [];
    byPic[pic].push(i);
  });

  const wb = XLSX.utils.book_new();
  const aoa = [];
  const merges = [];

  Object.keys(byPic).sort().forEach((picName, picIdx) => {
    const items = byPic[picName];
    const headerRow = aoa.length;
    aoa.push([picName, "", "", "", "", "", "", ""]);
    merges.push({ s: { r: headerRow, c: 0 }, e: { r: headerRow, c: 7 } });
    aoa.push(["Open Date", "Closed Date", "Stalkholders", "Client Name", "Issue Desc", "Orders Impacted", "RCA", "Solution"]);

    items.forEach(i => {
      const codes = toOrderCodesArray(i);
      const ordersImpacted = codes.length || 1;
      const issueDesc = [i.categoriComplain, i.detailsComplain].filter(Boolean).join(" — ");
      const solution = [
        i.shortTermSolution ? "• Short Term: " + i.shortTermSolution : "",
        i.longTermSolution ? "• Long Term: " + i.longTermSolution : ""
      ].filter(Boolean).join("\n");
      aoa.push([
        toDateStr(i.complainDate) || "",
        toDateStr(i.solvingDate) || "",
        i.issueSite || "",
        i.client || "",
        issueDesc,
        ordersImpacted,
        i.rootCause || "",
        solution || "—"
      ]);
    });
    if (picIdx < Object.keys(byPic).length - 1) aoa.push([""]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
    { wch: 50 }, { wch: 8 },  { wch: 40 }, { wch: 50 }
  ];
  for (let r = 0; r < aoa.length; r++) {
    if (merges.some(m => m.s.r === r)) {
      const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[cellRef]) {
        ws[cellRef].s = { font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "5B21B6" } } };
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "PIC Report");
  const filename = `Flow_PIC_Report_${today()}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast(`Exported ${Object.keys(byPic).length} PIC(s) → ${filename}`, "success");
}

// ============================================================
// EXPORT — Standard Excel (now with Order Count column)
// When a row has many order codes, the cell shows
// "FIRST_CODE + N more" so the report stays readable.
// The dedicated "Order Count" column always has the raw number.
// ============================================================
function exportExcel() {
  if (!filteredIssues.length) return toast("No issues to export", "error");
  const rows = [[
    "Update By", "Complain Date", "Solving Date", "Resolution Days",
    "Years", "Week",
    "Client", "Order Code", "Order Count", "Issue Site", "Categori Complain",
    "Details Complain", "Root Cause", "Short Term Solution",
    "Long Term Solution", "Status", "Notes",
    "Created By", "Created At", "Updated By", "Updated At"
  ]];
  filteredIssues.forEach(i => {
    const codes = toOrderCodesArray(i);
    // Full order codes — no truncation so MBR data is complete
    const codeCell = codes.join("; ");
    const resDays = (i.resolutionDays != null)
      ? i.resolutionDays
      : (i.status === "Close" && i.complainDate && i.solvingDate)
        ? Math.max(0, daysBetween(i.complainDate, i.solvingDate))
        : "";
    rows.push([
      i.updateBy || "", toDateStr(i.complainDate), toDateStr(i.solvingDate),
      resDays,
      i.years || "", i.week || "",
      i.client || "", codeCell, codes.length, i.issueSite || "", i.categoriComplain || "",
      i.detailsComplain || "", i.rootCause || "", i.shortTermSolution || "",
      i.longTermSolution || "", i.status || "", i.notes || "",
      i.createdBy || "", toDateStr(i.createdAt) || "",
      i.updatedBy || "", toDateStr(i.updatedAt) || ""
    ]);
  });
  const filename = `Flow_Daily_Issues_${today()}.xlsx`;
  downloadXLSX(rows, filename, "Daily Issues");
  toast("Exported " + filename, "success");
}

// ============================================================
// DATA HEALTH — surface dirty data before it hits MBR reports
// ============================================================
function renderDataHealth() {
  const el = $("issueDataHealth");
  if (!el) return;
  const issues = filteredIssues;
  if (!issues.length) { el.classList.add("hidden"); return; }

  const masterClients = getMasterData("clients");
  const warnings = [];

  const noRootCause = issues.filter(i => !i.rootCause?.trim()).length;
  if (noRootCause) warnings.push(`<b>${noRootCause}</b> issue(s) missing Root Cause`);

  const closedNoSolving = issues.filter(i => i.status === "Close" && !i.solvingDate).length;
  if (closedNoSolving) warnings.push(`<b>${closedNoSolving}</b> closed issue(s) missing Solving Date`);

  const futureDate = issues.filter(i => i.complainDate && new Date(i.complainDate) > new Date()).length;
  if (futureDate) warnings.push(`<b>${futureDate}</b> issue(s) with Complain Date in the future`);

  const solvingBeforeComplain = issues.filter(i =>
    i.complainDate && i.solvingDate && new Date(i.solvingDate) < new Date(i.complainDate)).length;
  if (solvingBeforeComplain) warnings.push(`<b>${solvingBeforeComplain}</b> issue(s) where Solving Date is before Complain Date`);

  if (masterClients.length) {
    const unknownClients = [...new Set(issues.map(i => i.client).filter(Boolean))]
      .filter(c => !masterClients.includes(c));
    if (unknownClients.length) warnings.push(`<b>${unknownClients.length}</b> client(s) not in Master Data: ${unknownClients.slice(0, 5).map(c => esc(c)).join(", ")}${unknownClients.length > 5 ? "..." : ""}`);
  }

  const noDetails = issues.filter(i => !i.detailsComplain?.trim() && !i.rootCause?.trim()).length;
  if (noDetails) warnings.push(`<b>${noDetails}</b> issue(s) missing both Details and Root Cause`);

  if (!warnings.length) { el.classList.add("hidden"); return; }

  el.classList.remove("hidden");
  el.innerHTML = `
    <h2 style="margin:0 0 8px;font-size:15px">&#9888;&#65039; Data Health Check <span class="small" style="color:var(--muted);font-weight:normal">(${warnings.length} warning${warnings.length > 1 ? "s" : ""} in filtered data)</span></h2>
    <ul style="margin:0;padding-left:20px;line-height:1.7">${warnings.map(w => `<li>${w}</li>`).join("")}</ul>
    <p class="small" style="margin:8px 0 0;color:var(--muted)">Clean these up before generating MBR reports. Click any issue in the table below to edit.</p>
  `;
}

// ============================================================
// MBR EXPORT — Client-scoped Monthly Business Review
//
// Generates a multi-sheet Excel workbook:
//   Sheet 1: "Executive Summary" — per-client KPIs for the period
//   Sheet 2: "Issue Detail"      — full row-level data for the period
//   Sheet 3: "By Site"           — breakdown by Issue Site
//   Sheet 4: "By Category"       — breakdown by Category
//   Sheet 5: "Top Root Causes"   — most common root causes
//   Sheet 6: "SLA"               — resolution time distribution
//   Sheet 7: "Weekly Trend"      — issues per week
// ============================================================
function exportMBR() {
  if (!filteredIssues.length) return toast("No issues match current filters — set your date range first", "error");
  if (typeof XLSX === "undefined") return toast("XLSX library not loaded", "error");

  const wb = XLSX.utils.book_new();

  // --- Group by client ---
  const byClient = {};
  filteredIssues.forEach(i => {
    const c = i.client || "Unknown";
    if (!byClient[c]) byClient[c] = [];
    byClient[c].push(i);
  });
  const clientNames = Object.keys(byClient).sort();

  // ---- Sheet 1: Executive Summary ----
  const execRows = [
    ["FLOW Monthly Business Review — Issue Summary"],
    [`Period: ${$("fltFrom").value || "All"} to ${$("fltTo").value || "All"} | Range: ${$("fltRange").value} | Generated: ${today()}`],
    [],
    ["Client", "Total Issues", "Open", "Closed", "Close Rate %",
     "Orders Impacted", "Avg Resolution (days)", "SLA <= 3d %",
     "Top Issue Site", "Top Category", "Top Root Cause"]
  ];

  clientNames.forEach(client => {
    const items = byClient[client];
    const open = items.filter(i => i.status === "Open").length;
    const closed = items.filter(i => i.status === "Close").length;
    const closeRate = items.length ? Math.round(closed / items.length * 100) : 0;
    const orders = items.reduce((s, i) => s + toOrderCodesArray(i).length, 0);
    const resDays = items
      .filter(i => i.status === "Close" && i.complainDate && i.solvingDate)
      .map(i => i.resolutionDays != null ? i.resolutionDays : Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
    const avgRes = resDays.length ? Math.round(resDays.reduce((a, b) => a + b, 0) / resDays.length) : "";
    const sla3d = resDays.length ? Math.round(resDays.filter(d => d <= 3).length / resDays.length * 100) : "";

    const topSite = topN(items, "issueSite", 1)[0];
    const topCat = topN(items, "categoriComplain", 1)[0];
    const topRC = topN(items.filter(i => i.rootCause?.trim()), "rootCause", 1)[0];

    execRows.push([
      client, items.length, open, closed, closeRate + "%",
      orders, avgRes, sla3d ? sla3d + "%" : "",
      topSite ? topSite.key : "", topCat ? topCat.key : "",
      topRC ? topRC.key : ""
    ]);
  });

  // Totals row
  const totalOpen = filteredIssues.filter(i => i.status === "Open").length;
  const totalClosed = filteredIssues.filter(i => i.status === "Close").length;
  const totalOrders = filteredIssues.reduce((s, i) => s + toOrderCodesArray(i).length, 0);
  const allResDays = filteredIssues
    .filter(i => i.status === "Close" && i.complainDate && i.solvingDate)
    .map(i => i.resolutionDays != null ? i.resolutionDays : Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
  const totalAvgRes = allResDays.length ? Math.round(allResDays.reduce((a, b) => a + b, 0) / allResDays.length) : "";
  const totalSla3d = allResDays.length ? Math.round(allResDays.filter(d => d <= 3).length / allResDays.length * 100) : "";
  execRows.push([]);
  execRows.push([
    "TOTAL", filteredIssues.length, totalOpen, totalClosed,
    filteredIssues.length ? Math.round(totalClosed / filteredIssues.length * 100) + "%" : "",
    totalOrders, totalAvgRes, totalSla3d ? totalSla3d + "%" : "", "", "", ""
  ]);

  const wsExec = XLSX.utils.aoa_to_sheet(execRows);
  wsExec["!cols"] = [
    { wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
    { wch: 16 }, { wch: 18 }, { wch: 12 },
    { wch: 18 }, { wch: 25 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsExec, "Executive Summary");

  // ---- Sheet 2: Issue Detail ----
  const detailRows = [[
    "Client", "Update By", "Complain Date", "Solving Date", "Resolution Days",
    "Year", "Week", "Order Codes", "Order Count",
    "Issue Site", "Category", "Details", "Root Cause",
    "Short Term Solution", "Long Term Solution", "Status", "Notes"
  ]];
  filteredIssues.forEach(i => {
    const codes = toOrderCodesArray(i);
    const resDays = (i.resolutionDays != null)
      ? i.resolutionDays
      : (i.status === "Close" && i.complainDate && i.solvingDate)
        ? Math.max(0, daysBetween(i.complainDate, i.solvingDate))
        : "";
    detailRows.push([
      i.client || "", i.updateBy || "",
      toDateStr(i.complainDate), toDateStr(i.solvingDate), resDays,
      i.years || "", i.week || "",
      codes.join("; "), codes.length,
      i.issueSite || "", i.categoriComplain || "",
      i.detailsComplain || "", i.rootCause || "",
      i.shortTermSolution || "", i.longTermSolution || "",
      i.status || "", i.notes || ""
    ]);
  });
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [
    { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 6 }, { wch: 6 }, { wch: 30 }, { wch: 10 },
    { wch: 14 }, { wch: 25 }, { wch: 40 }, { wch: 40 },
    { wch: 40 }, { wch: 40 }, { wch: 8 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Issue Detail");

  // ---- Sheet 3: By Site ----
  const siteRows = [["Issue Site", "Total", "Open", "Closed", "Close Rate %", "Orders Impacted", "Avg Resolution (days)"]];
  const bySite = {};
  filteredIssues.forEach(i => {
    const s = i.issueSite || "Unknown";
    if (!bySite[s]) bySite[s] = { total: 0, open: 0, close: 0, orders: 0, days: [] };
    bySite[s].total++;
    if (i.status === "Open") bySite[s].open++;
    if (i.status === "Close") bySite[s].close++;
    bySite[s].orders += toOrderCodesArray(i).length;
    if (i.status === "Close" && i.complainDate && i.solvingDate) {
      bySite[s].days.push(i.resolutionDays != null ? i.resolutionDays : Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
    }
  });
  Object.entries(bySite).sort((a, b) => b[1].total - a[1].total).forEach(([site, v]) => {
    const avg = v.days.length ? Math.round(v.days.reduce((a, b) => a + b, 0) / v.days.length) : "";
    siteRows.push([site, v.total, v.open, v.close, v.total ? Math.round(v.close / v.total * 100) + "%" : "", v.orders, avg]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(siteRows), "By Site");

  // ---- Sheet 4: By Category ----
  const catRows = [["Category", "Total", "Open", "Closed", "Close Rate %", "Orders Impacted", "Avg Resolution (days)"]];
  const byCat = {};
  filteredIssues.forEach(i => {
    const c = i.categoriComplain || "Unknown";
    if (!byCat[c]) byCat[c] = { total: 0, open: 0, close: 0, orders: 0, days: [] };
    byCat[c].total++;
    if (i.status === "Open") byCat[c].open++;
    if (i.status === "Close") byCat[c].close++;
    byCat[c].orders += toOrderCodesArray(i).length;
    if (i.status === "Close" && i.complainDate && i.solvingDate) {
      byCat[c].days.push(i.resolutionDays != null ? i.resolutionDays : Math.max(0, daysBetween(i.complainDate, i.solvingDate)));
    }
  });
  Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).forEach(([cat, v]) => {
    const avg = v.days.length ? Math.round(v.days.reduce((a, b) => a + b, 0) / v.days.length) : "";
    catRows.push([cat, v.total, v.open, v.close, v.total ? Math.round(v.close / v.total * 100) + "%" : "", v.orders, avg]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), "By Category");

  // ---- Sheet 5: Top Root Causes ----
  const rcMap = {};
  filteredIssues.filter(i => i.rootCause?.trim()).forEach(i => {
    const rc = i.rootCause.trim();
    if (!rcMap[rc]) rcMap[rc] = { count: 0, clients: new Set(), sites: new Set() };
    rcMap[rc].count++;
    if (i.client) rcMap[rc].clients.add(i.client);
    if (i.issueSite) rcMap[rc].sites.add(i.issueSite);
  });
  const rcRows = [["Root Cause", "Occurrences", "Affected Clients", "Issue Sites"]];
  Object.entries(rcMap).sort((a, b) => b[1].count - a[1].count).slice(0, 30).forEach(([rc, v]) => {
    rcRows.push([rc, v.count, [...v.clients].join(", "), [...v.sites].join(", ")]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rcRows), "Top Root Causes");

  // ---- Sheet 6: SLA ----
  const slaBuckets = { "Same day (0d)": 0, "1 day": 0, "2-3 days": 0, "4-7 days": 0, "8-14 days": 0, "15-30 days": 0, ">30 days": 0 };
  allResDays.forEach(d => {
    if (d === 0) slaBuckets["Same day (0d)"]++;
    else if (d === 1) slaBuckets["1 day"]++;
    else if (d <= 3) slaBuckets["2-3 days"]++;
    else if (d <= 7) slaBuckets["4-7 days"]++;
    else if (d <= 14) slaBuckets["8-14 days"]++;
    else if (d <= 30) slaBuckets["15-30 days"]++;
    else slaBuckets[">30 days"]++;
  });
  const slaRows = [["Resolution Time Bucket", "Count", "% of Closed"]];
  Object.entries(slaBuckets).forEach(([bucket, count]) => {
    slaRows.push([bucket, count, allResDays.length ? Math.round(count / allResDays.length * 100) + "%" : ""]);
  });
  slaRows.push([]);
  slaRows.push(["Summary"]);
  slaRows.push(["Total closed issues", allResDays.length]);
  slaRows.push(["Average resolution (days)", totalAvgRes]);
  slaRows.push(["Median resolution (days)", allResDays.length ? median(allResDays) : ""]);
  slaRows.push(["SLA <= 3 days", totalSla3d ? totalSla3d + "%" : ""]);
  slaRows.push(["SLA <= 7 days", allResDays.length ? Math.round(allResDays.filter(d => d <= 7).length / allResDays.length * 100) + "%" : ""]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(slaRows), "SLA");

  // ---- Sheet 7: Weekly Trend ----
  const byWeek = {};
  filteredIssues.forEach(i => {
    if (!i.years || !i.week) return;
    const key = `${i.years}-W${String(i.week).padStart(2, "0")}`;
    if (!byWeek[key]) byWeek[key] = { total: 0, open: 0, close: 0, orders: 0 };
    byWeek[key].total++;
    if (i.status === "Open") byWeek[key].open++;
    if (i.status === "Close") byWeek[key].close++;
    byWeek[key].orders += toOrderCodesArray(i).length;
  });
  const trendRows = [["Week", "Total Issues", "Open", "Closed", "Orders Impacted"]];
  Object.keys(byWeek).sort().forEach(wk => {
    const v = byWeek[wk];
    trendRows.push([wk, v.total, v.open, v.close, v.orders]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trendRows), "Weekly Trend");

  const filename = `Flow_MBR_${today()}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast(`MBR exported: ${filename} (${clientNames.length} clients, 7 sheets)`, "success");
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ============================================================
// IMPORT — bulletproof with interactive column mapper (v3.9.3)
//
// Flow:
//   1. User picks an Excel file.
//   2. We parse the first sheet (or let them pick if multiple).
//   3. We auto-detect column mappings using a *very* permissive
//      normalized fuzzy match against an aliases list (English,
//      Indonesian, common spellings, abbreviations).
//   4. We show a PREVIEW MODAL with:
//        - the column-mapping table (lets the user fix any mis-detected
//          column via dropdowns)
//        - the first 10 rows so they can sanity-check
//        - the count of rows that will be imported + skipped reasons
//   5. Only on explicit "Import N rows" click do we actually write.
//   6. Final toast + a downloadable error log if anything failed.
// ============================================================

// Fields that the app stores per issue, with all the aliases we've
// seen in real-world spreadsheets (English, Indonesian, abbreviations,
// underscores, dashes — the matcher normalizes whitespace so case &
// punctuation don't matter).
const ISSUE_FIELD_DEFS = [
  { key: "updateBy",          label: "Update By (PIC)",        required: true,
    aliases: ["update by", "updated by", "update_by", "updateby", "pic", "p i c", "pic ss", "ss pic", "sales support pic", "petugas", "input by", "logged by", "owner", "responsible"] },
  { key: "client",            label: "Client",                  required: true,
    aliases: ["client", "client name", "customer", "customer name", "klien", "nama client", "nama klien"] },
  { key: "complainDate",      label: "Complain Date",           required: true,
    aliases: ["complain date", "complaint date", "tanggal complain", "tanggal komplain", "tgl complain", "tgl komplain", "tgl", "date", "tanggal", "report date", "tanggal lapor"] },
  { key: "solvingDate",       label: "Solving Date",            required: false,
    aliases: ["solving date", "solved date", "solve date", "resolve date", "resolved date", "closed date", "close date", "tanggal solving", "tanggal selesai", "tgl selesai", "tgl solving"] },
  { key: "years",             label: "Year",                    required: false,
    aliases: ["years", "year", "tahun"] },
  { key: "week",              label: "Week",                    required: false,
    aliases: ["week", "wk", "minggu", "weeknum", "week num", "week number"] },
  { key: "orderCode",         label: "Order Code(s)",           required: false,
    aliases: ["order code", "orders code", "order codes", "ordercode", "order id", "order_id", "no order", "no pesanan", "nomor pesanan", "awb", "resi", "tracking", "tracking number"] },
  { key: "issueSite",         label: "Issue Site",              required: false,
    aliases: ["issue site", "site", "issue location", "location", "department site", "site issue", "lokasi", "lokasi issue", "where"] },
  { key: "categoriComplain",  label: "Category Complain",       required: true,
    aliases: ["categori complain", "category complain", "category complaint", "category", "kategori complain", "kategori komplain", "kategori", "type", "issue type", "tipe", "tipe complain", "tipe komplain"] },
  { key: "detailsComplain",   label: "Details / Description",   required: false,
    aliases: ["details complain", "detail complain", "details", "detail", "description", "deskripsi", "keterangan", "complaint detail", "complain detail", "issue", "issue description", "problem", "permasalahan"] },
  { key: "rootCause",         label: "Root Cause",              required: false,
    aliases: ["root cause", "rootcause", "cause", "akar masalah", "penyebab", "why"] },
  { key: "shortTermSolution", label: "Short Term Solution",     required: false,
    aliases: ["short term solution", "short terms solution", "short term", "short_term_solution", "shortterm", "immediate fix", "tindakan cepat", "tindakan sementara", "solusi cepat", "solusi short term", "solusi sementara", "tindakan", "resolution", "quick fix", "immediate action"] },
  { key: "longTermSolution",  label: "Long Term Solution",      required: false,
    aliases: ["long term solution", "long terms solution", "long term", "long_term_solution", "longterm", "permanent fix", "tindakan permanen", "solusi long term", "solusi permanen", "preventive", "preventive action", "pencegahan", "improvement", "long term action"] },
  { key: "status",            label: "Status",                  required: false,
    aliases: ["status", "state", "kondisi", "stat", "progress", "open close", "resolved"] },
  { key: "notes",             label: "Notes",                   required: false,
    aliases: ["notes", "note", "remarks", "remark", "catatan", "comment", "comments", "memo", "info", "keterangan tambahan"] }
];

// State for the in-flight import (set during file pick, cleared on close)
let _importState = null;

function _normalizeHeader(s) {
  return String(s || "")
    // Strip BOM, zero-width, non-breaking space, narrow no-break,
    // and other exotic whitespace that often sneaks in when sheets are
    // exported from Google Sheets / copied between tools. Without this,
    // a header "Notes\u00A0" looks different from "Notes" and the
    // exact-match lookup fails silently.
    .replace(/[\uFEFF\u200B-\u200D\u2060\u00A0\u202F\u2028\u2029]/g, " ")
    .toLowerCase()
    .replace(/[_\-/.()*?!:;,'"`\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Try to auto-detect each field's column by matching aliases. */
function _autoMapColumns(headers) {
  const normHeaders = headers.map(_normalizeHeader);
  // Helpful diagnostic when something doesn't auto-match — open the
  // browser console while importing and you'll see exactly what the
  // parser saw vs. what it was trying to match.
  console.log("[Issue Import] Normalized headers from your file:", normHeaders);
  const map = {};
  for (const def of ISSUE_FIELD_DEFS) {
    let found = -1;
    for (const alias of def.aliases) {
      const target = _normalizeHeader(alias);
      const i = normHeaders.indexOf(target);
      if (i >= 0) { found = i; break; }
      // also accept "contains" matches when alias is multi-word (e.g.
      // header "Categori Complain (System)" → matches "categori complain")
      const j = normHeaders.findIndex(h => h.includes(target));
      if (j >= 0 && found === -1) { found = j; break; }
    }
    map[def.key] = found;
  }
  return map;
}

async function importExcel(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    if (!wb.SheetNames.length) {
      toast("Empty workbook", "error");
      e.target.value = ""; return;
    }
    // Pick the first sheet by default — show a sheet picker if there
    // are multiple (so people don't accidentally import the wrong tab).
    let sheetName = wb.SheetNames[0];
    if (wb.SheetNames.length > 1) {
      const picks = wb.SheetNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
      const ans = prompt(`This workbook has ${wb.SheetNames.length} sheets:\n${picks}\n\nWhich sheet number to import? (default 1)`);
      const n = parseInt(ans, 10);
      if (n >= 1 && n <= wb.SheetNames.length) sheetName = wb.SheetNames[n - 1];
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (rows.length < 2) {
      toast(`Sheet "${sheetName}" has no data rows`, "error");
      e.target.value = ""; return;
    }
    // Find the header row: most sheets put it at row 0, but some have
    // a title row above. We scan the first 5 rows and pick the one
    // with the most cells that look like field labels.
    let headerRowIdx = 0;
    let bestScore = -1;
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const score = (rows[r] || []).filter(c => String(c).trim().length > 0).length;
      if (score > bestScore) { bestScore = score; headerRowIdx = r; }
    }
    const headers = rows[headerRowIdx].map(h => String(h));
    const bodyRows = rows.slice(headerRowIdx + 1).filter(r => r.some(c => String(c).trim() !== ""));

    const mapping = _autoMapColumns(headers);
    _importState = { file, sheetName, headers, bodyRows, mapping };
    _renderImportPreview();
  } catch (err) {
    console.error(err);
    toast("Could not read the file: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
}

function _renderImportPreview() {
  const st = _importState;
  if (!st) return;
  // Build the modal lazily — inject if not present
  if (!document.getElementById("issueImportModal")) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="issueImportModal" class="modal hidden">
        <div class="modalBox" style="max-width:920px">
          <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close" data-close-import>×</button></div>
          <h2>Import Daily Issues — Preview</h2>
          <p class="small" id="iiSummary" style="margin:0 0 10px"></p>

          <h3 style="margin:12px 0 6px;font-size:14px">Column Mapping</h3>
          <p class="small" style="margin:0 0 8px;color:var(--muted)">We auto-detected these columns. Use the dropdowns to fix any wrong matches. Required fields are marked *.</p>
          <div class="tableWrap" style="max-height:280px;overflow:auto">
            <table id="iiMappingTable" style="width:100%">
              <thead><tr><th>Field</th><th>Source column from your file</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>

          <h3 style="margin:18px 0 6px;font-size:14px">First 10 rows (preview)</h3>
          <div class="tableWrap" style="max-height:280px;overflow:auto">
            <table id="iiPreviewTable" style="width:100%;font-size:12px"></table>
          </div>

          <div id="iiValidation" class="output" style="margin-top:12px"></div>

          <div class="btns" style="justify-content:flex-end;margin-top:14px">
            <button class="secondary" data-close-import>Cancel</button>
            <button class="primary" id="iiConfirmImport">Import rows</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    document.querySelectorAll("[data-close-import]").forEach(b => {
      b.addEventListener("click", _closeImportPreview);
    });
    document.getElementById("iiConfirmImport").addEventListener("click", _runImport);
  }

  // --- Mapping table ---------------------------------------------------
  const mapTbody = document.querySelector("#iiMappingTable tbody");
  const optionsHtml = `<option value="-1">— Not in file —</option>` +
    st.headers.map((h, i) => `<option value="${i}">${esc(h || `(column ${i + 1})`)}</option>`).join("");
  mapTbody.innerHTML = ISSUE_FIELD_DEFS.map(def => {
    const cur = st.mapping[def.key];
    return `<tr>
      <td><b>${esc(def.label)}</b>${def.required ? ' <span style="color:#dc2626">*</span>' : ''}</td>
      <td>
        <select data-field="${def.key}" style="width:100%">
          ${optionsHtml.replace(`value="${cur}"`, `value="${cur}" selected`)}
        </select>
      </td>
    </tr>`;
  }).join("");
  mapTbody.querySelectorAll("select[data-field]").forEach(sel => {
    sel.addEventListener("change", () => {
      st.mapping[sel.dataset.field] = parseInt(sel.value, 10);
      _renderImportValidation();
      // If the user remapped a date column, re-render the preview table
      // so the date formatting follows the new mapping.
      if (sel.dataset.field === "complainDate" || sel.dataset.field === "solvingDate") {
        _renderImportPreview();
      }
    });
  });

  // --- Preview table ---------------------------------------------------
  // For columns the user has mapped to date fields, render the cell as
  // a real date (parseDate already handles Excel serials, ISO, and the
  // common dd/mm/yyyy + dd-Mmm-yyyy variants). Without this, Excel's
  // raw serial numbers like 45320 are confusing in the preview even
  // though the actual import converts them correctly.
  const dateColIndexes = new Set([
    st.mapping.complainDate,
    st.mapping.solvingDate
  ].filter(i => i >= 0));

  const fmtCell = (val, colIdx) => {
    if (dateColIndexes.has(colIdx)) {
      const parsed = parseDate(val);
      if (parsed) {
        // Show the parsed ISO date + the raw value in muted gray so the
        // user can see both what we'll save AND what's in their file.
        return `${esc(parsed)} <span class="small" style="color:var(--muted)">(${esc(String(val ?? ""))})</span>`;
      }
    }
    return esc(String(val ?? ""));
  };

  const previewN = Math.min(10, st.bodyRows.length);
  const previewHead = `<thead><tr>${st.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
  const previewBody = `<tbody>${
    st.bodyRows.slice(0, previewN).map(r =>
      `<tr>${st.headers.map((_, i) => `<td>${fmtCell(r[i], i)}</td>`).join("")}</tr>`
    ).join("")
  }</tbody>`;
  document.getElementById("iiPreviewTable").innerHTML = previewHead + previewBody;

  document.getElementById("iiSummary").innerHTML =
    `<b>File:</b> ${esc(st.file.name)} · <b>Sheet:</b> ${esc(st.sheetName)} · <b>${st.bodyRows.length}</b> data rows · <b>${st.headers.length}</b> columns detected.`;

  _renderImportValidation();
  document.getElementById("issueImportModal").classList.remove("hidden");
}

function _renderImportValidation() {
  const st = _importState;
  if (!st) return;
  const missing = ISSUE_FIELD_DEFS.filter(d => d.required && st.mapping[d.key] < 0);
  const box = document.getElementById("iiValidation");
  const btn = document.getElementById("iiConfirmImport");
  if (missing.length) {
    box.innerHTML = `Cannot import yet — required field${missing.length > 1 ? "s" : ""} not mapped: <b>${missing.map(m => esc(m.label)).join(", ")}</b>. Pick the matching source column above, or click Cancel.`;
    box.style.background = "#fee2e2"; box.style.color = "#7f1d1d";
    btn.disabled = true; btn.style.opacity = ".5";
  } else {
    // Estimate how many rows will be skipped (missing complainDate is the killer)
    const cdIdx = st.mapping.complainDate;
    let willImport = 0, willSkip = 0;
    for (const r of st.bodyRows) {
      if (parseDate(r[cdIdx])) willImport++;
      else willSkip++;
    }
    box.innerHTML = `Ready to import <b>${willImport}</b> rows.${willSkip ? ` <span style="color:#78350f">(${willSkip} will be skipped — missing or invalid Complain Date.)</span>` : ""}`;
    box.style.background = "#dcfce7"; box.style.color = "#14532d";
    btn.disabled = false; btn.style.opacity = "1";
    btn.textContent = `Import ${willImport} rows`;
  }
}

function _closeImportPreview() {
  const m = document.getElementById("issueImportModal");
  if (m) m.classList.add("hidden");
  _importState = null;
}

async function _runImport() {
  const st = _importState;
  if (!st) return;
  // Re-check required mappings (defensive)
  for (const def of ISSUE_FIELD_DEFS) {
    if (def.required && st.mapping[def.key] < 0) {
      toast(`Required field not mapped: ${def.label}`, "error");
      return;
    }
  }
  const btn = document.getElementById("iiConfirmImport");
  btn.disabled = true; btn.textContent = "Importing…";

  let ok = 0, skipped = 0;
  const errors = [];
  for (let i = 0; i < st.bodyRows.length; i++) {
    const row = st.bodyRows[i];
    const get = (key) => st.mapping[key] >= 0 ? row[st.mapping[key]] : "";
    const complainDate = parseDate(get("complainDate"));
    if (!complainDate) { skipped++; continue; }
    const orderCodeRaw = String(get("orderCode") || "").trim();
    const orderCodes = orderCodeRaw.split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean);
    const cDate = new Date(complainDate);
    // Always recalculate years/week from complainDate — trusting file
    // values caused wrong trend charts when they didn't match.
    const solvingDate = parseDate(get("solvingDate")) || null;
    const resolutionDays = (complainDate && solvingDate)
      ? Math.max(0, Math.round((new Date(solvingDate) - cDate) / 86400000))
      : null;
    const doc = {
      updateBy: String(get("updateBy") || "").trim(),
      complainDate,
      solvingDate,
      years: cDate.getFullYear(),
      week: getISOWeek(cDate),
      resolutionDays,
      client: String(get("client") || "").trim(),
      orderCodes,
      orderCode: orderCodes.join(", "),
      orderCount: orderCodes.length,
      issueSite: String(get("issueSite") || "").trim(),
      categoriComplain: String(get("categoriComplain") || "").trim(),
      detailsComplain: String(get("detailsComplain") || "").trim(),
      rootCause: String(get("rootCause") || "").trim(),
      shortTermSolution: String(get("shortTermSolution") || "").trim(),
      longTermSolution: String(get("longTermSolution") || "").trim(),
      status: normalizeStatus(get("status")),
      notes: String(get("notes") || "").trim()
    };
    try {
      await addDocument(COL.ISSUES, doc);
      ok++;
      // Periodic UI update so the user sees progress on big imports
      if (i % 50 === 0) {
        btn.textContent = `Importing… ${ok}/${st.bodyRows.length}`;
        await new Promise(r => setTimeout(r, 0));
      }
    } catch (e) {
      skipped++;
      if (errors.length < 10) errors.push(`Row ${i + 2}: ${e.message}`);
    }
  }

  _closeImportPreview();
  if (errors.length) {
    console.warn("Import errors (first 10):\n" + errors.join("\n"));
  }
  toast(`Imported ${ok} rows · ${skipped} skipped${errors.length ? ` · ${errors.length} errors (see console)` : ""}`, "success");
}

function parseDate(v) {
  if (!v) return "";
  if (typeof v === "number") {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Excel serial-as-string — CSV exports and Text-typed cells deliver
  // dates as strings of digits ("45320") instead of numbers. Without
  // this branch they fall through to new Date(s) and JS produces a
  // bogus "+045320-01" (year 45320). Bound to 5-digit serials in the
  // plausible date range (40000 ≈ 2009, 100000 ≈ 2173) so we don't
  // accidentally treat lone years like "2024" as serials.
  if (/^\d{5}$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 40000 && n < 100000) {
      const d = new Date((n - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
  }
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const mo = months[m[2].toLowerCase()];
    if (mo !== undefined) {
      const d = new Date(Number(m[3]), mo, Number(m[1]));
      return d.toISOString().slice(0, 10);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2,"0")}-${m2[1].padStart(2,"0")}`;
  // Guard: any 5+ digit string that wasn't recognized as a serial
  // above shouldn't be coerced by new Date() into a year-N date
  // (e.g. "39999" → year 39999, "100000" → year 100000). We preserve
  // "2024" → 2024-01-01 since 4-digit-year ISO parsing is well-defined.
  if (/^\d{5,}$/.test(s)) return "";
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return "";
}

function normalizeStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "close" || s === "closed" || s === "resolved" || s === "done") return "Close";
  return "Open";
}

// ============================================================
// Dashboard summary export
// ============================================================
export function getIssuesSummary() {
  return {
    total: allIssues.length,
    open: allIssues.filter(i => i.status === "Open").length,
    critical: allIssues.filter(i => i.status === "Open" && i.issueSite === "Outbound").length,
    latest: allIssues.slice(0, 5)
  };
}
