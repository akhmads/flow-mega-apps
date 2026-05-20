// ============================================================
// FLOW Mega Apps — Dashboard (v3.5 personalized)
//
// Greets the logged-in user by name with a time-aware message.
// Shows "My Action Items" front-and-center: tickets assigned to
// you that need acknowledgement + your open tasks. Quick buttons
// to acknowledge (Open → In Progress) and resolve (→ Resolved).
//
// Global KPIs + latest activity remain below for context.
// ============================================================

import { COL, subscribeCollection, updateDocument, orderBy } from "../firebase.js";
import {
  $, esc, friendlyDate, toDateStr, badgeClass, today, dateRange, toast
} from "../utils.js";
import { getCurrentEmail, getCurrentProfile } from "../roles.js";

let unsubIssues = null, unsubTickets = null, unsubTasksSales = null, unsubTasksSS = null;
let latestIssues = [], latestTickets = [], tasksSales = [], tasksSS = [];

export function initDashboard() {
  if (unsubIssues) unsubIssues();
  if (unsubTickets) unsubTickets();
  if (unsubTasksSales) unsubTasksSales();
  if (unsubTasksSS) unsubTasksSS();

  applyRangePreset("thisWeek");

  $("dashRange").onchange = () => {
    const v = $("dashRange").value;
    if (v !== "custom") applyRangePreset(v);
    render();
  };
  $("dashFrom").onchange = render;
  $("dashTo").onchange = render;

  unsubIssues = subscribeCollection(COL.ISSUES, rows => {
    latestIssues = rows.sort((a, b) => (b.complainDate || "").localeCompare(a.complainDate || ""));
    render();
  }, orderBy("complainDate", "desc"));

  unsubTickets = subscribeCollection(COL.TICKETS, rows => {
    latestTickets = rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    render();
  }, orderBy("createdAt", "desc"));

  unsubTasksSales = subscribeCollection(COL.TASKS_SALES, rows => {
    tasksSales = rows;
    render();
  });

  unsubTasksSS = subscribeCollection(COL.TASKS_SS, rows => {
    tasksSS = rows;
    render();
  });

  renderGreeting();
  setTodayPill();
}

// ============================================================
// Personalized greeting — time-aware (Indonesian time)
// ============================================================
function renderGreeting() {
  const el = $("dashGreeting");
  if (!el) return;
  const me = getCurrentProfile();
  const name = me?.name || (getCurrentEmail()?.split("@")[0] || "there");
  const hour = new Date().getHours();
  let salute = "Hello";
  let icon = "👋";
  if (hour < 11) { salute = "Selamat pagi"; icon = "☀️"; }
  else if (hour < 15) { salute = "Selamat siang"; icon = "🌤️"; }
  else if (hour < 18) { salute = "Selamat sore"; icon = "🌅"; }
  else { salute = "Selamat malam"; icon = "🌙"; }

  el.innerHTML = `
    <div class="greetTop">
      <span class="greetIcon">${icon}</span>
      <div>
        <h2 class="greetHello">${salute}, ${esc(name)}!</h2>
        <p class="greetSub">${getMotivation()}</p>
      </div>
    </div>
  `;
}

function getMotivation() {
  // A few rotating one-liners — Bryan likes ambition + clean execution
  const lines = [
    "Let's make today count. ⚡",
    "Move fast, fix things. 🚀",
    "Build the systems Flow needs to scale.",
    "Excellence is daily discipline.",
    "Speed is a competitive advantage.",
    "Small steps, compounded daily."
  ];
  return lines[new Date().getDate() % lines.length];
}

// ============================================================
// Date range filter helpers
// ============================================================
function applyRangePreset(preset) {
  if (preset === "all") {
    $("dashFrom").value = "";
    $("dashTo").value = "";
    return;
  }
  const r = dateRange(preset);
  $("dashFrom").value = r.from || "";
  $("dashTo").value = r.to || "";
}

function inRange(dateStr) {
  if (!dateStr) return false;
  const from = $("dashFrom").value;
  const to = $("dashTo").value;
  if (!from && !to) return true;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function setTodayPill() {
  const el = $("todayPill");
  if (el) el.textContent = friendlyDate(today());
}

// ============================================================
// Render
// ============================================================
function render() {
  renderMyActionItems();

  // Global KPIs (filtered by date range)
  const filteredIssues = latestIssues.filter(i => inRange(toDateStr(i.complainDate)));
  const filteredTickets = latestTickets.filter(t => inRange(toDateStr(t.createdAt)));
  const filteredTasks = [...tasksSales, ...tasksSS].filter(r => inRange(toDateStr(r.date)));

  const open = filteredIssues.filter(i => i.status === "Open").length;
  const critical = filteredIssues.filter(i => i.status === "Open" && i.issueSite === "Outbound").length;
  const openTickets = filteredTickets.filter(t => t.status === "Open" || t.status === "In Progress").length;
  const tasksInRange = filteredTasks.length;

  $("kpiOpenIssues").textContent = open;
  $("kpiCritical").textContent = critical;
  $("kpiOpenTickets").textContent = openTickets;
  $("kpiTasksToday").textContent = tasksInRange;

  // Make the KPI tiles clickable so users can drill into the underlying
  // list. Each tile navigates to its module AND pre-applies the matching
  // filter — e.g. "Open Issues" deep-links into Daily Issue Tracker with
  // status=Open, range=All time. We wire this once per render (cheap)
  // and use _wired so we don't double-bind.
  wireKpiClick("kpiOpenIssues",  "dailyIssue",      { fltStatus: "Open",     fltRange: "all" });
  wireKpiClick("kpiCritical",    "dailyIssue",      { fltStatus: "Open", fltIssueSite: "Outbound", fltRange: "all" });
  wireKpiClick("kpiOpenTickets", "ticketing",       { tktStatus: "Open" });
  // Tasks tile → wherever the current user can go (Sales/SS Daily Tracker)
  wireKpiClick("kpiTasksToday",  pickTaskTrackerTarget(), {});

  // Latest issues
  const issuesList = $("dashIssuesList");
  if (!filteredIssues.length) {
    issuesList.innerHTML = '<span class="small">No issues in this range.</span>';
  } else {
    issuesList.innerHTML = filteredIssues.slice(0, 5).map(i => `
      <div class="dashRow" data-openissue="${esc(i.id)}" role="button" tabindex="0" title="Open in Daily Issue Tracker"
           style="padding:10px 0;border-bottom:1px solid rgba(124,58,237,.08);cursor:pointer;transition:background .15s">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(i.client)}</b> · ${esc(friendlyDate(i.complainDate))} · <span class="small">${esc(i.updateBy || "")}</span></div>
          <div>
            <span class="${badgeClass(i.issueSite)}">${esc(i.issueSite || "")}</span>
            <span class="${badgeClass(i.status === "Close" ? "resolved" : "open")}">${esc(i.status)}</span>
          </div>
        </div>
        <div class="small" style="margin-top:4px">${esc((i.categoriComplain || "") + " · " + (i.detailsComplain || "")).slice(0, 140)}</div>
      </div>
    `).join("");
    issuesList.querySelectorAll("[data-openissue]").forEach(row => {
      row.addEventListener("click", () => navigateAndOpen("dailyIssue", row.dataset.openissue));
      row.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateAndOpen("dailyIssue", row.dataset.openissue); }
      });
      row.addEventListener("mouseenter", () => row.style.background = "rgba(124,58,237,.06)");
      row.addEventListener("mouseleave", () => row.style.background = "");
    });
  }

  // Latest tickets
  const ticketsList = $("dashTicketsList");
  if (!filteredTickets.length) {
    ticketsList.innerHTML = '<span class="small">No tickets in this range.</span>';
  } else {
    ticketsList.innerHTML = filteredTickets.slice(0, 5).map(t => `
      <div class="dashRow" data-openticket="${esc(t.id)}" role="button" tabindex="0" title="Open in Internal Tickets"
           style="padding:10px 0;border-bottom:1px solid rgba(124,58,237,.08);cursor:pointer;transition:background .15s">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(t.number || "—")}</b> · ${esc(t.dept || "")}</div>
          <div>
            <span class="${badgeClass(t.priority)}">${esc(t.priority)}</span>
            <span class="${badgeClass(t.status)}">${esc(t.status)}</span>
          </div>
        </div>
        <div class="small" style="margin-top:4px"><b>${esc(t.subject)}</b> · ${esc((t.description || "").slice(0, 100))}</div>
      </div>
    `).join("");
    ticketsList.querySelectorAll("[data-openticket]").forEach(row => {
      row.addEventListener("click", () => navigateAndOpen("ticketing", row.dataset.openticket));
      row.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateAndOpen("ticketing", row.dataset.openticket); }
      });
      row.addEventListener("mouseenter", () => row.style.background = "rgba(124,58,237,.06)");
      row.addEventListener("mouseleave", () => row.style.background = "");
    });
  }
}

// ----- KPI tile / row click helpers -----------------------------------

/** Wire a KPI tile to navigate to a target module with pre-applied filters.
 *  Idempotent — uses _wired so re-renders don't add duplicate listeners. */
function wireKpiClick(tileNumberId, targetMenu, filters) {
  const numEl = document.getElementById(tileNumberId);
  if (!numEl) return;
  const tile = numEl.closest(".kpi");
  if (!tile || tile._wired) {
    if (tile) tile._filters = filters; // refresh filter for the same listener
    return;
  }
  tile._wired = true;
  tile._filters = filters;
  tile.style.cursor = "pointer";
  tile.setAttribute("role", "button");
  tile.setAttribute("tabindex", "0");
  tile.title = `Open ${targetMenu}`;
  const go = () => {
    // Read the CURRENT filters from the live tile so the same listener
    // adapts if the wiring changes later.
    window.__pendingNavAction = { filters: tile._filters || {} };
    const navBtn = document.querySelector(`.nav button[data-menu="${targetMenu}"]`);
    if (navBtn) navBtn.click();
  };
  tile.addEventListener("click", go);
  tile.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });
  // subtle hover state
  tile.addEventListener("mouseenter", () => tile.style.transform = "translateY(-2px)");
  tile.addEventListener("mouseleave", () => tile.style.transform = "");
}

/** Navigate to a module AND open a specific record by id. Target modules
 *  read window.__pendingNavAction on init and consume it. */
function navigateAndOpen(targetMenu, recordId) {
  window.__pendingNavAction = { openId: recordId };
  const navBtn = document.querySelector(`.nav button[data-menu="${targetMenu}"]`);
  if (navBtn) navBtn.click();
}

/** Pick the right Daily Tracker for the Tasks KPI tile. Sales users get
 *  the Sales tracker, SS users get the SS tracker, admins/supervisors
 *  default to whichever they can see. Falls back gracefully. */
function pickTaskTrackerTarget() {
  const me = getCurrentProfile();
  const dept = (me?.department || "").toLowerCase();
  if (dept.includes("sales support")) return "dailyTrackerSS";
  if (dept === "sales") return "dailyTrackerSales";
  // Admin/supervisor: pick whichever button is visible (in nav order)
  const salesVisible = !document.querySelector('.nav button[data-menu="dailyTrackerSales"]')?.classList.contains("hidden");
  return salesVisible ? "dailyTrackerSales" : "dailyTrackerSS";
}

// ============================================================
// MY ACTION ITEMS — tickets assigned to me + tasks where I'm the person
// ============================================================
function renderMyActionItems() {
  const el = $("myActionItems");
  if (!el) return;
  const me = getCurrentProfile();
  if (!me) {
    el.innerHTML = '';
    return;
  }
  const myName = me.name || me.email;
  const myEmail = me.email;

  // Tickets assigned to me — Open or In Progress only (the actionable ones)
  const myTickets = latestTickets.filter(t =>
    (t.assignee === myName || t.assignee === myEmail) &&
    (t.status === "Open" || t.status === "In Progress" || t.status === "Waiting"));

  // Tasks where I'm the person and status is open
  const myTasks = [...tasksSales, ...tasksSS].filter(r =>
    (r.person === myName || r.person === myEmail) &&
    r.status !== "Done" && r.status !== "Hold");

  if (!myTickets.length && !myTasks.length) {
    el.innerHTML = `
      <div class="actEmpty">
        <span style="font-size:32px">🎉</span>
        <div>
          <b>You're all clear!</b>
          <p class="small">No open tickets or tasks assigned to you right now.</p>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    ${myTickets.length ? `
      <div class="actSection">
        <div class="actSectionHeader">
          <b>🎫 My Tickets</b>
          <span class="actCount">${myTickets.length}</span>
        </div>
        ${myTickets.map(renderTicketRow).join("")}
      </div>` : ""}
    ${myTasks.length ? `
      <div class="actSection">
        <div class="actSectionHeader">
          <b>📋 My Open Tasks</b>
          <span class="actCount">${myTasks.length}</span>
        </div>
        ${myTasks.slice(0, 8).map(renderTaskRow).join("")}
        ${myTasks.length > 8 ? `<div class="small" style="text-align:center;color:var(--muted);padding:6px">+ ${myTasks.length - 8} more — see Daily Tracker</div>` : ""}
      </div>` : ""}
  `;

  // Wire up the quick action buttons
  el.querySelectorAll("[data-ackticket]").forEach(b =>
    b.addEventListener("click", () => updateTicketStatus(b.dataset.ackticket, "In Progress")));
  el.querySelectorAll("[data-resticket]").forEach(b =>
    b.addEventListener("click", () => updateTicketStatus(b.dataset.resticket, "Resolved")));
  el.querySelectorAll("[data-opentkt]").forEach(b =>
    b.addEventListener("click", () => {
      // Open the ticketing page focused on this ticket
      const navBtn = document.querySelector('.nav button[data-menu="ticketing"]');
      if (navBtn) navBtn.click();
    }));
}

function renderTicketRow(t) {
  const ageDays = t.createdAtMs ? Math.floor((Date.now() - t.createdAtMs) / 86400000) : 0;
  const ageBadge = ageDays === 0
    ? '<span class="actAge fresh">today</span>'
    : ageDays === 1
      ? '<span class="actAge ok">1 day</span>'
      : ageDays <= 3
        ? `<span class="actAge ok">${ageDays} days</span>`
        : `<span class="actAge stale">${ageDays} days</span>`;
  const statusBadge = `<span class="${badgeClass(t.status)}">${esc(t.status)}</span>`;
  const priorityBadge = `<span class="${badgeClass(t.priority)}">${esc(t.priority || "—")}</span>`;
  return `
    <div class="actItem">
      <div class="actMain">
        <div class="actTitle">
          <b>${esc(t.number || "—")}</b> ${priorityBadge} ${statusBadge} ${ageBadge}
        </div>
        <div class="actSubj"><b>${esc(t.subject || "")}</b></div>
        <div class="actMeta small">${esc(t.dept || "")} · from ${esc(t.requester || "—")}</div>
      </div>
      <div class="actActions">
        ${t.status === "Open"
          ? `<button class="primary iconBtn" data-ackticket="${t.id}" title="Acknowledge — set to In Progress">✓ Ack</button>`
          : ""}
        ${(t.status === "In Progress" || t.status === "Waiting")
          ? `<button class="primary iconBtn" data-resticket="${t.id}" title="Mark resolved">✓ Resolve</button>`
          : ""}
        <button class="secondary iconBtn" data-opentkt="${t.id}" title="Open in Ticketing">↗</button>
      </div>
    </div>
  `;
}

function renderTaskRow(t) {
  return `
    <div class="actItem">
      <div class="actMain">
        <div class="actSubj"><b>${esc(t.task || "(untitled task)")}</b></div>
        <div class="actMeta small">${esc(friendlyDate(t.date))} · <span class="${badgeClass(t.status)}">${esc(t.status)}</span></div>
      </div>
    </div>
  `;
}

async function updateTicketStatus(id, newStatus) {
  try {
    await updateDocument(COL.TICKETS, id, { status: newStatus });
    toast(`Ticket → ${newStatus}`, "success");
  } catch (e) {
    toast("Update failed: " + e.message, "error");
  }
}
