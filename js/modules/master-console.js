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
//   • AI        — org-wide Anthropic API key for 1-on-1 summarizer
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
//     aiApiKey                 string (Anthropic key, shared)
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

    <!-- I: AI key -->
    <div class="card">
      <h2 style="margin:0 0 10px">Org-wide AI Key (Anthropic)</h2>
      <p class="small" style="color:var(--muted);margin:0 0 10px">Set once here — every supervisor's 1-on-1 Summarizer uses it automatically. Stored in Firestore, never shown again after save.</p>
      <div class="mcRow">
        <input type="password" id="mcAiKey" placeholder="sk-ant-…" autocomplete="off" />
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
    if (!key.startsWith("sk-")) return toast("Key should start with sk-", "error");
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
