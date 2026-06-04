// ============================================================
// FLOW Mega Apps — Debug Panel (v3.11)
//
// Floating bug button at bottom-right (Admin + Supervisor only).
// Built for a LAUNCHED app — the focus is catching, surfacing and
// reporting problems fast.
//
// Includes:
//   • Error capture — console errors, window errors AND unhandled
//     promise rejections, de-duplicated with a ×count.
//   • Central error log — new distinct errors are written to the
//     Firestore `error_log` collection, so problems from EVERY user
//     land in one place (Debug Panel → Logged Errors).
//   • "Report a Problem" — any user can file a bug report with their
//     description + auto-attached page / trail / errors → `bug_reports`.
//   • Action trail (breadcrumbs) — the last pages/clicks before an error.
//   • Feature-flag toggles — flip features live without a redeploy.
//   • Slow-operation watch — Firestore reads/writes over 3s.
//   • Data health checks — scans for missing/orphaned data.
//   • Test Data Generator — PREVIEW MODE ONLY (writes junk records).
// ============================================================

import { $, esc, toast, today } from "./utils.js";
import {
  isAdmin, isSupervisor, getCurrentEmail, getCurrentProfile
} from "./roles.js";
import { COL, addDocument, getDocuments, collection, addDoc, serverTimestamp } from "./firebase.js";
import { getMasterDataAll } from "./modules/master-data.js";
import { FEATURES, FEATURE_DEFAULTS, APP_VERSION, BUILD_DATE } from "./features.js";

const recentErrors = [];          // [{ msg, first, last, count, page }]
const breadcrumbs = [];           // [{ at, label }]
const MAX_ERRORS = 25;
const MAX_CRUMBS = 25;
const SESSION_START = Date.now();

let _dbLogCount = 0;              // cap error_log writes per session
const MAX_DB_LOGS = 60;

// ============================================================
// BREADCRUMBS — last pages/clicks, so an error shows its lead-up
// ============================================================
function nowTime() { return new Date().toLocaleTimeString(); }

/** Record a navigation or action. Exported — app.js calls it on every
 *  page switch; clicks are captured automatically below. */
export function logBreadcrumb(label) {
  label = String(label || "").trim().slice(0, 80);
  if (!label) return;
  const last = breadcrumbs[0];
  if (last && last.label === label) return;   // skip immediate repeats
  breadcrumbs.unshift({ at: nowTime(), label });
  if (breadcrumbs.length > MAX_CRUMBS) breadcrumbs.pop();
}

// Capture meaningful button clicks (capture phase, runs from page load).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button, .nav-btn, [role=button]");
  if (!btn) return;
  const txt = (btn.textContent || btn.title || btn.getAttribute("aria-label") || "").trim();
  if (txt) logBreadcrumb("Click: " + txt.replace(/\s+/g, " ").slice(0, 50));
}, true);

// ============================================================
// ERROR CAPTURE — runs at module load, before the panel mounts
// ============================================================
function currentPage() {
  const t = document.getElementById("pageTitle");
  return (t && t.textContent.trim()) || "—";
}

/** Record an error, de-duplicating by message. New distinct errors
 *  are also written to the Firestore error_log (best-effort). */
function recordError(msg) {
  msg = String(msg || "").trim().slice(0, 300);
  if (!msg) return;
  const existing = recentErrors.find(e => e.msg === msg);
  if (existing) {
    existing.count++;
    existing.last = nowTime();
  } else {
    const entry = { msg, first: nowTime(), last: nowTime(), count: 1, page: currentPage() };
    recentErrors.unshift(entry);
    if (recentErrors.length > MAX_ERRORS) recentErrors.pop();
    logErrorToDb(entry);
  }
  updateErrorBadge();
}

/** Write one error to the Firestore error_log. Best-effort: capped,
 *  never throws, never blocks — logging must not cause more errors. */
function logErrorToDb(entry) {
  if (_dbLogCount >= MAX_DB_LOGS) return;
  _dbLogCount++;
  try {
    addDoc(collection("error_log"), {
      message: entry.msg,
      page: entry.page,
      trail: breadcrumbs.slice(0, 12).map(b => b.label),
      userEmail: getCurrentEmail() || "anonymous",
      role: (getCurrentProfile() || {}).role || "—",
      url: location.href.slice(0, 300),
      userAgent: navigator.userAgent.slice(0, 200),
      tsMs: Date.now(),
      at: serverTimestamp(),
      createdBy: getCurrentEmail() || "anonymous"
    }).catch(() => { /* offline / denied — drop silently */ });
  } catch (e) { /* ignore */ }
}

const origError = console.error;
console.error = function (...args) {
  const msg = args.map(a =>
    a instanceof Error ? a.message
    : (typeof a === "object" ? JSON.stringify(a).slice(0, 200) : String(a))
  ).join(" ");
  recordError(msg);
  origError.apply(console, args);
};

window.addEventListener("error", (e) => {
  const where = (e.filename || "").split("/").pop();
  recordError(e.message + (where ? ` (${where}:${e.lineno})` : ""));
});

// The big one for a launched app — failed Firestore writes, awaited
// calls with no .catch(), etc. all surface as unhandled rejections.
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  recordError("Unhandled promise: " + (r && r.message ? r.message : String(r)));
});

function updateErrorBadge() {
  const badge = document.getElementById("dbgErrBadge");
  if (!badge) return;
  const n = recentErrors.length;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.style.display = n > 0 ? "flex" : "none";
}

// ============================================================
// MOUNT — Debug Panel (Admin + Supervisor)
// ============================================================
export function mountDebugPanel() {
  if (!isAdmin() && !isSupervisor()) return;
  if (document.getElementById("debugFab")) return;

  const fab = document.createElement("button");
  fab.id = "debugFab";
  fab.title = "Debug Panel · " + (isAdmin() ? "Admin" : "Supervisor");
  fab.setAttribute("aria-label", "Open Debug Panel");
  // Bug icon — makes the button identifiable instead of a blank circle.
  fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/>
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>
    <path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/>
    <path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/>
    <path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`;
  const badge = document.createElement("span");
  badge.id = "dbgErrBadge";
  badge.style.cssText = "position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;" +
    "border-radius:9px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;" +
    "display:none;align-items:center;justify-content:center;padding:0 5px;" +
    "box-shadow:0 1px 4px rgba(0,0,0,.35)";
  fab.appendChild(badge);
  document.body.appendChild(fab);

  const panel = document.createElement("div");
  panel.id = "debugPanel";
  panel.className = "hidden";
  panel.innerHTML = `
    <div class="dbgHeader">
      <b>Debug Panel</b>
      <button class="dbgClose">×</button>
    </div>
    <div class="dbgBody" id="dbgBody"></div>
    <div class="dbgFooter">
      <button class="secondary" id="dbgCopy">Copy Diagnostics</button>
      <button class="secondary" id="dbgClearErrors">Clear Errors</button>
      <button class="secondary" id="dbgClearCache">Clear Cache</button>
      <button class="secondary" id="dbgReload">↻ Reload</button>
    </div>
  `;
  document.body.appendChild(panel);

  fab.addEventListener("click", () => {
    if (panel.classList.contains("hidden")) {
      renderDebugBody();
      panel.classList.remove("hidden");
    } else {
      panel.classList.add("hidden");
    }
  });
  panel.querySelector(".dbgClose").addEventListener("click", () => panel.classList.add("hidden"));
  panel.querySelector("#dbgCopy").addEventListener("click", copyDiagnostics);
  panel.querySelector("#dbgClearErrors").addEventListener("click", () => {
    recentErrors.length = 0;
    updateErrorBadge();
    renderDebugBody();
    toast("Error log cleared", "success");
  });
  panel.querySelector("#dbgClearCache").addEventListener("click", clearFlowCache);
  panel.querySelector("#dbgReload").addEventListener("click", () => location.reload());

  updateErrorBadge();
  window.toggleDebugPanel = () => fab.click();
}

// ============================================================
// RENDER
// ============================================================
function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + (s % 60) + "s";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}

function renderDebugBody() {
  const me = getCurrentProfile();
  const previewMode = !!window.PREVIEW_MODE_INTERNAL;
  const online = navigator.onLine;
  const userAgent = navigator.userAgent.split(") ").slice(-1)[0];
  const slowOps = window.__flowSlowOps || [];

  let depts = [], clients = [], cats = [];
  try {
    depts = getMasterDataAll("departments");
    clients = getMasterDataAll("clients");
    cats = getMasterDataAll("issueCategories");
  } catch (e) {}

  const flowKeys = Object.keys(localStorage)
    .filter(k => k.startsWith("flow."))
    .map(k => ({ key: k, len: (localStorage.getItem(k) || "").length }));

  // Test Data Generator — PREVIEW MODE ONLY (writes records to the DB).
  const generatorSection = previewMode ? `
    <div class="dbgSection dbgGen">
      <div class="dbgLabel">Test Data Generator <span class="small" style="color:var(--muted)">· preview only</span></div>
      <div class="dbgGenGrid">
        <button class="dbgGenBtn" data-gen="tickets" data-count="10">+10 Tickets</button>
        <button class="dbgGenBtn" data-gen="tasksSales" data-count="20">+20 Sales Tasks</button>
        <button class="dbgGenBtn" data-gen="tasksSS" data-count="20">+20 SS Tasks</button>
        <button class="dbgGenBtn" data-gen="issues" data-count="15">+15 Daily Issues</button>
        <button class="dbgGenBtn" data-gen="marketplaceLinks" data-count="12">+12 Hub Stores</button>
      </div>
    </div>` : "";

  // Feature flags — toggles persist to localStorage; reload to apply.
  const featureRows = Object.keys(FEATURE_DEFAULTS).map(key => {
    const on = !!FEATURES[key];
    const overridden = on !== FEATURE_DEFAULTS[key];
    return `<label class="dbgToggleRow">
      <span>${esc(key)}${overridden ? ' <span class="small" style="color:#f59e0b">· changed</span>' : ''}</span>
      <input type="checkbox" data-feat="${esc(key)}" ${on ? "checked" : ""}/>
    </label>`;
  }).join("");

  $("dbgBody").innerHTML = `
    <div class="dbgSection">
      <button class="dbgActionBtn dbgPrimary" id="dbgOpenReport" style="width:100%">Report a Problem</button>
    </div>

    ${generatorSection}

    <div class="dbgSection">
      <div class="dbgLabel">Status &amp; Health</div>
      <table>
        <tr><td>Connection</td><td>${online
          ? '<b style="color:#22c55e">● Online</b>'
          : '<b style="color:#dc2626">● OFFLINE — changes will not sync</b>'}</td></tr>
        <tr><td>Mode</td><td>${previewMode
          ? '<b style="color:#f59e0b">PREVIEW (demo data)</b>'
          : '<b style="color:#22c55e">PRODUCTION</b>'}</td></tr>
        <tr><td>App version</td><td><b>${esc(APP_VERSION)}</b> · ${esc(BUILD_DATE)}</td></tr>
        <tr><td>Current page</td><td>${esc(currentPage())}</td></tr>
        <tr><td>Session uptime</td><td>${fmtUptime(Date.now() - SESSION_START)}</td></tr>
        <tr><td>Errors captured</td><td>${recentErrors.length
          ? `<b style="color:#dc2626">${recentErrors.length}</b>`
          : '<b style="color:#22c55e">0</b>'}</td></tr>
        <tr><td>Viewport</td><td>${window.innerWidth}×${window.innerHeight}</td></tr>
      </table>
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Current User</div>
      <table>
        <tr><td>Email</td><td>${esc(getCurrentEmail() || "—")}</td></tr>
        <tr><td>Name</td><td>${esc(me?.name || "—")}</td></tr>
        <tr><td>Role</td><td><b>${esc(me?.role || "—")}</b></td></tr>
        <tr><td>Department</td><td>${esc(me?.department || "—")}</td></tr>
      </table>
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Feature Flags <span class="small" style="color:var(--muted)">· reload to apply</span></div>
      ${featureRows}
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Recent Errors — this session (last ${MAX_ERRORS})</div>
      ${recentErrors.length
        ? recentErrors.map(e => `<div class="dbgErr">
            <b>${esc(e.last)}</b>${e.count > 1 ? ` <b style="color:#dc2626">×${e.count}</b>` : ""}
            <span class="small" style="color:var(--muted)"> · ${esc(e.page)}</span><br>
            ${esc(e.msg)}
          </div>`).join("")
        : `<p class="small" style="color:#22c55e;">No errors captured this session</p>`}
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Action Trail (last ${MAX_CRUMBS})</div>
      ${breadcrumbs.length
        ? `<div class="dbgTrail">${breadcrumbs.map(b =>
            `<div class="small"><b>${esc(b.at)}</b> · ${esc(b.label)}</div>`).join("")}</div>`
        : `<p class="small" style="color:var(--muted)">No actions recorded yet</p>`}
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Slow Operations <span class="small" style="color:var(--muted)">· over 3s</span></div>
      ${slowOps.length
        ? slowOps.map(o => `<div class="dbgErr"><b>${esc(o.at)}</b> · ${esc(o.op)} — <b style="color:#f59e0b">${o.ms}ms</b></div>`).join("")
        : `<p class="small" style="color:#22c55e">No slow operations</p>`}
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Data Health Checks</div>
      <button class="dbgActionBtn" id="dbgRunHealth">Run Data Checks</button>
      <div id="dbgHealthResult"></div>
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Logged Errors — all users (database)</div>
      <button class="dbgActionBtn" id="dbgLoadErrLog">Load from database</button>
      <div id="dbgErrLogResult"></div>
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Environment</div>
      <table>
        <tr><td>App URL</td><td class="small">${esc(location.href)}</td></tr>
        <tr><td>Browser</td><td class="small">${esc(userAgent.slice(0, 80))}</td></tr>
        <tr><td>Time</td><td>${new Date().toLocaleString()}</td></tr>
      </table>
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">Master Data Counts</div>
      <table>
        <tr><td>Departments</td><td><b>${depts.length}</b> total · ${depts.filter(d => !d.archived).length} active</td></tr>
        <tr><td>Clients</td><td><b>${clients.length}</b> total · ${clients.filter(c => !c.archived).length} active</td></tr>
        <tr><td>Issue Categories</td><td><b>${cats.length}</b> total · ${cats.filter(c => !c.archived).length} active</td></tr>
      </table>
    </div>

    <div class="dbgSection">
      <div class="dbgLabel">localStorage (flow.*)</div>
      ${flowKeys.length
        ? `<table>${flowKeys.map(k => `<tr><td class="small">${esc(k.key)}</td><td class="small">${k.len} bytes</td></tr>`).join("")}</table>`
        : `<p class="small" style="color:var(--muted)">No FLOW keys stored</p>`}
    </div>
  `;

  // Wire generator buttons
  document.querySelectorAll(".dbgGenBtn").forEach(b =>
    b.addEventListener("click", () => runGenerator(b.dataset.gen, parseInt(b.dataset.count))));
  // Feature toggles
  document.querySelectorAll("[data-feat]").forEach(cb =>
    cb.addEventListener("change", () => setFeatureOverride(cb.dataset.feat, cb.checked)));
  // Action buttons
  $("dbgOpenReport").addEventListener("click", openReportModal);
  $("dbgRunHealth").addEventListener("click", runHealthChecks);
  $("dbgLoadErrLog").addEventListener("click", loadErrorLog);
}

// ============================================================
// FEATURE FLAG OVERRIDES
// ============================================================
function setFeatureOverride(key, value) {
  let ov = {};
  try { ov = JSON.parse(localStorage.getItem("flow.featureOverrides") || "{}") || {}; } catch (e) {}
  if (value === FEATURE_DEFAULTS[key]) delete ov[key];   // back to default → drop override
  else ov[key] = value;
  try { localStorage.setItem("flow.featureOverrides", JSON.stringify(ov)); } catch (e) {}
  toast(`"${key}" set to ${value ? "ON" : "OFF"} — reload to apply`, "");
}

// ============================================================
// DATA HEALTH CHECKS
// ============================================================
async function runHealthChecks() {
  const out = $("dbgHealthResult");
  out.innerHTML = `<p class="small" style="color:var(--muted)">Running…</p>`;
  const findings = [];
  try {
    const [issues, tickets, users] = await Promise.all([
      getDocuments(COL.ISSUES),
      getDocuments(COL.TICKETS),
      getDocuments(COL.USERS)
    ]);

    const badIssues = issues.filter(i => !i.client || !i.complainDate || !i.categoriComplain || !i.updateBy);
    if (badIssues.length) findings.push(`${badIssues.length} daily issue(s) missing required fields (client / date / category / updateBy)`);

    const noAssignee = tickets.filter(t => !t.assignee && !/closed|resolved/i.test(t.status || ""));
    if (noAssignee.length) findings.push(`${noAssignee.length} open ticket(s) with no assignee`);

    const badUsers = users.filter(usr => !usr.role || !usr.department);
    if (badUsers.length) findings.push(`${badUsers.length} user(s) missing a role or department`);

    const clientNames = new Set(getMasterDataAll("clients").map(c => c.name));
    const orphans = [...new Set(issues.map(i => i.client).filter(c => c && !clientNames.has(c)))];
    if (orphans.length) findings.push(`${orphans.length} issue client name(s) not in Master Data: ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? "…" : ""}`);
  } catch (e) {
    out.innerHTML = `<p class="small" style="color:#dc2626">Check failed: ${esc(e.message)}</p>`;
    return;
  }
  out.innerHTML = findings.length
    ? findings.map(f => `<div class="dbgErr">⚠ ${esc(f)}</div>`).join("")
    : `<p class="small" style="color:#22c55e">✓ No data issues found</p>`;
}

// ============================================================
// LOGGED ERRORS — read the error_log collection (all users)
// ============================================================
async function loadErrorLog() {
  const out = $("dbgErrLogResult");
  out.innerHTML = `<p class="small" style="color:var(--muted)">Loading…</p>`;
  try {
    const rows = await getDocuments("error_log");
    rows.sort((a, b) => (b.tsMs || 0) - (a.tsMs || 0));
    const recent = rows.slice(0, 15);
    out.innerHTML = recent.length
      ? recent.map(r => `<div class="dbgErr">
          <b>${esc(r.userEmail || "—")}</b>
          <span class="small" style="color:var(--muted)"> · ${esc(r.page || "—")} · ${r.tsMs ? new Date(r.tsMs).toLocaleString() : ""}</span><br>
          ${esc(String(r.message || "").slice(0, 220))}
        </div>`).join("") + `<p class="small" style="color:var(--muted)">${rows.length} total in database</p>`
      : `<p class="small" style="color:#22c55e">No errors logged in the database</p>`;
  } catch (e) {
    out.innerHTML = `<p class="small" style="color:#dc2626">Could not load: ${esc(e.message)}</p>`;
  }
}

// ============================================================
// REPORT A PROBLEM — available to ALL users
// ============================================================
let _reportBuilt = false;

function buildReportModal() {
  if (_reportBuilt) return;
  _reportBuilt = true;
  const modal = document.createElement("div");
  modal.id = "dbgReportModal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modalBox" style="max-width:520px">
      <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
      <h2>Report a Problem</h2>
      <p class="small" style="color:var(--muted);margin:0 0 12px">
        Describe what went wrong. The current page, your recent actions and any
        errors are attached automatically so the team can investigate.
      </p>
      <div class="field">
        <label>What happened? *</label>
        <textarea id="dbgReportText" rows="5" placeholder="e.g. I clicked Save on a ticket and nothing happened"></textarea>
      </div>
      <div id="dbgReportMeta" class="output small" style="margin-top:10px;line-height:1.6"></div>
      <div class="btns" style="justify-content:flex-end;margin-top:14px">
        <button class="secondary" id="dbgReportCancel">Cancel</button>
        <button class="primary" id="dbgReportSend">Send Report</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#dbgReportCancel").addEventListener("click", () => modal.classList.add("hidden"));
  modal.querySelector("#dbgReportSend").addEventListener("click", submitReport);
}

function openReportModal() {
  buildReportModal();
  const panel = document.getElementById("debugPanel");
  if (panel) panel.classList.add("hidden");
  $("dbgReportText").value = "";
  $("dbgReportMeta").innerHTML =
    `<b>Auto-attached:</b><br>` +
    `Page: ${esc(currentPage())}<br>` +
    `Recent actions: ${esc(breadcrumbs.slice(0, 4).map(b => b.label).join(" → ") || "—")}<br>` +
    `Errors this session: ${recentErrors.length}`;
  document.getElementById("dbgReportModal").classList.remove("hidden");
  setTimeout(() => $("dbgReportText").focus(), 50);
}

function submitReport() {
  const desc = $("dbgReportText").value.trim();
  if (!desc) { toast("Please describe the problem first", "error"); return; }
  const btn = $("dbgReportSend");
  btn.disabled = true;
  const report = {
    description: desc.slice(0, 2000),
    page: currentPage(),
    trail: breadcrumbs.slice(0, 12).map(b => b.label),
    recentErrors: recentErrors.slice(0, 5).map(e => e.msg),
    userEmail: getCurrentEmail() || "anonymous",
    role: (getCurrentProfile() || {}).role || "—",
    url: location.href.slice(0, 300),
    userAgent: navigator.userAgent.slice(0, 200),
    appVersion: APP_VERSION,
    status: "new",
    tsMs: Date.now(),
    at: serverTimestamp(),
    createdBy: getCurrentEmail() || "anonymous"
  };
  addDoc(collection("bug_reports"), report)
    .then(() => {
      toast("Thank you — your report was sent", "success");
      document.getElementById("dbgReportModal").classList.add("hidden");
    })
    .catch(e => toast("Could not send report: " + (e.message || e), "error"))
    .finally(() => { btn.disabled = false; });
}

/** Mount the report entry point. Called for EVERY user from app.js.
 *  Admins/supervisors open it from inside the Debug Panel; everyone
 *  else gets a small floating button (they have no Debug FAB). */
export function mountReportButton() {
  buildReportModal();
  if (isAdmin() || isSupervisor()) return;
  if (document.getElementById("reportFab")) return;
  const btn = document.createElement("button");
  btn.id = "reportFab";
  btn.title = "Report a Problem";
  btn.setAttribute("aria-label", "Report a Problem");
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <path d="M12 7v4"/><path d="M12 15h.01"/></svg>`;
  btn.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:8999;width:46px;height:46px;" +
    "border-radius:50%;border:none;background:var(--primary);color:#fff;cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(99,55,216,.4)";
  btn.addEventListener("click", openReportModal);
  document.body.appendChild(btn);
}

// ============================================================
// TEST DATA GENERATORS  (preview mode only — gated in renderDebugBody)
// ============================================================
const SAMPLE_PEOPLE = ["Bryan", "Prayoga", "Yoga", "Farah", "Asih", "Fauzi", "Dimas", "Gratia", "Steve"];
const SAMPLE_DEPTS_FALLBACK = ["Sales", "Sales Support", "Operations", "Finance", "Tech", "HR", "Marketing"];
const SAMPLE_CLIENTS_FALLBACK = ["PERO", "Kintakun", "SummerID", "Fieldit", "GAON", "Quattro"];
const SAMPLE_CATS_FALLBACK = ["Wrong SKU shipped", "Missing item", "Damaged in transit", "Late delivery", "Wrong address", "Marketplace sync error"];
const SAMPLE_MARKETPLACES_FALLBACK = ["Shopee", "TikTok Shop", "Tokopedia", "Lazada", "Blibli"];

// URL templates per marketplace — slug = lowercase client name with spaces/dots removed
const MARKETPLACE_URL_TEMPLATES = {
  "Shopee":       (slug) => `https://shopee.co.id/${slug}official`,
  "TikTok Shop":  (slug) => `https://shop.tiktok.com/@${slug}`,
  "Tokopedia":    (slug) => `https://www.tokopedia.com/${slug}`,
  "Lazada":       (slug) => `https://www.lazada.co.id/shop/${slug}`,
  "Blibli":       (slug) => `https://www.blibli.com/merchant/${slug}`,
  "Bukalapak":    (slug) => `https://www.bukalapak.com/u/${slug}`,
  "JD.ID":        (slug) => `https://www.jd.id/store/${slug}`,
  "Zalora":       (slug) => `https://www.zalora.co.id/${slug}`,
  "Instagram":    (slug) => `https://www.instagram.com/${slug}`,
  "WhatsApp":     (slug) => `https://wa.me/628123456789`,
  "Website (own)":(slug) => `https://www.${slug}.co.id`,
  "Other":        (slug) => `https://example.com/${slug}`
};
const SAMPLE_LABELS = ["Main shop", "Reseller account", "Flash sale store", "Wholesale", "Outlet", ""];

const SAMPLE_TICKET_SUBJECTS = [
  "Need approval for Q4 budget",
  "Stock count mismatch in warehouse 2",
  "Customer complaint — need urgent reply",
  "VPN access issue",
  "Onboarding for new client — paperwork pending",
  "Shipping label printer down",
  "Marketplace integration error",
  "Need clarification on new SOP",
  "Bug in dashboard — chart not loading",
  "Vendor invoice overdue",
  "New hire equipment setup",
  "Sales pipeline review meeting"
];

const SAMPLE_TASKS = [
  "Follow-up with PERO on Q4 contract",
  "Review pipeline with team",
  "Update inventory count sheet",
  "Send proposal to new prospect",
  "Process pending returns",
  "Reconcile yesterday's orders",
  "Prepare client onboarding kit",
  "Cross-check marketplace listings",
  "Resolve damaged-shipment dispute",
  "Approve new SOP draft",
  "Weekly tracker review",
  "Schedule 1-on-1 with team",
  "Investigate stock discrepancy",
  "Coordinate with logistics partner"
];

const SAMPLE_ISSUE_SITES = ["Outbound", "Inbound", "Inventory", "Marketplace", "Lastmile", "Client"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDateInLast(days) {
  const ms = Date.now() - Math.floor(Math.random() * days * 86400000);
  return new Date(ms);
}
function pad(n) { return n < 10 ? "0" + n : n; }
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function getISOWeek(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}

async function runGenerator(kind, count) {
  // Hard guard — the buttons only render in preview mode, but never
  // let the generator write to a real database even if called otherwise.
  if (!window.PREVIEW_MODE_INTERNAL) {
    toast("Test data generator is disabled in production.", "error");
    return;
  }
  if (!confirm(`Generate ${count} test ${kind}? This writes to the demo database. Continue?`)) return;

  toast(`Generating ${count} ${kind}…`, "");
  let ok = 0, fail = 0;

  const departments = (getMasterDataAll("departments").filter(d => !d.archived).map(d => d.name)) || [];
  const clients = (getMasterDataAll("clients").filter(c => !c.archived).map(c => c.name)) || [];
  const cats = (getMasterDataAll("issueCategories").filter(c => !c.archived).map(c => c.name)) || [];
  const marketplaces = (getMasterDataAll("marketplaces").filter(m => !m.archived).map(m => m.name)) || [];
  const deptList = departments.length ? departments : SAMPLE_DEPTS_FALLBACK;
  const clientList = clients.length ? clients : SAMPLE_CLIENTS_FALLBACK;
  const catList = cats.length ? cats : SAMPLE_CATS_FALLBACK;
  const mpList = marketplaces.length ? marketplaces : SAMPLE_MARKETPLACES_FALLBACK;

  const generators = {
    tickets: () => genTicket(deptList),
    tasksSales: () => ({ col: COL.TASKS_SALES, doc: genTask("sales") }),
    tasksSS: () => ({ col: COL.TASKS_SS, doc: genTask("ss") }),
    issues: () => ({ col: COL.ISSUES, doc: genIssue(clientList, catList) }),
    marketplaceLinks: () => ({ col: COL.MARKETPLACE_LINKS, doc: genMarketplaceLink(clientList, mpList) })
  };

  for (let i = 0; i < count; i++) {
    try {
      const { col, doc } = generators[kind]();
      await addDocument(col, doc);
      ok++;
    } catch (e) {
      console.error("Generator failed:", e);
      fail++;
    }
  }
  toast(`Generated ${ok} ${kind}${fail ? ` · ${fail} failed (check console)` : ""}`, ok ? "success" : "error");
}

function genTicket(deptList) {
  const priorities = ["Low", "Medium", "Medium", "High", "Urgent"];
  const statuses = ["Open", "Open", "In Progress", "Waiting", "Resolved", "Closed"];
  const created = randomDateInLast(30);
  const num = "INT-26-" + String(Math.floor(1000 + Math.random() * 9000));
  const subject = pick(SAMPLE_TICKET_SUBJECTS);
  return {
    col: COL.TICKETS,
    doc: {
      number: num,
      type: "internal",
      priority: pick(priorities),
      status: pick(statuses),
      requester: pick(SAMPLE_PEOPLE),
      dept: pick(deptList),
      assignee: Math.random() > 0.3 ? pick(SAMPLE_PEOPLE) : "",
      subject,
      description: `${subject} — auto-generated test record. Lorem ipsum: ${pick(SAMPLE_PEOPLE)} flagged this on ${dateStr(created)}.`,
      comments: [],
      createdAtMs: created.getTime(),
      source: "test-generator"
    }
  };
}

function genTask(team) {
  const statusesSales = ["Open", "In Progress", "Done", "Pending", "Follow Up", "Hold"];
  const statusesSS = ["Open", "Progress", "Done", "Hold"];
  const tagsSS = ["Daily", "Weekly", "Project", "Urgent"];
  const date = randomDateInLast(21);
  const status = team === "sales" ? pick(statusesSales) : pick(statusesSS);
  const doc = {
    person: pick(SAMPLE_PEOPLE),
    date: dateStr(date),
    day: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][(date.getDay()+6)%7],
    status,
    task: pick(SAMPLE_TASKS),
    notes: Math.random() > 0.5 ? "Auto-generated for testing" : ""
  };
  if (team === "ss") {
    doc.tag = pick(tagsSS);
    doc.url = Math.random() > 0.6 ? "https://example.com/" + Math.random().toString(36).slice(2, 8) : "";
    doc.week = "W" + getISOWeek(date);
    if (status === "Done") doc.closedDate = doc.date;
  }
  return doc;
}

function genIssue(clientList, catList) {
  const statuses = ["Open", "Open", "Close"];
  const sites = SAMPLE_ISSUE_SITES;
  const complainDate = randomDateInLast(30);
  const status = pick(statuses);
  const codes = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () =>
    `FLOW_${dateStr(complainDate).replace(/-/g, "").slice(2)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  return {
    updateBy: pick(SAMPLE_PEOPLE),
    complainDate: dateStr(complainDate),
    solvingDate: status === "Close" ? dateStr(new Date(complainDate.getTime() + 86400000 * (1 + Math.floor(Math.random() * 5)))) : null,
    years: complainDate.getFullYear(),
    week: getISOWeek(complainDate),
    client: pick(clientList),
    orderCodes: codes,
    orderCode: codes.join(", "),
    orderCount: codes.length,
    issueSite: pick(sites),
    categoriComplain: pick(catList),
    detailsComplain: "Auto-generated test issue — details would go here in real life.",
    rootCause: Math.random() > 0.4 ? "Root cause analysis pending" : "",
    shortTermSolution: Math.random() > 0.5 ? "Quick fix applied" : "",
    longTermSolution: Math.random() > 0.7 ? "Process improvement TBD" : "",
    notes: "test-generator",
    status
  };
}

function genMarketplaceLink(clientList, mpList) {
  const clientName = pick(clientList);
  const marketplace = pick(mpList);
  const slug = clientName.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  const urlBuilder = MARKETPLACE_URL_TEMPLATES[marketplace] || ((s) => `https://example.com/${s}`);
  const label = pick(SAMPLE_LABELS);
  return {
    clientName,
    marketplace,
    label,
    url: urlBuilder(slug),
    notes: Math.random() > 0.7 ? "Login credentials stored in 1Password" : "",
    source: "test-generator"
  };
}

// ============================================================
// HELPERS
// ============================================================
function copyDiagnostics() {
  const header = `FLOW Mega Apps — Diagnostics\nGenerated: ${new Date().toLocaleString()}\n` +
    `Version: ${APP_VERSION} (${BUILD_DATE})\n` +
    `User: ${getCurrentEmail() || "—"}\n` + "=".repeat(40) + "\n\n";
  const text = header + ($("dbgBody").innerText || "");
  navigator.clipboard.writeText(text).then(
    () => toast("Diagnostics copied — paste it to your developer", "success"),
    () => toast("Copy failed", "error")
  );
}

function clearFlowCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith("flow."));
  if (!keys.length) return toast("No FLOW cache to clear", "");
  if (!confirm(`Remove ${keys.length} FLOW localStorage entries? (Recent-used dropdowns, language, feature overrides, etc.)`)) return;
  keys.forEach(k => localStorage.removeItem(k));
  toast(`Cleared ${keys.length} keys`, "success");
  renderDebugBody();
}
