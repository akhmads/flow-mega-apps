// ============================================================
// FLOW Mega Apps — Global Search
//
// One search box in the top bar that looks across Issues,
// Tickets and Daily Tracker tasks. Results respect role
// visibility (a GA user never sees issue results). Clicking a
// result navigates to the module and, where supported, opens
// the record.
// ============================================================

import { COL, subscribeCollection } from "../firebase.js";
import { $, esc, friendlyDate, toDateStr } from "../utils.js";
import { canViewModule } from "../roles.js";

let issues = [], tickets = [];
let tasksSales = [], tasksSS = [], tasksGA = [];
let wired = false;

export function initGlobalSearch() {
  const input = $("globalSearchInput");
  const box = $("globalSearchResults");
  if (!input || !box) return;

  // Subscribe once — data stays warm for instant search.
  if (!wired) {
    wired = true;
    subscribeCollection(COL.ISSUES, rows => { issues = rows; });
    subscribeCollection(COL.TICKETS, rows => { tickets = rows; });
    subscribeCollection(COL.TASKS_SALES, rows => { tasksSales = rows; });
    subscribeCollection(COL.TASKS_SS, rows => { tasksSS = rows; });
    subscribeCollection(COL.TASKS_GA, rows => { tasksGA = rows; });

    const run = debounce(() => renderResults(input.value), 180);
    input.addEventListener("input", run);
    input.addEventListener("focus", () => { if (input.value.trim()) renderResults(input.value); });

    document.addEventListener("click", e => {
      if (!e.target.closest(".globalSearch")) box.classList.add("hidden");
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") { input.value = ""; box.classList.add("hidden"); input.blur(); }
    });
    // Ctrl/Cmd+K focuses the search.
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function renderResults(rawQuery) {
  const box = $("globalSearchResults");
  const q = (rawQuery || "").toLowerCase().trim();
  if (q.length < 2) { box.classList.add("hidden"); box.innerHTML = ""; return; }

  const results = [];

  if (canViewModule("dailyIssue")) {
    for (const i of issues) {
      const blob = [i.client, i.orderCode, (i.orderCodes || []).join(" "), i.rootCause,
        i.detailsComplain, i.categoriComplain, i.notes, i.updateBy, i.issueSite]
        .filter(Boolean).join(" ").toLowerCase();
      if (blob.includes(q)) {
        results.push({
          type: "Issue", menu: "dailyIssue", openId: i.id,
          title: i.client || "(no client)",
          subtitle: `${i.issueSite || ""} · ${i.categoriComplain || ""} · ${friendlyDate(i.complainDate)}`,
          status: i.status === "Close" ? "resolved" : "open", statusText: i.status || ""
        });
      }
    }
  }

  if (canViewModule("ticketing")) {
    for (const t of tickets) {
      if (t.type && t.type !== "internal") continue;
      const blob = [t.number, t.subject, t.requester, t.description, t.assignee, t.dept]
        .filter(Boolean).join(" ").toLowerCase();
      if (blob.includes(q)) {
        results.push({
          type: "Ticket", menu: "ticketing", openId: t.id,
          title: `${t.number || "—"} · ${t.subject || ""}`,
          subtitle: `${t.dept || ""} · ${t.requester || ""} · ${friendlyDate(toDateStr(t.createdAt))}`,
          status: t.status, statusText: t.status || ""
        });
      }
    }
  }

  searchTasks(q, results, tasksSales, "dailyTrackerSales", "Sales");
  searchTasks(q, results, tasksSS, "dailyTrackerSS", "Sales Support");
  searchTasks(q, results, tasksGA, "dailyTrackerGA", "General Affairs");

  if (!results.length) {
    box.innerHTML = `<div class="searchEmpty small">No matches for "${esc(rawQuery.trim())}".</div>`;
    box.classList.remove("hidden");
    return;
  }

  box.innerHTML = results.slice(0, 12).map((r, idx) => `
    <div class="searchResult" data-idx="${idx}" role="button" tabindex="0">
      <span class="searchType">${esc(r.type)}</span>
      <div class="searchText">
        <div class="searchTitle">${esc(r.title)}</div>
        <div class="searchSub small">${esc(r.subtitle)}</div>
      </div>
      ${r.statusText ? `<span class="badge badge-${esc(String(r.status).toLowerCase().replace(/\s+/g, "-"))}">${esc(r.statusText)}</span>` : ""}
    </div>
  `).join("") +
    (results.length > 12 ? `<div class="searchMore small">+ ${results.length - 12} more — refine your search</div>` : "");

  box.querySelectorAll(".searchResult").forEach(el => {
    const r = results[Number(el.dataset.idx)];
    const go = () => navigate(r);
    el.addEventListener("click", go);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
  });
  box.classList.remove("hidden");
}

function searchTasks(q, results, rows, menu, teamLabel) {
  if (!canViewModule(menu)) return;
  for (const r of rows) {
    const blob = [r.task, r.person, r.notes, r.status].filter(Boolean).join(" ").toLowerCase();
    if (blob.includes(q)) {
      results.push({
        type: "Task", menu, openId: null,
        title: r.task || "(untitled task)",
        subtitle: `${teamLabel} · ${r.person || ""} · ${friendlyDate(r.date)}`,
        status: r.status, statusText: r.status || ""
      });
    }
  }
}

function navigate(r) {
  const box = $("globalSearchResults");
  const input = $("globalSearchInput");
  if (box) box.classList.add("hidden");
  if (input) input.value = "";
  if (r.openId) window.__pendingNavAction = { openId: r.openId };
  const navBtn = document.querySelector(`.nav button[data-menu="${r.menu}"]`);
  if (navBtn) navBtn.click();
}
