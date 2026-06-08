// ============================================================
// FLOW Mega Apps — Dashboard (v3.10 — department-tailored)
//
// Greets the logged-in user, then shows "My Action Items"
// (tickets + tasks assigned to you). Below that, the Overview
// KPIs and panels are TAILORED TO THE USER'S DEPARTMENT:
//
//   Sales Support → issue log + tickets
//   Operations    → inbound monitoring + tickets (no issue log)
//   Sales         → team tasks + tickets
//   General Affairs → team tasks + tickets (no issue log)
//   Admin         → org-wide view (everything)
//
// This way a GA user never sees an irrelevant "Open Issues" tile.
// ============================================================

import { COL, subscribeCollection, updateDocument, orderBy } from "../firebase.js";
import {
  $, esc, friendlyDate, toDateStr, badgeClass, today, toast
} from "../utils.js";
import { getCurrentEmail, getCurrentProfile, isAdmin } from "../roles.js";
import { t } from "../i18n.js";

let unsubs = [];
let latestIssues = [], latestTickets = [], inbound = [];
let tasksSales = [], tasksSS = [], tasksOps = [], tasksGA = [];

export function initDashboard() {
  unsubs.forEach(u => { try { u(); } catch (e) {} });
  unsubs = [];

  applyRangePreset($("dashRange").value || "thisWeek");

  $("dashRange").onchange = () => {
    const v = $("dashRange").value;
    if (v !== "custom") applyRangePreset(v);
    render();
  };
  $("dashFrom").onchange = render;
  $("dashTo").onchange = render;

  unsubs.push(subscribeCollection(COL.ISSUES, rows => {
    latestIssues = rows.sort((a, b) => (b.complainDate || "").localeCompare(a.complainDate || ""));
    render();
  }, orderBy("complainDate", "desc")));

  unsubs.push(subscribeCollection(COL.TICKETS, rows => {
    latestTickets = rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    render();
  }, orderBy("createdAt", "desc")));

  unsubs.push(subscribeCollection(COL.INBOUND, rows => {
    inbound = rows.sort((a, b) => (b.reportDate || "").localeCompare(a.reportDate || ""));
    render();
  }));

  unsubs.push(subscribeCollection(COL.TASKS_SALES, rows => { tasksSales = rows; render(); }));
  unsubs.push(subscribeCollection(COL.TASKS_SS, rows => { tasksSS = rows; render(); }));
  unsubs.push(subscribeCollection(COL.TASKS_OPS, rows => { tasksOps = rows; render(); }));
  unsubs.push(subscribeCollection(COL.TASKS_GA, rows => { tasksGA = rows; render(); }));

  renderGreeting();
  setTodayPill();
}

// ============================================================
// DEPARTMENT MODE — drives which KPIs / panels are shown
// ============================================================
function dashMode() {
  if (isAdmin()) return "all";
  const dept = (getCurrentProfile()?.department || "").toLowerCase();
  if (dept === "sales support") return "ss";
  if (dept === "operations") return "ops";
  if (dept === "sales") return "sales";
  if (dept === "general affairs") return "ga";
  return "all";
}

/** The daily-tracker collection + nav target for the current department. */
function deptTracker(mode) {
  if (mode === "ss") return { tasks: tasksSS, menu: "dailyTrackerSS", label: "Sales Support" };
  if (mode === "sales") return { tasks: tasksSales, menu: "dailyTrackerSales", label: "Sales" };
  if (mode === "ga") return { tasks: tasksGA, menu: "dailyTrackerGA", label: "General Affairs" };
  return { tasks: [], menu: null, label: "" };
}

const allTasks = () => [...tasksSales, ...tasksSS, ...tasksOps, ...tasksGA];

// ============================================================
// Personalized greeting — time-aware (Indonesian time)
// ============================================================
function renderGreeting() {
  const el = $("dashGreeting");
  if (!el) return;
  const me = getCurrentProfile();
  const name = me?.name || (getCurrentEmail()?.split("@")[0] || t("dash.greet.fallbackName"));
  const hour = new Date().getHours();
  let salute;
  if (hour < 11)      salute = t("dash.greet.morning");
  else if (hour < 15) salute = t("dash.greet.noon");
  else if (hour < 18) salute = t("dash.greet.afternoon");
  else                salute = t("dash.greet.evening");

  const dept = me?.department ? ` · ${esc(me.department)}` : "";
  el.innerHTML = `
    <div class="greetTop">
      <div>
        <h2 class="greetHello">${esc(salute)}, ${esc(name)}!</h2>
        <p class="greetSub">${esc(getMotivation())}${dept}</p>
      </div>
    </div>
  `;
}

function getMotivation() {
  return t(`dash.motivation.${new Date().getDate() % 6}`);
}

// ============================================================
// Date range filter helpers
// ============================================================
function applyRangePreset(preset) {
  const { from, to } = presetToBounds(preset);
  $("dashFrom").value = from;
  $("dashTo").value = to;
}

/** Resolve a dashRange preset to concrete from/to date strings. */
function presetToBounds(preset) {
  const d = new Date();
  const iso = x => x.toISOString().slice(0, 10);
  switch (preset) {
    case "today":     return { from: iso(d), to: iso(d) };
    case "yesterday": { const y = new Date(d); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) }; }
    case "thisWeek":  { const w = new Date(d); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); return { from: iso(w), to: iso(d) }; }
    case "thisMonth": return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(d) };
    case "last30":    { const m = new Date(d); m.setDate(m.getDate() - 29); return { from: iso(m), to: iso(d) }; }
    case "all":
    default:          return { from: "", to: "" };
  }
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
  const mode = dashMode();
  renderKPIs(mode);
  renderPanels(mode);
}

// ----- KPI tiles -------------------------------------------------------
function renderKPIs(mode) {
  const wrap = $("dashKpis");
  if (!wrap) return;

  const issuesIn = latestIssues.filter(i => inRange(toDateStr(i.complainDate)));
  const ticketsIn = latestTickets.filter(t => inRange(toDateStr(t.createdAt)));
  const inboundIn = inbound.filter(e => inRange(toDateStr(e.reportDate)));

  const openIssues = issuesIn.filter(i => i.status === "Open").length;
  const critical = issuesIn.filter(i => i.status === "Open" && i.issueSite === "Outbound").length;
  const openTickets = ticketsIn.filter(t => t.status === "Open" || t.status === "In Progress").length;
  const inboundDone = inboundIn.filter(e => e.inboundType === "Inbound Completed").length;
  const onTime = inboundIn.filter(e => e.leadTimeStatus === "ontime").length;
  const onTimeRate = inboundIn.length ? Math.round(onTime / inboundIn.length * 100) + "%" : "0%";

  const trk = deptTracker(mode);
  const teamTasksIn = trk.tasks.filter(r => inRange(toDateStr(r.date)));
  const teamDone = teamTasksIn.filter(r => (r.status || "").toLowerCase() === "done").length;
  const teamOpen = teamTasksIn.filter(r => {
    const s = (r.status || "").toLowerCase();
    return s === "open" || s === "in progress" || s === "progress";
  }).length;
  const teamPct = teamTasksIn.length ? Math.round(teamDone / teamTasksIn.length * 100) + "%" : "0%";

  let tiles;
  if (mode === "ss") {
    tiles = [
      kpi(openIssues, t("dash.kpi.openIssues"), "dailyIssue", { fltStatus: "Open", fltRange: "all" }),
      kpi(critical, t("dash.kpi.critical"), "dailyIssue", { fltStatus: "Open", fltIssueSite: "Outbound", fltRange: "all" }),
      kpi(openTickets, t("dash.kpi.openTickets"), "ticketing", { tktStatus: "Open" }),
      kpi(teamOpen, t("dash.kpi.openTeamTasks"), trk.menu, {})
    ];
  } else if (mode === "ops") {
    tiles = [
      kpi(inboundIn.length, t("dash.kpi.inboundRange"), "inboundMonitoring", {}),
      kpi(inboundDone, t("dash.kpi.completedInbound"), "inboundMonitoring", {}),
      kpi(onTimeRate, t("dash.kpi.onTimeRate"), "inboundMonitoring", {}),
      kpi(openTickets, t("dash.kpi.openTickets"), "ticketing", { tktStatus: "Open" })
    ];
  } else if (mode === "sales" || mode === "ga") {
    tiles = [
      kpi(teamTasksIn.length, t("dash.kpi.teamTasksRange"), trk.menu, {}),
      kpi(teamDone, t("dash.kpi.done"), trk.menu, {}),
      kpi(teamPct, t("dash.kpi.completion"), trk.menu, {}),
      kpi(openTickets, t("dash.kpi.openTickets"), "ticketing", { tktStatus: "Open" })
    ];
  } else {
    // all / admin — org-wide
    const tasksIn = allTasks().filter(r => inRange(toDateStr(r.date)));
    tiles = [
      kpi(openIssues, t("dash.kpi.openIssues"), "dailyIssue", { fltStatus: "Open", fltRange: "all" }),
      kpi(openTickets, t("dash.kpi.openTickets"), "ticketing", { tktStatus: "Open" }),
      kpi(inboundIn.length, t("dash.kpi.inboundRange"), "inboundMonitoring", {}),
      kpi(tasksIn.length, t("dash.kpi.tasksRange"), null, {})
    ];
  }

  wrap.innerHTML = tiles.join("");
  wireKpiTiles(wrap);
}

/** Build one KPI tile. menu=null → not clickable. */
function kpi(value, label, menu, filters) {
  const attrs = menu
    ? ` data-target="${esc(menu)}" data-filters='${esc(JSON.stringify(filters || {}))}' role="button" tabindex="0"`
    : "";
  return `<div class="kpi"${attrs}><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function wireKpiTiles(wrap) {
  wrap.querySelectorAll(".kpi[data-target]").forEach(tile => {
    tile.style.cursor = "pointer";
    const go = () => {
      let filters = {};
      try { filters = JSON.parse(tile.dataset.filters || "{}"); } catch (e) {}
      window.__pendingNavAction = { filters };
      const navBtn = document.querySelector(`.nav button[data-menu="${tile.dataset.target}"]`);
      if (navBtn) navBtn.click();
    };
    tile.addEventListener("click", go);
    tile.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
    tile.addEventListener("mouseenter", () => tile.style.transform = "translateY(-2px)");
    tile.addEventListener("mouseleave", () => tile.style.transform = "");
  });
}

// ----- Bottom panels ---------------------------------------------------
function renderPanels(mode) {
  const wrap = $("dashPanels");
  if (!wrap) return;

  const left = (mode === "ops")
    ? panelInbound()
    : (mode === "sales" || mode === "ga")
      ? panelTeamTasks(mode)
      : panelIssues();

  wrap.innerHTML = `${left}${panelTickets()}`;
  wireRows(wrap);
}

function panelIssues() {
  const rows = latestIssues.filter(i => inRange(toDateStr(i.complainDate)));
  const body = !rows.length
    ? `<span class="small">${esc(t("dash.empty.noIssues"))}</span>`
    : rows.slice(0, 5).map(i => `
      <div class="dashRow" data-nav="dailyIssue" data-id="${esc(i.id)}" role="button" tabindex="0"
           style="padding:10px 0;border-bottom:1px solid rgba(124,58,237,.08);cursor:pointer">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(i.client)}</b> · ${esc(friendlyDate(i.complainDate))} · <span class="small">${esc(i.updateBy || "")}</span></div>
          <div>
            <span class="${badgeClass(i.issueSite)}">${esc(i.issueSite || "")}</span>
            <span class="${badgeClass(i.status === "Close" ? "resolved" : "open")}">${esc(i.status)}</span>
          </div>
        </div>
        <div class="small" style="margin-top:4px">${esc((i.categoriComplain || "") + " · " + (i.detailsComplain || "")).slice(0, 140)}</div>
      </div>`).join("");
  return `<div class="card"><h2>${esc(t("dash.panel.latestIssues"))}</h2><div class="output">${body}</div></div>`;
}

function panelTickets() {
  const rows = latestTickets.filter(t => inRange(toDateStr(t.createdAt)));
  const body = !rows.length
    ? `<span class="small">${esc(t("dash.empty.noTickets"))}</span>`
    : rows.slice(0, 5).map(t => `
      <div class="dashRow" data-nav="ticketing" data-id="${esc(t.id)}" role="button" tabindex="0"
           style="padding:10px 0;border-bottom:1px solid rgba(124,58,237,.08);cursor:pointer">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(t.number || "—")}</b> · ${esc(t.dept || "")}</div>
          <div>
            <span class="${badgeClass(t.priority)}">${esc(t.priority)}</span>
            <span class="${badgeClass(t.status)}">${esc(t.status)}</span>
          </div>
        </div>
        <div class="small" style="margin-top:4px"><b>${esc(t.subject)}</b> · ${esc((t.description || "").slice(0, 100))}</div>
      </div>`).join("");
  return `<div class="card"><h2>${esc(t("dash.panel.latestTickets"))}</h2><div class="output">${body}</div></div>`;
}

function panelInbound() {
  const rows = inbound.filter(e => inRange(toDateStr(e.reportDate)));
  const body = !rows.length
    ? `<span class="small">${esc(t("dash.empty.noInbound"))}</span>`
    : rows.slice(0, 5).map(e => `
      <div class="dashRow" data-nav="inboundMonitoring" role="button" tabindex="0"
           style="padding:10px 0;border-bottom:1px solid rgba(124,58,237,.08);cursor:pointer">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(e.client || "—")}</b> · ${esc(friendlyDate(e.reportDate))}</div>
          <span class="${badgeClass(e.inboundType === "Inbound Completed" ? "done" : e.inboundType === "Inbound Partial" ? "progress" : "open")}">${esc(e.inboundType || "")}</span>
        </div>
        <div class="small" style="margin-top:4px">${esc(e.poNumber || "")} · ${esc(e.vendor || "")} · ${esc(e.operator || "")}</div>
      </div>`).join("");
  return `<div class="card"><h2>${esc(t("dash.panel.recentInbound"))}</h2><div class="output">${body}</div></div>`;
}

function panelTeamTasks(mode) {
  const trk = deptTracker(mode);
  const rows = trk.tasks
    .filter(r => inRange(toDateStr(r.date)))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const body = !rows.length
    ? `<span class="small">${esc(t("dash.empty.noTeamTasks"))}</span>`
    : rows.slice(0, 5).map(r => `
      <div class="dashRow" data-nav="${esc(trk.menu)}" role="button" tabindex="0"
           style="padding:10px 0;border-bottom:1px solid rgba(124,58,237,.08);cursor:pointer">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div><b>${esc(r.person || "—")}</b> · ${esc(friendlyDate(r.date))}</div>
          <span class="${badgeClass(r.status)}">${esc(r.status || "")}</span>
        </div>
        <div class="small" style="margin-top:4px">${esc((r.task || "").slice(0, 140))}</div>
      </div>`).join("");
  return `<div class="card"><h2>${esc(t("dash.panel.latestTeamTasks", { label: trk.label }))}</h2><div class="output">${body}</div></div>`;
}

/** Wire every .dashRow so clicking navigates (and optionally opens a record). */
function wireRows(wrap) {
  wrap.querySelectorAll(".dashRow[data-nav]").forEach(row => {
    const go = () => {
      if (row.dataset.id) window.__pendingNavAction = { openId: row.dataset.id };
      const navBtn = document.querySelector(`.nav button[data-menu="${row.dataset.nav}"]`);
      if (navBtn) navBtn.click();
    };
    row.addEventListener("click", go);
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
    row.addEventListener("mouseenter", () => row.style.background = "rgba(124,58,237,.06)");
    row.addEventListener("mouseleave", () => row.style.background = "");
  });
}

// ============================================================
// MY ACTION ITEMS — tickets assigned to me + my open tasks
// ============================================================
function renderMyActionItems() {
  const el = $("myActionItems");
  if (!el) return;
  const me = getCurrentProfile();
  if (!me) { el.innerHTML = ''; return; }
  const myName = me.name || me.email;
  const myEmail = me.email;

  const myTickets = latestTickets.filter(t =>
    (t.assignee === myName || t.assignee === myEmail) &&
    (t.status === "Open" || t.status === "In Progress" || t.status === "Waiting"));

  const myTasks = allTasks().filter(r =>
    (r.person === myName || r.person === myEmail) &&
    r.status !== "Done" && r.status !== "Hold");

  if (!myTickets.length && !myTasks.length) {
    el.innerHTML = `
      <div class="actEmpty">
        <div>
          <b>${esc(t("dash.action.clear"))}</b>
          <p class="small">${esc(t("dash.action.clearSub"))}</p>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    ${myTickets.length ? `
      <div class="actSection">
        <div class="actSectionHeader">
          <b>${esc(t("dash.action.myTickets"))}</b>
          <span class="actCount">${myTickets.length}</span>
        </div>
        ${myTickets.map(renderTicketRow).join("")}
      </div>` : ""}
    ${myTasks.length ? `
      <div class="actSection">
        <div class="actSectionHeader">
          <b>${esc(t("dash.action.myTasks"))}</b>
          <span class="actCount">${myTasks.length}</span>
        </div>
        ${myTasks.slice(0, 8).map(renderTaskRow).join("")}
        ${myTasks.length > 8 ? `<div class="small" style="text-align:center;color:var(--muted);padding:6px">${esc(t("dash.action.moreTasks", { count: myTasks.length - 8 }))}</div>` : ""}
      </div>` : ""}
  `;

  el.querySelectorAll("[data-ackticket]").forEach(b =>
    b.addEventListener("click", () => updateTicketStatus(b.dataset.ackticket, "In Progress")));
  el.querySelectorAll("[data-resticket]").forEach(b =>
    b.addEventListener("click", () => updateTicketStatus(b.dataset.resticket, "Resolved")));
  el.querySelectorAll("[data-opentkt]").forEach(b =>
    b.addEventListener("click", () => {
      const navBtn = document.querySelector('.nav button[data-menu="ticketing"]');
      if (navBtn) navBtn.click();
    }));
}

function renderTicketRow(tk) {
  const ageDays = tk.createdAtMs ? Math.floor((Date.now() - tk.createdAtMs) / 86400000) : 0;
  const ageLabel = ageDays === 0
    ? t("dash.age.today")
    : ageDays === 1
      ? t("dash.age.oneDay")
      : t("dash.age.daysCount", { n: ageDays });
  const ageBadge = ageDays === 0
    ? `<span class="actAge fresh">${esc(ageLabel)}</span>`
    : ageDays <= 3
      ? `<span class="actAge ok">${esc(ageLabel)}</span>`
      : `<span class="actAge stale">${esc(ageLabel)}</span>`;
  const statusBadge = `<span class="${badgeClass(tk.status)}">${esc(tk.status)}</span>`;
  const priorityBadge = `<span class="${badgeClass(tk.priority)}">${esc(tk.priority || "—")}</span>`;
  return `
    <div class="actItem">
      <div class="actMain">
        <div class="actTitle">
          <b>${esc(tk.number || "—")}</b> ${priorityBadge} ${statusBadge} ${ageBadge}
        </div>
        <div class="actSubj"><b>${esc(tk.subject || "")}</b></div>
        <div class="actMeta small">${esc(tk.dept || "")} · ${esc(t("dash.action.from"))} ${esc(tk.requester || "—")}</div>
      </div>
      <div class="actActions">
        ${tk.status === "Open"
          ? `<button class="primary iconBtn" data-ackticket="${tk.id}" title="${esc(t("dash.action.ackTitle"))}">${esc(t("dash.action.ack"))}</button>`
          : ""}
        ${(tk.status === "In Progress" || tk.status === "Waiting")
          ? `<button class="primary iconBtn" data-resticket="${tk.id}" title="${esc(t("dash.action.resolveTitle"))}">${esc(t("dash.action.resolve"))}</button>`
          : ""}
        <button class="secondary iconBtn" data-opentkt="${tk.id}" title="${esc(t("dash.action.openInTicketing"))}">↗</button>
      </div>
    </div>
  `;
}

function renderTaskRow(tk) {
  return `
    <div class="actItem">
      <div class="actMain">
        <div class="actSubj"><b>${esc(tk.task || t("dash.action.untitledTask"))}</b></div>
        <div class="actMeta small">${esc(friendlyDate(tk.date))} · <span class="${badgeClass(tk.status)}">${esc(tk.status)}</span></div>
      </div>
    </div>
  `;
}

async function updateTicketStatus(id, newStatus) {
  try {
    await updateDocument(COL.TICKETS, id, { status: newStatus });
    toast(t("dash.toast.ticketUpdated", { status: newStatus }), "success");
  } catch (e) {
    toast(t("dash.toast.updateFailed", { msg: e.message }), "error");
  }
}
