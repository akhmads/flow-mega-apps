// ============================================================
// FLOW Mega Apps — Debug Panel (v3.7)
//
// Floating button at bottom-right (Admin + Supervisor only).
// Shows user info, env, master data counts, errors + lets you
// auto-generate test data (tickets / tasks / issues) for fast
// UI testing without typing.
// ============================================================

import { $, esc, toast, today } from "./utils.js";
import {
  isAdmin, isSupervisor, getCurrentEmail, getCurrentProfile
} from "./roles.js";
import { COL, addDocument } from "./firebase.js";
import { getMasterDataAll } from "./modules/master-data.js";

const recentErrors = [];
const MAX_ERRORS = 10;

// Capture console errors globally
const origError = console.error;
console.error = function (...args) {
  const msg = args.map(a => a instanceof Error ? a.message : (typeof a === "object" ? JSON.stringify(a).slice(0, 200) : String(a))).join(" ");
  recentErrors.unshift({ msg, at: new Date().toLocaleTimeString() });
  if (recentErrors.length > MAX_ERRORS) recentErrors.pop();
  origError.apply(console, args);
};
window.addEventListener("error", (e) => {
  recentErrors.unshift({ msg: e.message + " (" + (e.filename || "").split("/").pop() + ":" + e.lineno + ")", at: new Date().toLocaleTimeString() });
  if (recentErrors.length > MAX_ERRORS) recentErrors.pop();
});

export function mountDebugPanel() {
  // v3.7 — visible to Admin AND Supervisor (Bryan + CEO have access)
  if (!isAdmin() && !isSupervisor()) return;
  if (document.getElementById("debugFab")) return;

  const fab = document.createElement("button");
  fab.id = "debugFab";
  fab.title = "Debug Panel · " + (isAdmin() ? "Admin" : "Supervisor");
  fab.innerHTML = "";
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
  panel.querySelector("#dbgClearCache").addEventListener("click", clearFlowCache);
  panel.querySelector("#dbgReload").addEventListener("click", () => location.reload());

  window.toggleDebugPanel = () => fab.click();
}

function renderDebugBody() {
  const me = getCurrentProfile();
  const previewMode = !!window.PREVIEW_MODE_INTERNAL;
  const userAgent = navigator.userAgent.split(") ").slice(-1)[0];

  let depts = [], clients = [], cats = [];
  try {
    depts = getMasterDataAll("departments");
    clients = getMasterDataAll("clients");
    cats = getMasterDataAll("issueCategories");
  } catch (e) {}

  const flowKeys = Object.keys(localStorage)
    .filter(k => k.startsWith("flow."))
    .map(k => ({ key: k, len: (localStorage.getItem(k) || "").length }));

  $("dbgBody").innerHTML = `
    <!-- TEST DATA GENERATOR -->
    <div class="dbgSection dbgGen">
      <div class="dbgLabel">Test Data Generator</div>
      <p class="small" style="color:var(--muted);margin-bottom:8px">Auto-create plausible records for UI testing. <b style="color:#b91c1c">Writes to live database.</b></p>
      <div class="dbgGenGrid">
        <button class="dbgGenBtn" data-gen="tickets" data-count="10">+10 Tickets</button>
        <button class="dbgGenBtn" data-gen="tasksSales" data-count="20">+20 Sales Tasks</button>
        <button class="dbgGenBtn" data-gen="tasksSS" data-count="20">+20 SS Tasks</button>
        <button class="dbgGenBtn" data-gen="issues" data-count="15">+15 Daily Issues</button>
      </div>
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
      <div class="dbgLabel">Environment</div>
      <table>
        <tr><td>Mode</td><td>${previewMode ? '<b style="color:#f59e0b">PREVIEW (demo data)</b>' : '<b style="color:#22c55e">PRODUCTION</b>'}</td></tr>
        <tr><td>App URL</td><td>${esc(location.href)}</td></tr>
        <tr><td>User Agent</td><td class="small">${esc(userAgent.slice(0, 80))}</td></tr>
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

    <div class="dbgSection">
      <div class="dbgLabel">Recent Errors (last ${MAX_ERRORS})</div>
      ${recentErrors.length
        ? recentErrors.map(e => `<div class="dbgErr"><b>${esc(e.at)}</b> · ${esc(e.msg.slice(0, 200))}</div>`).join("")
        : `<p class="small" style="color:#22c55e;">No errors captured</p>`}
    </div>
  `;

  // Wire up the generator buttons
  document.querySelectorAll(".dbgGenBtn").forEach(b =>
    b.addEventListener("click", () => runGenerator(b.dataset.gen, parseInt(b.dataset.count))));
}

// ============================================================
// TEST DATA GENERATORS
// ============================================================
const SAMPLE_PEOPLE = ["Bryan", "Prayoga", "Yoga", "Farah", "Asih", "Fauzi", "Dimas", "Gratia", "Steve"];
const SAMPLE_DEPTS_FALLBACK = ["Sales", "Sales Support", "Operations", "Finance", "Tech", "HR", "Marketing"];
const SAMPLE_CLIENTS_FALLBACK = ["PERO", "Kintakun", "SummerID", "Fieldit", "GAON", "Quattro"];
const SAMPLE_CATS_FALLBACK = ["Wrong SKU shipped", "Missing item", "Damaged in transit", "Late delivery", "Wrong address", "Marketplace sync error"];

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
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
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
  if (!confirm(`Generate ${count} test ${kind}? This will write to the live database. Continue?`)) return;

  toast(`Generating ${count} ${kind}…`, "");
  let ok = 0, fail = 0;

  const departments = (getMasterDataAll("departments").filter(d => !d.archived).map(d => d.name)) || [];
  const clients = (getMasterDataAll("clients").filter(c => !c.archived).map(c => c.name)) || [];
  const cats = (getMasterDataAll("issueCategories").filter(c => !c.archived).map(c => c.name)) || [];
  const deptList = departments.length ? departments : SAMPLE_DEPTS_FALLBACK;
  const clientList = clients.length ? clients : SAMPLE_CLIENTS_FALLBACK;
  const catList = cats.length ? cats : SAMPLE_CATS_FALLBACK;

  const generators = {
    tickets: () => genTicket(deptList),
    tasksSales: () => ({ col: COL.TASKS_SALES, doc: genTask("sales") }),
    tasksSS: () => ({ col: COL.TASKS_SS, doc: genTask("ss") }),
    issues: () => ({ col: COL.ISSUES, doc: genIssue(clientList, catList) })
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

// ============================================================
// HELPERS
// ============================================================
function copyDiagnostics() {
  const text = $("dbgBody").innerText;
  navigator.clipboard.writeText(text).then(
    () => toast("Diagnostics copied to clipboard", "success"),
    () => toast("Copy failed", "error")
  );
}

function clearFlowCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith("flow."));
  if (!keys.length) return toast("No FLOW cache to clear", "");
  if (!confirm(`Remove ${keys.length} FLOW localStorage entries? (Recent-used dropdowns, API key, etc.)`)) return;
  keys.forEach(k => localStorage.removeItem(k));
  toast(`Cleared ${keys.length} keys`, "success");
  renderDebugBody();
}
