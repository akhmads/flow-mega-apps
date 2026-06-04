// ============================================================
// FLOW Mega Apps — Main App Router
//
// PREVIEW_MODE controls login behavior:
//   - true  = demo accounts (no Firebase auth needed)
//   - false = real Firebase auth + Firestore sync (production)
//
// It now AUTO-DETECTS from firebase-applet-config.json:
//   - real apiKey present  → production mode (Firebase database sync)
//   - config empty / {}    → demo mode (localStorage sandbox)
// This keeps the login flow consistent with the data layer in
// firebase.js (which already auto-detects the same way).
//
// URL overrides: add ?demo to force the demo sandbox, or ?prod
// to force production — handy for testing either way.
// ============================================================

import { isFirebaseConfigured } from "./firebase.js";

// ============================================================
// MODE RESOLUTION (preview/demo vs production)
// Priority (highest → lowest):
//   1. URL flag (?demo / ?prod) — one-off override for the visiting tab
//   2. localStorage "flow.modeOverride" — persistent toggle set by the
//      Master Console (so master can flip modes without editing files
//      or remembering URL params)
//   3. Auto-detect from firebase-applet-config.json
// ============================================================
const _params = new URLSearchParams(location.search);
let _modeOverride = null;
try { _modeOverride = localStorage.getItem("flow.modeOverride"); } catch (e) {}
// Defensive: a "prod" override only makes sense if a real Firebase
// config is actually present. Otherwise we'd try to call Firebase Auth
// with auth=null and crash with "Cannot read properties of null".
// Silently demote to demo in that case and clear the bad override.
if (_modeOverride === "prod" && !isFirebaseConfigured) {
  try { localStorage.removeItem("flow.modeOverride"); } catch (e) {}
  _modeOverride = null;
  console.warn("[Mode] 'prod' override ignored — no Firebase config present. Falling back to demo.");
}
const PREVIEW_MODE = _params.has("prod") ? false
                   : _params.has("demo") ? true
                   : _modeOverride === "demo" ? true
                   : _modeOverride === "prod" ? false
                   : !isFirebaseConfigured;
// Expose to other modules (e.g. master-console) so they can decide
// whether the dashboard's preview banner should ever be re-shown.
if (typeof window !== "undefined") window.__flowIsProductionMode = !PREVIEW_MODE;

// ============================================================
// MASTER ACCOUNT — single hardcoded account with full control.
// Works in BOTH preview and production modes (bypasses Firebase Auth
// when needed). Anyone reading the JS source can see this credential,
// so treat it as a known internal-only login.
// To rotate: change the password here, redeploy.
// To transfer: change the email here OR (in production) set
//   /users/{newEmail}.role = "master" in Firestore.
// ============================================================
const MASTER_ACCOUNT = {
  email: "allen@flowgistik.id",
  password: "Allen!Flow2026",
  name: "Allen",
  role: "master",
  department: "Master"
};

// 4 demo accounts — type these into the login form to test each role.
// Password for ALL of them is just "demo"
const DEMO_ACCOUNTS = {
  "admin@demo":            { password: "demo", role: "admin",      name: "Demo Admin",            department: "Operations" },
  "supervisor.ss@demo":    { password: "demo", role: "supervisor", name: "Demo SS Supervisor",    department: "Sales Support" },
  "supervisor.sales@demo": { password: "demo", role: "supervisor", name: "Demo Sales Supervisor", department: "Sales" },
  "supervisor.ops@demo":   { password: "demo", role: "supervisor", name: "Demo Ops Supervisor",   department: "Operations" },
  "supervisor.ga@demo":    { password: "demo", role: "supervisor", name: "Demo GA Supervisor",    department: "General Affairs" },
  "user.ss@demo":          { password: "demo", role: "user",       name: "Demo SS User",          department: "Sales Support" },
  "user.sales@demo":       { password: "demo", role: "user",       name: "Demo Sales User",       department: "Sales" },
  "user.ops@demo":         { password: "demo", role: "user",       name: "Demo Ops User",         department: "Operations" },
  "user.ga@demo":          { password: "demo", role: "user",       name: "Demo GA User",          department: "General Affairs" }
};

// ============================================================
import { initAuth } from "./auth.js";
import {
  loadCurrentUserRole, setPreviewUser, canViewModule,
  roleLabel, roleBadgeClass, getCurrentRole, getCurrentEmail,
  isAdmin, isSupervisor, isMaster
} from "./roles.js";
import { initDashboard } from "./modules/dashboard.js";
import { initIssues, consumeIssuesNavAction } from "./modules/daily-issue.js";
import { initSalesTracker, initSSTracker, initGATracker } from "./modules/daily-tracker.js";
import { initInboundMonitoring } from "./modules/inbound-monitoring.js";
import { initMPForecasting } from "./modules/mp-forecasting.js";
import { initWeeklyReport } from "./modules/weekly-report.js";
import { initTickets, consumeTicketsNavAction } from "./modules/ticketing.js";
import { initRevenueCalc } from "./modules/revenue-calc.js";
import { initSalesToolkit } from "./modules/sales-toolkit.js";
import { initProjection } from "./modules/projection.js";
import { initUsers } from "./modules/users.js";
import { initMasterData, bootstrapMasterData } from "./modules/master-data.js";
import { initOneOnOne } from "./modules/one-on-one.js";
import { initMasterConsole } from "./modules/master-console.js";
import { initClientLinks } from "./modules/client-links.js";
import { mountDebugPanel, mountReportButton, logBreadcrumb } from "./debug-panel.js";
import { initMerger, initOrderProcessing, initDailyReconcile, initWeeklyReportGen, initForecastOrdersGen } from "./legacy/legacy-loader.js";
import { initGlobalSearch } from "./modules/global-search.js";
import { initAuditLog } from "./modules/audit-log.js";
import { initNotifications } from "./modules/notifications.js";
import { FEATURES } from "./features.js";
import { initI18n, t, onLangChange } from "./i18n.js";
import { $, toast } from "./utils.js";

const inited = {};
let _currentMenu = null;   // tracks the open page so its title can be re-translated

const PAGES = {
  dashboard: { title: "Dashboard", sub: "Overview of today's operations", init: initDashboard },
  dailyIssue: { title: "Daily Issue Tracker", sub: "Sales Support · Root-cause analysis log", init: initIssues, onShow: consumeIssuesNavAction },
  dailyTrackerSales: { title: "Daily Tracker — Sales", sub: "Daily tasks for Sales team", init: initSalesTracker },
  dailyTrackerSS: { title: "Daily Tracker — Sales Support", sub: "Daily / Projection / Improvement tasks", init: initSSTracker },
  inboundMonitoring: { title: "Inbound Monitoring", sub: "Vehicle arrivals, unloading, GRN processing", init: initInboundMonitoring },
  mpForecasting: { title: "MP Forecasting", sub: "Manpower forecast planning and roster management", init: initMPForecasting },
  dailyTrackerGA: { title: "Daily Tracker — General Affairs", sub: "Daily tasks and requests for GA team", init: initGATracker },
  ticketing: { title: "Internal Tickets", sub: "Department-wide ticket system", init: initTickets, onShow: consumeTicketsNavAction },
  revenueCalc: { title: "Revenue Calculator", sub: "Calculate monthly revenue per client", init: initRevenueCalc },
  salesToolkit: { title: "Sales Toolkit", sub: "Deal scoring, follow-up templates & objection playbook", init: initSalesToolkit },
  projectManagement: { title: "Projection Management", sub: "Client onboarding projects · multi-user, real-time", init: initProjection },
  mergerSystem: { title: "Merge System", sub: "Merge orders, Excel, PDF (v21)", init: initMerger },
  orderProcessing: { title: "Transaction", sub: "Master item, screening stock, orders generator (v21)", init: initOrderProcessing },
  dailyReconcile: { title: "Daily Reconcile", sub: "Reconcile daily orders (v21)", init: initDailyReconcile },
  weeklyReportGen: { title: "Weekly Report Generator", sub: "Inbound/outbound volume Excel generator (v21)", init: initWeeklyReportGen },
  forecastOrdersGen: { title: "Forecast Orders Generator", sub: "Outbound forecast summary · chart + by-client tables (v21)", init: initForecastOrdersGen },
  masterData: { title: "Master Data", sub: "Standardize departments, clients, and categories", init: initMasterData },
  auditLog: { title: "Activity Log", sub: "Audit trail — who changed what, and when", init: initAuditLog },
  oneOnOne: { title: "1-on-1 Summarizer", sub: "Run structured 1-on-1s · AI summary", init: initOneOnOne },
  users: { title: "User Management", sub: "Manage team accounts and roles", init: initUsers },
  clientLinks: { title: "Marketplace Hub", sub: "Workspace akses seller center · pilih marketplace → pilih toko → connect", init: initClientLinks },
  masterConsole: { title: "Master Console", sub: "Master-only controls · mode toggle, broadcast, kill switches", init: initMasterConsole }
};

// ============================================================
// APP-SHELL i18n (ID / EN) — nav, page titles, login, header.
// Individual modules still render Indonesian; migrate later.
// ============================================================
initI18n();
onLangChange(() => {
  if (_currentMenu && PAGES[_currentMenu]) {
    $("pageTitle").textContent = t(`page.${_currentMenu}.title`);
    $("pageSubtitle").textContent = t(`page.${_currentMenu}.sub`);
  }
});

// ============================================================
// NAV
// ============================================================
function applyRoleVisibility() {
  document.querySelectorAll(".nav button[data-menu]").forEach(btn => {
    btn.style.display = canViewModule(btn.dataset.menu) ? "" : "none";
  });
  // Admin-only sections (User Management)
  document.querySelectorAll("[data-admin-only]").forEach(el => {
    el.style.display = isAdmin() ? "" : "none";
  });
  // Supervisor + Admin sections (1-on-1, Master Data label)
  document.querySelectorAll("[data-show-for-supervisor]").forEach(el => {
    el.style.display = (isAdmin() || isSupervisor()) ? "" : "none";
  });
  // Master-only sections (the entire Master Console nav group)
  document.querySelectorAll("[data-master-only]").forEach(el => {
    el.style.display = isMaster() ? "" : "none";
  });
  // Auto-hide nav group labels when none of their following sibling
  // buttons (up to next group label) are visible — prevents empty
  // "Sales" / "Sales Support" headers showing for users in other depts.
  document.querySelectorAll(".nav .navGroup").forEach(group => {
    if (group.hasAttribute("data-admin-only") || group.hasAttribute("data-show-for-supervisor")) return;
    let next = group.nextElementSibling;
    let anyVisible = false;
    while (next && !next.classList.contains("navGroup")) {
      if (next.tagName === "BUTTON" && next.style.display !== "none") {
        anyVisible = true; break;
      }
      next = next.nextElementSibling;
    }
    group.style.display = anyVisible ? "" : "none";
  });
  const role = getCurrentRole();
  const el = $("userRoleBadge");
  if (el) {
    el.className = roleBadgeClass(role);
    el.textContent = roleLabel(role);
  }
}

function bindNav() {
  // Mobile sidebar toggle
  const sidebar = document.querySelector(".sidebar");
  const overlay = $("sidebarOverlay");
  const toggle = $("menuToggle");
  function closeMobileNav() {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
  }
  if (toggle) {
    toggle.addEventListener("click", () => {
      sidebar?.classList.toggle("open");
      overlay?.classList.toggle("open");
    });
  }
  if (overlay) overlay.addEventListener("click", closeMobileNav);

  // Desktop sidebar collapse — burger button in the top bar. State is
  // persisted so the sidebar stays hidden/shown across navigations and
  // page reloads.
  const app = document.querySelector(".app");
  const collapseBtn = $("navCollapseBtn");
  const NAV_KEY = "flow.navCollapsed";
  if (app && localStorage.getItem(NAV_KEY) === "1") {
    app.classList.add("nav-collapsed");
  }
  if (collapseBtn && !collapseBtn._wired) {
    collapseBtn._wired = true;
    collapseBtn.addEventListener("click", () => {
      // On mobile the burger is hidden; this controls the desktop sidebar.
      const collapsed = app.classList.toggle("nav-collapsed");
      try { localStorage.setItem(NAV_KEY, collapsed ? "1" : "0"); } catch (e) {}
    });
  }

  document.querySelectorAll(".nav button[data-menu]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeMobileNav();
      switchPage(btn.dataset.menu, btn);
    });
  });

  // Daily Tracker sub-tab switching (Tasks vs Weekly Report)
  document.querySelectorAll("[data-trktab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.trktab; // e.g. "sales-tasks" or "sales-weekly"
      const parent = btn.closest("section");
      parent.querySelectorAll("[data-trktab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      parent.querySelectorAll("[data-trkpane]").forEach(p => p.classList.add("hidden"));
      parent.querySelector(`[data-trkpane="${tab}"]`)?.classList.remove("hidden");
      // If user clicked Weekly tab, init the report
      if (tab.endsWith("-weekly")) {
        const team = tab.startsWith("sales") ? "sales" : "ss";
        initWeeklyReport(team);
      }
    });
  });

  // Merger/Order sub-tab switching (showSub helper from legacy)
  // legacy-global.js already exposes window.showSub; nothing to wire here.
}

function switchPage(menuId, clickedBtn) {
  if (!canViewModule(menuId)) {
    toast("You don't have access to this section", "error");
    return;
  }
  document.querySelectorAll(".nav button").forEach(b => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");
  else {
    const b = document.querySelector(`.nav button[data-menu="${menuId}"]`);
    if (b) b.classList.add("active");
  }
  document.querySelectorAll(".menu").forEach(s => s.classList.add("hidden"));
  const target = $(menuId);
  if (target) target.classList.remove("hidden");
  const page = PAGES[menuId];
  if (page) {
    _currentMenu = menuId;
    $("pageTitle").textContent = t(`page.${menuId}.title`);
    $("pageSubtitle").textContent = t(`page.${menuId}.sub`);
    logBreadcrumb("Page → " + t(`page.${menuId}.title`));
    if (!inited[menuId]) {
      try {
        page.init();
        inited[menuId] = true;
      } catch (e) {
        console.error(`Failed to init ${menuId}:`, e);
        toast(`Failed to load ${page.title}`, "error");
      }
    }
    // Fire on EVERY navigation, not just the first. Lets modules
    // honor `window.__pendingNavAction` (set by the dashboard when
    // a KPI tile or latest-issue row is clicked) without depending
    // on a fresh init.
    if (typeof page.onShow === "function") {
      try { page.onShow(); } catch (e) { console.warn(`onShow ${menuId} failed:`, e); }
    }
  }
}

// ============================================================
// REMEMBER ME
// Two storage keys:
//   • flow.rememberMe          — saved session (email/role/name/dept)
//   • flow.rememberMe.checked  — last state of the checkbox (so it
//     stays checked across visits if the user opted in)
// ============================================================
const REMEMBER_KEY = "flow.rememberMe";
const REMEMBER_CHECKED_KEY = "flow.rememberMe.checked";

function saveSession(email, role, name, department) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, role, name, department }));
  } catch (e) { /* ignore */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && s.email) ? s : null;
  } catch (e) { return null; }
}

function clearSession() {
  try {
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(REMEMBER_CHECKED_KEY);
  } catch (e) { /* ignore */ }
}

/** Restore the "Ingat saya" checkbox state from the last login.
 *  Called on page load so the box stays ticked if the user opted in
 *  before, and persists the new state when they click it. */
function wireRememberCheckbox() {
  const el = document.getElementById("rememberMe");
  if (!el) return;
  try {
    el.checked = localStorage.getItem(REMEMBER_CHECKED_KEY) === "1";
  } catch (e) { /* ignore */ }
  el.addEventListener("change", () => {
    try {
      localStorage.setItem(REMEMBER_CHECKED_KEY, el.checked ? "1" : "0");
      // If they UN-checked it, drop any saved session immediately
      // (otherwise next reload would still auto-login).
      if (!el.checked) localStorage.removeItem(REMEMBER_KEY);
    } catch (e) { /* ignore */ }
  });
}

/** Wire the eye icon next to the password field — toggles
 *  type=password / type=text and swaps the SVG. */
function wireViewPasswordToggle() {
  const btn = document.getElementById("pwToggleBtn");
  const input = document.getElementById("loginPassword");
  const eyeOpen = document.getElementById("pwEyeOpen");
  const eyeOff = document.getElementById("pwEyeOff");
  if (!btn || !input || !eyeOpen || !eyeOff) return;
  btn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    eyeOpen.style.display = showing ? "" : "none";
    eyeOff.style.display = showing ? "none" : "";
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    btn.title = showing ? "Show password" : "Hide password";
    input.focus();
  });
}

// Wire UI helpers as soon as the login form exists in the DOM.
wireRememberCheckbox();
wireViewPasswordToggle();

// Master setting: hide the yellow demo helper box on the login screen
// (set via Master Console → Mode & Display → Hide Box). Stays hidden
// across reloads until the master toggles it back on.
try {
  if (localStorage.getItem("flow.hideDemoHelper") === "1") {
    const helper = document.getElementById("demoHelper");
    if (helper) helper.style.display = "none";
  }
} catch (e) { /* ignore */ }

// Pre-seed disabled-modules from last session's cache so the nav
// doesn't show a hidden item for a split-second before the Firestore
// settings snapshot arrives and corrects it.
try {
  const cached = JSON.parse(localStorage.getItem("flow.disabledModules") || "[]");
  if (Array.isArray(cached)) window.__flowDisabledModules = cached;
} catch (e) { /* ignore */ }

// ============================================================
// MASTER LOGIN — checked FIRST in both preview and production paths.
// Bypasses Firebase Auth so the hardcoded credential works even when
// the email isn't registered in Firebase. Returns true if handled.
// ============================================================
function tryMasterLogin(email, password) {
  if (email !== MASTER_ACCOUNT.email.toLowerCase()) return false;
  if (password !== MASTER_ACCOUNT.password) return false;
  const errEl = document.getElementById("loginError");
  if (errEl) errEl.classList.add("hidden");
  bootApp(MASTER_ACCOUNT.email, MASTER_ACCOUNT.role, MASTER_ACCOUNT.name, MASTER_ACCOUNT.department);
  return true;
}

// ============================================================
// IMPERSONATION — master can set flow.impersonateAs in localStorage
// (via Master Console). When set, the next boot uses that identity
// instead of the actual login. Master themselves doesn't get
// impersonated — they cleared it before reloading.
// ============================================================
function applyImpersonationOverride(email, role, name, department) {
  try {
    const raw = localStorage.getItem("flow.impersonateAs");
    if (!raw) return { email, role, name, department };
    const imp = JSON.parse(raw);
    if (imp && imp.email) {
      console.log(`[Master] Impersonating ${imp.email} (${imp.role}) — clear via Master Console.`);
      return { email: imp.email, role: imp.role || "user", name: imp.name || imp.email, department: imp.department || "" };
    }
  } catch (e) { /* fall through */ }
  return { email, role, name, department };
}

// ============================================================
// SESSION START — used to decide whether a force-refresh signal
// from /app_settings/global.forceRefreshAt applies to us (yes if
// our session predates it, otherwise we already loaded the new code).
// ============================================================
const SESSION_START_MS = Date.now();

// ============================================================
// ORG-WIDE SETTINGS SUBSCRIBER
// Subscribes to /app_settings/global and reacts to:
//   • maintenanceMode      → lockscreen for non-master users
//   • broadcastMessage     → banner strip across the top
//   • forceRefreshAt       → auto-reload if our session is older
// ============================================================
let _settingsBound = false;
async function bindMasterSettings() {
  if (_settingsBound) return;
  _settingsBound = true;
  try {
    const { doc, onSnapshot } = await import("./firebase.js");
    const ref = doc("app_settings", "global");
    onSnapshot(ref, (snap) => {
      const s = (snap && snap.exists && snap.exists()) ? snap.data() : {};
      applyMasterSettings(s);
    });
  } catch (e) {
    console.warn("[Master] settings subscription failed (likely offline):", e?.message);
  }
}

function applyMasterSettings(s) {
  // Maintenance lockscreen (non-master only)
  if (s.maintenanceMode && !isMaster()) {
    showMaintenanceLock(s.maintenanceMessage || "Under maintenance. Back shortly.");
  } else {
    hideMaintenanceLock();
  }
  // Broadcast banner
  if (s.broadcastMessage) {
    showBroadcastBanner(s.broadcastMessage, s.broadcastSeverity || "info");
  } else {
    hideBroadcastBanner();
  }
  // Force refresh
  if (s.forceRefreshAt && s.forceRefreshAt > SESSION_START_MS && !isMaster()) {
    // Random 0-30s jitter so a thousand tabs don't reload simultaneously
    const jitter = Math.floor(Math.random() * 30000);
    setTimeout(() => location.reload(), jitter);
  }
  // Module visibility — master-curated list of module IDs hidden from
  // non-master users. Cached in localStorage to eliminate flicker on
  // next page load (Firestore snapshot then replaces the cache).
  const disabled = Array.isArray(s.disabledModules) ? s.disabledModules : [];
  window.__flowDisabledModules = disabled;
  try { localStorage.setItem("flow.disabledModules", JSON.stringify(disabled)); } catch (e) {}
  // Re-apply nav visibility live (no reload needed)
  try { applyRoleVisibility(); } catch (e) { /* bootApp not done yet */ }
}

function showMaintenanceLock(msg) {
  if (document.getElementById("maintLock")) return;
  const lock = document.createElement("div");
  lock.id = "maintLock";
  lock.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.95);color:#fff;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px;font-family:inherit";
  lock.innerHTML = `<div style="max-width:420px"><div style="font-size:56px">🔒</div><h2 style="color:#fff;margin:16px 0 8px;font-size:24px">Under Maintenance</h2><p style="color:#cbd5e1;line-height:1.6">${msg.replace(/[<>]/g, "")}</p><p class="small" style="color:#64748b;margin-top:24px">This page will refresh automatically when access is restored.</p></div>`;
  document.body.appendChild(lock);
}
function hideMaintenanceLock() {
  const el = document.getElementById("maintLock");
  if (el) el.remove();
}

function showBroadcastBanner(msg, severity) {
  let bar = document.getElementById("broadcastBar");
  const colors = {
    info:   { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6" },
    warn:   { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
    danger: { bg: "#fee2e2", text: "#991b1b", border: "#dc2626" }
  };
  const c = colors[severity] || colors.info;
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "broadcastBar";
    bar.style.cssText = "position:sticky;top:0;z-index:9000;padding:10px 18px;font-size:13px;font-weight:600;text-align:center;border-bottom:2px solid";
    document.body.insertBefore(bar, document.body.firstChild);
  }
  bar.style.background = c.bg;
  bar.style.color = c.text;
  bar.style.borderBottomColor = c.border;
  bar.textContent = "📣 " + msg;
}
function hideBroadcastBanner() {
  const el = document.getElementById("broadcastBar");
  if (el) el.remove();
}

// ============================================================
// SHARED BOOT (after auth/demo success)
// ============================================================
function bootApp(email, role, name, department) {
  // Apply impersonation BEFORE setting the preview user, so all
  // role checks downstream see the impersonated identity.
  const impersonated = applyImpersonationOverride(email, role, name, department);
  email = impersonated.email; role = impersonated.role;
  name = impersonated.name; department = impersonated.department;
  // Save session if remember me is checked
  const rememberEl = $("rememberMe");
  if (rememberEl && rememberEl.checked) {
    saveSession(email, role, name, department);
  }
  $("loginGate").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userBadgeEmail").textContent = email;
  setPreviewUser({ email, role, name, department });
  window.PREVIEW_MODE_INTERNAL = PREVIEW_MODE;
  // Activity Log — optional (toggle in features.js). Hide its nav
  // entry entirely when disabled.
  if (!FEATURES.auditLog) {
    const ab = document.querySelector('.nav button[data-menu="auditLog"]');
    if (ab) ab.remove();
  }
  applyRoleVisibility();
  bindNav();
  // Global search — optional (toggle in features.js).
  if (FEATURES.globalSearch) {
    initGlobalSearch();
  } else {
    const gs = document.querySelector(".globalSearch");
    if (gs) gs.style.display = "none";
  }
  // Notifications — optional (toggle in features.js).
  if (FEATURES.notifications) {
    initNotifications();
  } else {
    const nw = document.querySelector(".notifWrap");
    if (nw) nw.style.display = "none";
  }
  bindGlobalModalClose();
  bootstrapMasterData();
  mountDebugPanel();
  mountReportButton();
  // Show the preview banner only in preview mode AND when the master
  // hasn't asked to hide demo UI (Master Console → Hide Box). Wire the
  // wipe button regardless so the banner works if later un-hidden.
  const _hideDemoUI = (() => { try { return localStorage.getItem("flow.hideDemoHelper") === "1"; } catch (e) { return false; } })();
  if (PREVIEW_MODE && !_hideDemoUI) {
    const banner = $("previewBanner");
    if (banner) banner.classList.remove("hidden");
  }
  if (PREVIEW_MODE) {
    const wipe = $("previewWipeBtn");
    if (wipe && !wipe._wired) {
      wipe._wired = true;
      wipe.addEventListener("click", () => {
        if (confirm("Wipe ALL demo data (issues, tickets, tasks, users you created)? Built-in demo accounts will return on next page load.")) {
          try { localStorage.clear(); } catch (e) {}
          location.reload();
        }
      });
    }
  }
  switchPage("dashboard", document.querySelector('.nav button[data-menu="dashboard"]'));
  // Org-wide settings subscriber — maintenance lock, broadcast banner,
  // forced refresh. Bound once per session, applies live to every user.
  bindMasterSettings();
}

// Single delegated handler for ALL modal X buttons — works for
// static modals in index.html AND modals rendered dynamically by modules.
function bindGlobalModalClose() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".modalClose");
    if (!btn) return;
    const modal = btn.closest(".modal");
    if (modal) modal.classList.add("hidden");
  });
  // ESC to close the topmost open modal
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".modal:not(.hidden)")];
    if (open.length) open[open.length - 1].classList.add("hidden");
  });
}

// ============================================================
// LOGIN MODE: PREVIEW (demo accounts) or PRODUCTION (Firebase)
// ============================================================

if (PREVIEW_MODE) {
  console.log("%cPREVIEW MODE — full local sandbox. Data persists in your browser.", "color:#7c3aed;font-weight:bold");

  // Auto-login from saved session (remember me)
  const saved = loadSession();
  if (saved) {
    bootApp(saved.email, saved.role, saved.name, saved.department);
  } else {
    // Wire up the demo buttons (auto-fill + auto-submit)
    document.querySelectorAll(".demoLoginBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        $("loginEmail").value = btn.dataset.email;
        $("loginPassword").value = btn.dataset.pwd;
        $("loginBtn").click();
      });
    });

    // Intercept the sign-in button. In preview mode we accept BOTH:
    //   1) The hardcoded DEMO_ACCOUNTS above (always available)
    //   2) Accounts created by a supervisor via User Management
    async function previewLogin() {
      const email = $("loginEmail").value.trim().toLowerCase();
      const password = $("loginPassword").value;
      const errEl = $("loginError");

      // 0. Master account — works in preview AND production
      if (tryMasterLogin(email, password)) return;

      // 1. Hardcoded demo accounts
      const account = DEMO_ACCOUNTS[email];
      if (account && account.password === password) {
        errEl.classList.add("hidden");
        bootApp(email, account.role, account.name, account.department);
        return;
      }

      // 2. Supervisor-created accounts in the preview store
      try {
        const { getDoc, doc, COL } = await import("./firebase.js");
        const snap = await getDoc(doc(COL.USERS, email));
        if (snap.exists()) {
          const data = snap.data();
          if (data.previewPassword && data.previewPassword === password) {
            errEl.classList.add("hidden");
            bootApp(email, data.role || "user", data.name || email.split("@")[0], data.department || "");
            return;
          }
        }
      } catch (e) {
        console.warn("Preview-store login lookup failed:", e);
      }

      errEl.textContent = "Wrong email or password. Click a demo button below, or ask a supervisor to create an account.";
      errEl.classList.remove("hidden");
    }
    $("loginBtn").addEventListener("click", previewLogin);

    // Enter-key submits too
    $("loginPassword").addEventListener("keydown", e => {
      if (e.key === "Enter") $("loginBtn").click();
    });
  }

  // Logout button clears session and reloads (always wired, even after auto-login)
  $("logoutBtn").addEventListener("click", () => {
    clearSession();
    location.reload();
  });

} else {
  // PRODUCTION: real Firebase auth + hide demo helper
  const demoHelper = document.getElementById("demoHelper");
  if (demoHelper) demoHelper.style.display = "none";

  // In PRODUCTION mode the master must exist in Firebase Auth (created
  // manually in Firebase Console — see DEPLOY.md) so that Firestore
  // writes from the master session work. We let the normal Firebase
  // login flow handle it — roles.js auto-detects MASTER_EMAIL and
  // grants the master role on first login, also self-bootstrapping
  // the /users/{email} doc. No client-side bypass needed here.

  initAuth(
    async (user) => {
      await loadCurrentUserRole(user);
      bootApp(getCurrentEmail(), getCurrentRole(), user.email.split("@")[0]);
    },
    () => { Object.keys(inited).forEach(k => delete inited[k]); }
  );
}
