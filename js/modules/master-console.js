// ============================================================
// FLOW Mega Apps — Master Console
//
// Master-only operations console. Lives at /masterConsole nav slot.
// Single hardcoded master (see MASTER_ACCOUNT in app.js); no other
// role can reach this module — gated by canViewModule("masterConsole")
// AND by data-master-only on the nav button.
//
// Capabilities (grouped):
//   • Mode      — flip demo / production override (per-browser)
//   • Display   — hide yellow demo helper (per-browser)
//   • Ops       — maintenance lockscreen, broadcast banner, force refresh
//                 (org-wide, persisted to Firestore /app_settings/global)
//   • Power     — impersonate any user (per-browser session)
//   • Features  — kill switch for any feature flag (org-wide override)
//   • AI        — org-wide Gemini API key for 1-on-1 summarizer
//   • Users     — promote/demote anyone to any role (incl. master)
//   • Data      — export current store as JSON (backup)
//   • Audit     — tail of recent logins + activity entries
//
// Storage layout:
//   localStorage:
//     flow.modeOverride        "demo" | "prod" | (absent → auto)
//     flow.hideDemoHelper      "1" if yellow box should stay hidden
//     flow.impersonateAs       JSON {email, role, name, department}
//     flow.featureOverrides    {flag: bool}  — already used by features.js
//   Firestore /app_settings/global:
//     maintenanceMode          boolean
//     maintenanceMessage       string
//     broadcastMessage         string
//     broadcastSeverity        "info" | "warn" | "danger"
//     forceRefreshAt           number (Date.now()) — clients reload if
//                              their session predates this stamp
//     aiApiKey                 string (Gemini key, shared)
//     updatedAt / updatedBy    standard audit fields
// ============================================================

import { $, esc, toast } from "../utils.js";
import {
  isMaster, listUsers, upsertUserProfile, getCurrentEmail
} from "../roles.js";
import {
  COL, doc, getDoc, setDoc, getDocs, collection, query, orderBy, limit, serverTimestamp
} from "../firebase.js";
import { FEATURES, FEATURE_DEFAULTS, APP_VERSION, BUILD_DATE } from "../features.js";
import { snapshotNavLayout, applySidebarLayout } from "./sidebar-layout.js";

const SETTINGS_COL = "app_settings";
const SETTINGS_DOC = "global";

// Modules that master can hide from non-master users.
// Master Console + Dashboard are intentionally excluded — they must
// always be reachable (the console to undo the hide, the dashboard
// because it's the landing page).
const TOGGLEABLE_MODULES = [
  { id: "clientLinks",        label: "Marketplace Hub",              group: "Sales Support" },
  { id: "dailyIssue",         label: "Daily Issue Tracker",          group: "Sales Support" },
  { id: "dailyTrackerSales",  label: "Daily Tracker — Sales",        group: "Sales" },
  { id: "dailyTrackerSS",     label: "Daily Tracker — Sales Support",group: "Sales Support" },
  { id: "dailyTrackerGA",     label: "Daily Tracker — GA",           group: "General Affairs" },
  { id: "inboundMonitoring",  label: "Inbound Monitoring",           group: "Operations" },
  { id: "mpForecasting",      label: "MP Forecasting",               group: "Operations" },
  { id: "ticketing",          label: "Internal Tickets",             group: "Department" },
  { id: "revenueCalc",        label: "Revenue Calculator",           group: "Sales" },
  { id: "salesToolkit",       label: "Sales Toolkit",                group: "Sales" },
  { id: "projectManagement",  label: "Projection Management",        group: "Tools" },
  { id: "mergerSystem",       label: "Merge System",                 group: "Tools" },
  { id: "orderProcessing",    label: "Transaction",                  group: "Tools" },
  { id: "dailyReconcile",     label: "Daily Reconcile",              group: "Tools" },
  { id: "weeklyReportGen",    label: "Weekly Report Generator",      group: "Tools" },
  { id: "forecastOrdersGen",  label: "Forecast Orders Generator",    group: "Tools" },
  { id: "oneOnOne",           label: "1-on-1 Summarizer",            group: "Management" },
  { id: "masterData",         label: "Master Data",                  group: "Management" },
  { id: "auditLog",           label: "Activity Log",                 group: "Management" },
  { id: "users",              label: "User Management",              group: "Management" }
];

// ============================================================
// ENTRY
// ============================================================
export function initMasterConsole() {
  const root = $("masterConsoleRoot");
  if (!root) return;
  if (!isMaster()) {
    root.innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <h2>Access Denied</h2>
        <p>Master Console is reserved for the master account.</p>
      </div>`;
    return;
  }
  root.innerHTML = renderShell();
  bindEvents();
  loadAndRenderSettings();
  renderImpersonateOptions();
  renderFeatureGrid();
  renderModuleGrid([]);   // initial paint — actual state filled in by loadAndRenderSettings()
  renderAuditFeed();
}

// ============================================================
// SHELL
// ============================================================
function renderShell() {
  const mode = currentMode();
  const hideDemo = localStorage.getItem("flow.hideDemoHelper") === "1";
  const impersonating = readImpersonation();

  return `
    <div class="card mcHeader">
      <div>
        <span class="pmPill" style="background:#fef3c7;color:#92400e;border:1px solid #f59e0b">MASTER</span>
        <h2 style="margin:8px 0 4px">Master Console</h2>
        <p class="small" style="color:var(--muted);margin:0">Controls that only you can use. Changes either apply to your browser, or org-wide.</p>
      </div>
      <div class="mcVer">v${APP_VERSION} · ${BUILD_DATE}</div>
    </div>

    ${impersonating ? `
    <div class="card" style="background:#fff7ed;border-left:4px solid #ea580c">
      <div class="pmHeaderActions">
        <div class="left">
          <h2 style="margin:0;color:#9a3412">Currently Impersonating</h2>
          <p style="margin:6px 0 0">You are viewing the app as <b>${esc(impersonating.name || impersonating.email)}</b> (${esc(impersonating.role)}). Refresh after stopping to restore master view.</p>
        </div>
        <div class="right">
          <button class="secondary" id="mcStopImpersonate">Stop Impersonating</button>
        </div>
      </div>
    </div>` : ""}

    <!-- A + B: Mode toggle + Hide demo helper -->
    <div class="card">
      <h2 style="margin:0 0 10px">Mode &amp; Display</h2>
      <div class="mcGrid2">
        <div class="mcTile">
          <div class="mcLabel">Current Mode</div>
          <div class="mcBig">${mode === "demo" ? "🟡 Demo / Preview" : "🟢 Production"}</div>
          <p class="small">${mode === "demo" ? "Demo accounts visible, data in localStorage." : "Real Firebase auth + Firestore writes."}</p>
          <div class="mcBtnRow">
            <button class="${mode === "demo" ? "secondary" : "primary"}" id="mcModeProd">Switch to Production</button>
            <button class="${mode === "demo" ? "primary" : "secondary"}" id="mcModeDemo">Switch to Demo</button>
            <button class="secondary" id="mcModeAuto" title="Clear override — auto-detect from firebase-applet-config.json">Auto</button>
          </div>
        </div>
        <div class="mcTile">
          <div class="mcLabel">Yellow Demo Helper Box (login screen)</div>
          <div class="mcBig">${hideDemo ? "🚫 Hidden" : "👁️ Visible"}</div>
          <p class="small">Hide it for client demos / screen-share while keeping demo mode on.</p>
          <div class="mcBtnRow">
            <button class="${hideDemo ? "secondary" : "primary"}" id="mcHideDemo">Hide Box</button>
            <button class="${hideDemo ? "primary" : "secondary"}" id="mcShowDemo">Show Box</button>
          </div>
        </div>
      </div>
    </div>

    <!-- C + D + K: Maintenance, Broadcast, Force refresh -->
    <div class="card">
      <h2 style="margin:0 0 10px">Operations (Org-wide)</h2>
      <p class="small" style="color:var(--muted);margin:0 0 14px">These settings sync to every logged-in user via Firestore.</p>

      <div class="mcSection">
        <h3>🔒 Maintenance Mode</h3>
        <p class="small">When ON, non-master users see a lockscreen. You stay in.</p>
        <div class="mcRow">
          <input type="text" id="mcMaintMsg" placeholder="Optional message (e.g. 'Back at 8pm WIB — DB migration')" />
          <button class="primary" id="mcMaintOn">Lock Everyone Out</button>
          <button class="secondary" id="mcMaintOff">Unlock</button>
        </div>
        <div class="small mcStatus" id="mcMaintStatus">Status: —</div>
      </div>

      <div class="mcSection">
        <h3>📣 Broadcast Banner</h3>
        <p class="small">Strip shown at top of every page until you clear it.</p>
        <div class="mcRow">
          <input type="text" id="mcBroadcastMsg" placeholder="Type announcement here…" />
          <select id="mcBroadcastSev">
            <option value="info">Info (blue)</option>
            <option value="warn">Warning (amber)</option>
            <option value="danger">Danger (red)</option>
          </select>
          <button class="primary" id="mcBroadcastOn">Post</button>
          <button class="secondary" id="mcBroadcastOff">Clear</button>
        </div>
        <div class="small mcStatus" id="mcBroadcastStatus">Status: —</div>
      </div>

      <div class="mcSection">
        <h3>🔁 Force Refresh All Users</h3>
        <p class="small">Bumps a timestamp. Any client whose session is older auto-reloads within ~30s. Use after deploying a new version.</p>
        <div class="mcRow">
          <button class="primary" id="mcForceRefresh">Force Refresh</button>
        </div>
        <div class="small mcStatus" id="mcRefreshStatus">Last forced: —</div>
      </div>
    </div>

    <!-- E: Impersonation -->
    <div class="card">
      <h2 style="margin:0 0 10px">Impersonate User</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">View the app as anyone — for debugging "it doesn't work for me" reports. Only affects your browser.</p>
      <div class="mcRow">
        <select id="mcImpersonateSel"><option value="">— Pick a user —</option></select>
        <button class="primary" id="mcImpersonateBtn">Impersonate &amp; Reload</button>
      </div>
    </div>

    <!-- F: Feature kill switches -->
    <div class="card">
      <h2 style="margin:0 0 10px">Feature Kill Switches</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Flip a flag off if a module is breaking in production. Overrides defaults until you clear them. <b>Per-browser</b> — for org-wide control, use Module Visibility below.</p>
      <div id="mcFeatureGrid" class="mcFeatureGrid"></div>
      <div class="mcBtnRow" style="margin-top:10px">
        <button class="secondary" id="mcFeatureReset">Reset to Defaults</button>
      </div>
    </div>

    <!-- Module Visibility — org-wide hide-from-non-master toggles -->
    <div class="card">
      <h2 style="margin:0 0 10px">🚫 Module Visibility (Org-wide)</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Hide entire modules from non-master users. Use this to soft-launch unfinished features — toggle off, deploy, finish polishing, toggle on. You (master) always see hidden modules so you can manage them.</p>
      <div id="mcModuleGrid" class="mcFeatureGrid"></div>
      <div class="mcBtnRow" style="margin-top:10px">
        <button class="primary" id="mcModulesSave">Save &amp; Apply Org-wide</button>
        <button class="secondary" id="mcModulesShowAll">Show All</button>
      </div>
      <div class="small mcStatus" id="mcModulesStatus">—</div>
    </div>

    <!-- Sidebar Editor — drag to reorder, click to rename, move between groups -->
    <div class="card">
      <h2 style="margin:0 0 10px">📐 Sidebar Editor (Org-wide)</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Drag the ⠿ handles to reorder items or whole groups. Click any label to rename it. Drop an item under a different group label to move it. Saves to every user.</p>
      <div class="mcBtnRow" style="margin-bottom:10px">
        <button class="secondary" id="mcSidebarAddGroup">+ New Department (Group)</button>
        <button class="secondary" id="mcSidebarAddTracker">+ Daily Tracker for Dept</button>
      </div>
      <div id="mcSidebarList" class="mcSidebarList"></div>
      <div class="mcBtnRow" style="margin-top:12px">
        <button class="primary"   id="mcSidebarSave">Save &amp; Apply Org-wide</button>
        <button class="secondary" id="mcSidebarReset">Reset to Defaults</button>
        <button class="secondary" id="mcSidebarRevert">Revert Unsaved</button>
      </div>
      <div class="small mcStatus" id="mcSidebarStatus">—</div>
    </div>

    <!-- I: AI key -->
    <div class="card">
      <h2 style="margin:0 0 10px">Org-wide AI Key (Gemini)</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Set once here — every supervisor's 1-on-1 Summarizer uses it automatically. Stored in Firestore, never shown again after save. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.</p>
      <div class="mcRow">
        <input type="password" id="mcAiKey" placeholder="AIza… or AQ.…" autocomplete="off" />
        <button class="primary" id="mcAiKeySave">Save Key</button>
        <button class="secondary" id="mcAiKeyClear">Clear</button>
      </div>
      <div class="small mcStatus" id="mcAiKeyStatus">Status: —</div>
    </div>

    <!-- N: Promote/demote -->
    <div class="card">
      <h2 style="margin:0 0 10px">Promote / Demote Any User</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Direct role assignment — bypasses normal supervisor restrictions. Use to grant another master if you need a backup.</p>
      <div class="mcRow">
        <select id="mcPromoteSel"><option value="">— Pick a user —</option></select>
        <select id="mcPromoteRole">
          <option value="master">Master</option>
          <option value="admin">Admin</option>
          <option value="supervisor">Supervisor</option>
          <option value="user">User</option>
        </select>
        <button class="primary" id="mcPromoteBtn">Apply</button>
      </div>
      <div class="small" style="color:#dc2626;margin-top:6px">⚠ Granting <b>master</b> gives full control — irreversible from inside the app if they lock you out.</div>
    </div>

    <!-- L: Data export -->
    <div class="card">
      <h2 style="margin:0 0 10px">Backup / Data Export</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Dumps every Firestore collection as one JSON file. Save it somewhere safe.</p>
      <div class="mcBtnRow">
        <button class="primary" id="mcExportBtn">Download Full Backup (JSON)</button>
      </div>
      <div class="small mcStatus" id="mcExportStatus"></div>
    </div>

    <!-- O: Audit feed -->
    <div class="card">
      <h2 style="margin:0 0 10px">Recent Activity (Audit)</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Last 30 entries from the audit log — who changed what, when.</p>
      <div id="mcAuditFeed" class="mcAuditFeed"><span class="small">Loading…</span></div>
    </div>
  `;
}

// ============================================================
// EVENT WIRING
// ============================================================
function bindEvents() {
  // A: Mode
  $("mcModeProd").onclick = () => setMode("prod");
  $("mcModeDemo").onclick = () => setMode("demo");
  $("mcModeAuto").onclick = () => setMode(null);

  // B: Hide demo helper — hides BOTH the yellow login-screen helper
  // AND the purple "Preview / Demo Mode" banner on the dashboard,
  // immediately + persisted across reloads.
  $("mcHideDemo").onclick = () => {
    localStorage.setItem("flow.hideDemoHelper", "1");
    const helper = document.getElementById("demoHelper");
    if (helper) helper.style.display = "none";
    const banner = document.getElementById("previewBanner");
    if (banner) banner.classList.add("hidden");
    toast("Demo box hidden everywhere", "success");
  };
  $("mcShowDemo").onclick = () => {
    localStorage.removeItem("flow.hideDemoHelper");
    const helper = document.getElementById("demoHelper");
    if (helper) helper.style.display = "";
    // Only re-show the dashboard banner if we're actually in preview mode
    // (no Firebase). In production the banner has no business appearing.
    const banner = document.getElementById("previewBanner");
    if (banner && !window.__flowIsProductionMode) banner.classList.remove("hidden");
    toast("Demo box restored", "success");
  };

  // C: Maintenance
  $("mcMaintOn").onclick = () => setSetting({
    maintenanceMode: true,
    maintenanceMessage: $("mcMaintMsg").value.trim() || "Under maintenance. Back shortly."
  }).then(() => { toast("Maintenance lock ON — everyone except you is locked out", "success"); loadAndRenderSettings(); });
  $("mcMaintOff").onclick = () => setSetting({ maintenanceMode: false })
    .then(() => { toast("Maintenance unlocked", "success"); loadAndRenderSettings(); });

  // D: Broadcast
  $("mcBroadcastOn").onclick = () => {
    const msg = $("mcBroadcastMsg").value.trim();
    if (!msg) return toast("Type a message first", "error");
    setSetting({ broadcastMessage: msg, broadcastSeverity: $("mcBroadcastSev").value })
      .then(() => { toast("Broadcast posted", "success"); loadAndRenderSettings(); });
  };
  $("mcBroadcastOff").onclick = () => setSetting({ broadcastMessage: "" })
    .then(() => { toast("Broadcast cleared", "success"); loadAndRenderSettings(); });

  // K: Force refresh
  $("mcForceRefresh").onclick = () => {
    if (!confirm("Force every logged-in user to reload? Their unsaved input may be lost.")) return;
    setSetting({ forceRefreshAt: Date.now() })
      .then(() => { toast("Force-refresh signal sent — users reload within ~30s", "success"); loadAndRenderSettings(); });
  };

  // E: Impersonation
  $("mcImpersonateBtn").onclick = () => {
    const email = $("mcImpersonateSel").value;
    if (!email) return toast("Pick a user", "error");
    const u = _userCache.find(x => x.email === email);
    if (!u) return toast("User not found", "error");
    localStorage.setItem("flow.impersonateAs", JSON.stringify({
      email: u.email, role: u.role || "user", name: u.name || u.email.split("@")[0], department: u.department || ""
    }));
    toast(`Impersonating ${u.name || u.email}…`, "success");
    setTimeout(() => location.reload(), 500);
  };
  if ($("mcStopImpersonate")) {
    $("mcStopImpersonate").onclick = () => {
      localStorage.removeItem("flow.impersonateAs");
      toast("Stopped impersonating", "success");
      setTimeout(() => location.reload(), 500);
    };
  }

  // F: Feature reset
  $("mcFeatureReset").onclick = () => {
    if (!confirm("Clear all feature overrides and use defaults?")) return;
    localStorage.removeItem("flow.featureOverrides");
    toast("Feature overrides cleared — reloading", "success");
    setTimeout(() => location.reload(), 500);
  };

  // I: AI key
  $("mcAiKeySave").onclick = () => {
    const key = $("mcAiKey").value.trim();
    if (!key.startsWith("AIza") && !key.startsWith("AQ.")) return toast("Gemini key should start with AIza… or AQ.…", "error");
    setSetting({ aiApiKey: key })
      .then(() => { toast("AI key saved org-wide", "success"); $("mcAiKey").value = ""; loadAndRenderSettings(); });
  };
  $("mcAiKeyClear").onclick = () => setSetting({ aiApiKey: "" })
    .then(() => { toast("AI key cleared", "success"); loadAndRenderSettings(); });

  // N: Promote
  $("mcPromoteBtn").onclick = async () => {
    const email = $("mcPromoteSel").value;
    const role = $("mcPromoteRole").value;
    if (!email) return toast("Pick a user", "error");
    if (role === "master" && !confirm(`Grant MASTER role to ${email}? This gives them every power you have, including the ability to demote you.`)) return;
    const u = _userCache.find(x => x.email === email);
    try {
      await upsertUserProfile({
        email, role, name: u?.name || email.split("@")[0], department: u?.department || ""
      });
      toast(`${email} is now ${role}`, "success");
      loadUsers();
    } catch (e) {
      toast("Failed: " + e.message, "error");
    }
  };

  // L: Export
  $("mcExportBtn").onclick = exportEverything;

  // Module Visibility — save org-wide
  $("mcModulesSave").onclick = async () => {
    const disabled = [];
    document.querySelectorAll("#mcModuleGrid input[data-mod]").forEach(cb => {
      if (!cb.checked) disabled.push(cb.dataset.mod);
    });
    try {
      await setSetting({ disabledModules: disabled });
      toast(`Saved · ${disabled.length} module${disabled.length === 1 ? "" : "s"} hidden from non-master users`, "success");
      $("mcModulesStatus").textContent = disabled.length
        ? `🚫 Hiding ${disabled.length}: ${disabled.join(", ")}`
        : "All modules visible to everyone.";
    } catch (e) {
      toast("Save failed: " + e.message, "error");
    }
  };
  $("mcModulesShowAll").onclick = async () => {
    document.querySelectorAll("#mcModuleGrid input[data-mod]").forEach(cb => cb.checked = true);
    try {
      await setSetting({ disabledModules: [] });
      toast("All modules visible to everyone", "success");
      $("mcModulesStatus").textContent = "All modules visible to everyone.";
    } catch (e) {
      toast("Save failed: " + e.message, "error");
    }
  };

  // Sidebar Editor
  initSidebarEditor();
  $("mcSidebarSave").onclick = saveSidebarLayout;
  $("mcSidebarReset").onclick = resetSidebarLayout;
  $("mcSidebarRevert").onclick = () => { initSidebarEditor(true); };
  $("mcSidebarAddGroup").onclick = addNewSidebarGroup;
  $("mcSidebarAddTracker").onclick = addNewSidebarTracker;
}

// ============================================================
// SETTINGS (Firestore /app_settings/global)
// ============================================================
async function getSetting() {
  try {
    const snap = await getDoc(doc(SETTINGS_COL, SETTINGS_DOC));
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    console.warn("[MasterConsole] getSetting failed:", e.message);
    return {};
  }
}

async function setSetting(patch) {
  try {
    await setDoc(doc(SETTINGS_COL, SETTINGS_DOC), {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: getCurrentEmail() || "master"
    }, { merge: true });
  } catch (e) {
    toast("Settings save failed: " + e.message, "error");
    throw e;
  }
}

async function loadAndRenderSettings() {
  const s = await getSetting();
  // Maintenance
  const mEl = $("mcMaintStatus");
  if (mEl) {
    mEl.textContent = s.maintenanceMode
      ? `Status: 🔒 LOCKED — "${s.maintenanceMessage || ""}"`
      : "Status: Unlocked (everyone has access)";
    mEl.style.color = s.maintenanceMode ? "#dc2626" : "var(--muted)";
  }
  if ($("mcMaintMsg")) $("mcMaintMsg").value = s.maintenanceMessage || "";

  // Broadcast
  const bEl = $("mcBroadcastStatus");
  if (bEl) {
    bEl.textContent = s.broadcastMessage
      ? `Status: 📣 Live — "${s.broadcastMessage}" (${s.broadcastSeverity || "info"})`
      : "Status: No active broadcast";
    bEl.style.color = s.broadcastMessage ? "#0369a1" : "var(--muted)";
  }
  if ($("mcBroadcastMsg")) $("mcBroadcastMsg").value = s.broadcastMessage || "";
  if ($("mcBroadcastSev")) $("mcBroadcastSev").value = s.broadcastSeverity || "info";

  // Force refresh
  if ($("mcRefreshStatus")) {
    $("mcRefreshStatus").textContent = s.forceRefreshAt
      ? `Last forced: ${new Date(s.forceRefreshAt).toLocaleString()}`
      : "Last forced: —";
  }

  // AI key (don't display the key itself — only whether one is set)
  if ($("mcAiKeyStatus")) {
    $("mcAiKeyStatus").textContent = s.aiApiKey
      ? `Status: ✅ Key set (••••${s.aiApiKey.slice(-4)})`
      : "Status: No key set — supervisors must enter their own per browser";
    $("mcAiKeyStatus").style.color = s.aiApiKey ? "#16a34a" : "var(--muted)";
  }

  // Module visibility
  const disabled = Array.isArray(s.disabledModules) ? s.disabledModules : [];
  renderModuleGrid(disabled);
  if ($("mcModulesStatus")) {
    $("mcModulesStatus").textContent = disabled.length
      ? `🚫 Hiding ${disabled.length}: ${disabled.join(", ")}`
      : "All modules visible to everyone.";
    $("mcModulesStatus").style.color = disabled.length ? "#dc2626" : "var(--muted)";
  }
}

// ============================================================
// MODE TOGGLE
// ============================================================
function currentMode() {
  const o = localStorage.getItem("flow.modeOverride");
  if (o === "demo" || o === "prod") return o;
  return window.PREVIEW_MODE_INTERNAL ? "demo" : "prod";
}
function setMode(mode) {
  if (mode === null) localStorage.removeItem("flow.modeOverride");
  else localStorage.setItem("flow.modeOverride", mode);
  toast(`Mode → ${mode || "auto"}. Reloading…`, "success");
  setTimeout(() => location.reload(), 500);
}

// ============================================================
// USER LIST (cached for impersonate / promote selects)
// ============================================================
let _userCache = [];
async function loadUsers() {
  try {
    _userCache = await listUsers();
  } catch (e) {
    _userCache = [];
  }
  populateUserSelect("mcImpersonateSel");
  populateUserSelect("mcPromoteSel");
}
function populateUserSelect(id) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = `<option value="">— Pick a user —</option>` + _userCache
    .map(u => `<option value="${esc(u.email)}">${esc(u.name || u.email)} · ${esc(u.role || "—")} · ${esc(u.department || "—")}</option>`)
    .join("");
}
function renderImpersonateOptions() { loadUsers(); }

// ============================================================
// FEATURE FLAGS GRID
// ============================================================
function renderFeatureGrid() {
  const grid = $("mcFeatureGrid");
  if (!grid) return;
  const overrides = readOverrides();
  grid.innerHTML = Object.entries(FEATURE_DEFAULTS).map(([key, defOn]) => {
    const overridden = key in overrides;
    const effective = overridden ? overrides[key] : defOn;
    return `
      <div class="mcFeatureRow">
        <div>
          <b>${esc(key)}</b>
          <div class="small" style="color:var(--muted)">default: ${defOn ? "ON" : "OFF"}${overridden ? " · overridden" : ""}</div>
        </div>
        <label class="mcSwitch">
          <input type="checkbox" data-flag="${esc(key)}" ${effective ? "checked" : ""} />
          <span></span>
        </label>
      </div>`;
  }).join("");
  grid.querySelectorAll("input[data-flag]").forEach(cb => {
    cb.addEventListener("change", () => {
      const o = readOverrides();
      o[cb.dataset.flag] = cb.checked;
      localStorage.setItem("flow.featureOverrides", JSON.stringify(o));
      toast(`Flag ${cb.dataset.flag} → ${cb.checked ? "ON" : "OFF"} (reload to apply)`, "success");
    });
  });
}
function readOverrides() {
  try { return JSON.parse(localStorage.getItem("flow.featureOverrides") || "{}") || {}; }
  catch (e) { return {}; }
}

// ============================================================
// MODULE VISIBILITY GRID
// ============================================================
function renderModuleGrid(disabledArr) {
  const grid = $("mcModuleGrid");
  if (!grid) return;
  const disabled = new Set(disabledArr || []);
  // Group modules visually for easier scanning
  const byGroup = {};
  TOGGLEABLE_MODULES.forEach(m => {
    if (!byGroup[m.group]) byGroup[m.group] = [];
    byGroup[m.group].push(m);
  });
  const html = Object.entries(byGroup).map(([group, mods]) => `
    <div style="grid-column:1 / -1;font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:8px;border-bottom:1px solid var(--border);padding-bottom:4px">${esc(group)}</div>
    ${mods.map(m => {
      const hidden = disabled.has(m.id);
      return `
        <div class="mcFeatureRow">
          <div>
            <b>${esc(m.label)}</b>
            <div class="small" style="color:var(--muted)">${esc(m.id)}${hidden ? " · 🚫 hidden" : ""}</div>
          </div>
          <label class="mcSwitch" title="${hidden ? "Currently hidden" : "Visible"}">
            <input type="checkbox" data-mod="${esc(m.id)}" ${hidden ? "" : "checked"} />
            <span></span>
          </label>
        </div>`;
    }).join("")}
  `).join("");
  grid.innerHTML = html;
}

// ============================================================
// IMPERSONATION
// ============================================================
function readImpersonation() {
  try {
    const raw = localStorage.getItem("flow.impersonateAs");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ============================================================
// EXPORT (full data backup)
// ============================================================
async function exportEverything() {
  const out = { exportedAt: new Date().toISOString(), exportedBy: getCurrentEmail(), version: APP_VERSION, collections: {} };
  const collections = Object.values(COL).filter(v => typeof v === "string");
  const statusEl = $("mcExportStatus");
  statusEl.textContent = "Exporting…";
  try {
    for (const colName of collections) {
      try {
        const snap = await getDocs(collection(colName));
        out.collections[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        out.collections[colName] = { __error: e.message };
      }
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const total = Object.values(out.collections).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
    statusEl.textContent = `Done — ${total} documents across ${collections.length} collections.`;
    toast("Backup downloaded", "success");
  } catch (e) {
    statusEl.textContent = "Failed: " + e.message;
    toast("Export failed", "error");
  }
}

// ============================================================
// AUDIT FEED
// ============================================================
async function renderAuditFeed() {
  const wrap = $("mcAuditFeed");
  if (!wrap) return;
  try {
    let entries = [];
    try {
      const snap = await getDocs(query(collection("audit_log"), orderBy("tsMs", "desc"), limit(30)));
      entries = snap.docs.map(d => d.data());
    } catch (e) {
      // Fall back to client-side sort if orderBy isn't supported
      const snap = await getDocs(collection("audit_log"));
      entries = snap.docs.map(d => d.data())
        .sort((a, b) => (b.tsMs || 0) - (a.tsMs || 0))
        .slice(0, 30);
    }
    if (!entries.length) {
      wrap.innerHTML = `<span class="small" style="color:var(--muted)">No audit entries yet.</span>`;
      return;
    }
    wrap.innerHTML = entries.map(e => `
      <div class="mcAuditRow">
        <div class="mcAuditWhen">${esc(new Date(e.tsMs || Date.now()).toLocaleString())}</div>
        <div class="mcAuditWho">${esc(e.createdBy || e.userEmail || "—")}</div>
        <div class="mcAuditWhat">${esc(e.action || e.message || JSON.stringify(e).slice(0, 120))}</div>
      </div>
    `).join("");
  } catch (e) {
    wrap.innerHTML = `<span class="small" style="color:#dc2626">Audit load failed: ${esc(e.message)}</span>`;
  }
}

// ============================================================
// SIDEBAR EDITOR
//
// Working layout (`_workingLayout`) is what the master is currently
// editing in the UI. Save flushes it to /app_settings/global.sidebar
// (which triggers applySidebarLayout for every signed-in user via
// the existing onSnapshot in app.js).
// ============================================================
let _workingLayout = null;          // [{kind, id, label}]
let _draggingRow = null;            // currently-dragged row element

function initSidebarEditor(forceFromLive = false) {
  // Try the cached/saved layout first; fall back to the live nav order.
  if (forceFromLive) {
    _workingLayout = snapshotNavLayout();
  } else {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem("flow.sidebarLayout") || "null"); } catch (e) {}
    _workingLayout = (Array.isArray(cached) && cached.length) ? cached : snapshotNavLayout();
  }
  renderSidebarEditor();
  $("mcSidebarStatus").textContent = `${_workingLayout.length} entries · drag ⠿ to reorder · click label to rename`;
}

function renderSidebarEditor() {
  const wrap = $("mcSidebarList");
  if (!wrap) return;
  wrap.innerHTML = _workingLayout.map((entry, i) => {
    const isGroup   = entry.kind === "group";
    const isTracker = entry.kind === "tracker";
    const rowClass  = isGroup ? "mcSideGroup" : "mcSideItem";
    const kindLabel = isGroup ? "GROUP" : isTracker ? "TRACKER" : "ITEM";
    const removable = isGroup || isTracker;  // built-in items can't be removed
    const removeBtn = removable
      ? `<button class="mcSideRemove" type="button" data-idx="${i}" title="Remove">×</button>`
      : "";
    return `
      <div class="mcSideRow ${rowClass}" draggable="true" data-idx="${i}">
        <span class="mcSideHandle" title="Drag to reorder">⠿</span>
        <span class="mcSideKind">${kindLabel}</span>
        <span class="mcSideLabel" contenteditable="true"
              data-idx="${i}" title="Click to rename · Enter to confirm">${esc(entry.label)}</span>
        <span class="mcSideId">${esc(entry.id)}</span>
        ${removeBtn}
      </div>
    `;
  }).join("");

  // Remove buttons (only on groups and trackers)
  wrap.querySelectorAll(".mcSideRemove").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = +btn.dataset.idx;
      _workingLayout.splice(idx, 1);
      renderSidebarEditor();
    });
  });

  // Inline rename
  wrap.querySelectorAll(".mcSideLabel").forEach(el => {
    el.addEventListener("blur", () => commitRename(el));
    el.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); el.blur(); }
      if (e.key === "Escape") {
        const idx = +el.dataset.idx;
        el.textContent = _workingLayout[idx]?.label || "";
        el.blur();
      }
    });
  });

  // Drag and drop — reorder + move between groups in one mechanic.
  wrap.querySelectorAll(".mcSideRow").forEach(row => {
    row.addEventListener("dragstart", e => {
      _draggingRow = row;
      row.classList.add("mcSideDragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", row.dataset.idx); } catch (_) {}
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("mcSideDragging");
      _draggingRow = null;
      wrap.querySelectorAll(".mcSideRow").forEach(r => r.classList.remove("mcSideDropAbove", "mcSideDropBelow"));
    });
    row.addEventListener("dragover", e => {
      if (!_draggingRow || _draggingRow === row) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const r = row.getBoundingClientRect();
      const above = e.clientY < r.top + r.height / 2;
      row.classList.toggle("mcSideDropAbove", above);
      row.classList.toggle("mcSideDropBelow", !above);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("mcSideDropAbove", "mcSideDropBelow");
    });
    row.addEventListener("drop", e => {
      if (!_draggingRow || _draggingRow === row) return;
      e.preventDefault();
      const fromIdx = +_draggingRow.dataset.idx;
      let toIdx = +row.dataset.idx;
      const r = row.getBoundingClientRect();
      const above = e.clientY < r.top + r.height / 2;
      const moved = _workingLayout.splice(fromIdx, 1)[0];
      if (fromIdx < toIdx) toIdx--;                         // index shifts after splice
      if (!above) toIdx++;                                  // drop below
      _workingLayout.splice(toIdx, 0, moved);
      renderSidebarEditor();
    });
  });
}

function commitRename(el) {
  const idx = +el.dataset.idx;
  const newLabel = (el.textContent || "").trim();
  if (!newLabel) {
    // Don't allow an empty label — restore previous.
    el.textContent = _workingLayout[idx]?.label || "";
    return;
  }
  if (_workingLayout[idx] && _workingLayout[idx].label !== newLabel) {
    _workingLayout[idx].label = newLabel;
  }
}

async function saveSidebarLayout() {
  if (!Array.isArray(_workingLayout) || !_workingLayout.length) {
    return toast("Nothing to save", "error");
  }
  try {
    await setSetting({ sidebar: _workingLayout });
    // Apply locally too so the master sees the new layout immediately
    // (the org-wide snapshot will arrive a beat later and re-apply).
    try { applySidebarLayout(_workingLayout); } catch (_) {}
    toast(`Saved · ${_workingLayout.length} entries applied org-wide`, "success");
    $("mcSidebarStatus").textContent = `✓ Last saved ${new Date().toLocaleTimeString()} — applied to every user`;
  } catch (e) {
    toast("Save failed: " + e.message, "error");
  }
}

async function resetSidebarLayout() {
  if (!confirm("Reset the sidebar to defaults for everyone? Custom labels and order will be lost.")) return;
  try {
    await setSetting({ sidebar: [] });            // empty array = clear override
    try { localStorage.removeItem("flow.sidebarLayout"); } catch (_) {}
    toast("Sidebar reset to defaults org-wide. Reload to see the default order.", "success");
    $("mcSidebarStatus").textContent = "Reset to defaults — reload to fully restore default labels.";
    initSidebarEditor(true);
  } catch (e) {
    toast("Reset failed: " + e.message, "error");
  }
}

// Add a brand-new department (group) at the end of the sidebar.
// Master can immediately drag it where they want and rename it inline.
function addNewSidebarGroup() {
  const id = "custom-" + Math.random().toString(36).slice(2, 8);
  _workingLayout.push({ kind: "group", id, label: "New Department" });
  renderSidebarEditor();
  // Auto-focus the new label so master can rename it right away
  setTimeout(() => {
    const rows = document.querySelectorAll("#mcSidebarList .mcSideLabel");
    const last = rows[rows.length - 1];
    if (last) { last.focus(); document.getSelection().selectAllChildren(last); }
  }, 30);
}

// Add a Daily Tracker for a custom department. Prompts for the dept
// name, slugifies it for the menu id (e.g. "Finance" → "finance"), and
// inserts an entry that materialises as a tracker page on every client.
// Tasks live in their own Firestore collection: daily_tasks_<slug>.
function addNewSidebarTracker() {
  const deptName = (prompt("Department name for this Daily Tracker (e.g. Finance, Legal)") || "").trim();
  if (!deptName) return;
  const slug = deptName.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return toast("Couldn't derive a key from that name", "error");
  const menuId = "tracker:" + slug;
  // Avoid dupes
  if (_workingLayout.some(e => e.id === menuId)) {
    return toast(`A tracker for "${deptName}" is already in the layout`, "error");
  }
  _workingLayout.push({
    kind: "tracker",
    id: menuId,
    label: `Daily Tracker — ${deptName}`
  });
  renderSidebarEditor();
  toast(`Added · drag it under the "${deptName}" group, then Save`, "success");
}
