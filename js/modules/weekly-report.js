// ============================================================
// FLOW Mega Apps — Weekly Task Report
//
// New tab inside Daily Tracker (Sales) and Daily Tracker (SS).
// - Multi-person selector (compare 2+ people side-by-side)
// - Custom date range filter
// - KPI row: Total Tasks · Done · In Progress · Pending · Completion %
// - Day-by-day breakdown table with day-total rollups
// - Export to Excel (matches the spreadsheet layout in the screenshot)
// ============================================================

import { COL, subscribeCollection } from "../firebase.js";
import {
  $, esc, toDateStr, friendlyDate, dayName, today, dateRange,
  toast, downloadXLSX
} from "../utils.js";
import { getStaffForTeam } from "../roles.js";

const wkState = {
  sales: { team: "sales", rootId: "wkSalesRoot", col: COL.TASKS_SALES, all: [], unsub: null, picks: new Set(), from: "", to: "" },
  ss:    { team: "ss",    rootId: "wkSSRoot",    col: COL.TASKS_SS,    all: [], unsub: null, picks: new Set(), from: "", to: "" }
};

/** Init the weekly report for a team. Called when user clicks the Weekly Report tab. */
export function initWeeklyReport(team) {
  const s = wkState[team];
  if (!s) return;

  // Default range: this week
  const r = dateRange("week");
  s.from = r.from;
  s.to = r.to;

  // Subscribe to tasks for this team
  if (!s.unsub) {
    s.unsub = subscribeCollection(s.col, rows => {
      s.all = rows;
      render(team);
    });
  } else {
    render(team);
  }
}

async function render(team) {
  const s = wkState[team];
  const root = $(s.rootId);
  if (!root) return;

  // Load staff for the multi-select
  let staff = [];
  try { staff = await getStaffForTeam(s.team); } catch (e) { console.warn(e); }

  // If no picks yet, default to all staff
  if (s.picks.size === 0) staff.forEach(p => s.picks.add(p.name));

  root.innerHTML = renderShell(team, staff, s);
  wireControls(team);
  renderReport(team);
}

function renderShell(team, staff, s) {
  const pickedChips = [...s.picks].map(name => `
    <span class="chip">${esc(name)}<button type="button" class="chipDel" data-removepick="${esc(name)}">×</button></span>
  `).join("");

  const staffOptions = staff
    .filter(p => !s.picks.has(p.name))
    .map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`)
    .join("");

  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left"></div>
        <div class="right">
          <button class="secondary" id="wk_${team}_export">Export Excel</button>
        </div>
      </div>

      <div class="filterGrid" style="margin-top:14px">
        <div style="grid-column:span 2">
          <label class="pmLabel">People (multi-select)</label>
          <div class="chipInputWrap" style="min-height:46px">
            ${pickedChips}
            <select id="wk_${team}_addPerson" style="border:none;outline:none;background:transparent;flex:1;min-width:140px;font-size:13px">
              <option value="">+ Add person…</option>
              ${staffOptions}
            </select>
          </div>
        </div>
        <div><label class="pmLabel">From</label><input type="date" id="wk_${team}_from" value="${esc(s.from)}"/></div>
        <div><label class="pmLabel">To</label><input type="date" id="wk_${team}_to" value="${esc(s.to)}"/></div>
      </div>
      <div class="btns" style="margin-top:6px">
        <button class="primary" id="wk_${team}_apply">Apply</button>
        <button class="secondary" id="wk_${team}_thisWeek">This Week</button>
        <button class="secondary" id="wk_${team}_lastWeek">Last Week</button>
        <button class="secondary" id="wk_${team}_clearPeople">Clear People</button>
      </div>
    </div>

    <div id="wk_${team}_kpis"></div>
    <div id="wk_${team}_body"></div>
  `;
}

function wireControls(team) {
  const s = wkState[team];

  $(`wk_${team}_apply`).onclick = () => {
    s.from = $(`wk_${team}_from`).value;
    s.to = $(`wk_${team}_to`).value;
    renderReport(team);
  };
  $(`wk_${team}_thisWeek`).onclick = () => {
    const r = dateRange("week");
    s.from = r.from; s.to = r.to;
    render(team);
  };
  $(`wk_${team}_lastWeek`).onclick = () => {
    // last week = shift -7 days
    const r = dateRange("week");
    const fd = new Date(r.from); fd.setDate(fd.getDate() - 7);
    const td = new Date(r.to); td.setDate(td.getDate() - 7);
    s.from = fd.toISOString().slice(0, 10);
    s.to = td.toISOString().slice(0, 10);
    render(team);
  };
  $(`wk_${team}_clearPeople`).onclick = () => {
    s.picks.clear();
    render(team);
  };
  $(`wk_${team}_export`).onclick = () => exportWeekly(team);
  $(`wk_${team}_addPerson`).onchange = (e) => {
    const v = e.target.value;
    if (v) {
      s.picks.add(v);
      render(team);
    }
  };
  document.querySelectorAll(`#${wkState[team].rootId} [data-removepick]`).forEach(btn => {
    btn.onclick = () => {
      s.picks.delete(btn.dataset.removepick);
      render(team);
    };
  });
}

function getFilteredTasks(team) {
  const s = wkState[team];
  return s.all.filter(t => {
    if (s.picks.size && !s.picks.has(t.person)) return false;
    const d = toDateStr(t.date);
    if (!d) return false;
    if (s.from && d < s.from) return false;
    if (s.to && d > s.to) return false;
    return true;
  });
}

function renderReport(team) {
  const s = wkState[team];
  const tasks = getFilteredTasks(team);

  // KPIs
  const total = tasks.length;
  const done = tasks.filter(t => /done/i.test(t.status || "")).length;
  const progress = tasks.filter(t => /progress/i.test(t.status || "")).length;
  const pending = tasks.filter(t => /pending|hold|follow/i.test(t.status || "")).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  $(`wk_${team}_kpis`).innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${total}</b><span>Total Tasks</span></div>
      <div class="kpi"><b style="color:#15803d">${done}</b><span>Done</span></div>
      <div class="kpi"><b style="color:#7c3aed">${progress}</b><span>In Progress</span></div>
      <div class="kpi"><b style="color:#b45309">${pending}</b><span>Pending</span></div>
      <div class="kpi"><b>${pct}%</b><span>Completion</span></div>
    </div>
  `;

  // Group by date, then by person
  const byDate = {};
  tasks.forEach(t => {
    const d = toDateStr(t.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });
  const dates = Object.keys(byDate).sort();

  if (!dates.length) {
    $(`wk_${team}_body`).innerHTML = `
      <div class="card" style="text-align:center;color:var(--muted);padding:48px">
        No tasks in the selected range for the selected people.
      </div>`;
    return;
  }

  // Build the day-by-day table — matches your spreadsheet layout
  let html = `
    <div class="card">
      <div class="tableWrap">
        <table class="wkTable">
          <thead>
            <tr><th>Date</th><th>Day</th><th>Person</th><th>Daily Task</th><th>Status</th><th>Notes</th></tr>
          </thead>
          <tbody>
  `;

  dates.forEach(d => {
    const dayTasks = byDate[d];
    const dayDone = dayTasks.filter(t => /done/i.test(t.status || "")).length;
    const dayPct = dayTasks.length ? Math.round((dayDone / dayTasks.length) * 100) : 0;

    // First row of the day has rowspan for Date/Day cells
    dayTasks.forEach((t, i) => {
      const statusBadge = badgeForStatus(t.status);
      if (i === 0) {
        html += `
          <tr class="wkDayStart">
            <td rowspan="${dayTasks.length}" class="wkDateCell">${esc(d)}</td>
            <td rowspan="${dayTasks.length}" class="wkDateCell">${esc(dayName(new Date(d)))}</td>
            <td>${esc(t.person || "—")}</td>
            <td>${esc(t.task || "")}</td>
            <td>${statusBadge}</td>
            <td class="small">${esc(t.notes || "")}</td>
          </tr>
        `;
      } else {
        html += `
          <tr>
            <td>${esc(t.person || "—")}</td>
            <td>${esc(t.task || "")}</td>
            <td>${statusBadge}</td>
            <td class="small">${esc(t.notes || "")}</td>
          </tr>
        `;
      }
    });

    // Day-total rollup row
    html += `
      <tr class="wkDayTotal">
        <td colspan="3" style="text-align:right"><b>Day total →</b></td>
        <td><b>${dayDone} / ${dayTasks.length} done</b></td>
        <td colspan="2"><b style="color:${dayPct === 100 ? '#15803d' : (dayPct >= 50 ? '#7c3aed' : '#b45309')}">${dayPct}%</b></td>
      </tr>
    `;
  });

  html += `</tbody></table></div></div>`;
  $(`wk_${team}_body`).innerHTML = html;
}

function badgeForStatus(s) {
  const status = String(s || "").toLowerCase();
  const color = /done/.test(status) ? "#15803d" :
                /progress/.test(status) ? "#7c3aed" :
                /pending|hold|follow/.test(status) ? "#b45309" :
                "#1f2937";
  return `<span class="badge" style="background:rgba(124,58,237,.1);color:${color}">${esc(s || "—")}</span>`;
}

function exportWeekly(team) {
  const s = wkState[team];
  const tasks = getFilteredTasks(team);
  if (!tasks.length) return toast("No tasks to export", "error");

  // Build rows in the same shape as the on-screen report
  const total = tasks.length;
  const done = tasks.filter(t => /done/i.test(t.status || "")).length;
  const progress = tasks.filter(t => /progress/i.test(t.status || "")).length;
  const pending = tasks.filter(t => /pending|hold|follow/i.test(t.status || "")).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const teamLabel = team === "sales" ? "Sales" : "Sales Support";
  const titleRange = `${s.from || "any"} → ${s.to || "any"}`;
  const peopleLabel = s.picks.size ? [...s.picks].join(", ") : "All";

  const rows = [];
  rows.push([`${teamLabel} Weekly Report · ${titleRange}`]);
  rows.push([`People: ${peopleLabel}`]);
  rows.push([]);
  rows.push(["Total Tasks", "Done", "In Progress", "Pending", "Completion %"]);
  rows.push([total, done, progress, pending, pct + "%"]);
  rows.push([]);
  rows.push(["Date", "Day", "Person", "Daily Task", "Status", "Notes"]);

  // Group by date, then per person
  const byDate = {};
  tasks.forEach(t => {
    const d = toDateStr(t.date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  Object.keys(byDate).sort().forEach(d => {
    const dayTasks = byDate[d];
    dayTasks.forEach((t, i) => {
      rows.push([
        i === 0 ? d : "",
        i === 0 ? dayName(new Date(d)) : "",
        t.person || "",
        t.task || "",
        t.status || "",
        t.notes || ""
      ]);
    });
    const dayDone = dayTasks.filter(t => /done/i.test(t.status || "")).length;
    const dayPct = dayTasks.length ? Math.round((dayDone / dayTasks.length) * 100) : 0;
    rows.push(["", "", "Day total →", `${dayDone} / ${dayTasks.length} done`, "", dayPct + "%"]);
  });

  const filename = `Flow_Weekly_Report_${teamLabel.replace(/\s+/g, "_")}_${today()}.xlsx`;
  downloadXLSX(rows, filename, "Weekly Report");
  toast("Exported " + filename, "success");
}
