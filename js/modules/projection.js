// ============================================================
// FLOW Mega Apps — Projection Management
// 
// Client onboarding project tracker. Each project has:
//   - Metadata: name, clientName, picSales, picSalesSupport, openDate, closedDate, status
//   - Timeline tasks (default 35-task template, customizable per project)
//   - People (Flow + Client contacts)
//   - Client Info, Inbound, Outbound, Inventory, Working Instruction
//
// Storage: Firestore (real-time multi-user sync).
// Schema preserved from previous localStorage version for forward-compat.
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument, subscribeCollection, orderBy
} from "../firebase.js";
import { $, esc, toast, today, downloadXLSX, confirmAction, friendlyDate } from "../utils.js";
import { createDropdown } from "../components/dropdown.js";
import { subscribeMasterData, addMasterItem } from "./master-data.js";

// v3.4 — dropdown handles for the new-project modal
let _pmClientDD = null;
let _pmClientList = [];

// ============================================================
// DEFAULT TEMPLATE (35 timeline tasks + default people + field lists)
// ============================================================
const PM_TEMPLATE = {
  "timelineTasks": [
    {
      "stakeholder": "Sales",
      "task": "Agreement Signed",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Create business unit WMS & OMS",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Pricing Approval Internal",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Reconcile & Upload master item",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Pengisian Client Information & Requirement",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Create & Share client access",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "SLA Aligned w/ Client",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Training client portal",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "New Client Form dikirim dan diisi oleh client",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Integration sistem",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Handover Form dikirim ke OPS",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Shipping & Courrier Mapping",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Data Client & PIC",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Jadwal Inbound pertama confirmed",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Service Scope Lengkap",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Inbound Process & Data GR Released",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Forecast Volume disampaikkan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Test order",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Requirement Lengkap disampaikkan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Error Handling",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Special Request Handling",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "Go Live Approval diberikan ke OPS",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "SLA Aligned w/ OPS",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales Support",
      "task": "First Outbound",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Kick Off Meeting dilakukan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Timeline Onboarding disetujui",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "SLA & Cut Off dijelaskan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Alur Komunikasi ditentukan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Checklist data client diterima",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Client Status Active",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Monitoring 1 Minggu",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "SLA Monitoring",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Check In week 1",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Review Proforma 1 bulan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    },
    {
      "stakeholder": "Sales",
      "task": "Volume Growth monitoring 3 bulan",
      "status": "Open",
      "targetDate": "",
      "actualDate": "",
      "notes": ""
    }
  ],
  "flowPeople": [
    {
      "nama": "Bryan",
      "role": "Sales manager",
      "phone": "6281284849987"
    },
    {
      "nama": "Dimas",
      "role": "Account manager",
      "phone": "6285771439820"
    },
    {
      "nama": "Prayoga Pangestu",
      "role": "Leader Sales Support",
      "phone": "6285775447954"
    },
    {
      "nama": "Asih",
      "role": "Sales Support",
      "phone": "628818025202"
    },
    {
      "nama": "Faisal Fansuri",
      "role": "Warehouse manager",
      "phone": "6289687511835"
    },
    {
      "nama": "Ahmad",
      "role": "Supervisor inbound",
      "phone": "6281293756908"
    },
    {
      "nama": "Yuda",
      "role": "Supervisor outbound",
      "phone": "6285183199345"
    }
  ],
  "clientPeople": [
    {
      "nama": "",
      "role": "",
      "phone": ""
    },
    {
      "nama": "",
      "role": "",
      "phone": ""
    },
    {
      "nama": "",
      "role": "",
      "phone": ""
    }
  ],
  "clientFields": [
    "Client Name",
    "Brand Name",
    "Product Category",
    "Average order / Day",
    "Average order / Month",
    "Average product price",
    "Basket order size",
    "Product Size Dimenstion",
    "Product Handling",
    "Marketplace / Channel Information",
    "Live Streaming Studio",
    "Working Space",
    "Delivery - First Mile",
    "Delivery - Middle Mile",
    "Delivery - Lastmile"
  ],
  "inboundFields": [
    "Inbound QC",
    "Repacking",
    "Product Dimenstion",
    "Hard Bundling",
    "Virtual Bundling",
    "Insertion",
    "Barcode Fisik",
    "SKU & Barcode berbeda",
    "Channel dengan master item terlengkap"
  ],
  "outboundFields": [
    "Fulfilment by Flowgistik",
    "Inhouse location",
    "Others third party",
    "Packing Type"
  ],
  "inventoryFields": [
    "Share / Dedicated Storage",
    "Type of storage ( Cool / Normal )"
  ],
  "workingFields": [
    "Inbound URL Input file",
    "Outbound URL Input file"
  ]
};

// ============================================================
// STATE
// ============================================================
let allProjects = [];
let activeId = null;
let unsub = null;
let view = "list"; // "list" or "detail"
let detailTab = "timeline"; // timeline | client | people | requirements
let saveTimers = {}; // debounced auto-save per project id

// ============================================================
// INIT
// ============================================================
export function initProjection() {
  // Inject the UI shell into the pmRoot div
  const root = $("pmRoot");
  if (!root) return;
  root.innerHTML = renderShell();

  bindEvents();

  if (unsub) unsub();
  unsub = subscribeCollection(COL.PROJECTIONS, rows => {
    allProjects = rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    render();
  }, orderBy("createdAt", "desc"));
}

// ============================================================
// SHELL HTML
// ============================================================
function renderShell() {
  return `
    <div id="pmListView">
      <div class="card">
        <div class="pmHeaderActions">
          <div class="left"></div>
          <div class="right">
            <button class="primary" id="pmNewBtn">+ New Project</button>
            <button class="secondary" id="pmExportAllBtn">Export All</button>
          </div>
        </div>
        <div class="filterGrid" style="margin-top:14px">
          <div><label class="pmLabel">Search</label><input type="text" id="pmSearch" placeholder="Search by client, brand, PIC…"/></div>
          <div><label class="pmLabel">Status</label>
            <select id="pmFltStatus">
              <option value="">All</option>
              <option>Open</option><option>Onboarding</option><option>Active</option><option>Done</option><option>On Hold</option>
            </select>
          </div>
          <div><label class="pmLabel">Sales PIC</label><select id="pmFltSales"><option value="">All</option></select></div>
          <div><label class="pmLabel">SS PIC</label><select id="pmFltSS"><option value="">All</option></select></div>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi"><b id="pmKpiTotal">0</b><span>Total Projects</span></div>
        <div class="kpi"><b id="pmKpiActive">0</b><span>Active</span></div>
        <div class="kpi"><b id="pmKpiDone">0</b><span>Done</span></div>
        <div class="kpi"><b id="pmKpiAvgPct">0%</b><span>Avg Completion</span></div>
      </div>

      <div id="pmCardGrid" class="pmCardGrid"></div>
    </div>

    <div id="pmDetailView" class="hidden"></div>

    <!-- New project modal -->
    <div id="pmNewModal" class="modal hidden">
      <div class="modalBox">
        <h2>New Projection</h2>
        <div class="form-grid">
          <div class="field"><label>Project Name *</label><input type="text" id="pmNewName" placeholder="e.g. Fieldit Golf"/></div>
          <div class="field">
            <label>Client Name</label>
            <div id="pmNewClient_dd" class="dd"></div>
            <input type="hidden" id="pmNewClient"/>
          </div>
          <div class="field"><label>Sales PIC</label><input type="text" id="pmNewSales" placeholder="e.g. Bryan"/></div>
          <div class="field"><label>Sales Support PIC</label><input type="text" id="pmNewSS" placeholder="e.g. Farah"/></div>
          <div class="field"><label>Open Date</label><input type="date" id="pmNewOpen"/></div>
          <div class="field"><label>Status</label>
            <select id="pmNewStatus">
              <option>Open</option><option selected>Onboarding</option><option>Active</option><option>Done</option><option>On Hold</option>
            </select>
          </div>
        </div>
        <p class="small">A default 35-task timeline will be auto-populated. You can customize it after creation.</p>
        <div class="btns" style="justify-content:flex-end;margin-top:14px">
          <button class="secondary" id="pmNewCancel">Cancel</button>
          <button class="primary" id="pmNewSave">Create Project</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// EVENTS
// ============================================================
function bindEvents() {
  $("pmNewBtn").onclick = openNewModal;
  $("pmExportAllBtn").onclick = exportAll;
  $("pmNewCancel").onclick = () => $("pmNewModal").classList.add("hidden");
  $("pmNewSave").onclick = createProject;

  $("pmSearch").addEventListener("input", debounce(render, 200));
  $("pmFltStatus").onchange = render;
  $("pmFltSales").onchange = render;
  $("pmFltSS").onchange = render;
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ============================================================
// RENDER
// ============================================================
function render() {
  if (view === "list") {
    $("pmListView").classList.remove("hidden");
    $("pmDetailView").classList.add("hidden");
    renderList();
  } else {
    $("pmListView").classList.add("hidden");
    $("pmDetailView").classList.remove("hidden");
    renderDetail();
  }
}

function renderList() {
  // Populate PIC filters
  const sales = [...new Set(allProjects.map(p => p.picSales).filter(Boolean))].sort();
  const ss = [...new Set(allProjects.map(p => p.picSalesSupport).filter(Boolean))].sort();
  populateSelect("pmFltSales", sales);
  populateSelect("pmFltSS", ss);

  const search = ($("pmSearch")?.value || "").toLowerCase().trim();
  const fStatus = $("pmFltStatus")?.value || "";
  const fSales = $("pmFltSales")?.value || "";
  const fSS = $("pmFltSS")?.value || "";

  const filtered = allProjects.filter(p => {
    if (fStatus && p.status !== fStatus) return false;
    if (fSales && p.picSales !== fSales) return false;
    if (fSS && p.picSalesSupport !== fSS) return false;
    if (search) {
      const blob = `${p.name||""} ${p.clientName||""} ${p.picSales||""} ${p.picSalesSupport||""}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  // KPIs
  $("pmKpiTotal").textContent = filtered.length;
  $("pmKpiActive").textContent = filtered.filter(p => p.status === "Active" || p.status === "Onboarding").length;
  $("pmKpiDone").textContent = filtered.filter(p => p.status === "Done").length;
  const avgPct = filtered.length
    ? Math.round(filtered.reduce((sum, p) => sum + progressOf(p).pct, 0) / filtered.length)
    : 0;
  $("pmKpiAvgPct").textContent = avgPct + "%";

  // Card grid
  const grid = $("pmCardGrid");
  if (!filtered.length) {
    grid.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);padding:48px">No projects match the current filters. Click "+ New Project" to create one.</div>`;
    return;
  }
  grid.innerHTML = filtered.map(p => {
    const prog = progressOf(p);
    return `
      <div class="pmProjectCard" data-pid="${p.id}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px">
          <h3 style="margin:0;color:#3b1678;font-size:18px">${esc(p.name || "Untitled")}</h3>
          <span class="badge badge-${(p.status||"open").toLowerCase().replace(/\s+/g, '-')}">${esc(p.status || "Open")}</span>
        </div>
        <p class="small" style="margin:4px 0"><b>Client:</b> ${esc(p.clientName || "—")}</p>
        <p class="small" style="margin:4px 0"><b>Sales:</b> ${esc(p.picSales || "—")} · <b>SS:</b> ${esc(p.picSalesSupport || "—")}</p>
        <p class="small" style="margin:4px 0"><b>Open:</b> ${esc(p.openDate || "—")}</p>
        <div class="pmProgress">
          <div class="pmProgressFill" style="width:${prog.pct}%"></div>
        </div>
        <p class="small" style="margin:6px 0 0"><b>${prog.pct}%</b> · ${prog.done}/${prog.total} tasks done</p>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".pmProjectCard").forEach(el => {
    el.addEventListener("click", () => openProject(el.dataset.pid));
  });
}

function populateSelect(id, options) {
  const sel = $(id);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All</option>' +
    options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
  sel.value = current;
}

// ============================================================
// PROGRESS
// ============================================================
function progressOf(p) {
  const total = (p.tasks || []).length;
  const done = (p.tasks || []).filter(t => String(t.status || "").toLowerCase() === "done").length;
  return { total, done, open: total - done, pct: total ? Math.round(done / total * 100) : 0 };
}

// ============================================================
// CREATE / DELETE
// ============================================================
function openNewModal() {
  $("pmNewName").value = "";
  $("pmNewClient").value = "";
  $("pmNewSales").value = "";
  $("pmNewSS").value = "";
  $("pmNewOpen").value = today();
  $("pmNewStatus").value = "Onboarding";
  ensurePmClientDD();
  _pmClientDD?.setValue("");
  $("pmNewModal").classList.remove("hidden");
}

function ensurePmClientDD() {
  if (_pmClientDD) return;
  const container = $("pmNewClient_dd");
  if (!container) return;
  _pmClientDD = createDropdown({
    container,
    hiddenInput: $("pmNewClient"),
    getItems: () => _pmClientList,
    onAddNew: async (typedName) => {
      let name = typedName?.trim();
      if (!name) {
        name = prompt("New client name:");
        if (!name?.trim()) return null;
        name = name.trim();
      }
      try {
        await addMasterItem("clients", name);
        toast(`Client "${name}" added to master list`, "success");
        return name;
      } catch (e) {
        if (e.message?.includes("exists")) return name;
        toast("Failed: " + e.message, "error");
        return null;
      }
    },
    placeholder: "Select or search client…",
    addNewLabel: "+ Add new client…",
    recentKey: "flow.recent.client"
  });
  subscribeMasterData("clients", (items) => {
    _pmClientList = items;
    _pmClientDD?.refresh();
  });
}

async function createProject() {
  const name = $("pmNewName").value.trim();
  if (!name) return toast("Project name required", "error");

  const newProject = {
    name,
    clientName: $("pmNewClient").value.trim(),
    picSales: $("pmNewSales").value.trim(),
    picSalesSupport: $("pmNewSS").value.trim(),
    openDate: $("pmNewOpen").value,
    closedDate: "",
    status: $("pmNewStatus").value,
    tasks: JSON.parse(JSON.stringify(PM_TEMPLATE.timelineTasks)),
    people: {
      flowgistik: JSON.parse(JSON.stringify(PM_TEMPLATE.flowPeople)),
      client: JSON.parse(JSON.stringify(PM_TEMPLATE.clientPeople))
    },
    clientInfo: Object.fromEntries(PM_TEMPLATE.clientFields.map(k => [k, ""])),
    inbound: Object.fromEntries(PM_TEMPLATE.inboundFields.map(k => [k, ""])),
    outbound: Object.fromEntries(PM_TEMPLATE.outboundFields.map(k => [k, ""])),
    inventory: Object.fromEntries(PM_TEMPLATE.inventoryFields.map(k => [k, ""])),
    workingInstruction: Object.fromEntries(PM_TEMPLATE.workingFields.map(k => [k, ""]))
  };

  try {
    const id = await addDocument(COL.PROJECTIONS, newProject);
    toast(`Created "${name}"`, "success");
    $("pmNewModal").classList.add("hidden");
    // open it immediately
    setTimeout(() => openProject(id), 200);
  } catch (e) {
    console.error(e);
    toast("Create failed: " + e.message, "error");
  }
}

async function deleteProject(id) {
  if (!confirmAction("Delete this project? This cannot be undone.")) return;
  try {
    await deleteDocument(COL.PROJECTIONS, id);
    toast("Project deleted", "success");
    view = "list";
    activeId = null;
    render();
  } catch (e) {
    toast("Delete failed", "error");
  }
}

// ============================================================
// OPEN PROJECT (DETAIL VIEW)
// ============================================================
function openProject(id) {
  activeId = id;
  detailTab = "timeline";
  view = "detail";
  render();
}

function backToList() {
  view = "list";
  activeId = null;
  render();
}

// ============================================================
// DETAIL VIEW
// ============================================================
function getActive() {
  return allProjects.find(p => p.id === activeId);
}

function renderDetail() {
  const p = getActive();
  if (!p) { backToList(); return; }
  const prog = progressOf(p);
  const v = $("pmDetailView");

  v.innerHTML = `
    <div class="card">
      <div class="pmDetailTop">
        <div style="flex:1;min-width:280px">
          <button class="secondary" id="pmBackBtn">← Back to list</button>
          <h2 style="margin:10px 0 4px;color:#3b1678">${esc(p.name)}</h2>
          <p class="small">Client: <b>${esc(p.clientName || "—")}</b> · Sales: <b>${esc(p.picSales || "—")}</b> · SS: <b>${esc(p.picSalesSupport || "—")}</b></p>
          <div class="pmProgress" style="margin-top:10px"><div class="pmProgressFill" style="width:${prog.pct}%"></div></div>
          <p class="small" style="margin-top:6px"><b>${prog.pct}%</b> · ${prog.done}/${prog.total} tasks done</p>
        </div>
        <div class="btns" style="margin:0">
          <button class="secondary" id="pmExportOneBtn">Export Excel</button>
          <button class="danger" id="pmDeleteBtn">Delete</button>
        </div>
      </div>

      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Project Name</label><input type="text" id="pmEditName" value="${esc(p.name)}"/></div>
        <div class="field"><label>Client Name</label><input type="text" id="pmEditClient" value="${esc(p.clientName || "")}"/></div>
        <div class="field"><label>Sales PIC</label><input type="text" id="pmEditSales" value="${esc(p.picSales || "")}"/></div>
        <div class="field"><label>Sales Support PIC</label><input type="text" id="pmEditSS" value="${esc(p.picSalesSupport || "")}"/></div>
        <div class="field"><label>Open Date</label><input type="date" id="pmEditOpen" value="${esc(p.openDate || "")}"/></div>
        <div class="field"><label>Closed Date</label><input type="date" id="pmEditClosed" value="${esc(p.closedDate || "")}"/></div>
        <div class="field"><label>Status</label>
          <select id="pmEditStatus">
            ${["Open","Onboarding","Active","Done","On Hold"].map(s =>
              `<option ${p.status===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="tabs" style="margin-top:14px">
        <button class="${detailTab==="timeline"?"active":""}" data-pmtab="timeline">Timeline (${prog.total} tasks)</button>
        <button class="${detailTab==="client"?"active":""}" data-pmtab="client">Client Info</button>
        <button class="${detailTab==="people"?"active":""}" data-pmtab="people">People</button>
        <button class="${detailTab==="requirements"?"active":""}" data-pmtab="requirements">Requirements</button>
      </div>
    </div>

    <div id="pmTabContent"></div>
  `;

  $("pmBackBtn").onclick = backToList;
  $("pmExportOneBtn").onclick = () => exportOne(p);
  $("pmDeleteBtn").onclick = () => deleteProject(p.id);

  // Meta field auto-save
  ["pmEditName:name", "pmEditClient:clientName", "pmEditSales:picSales", "pmEditSS:picSalesSupport",
   "pmEditOpen:openDate", "pmEditClosed:closedDate", "pmEditStatus:status"].forEach(pair => {
    const [elId, field] = pair.split(":");
    $(elId).addEventListener("change", e => updateField(p.id, { [field]: e.target.value }));
    $(elId).addEventListener("input", e => updateField(p.id, { [field]: e.target.value }));
  });

  // Tab switching
  v.querySelectorAll("[data-pmtab]").forEach(btn => {
    btn.onclick = () => { detailTab = btn.dataset.pmtab; render(); };
  });

  renderTabContent(p);
}

// ============================================================
// TAB CONTENT
// ============================================================
function renderTabContent(p) {
  const c = $("pmTabContent");
  if (detailTab === "timeline") c.innerHTML = renderTimeline(p);
  else if (detailTab === "client") c.innerHTML = renderClientInfo(p);
  else if (detailTab === "people") c.innerHTML = renderPeople(p);
  else if (detailTab === "requirements") c.innerHTML = renderRequirements(p);

  attachTabHandlers(p);
}

function renderTimeline(p) {
  const tasks = p.tasks || [];
  const lanes = {};
  tasks.forEach((t, i) => {
    const lane = t.stakeholder || "Other";
    if (!lanes[lane]) lanes[lane] = [];
    lanes[lane].push({ ...t, _idx: i });
  });

  let html = `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left"><h2 style="margin:0">Timeline Tasks</h2></div>
        <div class="right"><button class="primary" id="pmAddTaskBtn">+ Add Task</button></div>
      </div>
      <div class="tableWrap">
        <table>
          <thead><tr>
            <th>Stakeholder</th><th>Task</th><th>Status</th><th>Target</th><th>Actual</th><th>Notes</th><th></th>
          </tr></thead>
          <tbody id="pmTaskBody">
  `;

  Object.entries(lanes).forEach(([lane, items]) => {
    html += `<tr style="background:rgba(124,58,237,.06)"><td colspan="7"><b style="color:#5b21b6">${esc(lane)}</b> · ${items.length} tasks</td></tr>`;
    items.forEach(t => {
      html += `
        <tr data-idx="${t._idx}">
          <td><input type="text" class="pmCell" data-key="stakeholder" value="${esc(t.stakeholder || "")}" style="min-width:120px"/></td>
          <td><input type="text" class="pmCell" data-key="task" value="${esc(t.task || "")}" style="min-width:240px"/></td>
          <td>
            <select class="pmCell" data-key="status">
              ${["Open","Progress","Done","Hold"].map(s => `<option ${t.status===s?"selected":""}>${s}</option>`).join("")}
            </select>
          </td>
          <td><input type="date" class="pmCell" data-key="targetDate" value="${esc(t.targetDate || "")}"/></td>
          <td><input type="date" class="pmCell" data-key="actualDate" value="${esc(t.actualDate || "")}"/></td>
          <td><input type="text" class="pmCell" data-key="notes" value="${esc(t.notes || "")}" style="min-width:180px"/></td>
          <td><button class="danger iconBtn" data-pmdeltask="${t._idx}">×</button></td>
        </tr>
      `;
    });
  });

  html += `</tbody></table></div></div>`;
  return html;
}

function renderClientInfo(p) {
  const fields = PM_TEMPLATE.clientFields;
  return `
    <div class="card">
      <h2>Client Information</h2>
      <div class="form-grid">
        ${fields.map(k => `
          <div class="field">
            <label>${esc(k)}</label>
            <input type="text" class="pmGroupCell" data-group="clientInfo" data-key="${esc(k)}" value="${esc((p.clientInfo || {})[k] || "")}"/>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPeople(p) {
  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left"><h2 style="margin:0">Flow Team</h2></div>
        <div class="right"><button class="secondary" id="pmAddFlowPerson">+ Add</button></div>
      </div>
      ${renderPeopleTable(p, "flowgistik")}
    </div>
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left"><h2 style="margin:0">Client Contacts</h2></div>
        <div class="right"><button class="secondary" id="pmAddClientPerson">+ Add</button></div>
      </div>
      ${renderPeopleTable(p, "client")}
    </div>
  `;
}

function renderPeopleTable(p, type) {
  const list = (p.people && p.people[type]) || [];
  return `
    <div class="tableWrap">
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th></th></tr></thead>
        <tbody>
          ${list.map((person, i) => `
            <tr data-personidx="${i}" data-persontype="${type}">
              <td><input type="text" class="pmPersonCell" data-key="nama" value="${esc(person.nama || "")}"/></td>
              <td><input type="text" class="pmPersonCell" data-key="role" value="${esc(person.role || "")}"/></td>
              <td><input type="text" class="pmPersonCell" data-key="phone" value="${esc(person.phone || "")}"/></td>
              <td><button class="danger iconBtn" data-pmdelperson="${type}:${i}">×</button></td>
            </tr>
          `).join("") || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">No ${type} contacts yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderRequirements(p) {
  const groups = [
    { key: "inbound", label: "Inbound", fields: PM_TEMPLATE.inboundFields },
    { key: "outbound", label: "Outbound", fields: PM_TEMPLATE.outboundFields },
    { key: "inventory", label: "Inventory", fields: PM_TEMPLATE.inventoryFields },
    { key: "workingInstruction", label: "Working Instruction", fields: PM_TEMPLATE.workingFields }
  ];

  return groups.map(g => `
    <div class="card">
      <h2>${g.label}</h2>
      <div class="form-grid">
        ${g.fields.map(k => `
          <div class="field">
            <label>${esc(k)}</label>
            <input type="text" class="pmGroupCell" data-group="${g.key}" data-key="${esc(k)}" value="${esc((p[g.key] || {})[k] || "")}"/>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

// ============================================================
// TAB HANDLERS (auto-save)
// ============================================================
function attachTabHandlers(p) {
  // Task cell edits
  document.querySelectorAll("#pmTaskBody [data-idx]").forEach(row => {
    const idx = parseInt(row.dataset.idx);
    row.querySelectorAll(".pmCell").forEach(input => {
      const key = input.dataset.key;
      input.addEventListener("change", () => {
        updateTaskField(p.id, idx, key, input.value);
      });
    });
  });
  // Delete task
  document.querySelectorAll("[data-pmdeltask]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.pmdeltask);
      deleteTask(p.id, idx);
    });
  });
  // Add task
  if ($("pmAddTaskBtn")) {
    $("pmAddTaskBtn").onclick = () => addTask(p.id);
  }
  // Client info group cells
  document.querySelectorAll(".pmGroupCell").forEach(input => {
    const group = input.dataset.group;
    const key = input.dataset.key;
    input.addEventListener("change", () => updateGroupField(p.id, group, key, input.value));
  });
  // People
  document.querySelectorAll("[data-personidx]").forEach(row => {
    const idx = parseInt(row.dataset.personidx);
    const type = row.dataset.persontype;
    row.querySelectorAll(".pmPersonCell").forEach(input => {
      const key = input.dataset.key;
      input.addEventListener("change", () => updatePerson(p.id, type, idx, key, input.value));
    });
  });
  document.querySelectorAll("[data-pmdelperson]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [type, idx] = btn.dataset.pmdelperson.split(":");
      deletePerson(p.id, type, parseInt(idx));
    });
  });
  if ($("pmAddFlowPerson")) $("pmAddFlowPerson").onclick = () => addPerson(p.id, "flowgistik");
  if ($("pmAddClientPerson")) $("pmAddClientPerson").onclick = () => addPerson(p.id, "client");
}

// ============================================================
// FIRESTORE WRITES (debounced)
// ============================================================
function scheduleSave(id, data) {
  clearTimeout(saveTimers[id]);
  saveTimers[id] = setTimeout(async () => {
    try {
      await updateDocument(COL.PROJECTIONS, id, data);
    } catch (e) {
      console.error(e);
      toast("Auto-save failed", "error");
    }
  }, 600);
}

function updateField(id, patch) {
  // Apply locally too
  const p = allProjects.find(x => x.id === id);
  if (p) Object.assign(p, patch);
  scheduleSave(id, patch);
}

function updateTaskField(id, idx, key, value) {
  const p = allProjects.find(x => x.id === id);
  if (!p || !p.tasks[idx]) return;
  p.tasks[idx][key] = value;
  scheduleSave(id, { tasks: p.tasks });
}

function addTask(id) {
  const p = allProjects.find(x => x.id === id);
  if (!p) return;
  p.tasks = p.tasks || [];
  p.tasks.push({ stakeholder: "Sales", task: "New Task", status: "Open", targetDate: "", actualDate: "", notes: "" });
  scheduleSave(id, { tasks: p.tasks });
  render();
}

function deleteTask(id, idx) {
  const p = allProjects.find(x => x.id === id);
  if (!p || !p.tasks) return;
  p.tasks.splice(idx, 1);
  scheduleSave(id, { tasks: p.tasks });
  render();
}

function updateGroupField(id, group, key, value) {
  const p = allProjects.find(x => x.id === id);
  if (!p) return;
  p[group] = p[group] || {};
  p[group][key] = value;
  scheduleSave(id, { [group]: p[group] });
}

function addPerson(id, type) {
  const p = allProjects.find(x => x.id === id);
  if (!p) return;
  p.people = p.people || { flowgistik: [], client: [] };
  p.people[type] = p.people[type] || [];
  p.people[type].push({ nama: "", role: "", phone: "" });
  scheduleSave(id, { people: p.people });
  render();
}

function deletePerson(id, type, idx) {
  const p = allProjects.find(x => x.id === id);
  if (!p || !p.people || !p.people[type]) return;
  p.people[type].splice(idx, 1);
  scheduleSave(id, { people: p.people });
  render();
}

function updatePerson(id, type, idx, key, value) {
  const p = allProjects.find(x => x.id === id);
  if (!p || !p.people || !p.people[type] || !p.people[type][idx]) return;
  p.people[type][idx][key] = value;
  scheduleSave(id, { people: p.people });
}

// ============================================================
// EXPORT
// ============================================================
function exportOne(p) {
  const rows = [
    ["FLOW PROJECTION MANAGEMENT"],
    ["Project Name", p.name],
    ["Client", p.clientName],
    ["Sales PIC", p.picSales],
    ["SS PIC", p.picSalesSupport],
    ["Open Date", p.openDate],
    ["Closed Date", p.closedDate],
    ["Status", p.status],
    [],
    ["TIMELINE TASKS"],
    ["Stakeholder", "Task", "Status", "Target Date", "Actual Date", "Notes"]
  ];
  (p.tasks || []).forEach(t => rows.push([
    t.stakeholder || "", t.task || "", t.status || "",
    t.targetDate || "", t.actualDate || "", t.notes || ""
  ]));

  rows.push([], ["CLIENT INFO"]);
  Object.entries(p.clientInfo || {}).forEach(([k, v]) => rows.push([k, v]));

  rows.push([], ["INBOUND"]);
  Object.entries(p.inbound || {}).forEach(([k, v]) => rows.push([k, v]));
  rows.push([], ["OUTBOUND"]);
  Object.entries(p.outbound || {}).forEach(([k, v]) => rows.push([k, v]));
  rows.push([], ["INVENTORY"]);
  Object.entries(p.inventory || {}).forEach(([k, v]) => rows.push([k, v]));
  rows.push([], ["WORKING INSTRUCTION"]);
  Object.entries(p.workingInstruction || {}).forEach(([k, v]) => rows.push([k, v]));

  rows.push([], ["FLOW TEAM"], ["Name", "Role", "Phone"]);
  ((p.people || {}).flowgistik || []).forEach(x => rows.push([x.nama, x.role, x.phone]));
  rows.push([], ["CLIENT CONTACTS"], ["Name", "Role", "Phone"]);
  ((p.people || {}).client || []).forEach(x => rows.push([x.nama, x.role, x.phone]));

  const safe = (p.name || "Project").replace(/[^a-z0-9]/gi, "_");
  downloadXLSX(rows, `Flow_Projection_${safe}_${today()}.xlsx`, "Projection");
  toast("Exported", "success");
}

function exportAll() {
  if (!allProjects.length) return toast("No projects to export", "error");
  const rows = [["Project", "Client", "Sales PIC", "SS PIC", "Open Date", "Status", "Progress %", "Tasks Done", "Total Tasks"]];
  allProjects.forEach(p => {
    const prog = progressOf(p);
    rows.push([
      p.name || "", p.clientName || "", p.picSales || "", p.picSalesSupport || "",
      p.openDate || "", p.status || "", prog.pct + "%", prog.done, prog.total
    ]);
  });
  downloadXLSX(rows, `Flow_Projections_All_${today()}.xlsx`, "Projections");
  toast("Exported", "success");
}
