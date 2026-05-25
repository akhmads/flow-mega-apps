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

const _params = new URLSearchParams(location.search);
const PREVIEW_MODE = _params.has("prod") ? false
                   : _params.has("demo") ? true
                   : !isFirebaseConfigured;

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
  isAdmin, isSupervisor
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
  users: { title: "User Management", sub: "Manage team accounts and roles", init: initUsers }
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
// ============================================================
const REMEMBER_KEY = "flow.rememberMe";

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
  try { localStorage.removeItem(REMEMBER_KEY); } catch (e) { /* ignore */ }
}

// ============================================================
// SHARED BOOT (after auth/demo success)
// ============================================================
function bootApp(email, role, name, department) {
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
  // Show the preview banner only in preview mode + wire the wipe button
  if (PREVIEW_MODE) {
    const banner = $("previewBanner");
    if (banner) banner.classList.remove("hidden");
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
  initAuth(
    async (user) => {
      await loadCurrentUserRole(user);
      bootApp(getCurrentEmail(), getCurrentRole(), user.email.split("@")[0]);
    },
    () => { Object.keys(inited).forEach(k => delete inited[k]); }
  );
}
