// ============================================================
// FLOW Mega Apps — Notifications
//
// A bell in the top bar + count badges on nav items, surfacing
// what needs the current user's attention:
//   • Tickets assigned to me that are still open
//   • My tasks that are overdue (past their date, not done)
//   • Issues open longer than the SLA window (stale)
// Clicking an alert jumps straight to the record.
// ============================================================

import { COL, subscribeCollection } from "../firebase.js";
import { $, esc, friendlyDate, toDateStr, today, slaAge } from "../utils.js";
import { getCurrentProfile, canViewModule } from "../roles.js";

let tickets = [], issues = [];
let tasksSales = [], tasksSS = [], tasksGA = [];
let wired = false;

const STALE_ISSUE_DAYS = 7;

export function initNotifications() {
  const bell = $("notifBell");
  const panel = $("notifPanel");
  if (!bell || !panel) return;

  if (!wired) {
    wired = true;
    subscribeCollection(COL.TICKETS, rows => { tickets = rows; refresh(); });
    subscribeCollection(COL.ISSUES, rows => { issues = rows; refresh(); });
    subscribeCollection(COL.TASKS_SALES, rows => { tasksSales = rows; refresh(); });
    subscribeCollection(COL.TASKS_SS, rows => { tasksSS = rows; refresh(); });
    subscribeCollection(COL.TASKS_GA, rows => { tasksGA = rows; refresh(); });

    bell.addEventListener("click", e => {
      e.stopPropagation();
      const open = panel.classList.toggle("hidden");
      if (!open) renderPanel(buildAlerts());
    });
    document.addEventListener("click", e => {
      if (!e.target.closest(".notifWrap")) panel.classList.add("hidden");
    });
  }
  refresh();
}

// ============================================================
// Build the alert list for the current user
// ============================================================
function buildAlerts() {
  const me = getCurrentProfile();
  if (!me) return [];
  const myName = me.name || me.email;
  const myEmail = me.email;
  const isMine = v => v === myName || v === myEmail;
  const todayStr = today();
  const alerts = [];

  // Tickets assigned to me, still actionable
  for (const t of tickets) {
    if (t.type && t.type !== "internal") continue;
    if (!isMine(t.assignee)) continue;
    if (!["Open", "In Progress", "Waiting"].includes(t.status)) continue;
    const age = slaAge(toDateStr(t.createdAt));
    alerts.push({
      level: age.level === "stale" ? "stale" : "ok",
      menu: "ticketing", openId: t.id,
      title: `${t.number || "Ticket"} · ${t.subject || ""}`,
      subtitle: `Assigned to you · ${t.status} · ${age.label} old`
    });
  }

  // My overdue tasks
  const taskGroups = [
    [tasksSales, "dailyTrackerSales"],
    [tasksSS, "dailyTrackerSS"],
    [tasksGA, "dailyTrackerGA"]
  ];
  for (const [rows, menu] of taskGroups) {
    for (const r of rows) {
      if (!isMine(r.person)) continue;
      if (r.status === "Done" || r.status === "Hold") continue;
      const d = toDateStr(r.date);
      if (!d || d >= todayStr) continue;            // not overdue
      alerts.push({
        level: "stale", menu, openId: null,
        title: r.task || "(untitled task)",
        subtitle: `Overdue task · was due ${friendlyDate(r.date)}`
      });
    }
  }

  // Stale open issues (team-wide) — only if the user can see them
  if (canViewModule("dailyIssue")) {
    for (const i of issues) {
      if (i.status !== "Open") continue;
      const age = slaAge(i.complainDate);
      if (age.days <= STALE_ISSUE_DAYS) continue;
      alerts.push({
        level: "stale", menu: "dailyIssue", openId: i.id,
        title: `${i.client || "Issue"} · ${i.categoriComplain || ""}`,
        subtitle: `Open ${age.label} · ${i.issueSite || ""}`
      });
    }
  }

  // Stale items first
  alerts.sort((a, b) => (a.level === "stale" ? 0 : 1) - (b.level === "stale" ? 0 : 1));
  return alerts;
}

// ============================================================
// Render: bell badge, nav badges, dropdown panel
// ============================================================
function refresh() {
  const alerts = buildAlerts();
  const countEl = $("notifCount");
  if (countEl) {
    countEl.textContent = alerts.length > 99 ? "99+" : String(alerts.length);
    countEl.classList.toggle("hidden", alerts.length === 0);
  }

  // Per-module nav badges
  const byMenu = {};
  for (const a of alerts) byMenu[a.menu] = (byMenu[a.menu] || 0) + 1;
  ["ticketing", "dailyIssue", "dailyTrackerSales", "dailyTrackerSS", "dailyTrackerGA"]
    .forEach(menu => setNavBadge(menu, byMenu[menu] || 0));

  // Refresh panel if it's currently open
  const panel = $("notifPanel");
  if (panel && !panel.classList.contains("hidden")) renderPanel(alerts);
}

function setNavBadge(menu, count) {
  const btn = document.querySelector(`.nav button[data-menu="${menu}"]`);
  if (!btn) return;
  let badge = btn.querySelector(".navBadge");
  if (count <= 0) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "navBadge";
    btn.appendChild(badge);
  }
  badge.textContent = count > 9 ? "9+" : String(count);
}

function renderPanel(alerts) {
  const panel = $("notifPanel");
  if (!panel) return;
  if (!alerts.length) {
    panel.innerHTML = `
      <div class="notifHead">Notifications</div>
      <div class="notifEmpty small">Nothing needs your attention. </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="notifHead">Notifications <span class="notifHeadCount">${alerts.length}</span></div>
    ${alerts.slice(0, 20).map((a, idx) => `
      <div class="notifItem" data-idx="${idx}" role="button" tabindex="0">
        <span class="notifDot ${a.level === "stale" ? "stale" : "ok"}"></span>
        <div class="notifText">
          <div class="notifTitle">${esc(a.title)}</div>
          <div class="notifSub small">${esc(a.subtitle)}</div>
        </div>
      </div>`).join("")}
    ${alerts.length > 20 ? `<div class="notifMore small">+ ${alerts.length - 20} more</div>` : ""}
  `;
  panel.querySelectorAll(".notifItem").forEach(el => {
    const a = alerts[Number(el.dataset.idx)];
    const go = () => navigate(a);
    el.addEventListener("click", go);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
  });
}

function navigate(a) {
  $("notifPanel")?.classList.add("hidden");
  if (a.openId) window.__pendingNavAction = { openId: a.openId };
  const navBtn = document.querySelector(`.nav button[data-menu="${a.menu}"]`);
  if (navBtn) navBtn.click();
}
