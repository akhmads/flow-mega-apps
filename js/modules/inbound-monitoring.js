// ============================================================
// FLOW Mega Apps — Inbound Monitoring (Operations)
//
// Tracks vehicle arrivals, unloading, GRN processing, lead times,
// and discrepancies. Schema based on Flow's Inbound Monitoring Excel.
//
// Two views:
//   1. Inbound Log — full tracking from arrival to GRN
//   2. Vehicle Status — quick vehicle arrival board
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument, subscribeCollection, orderBy
} from "../firebase.js";
import {
  $, esc, toDateStr, friendlyDate, dateRange, toast,
  badgeClass, downloadXLSX, today, confirmAction
} from "../utils.js";

let allEntries = [];
let filteredEntries = [];
let allVehicles = [];
let unsub = null;
let unsubVehicles = null;
let editingId = null;
let currentTab = "log";

const INBOUND_STATUSES = ["Inbound Completed", "Inbound Partial", "Pending"];
const VEHICLE_STATUSES = ["DONE", "ON PROCESS", "WAITING"];
const UNIT_TYPES = ["CDE", "CDD", "Motorcycle", "Van", "PickUP", "20 FEET", "40 FEET"];

// ============================================================
// INIT
// ============================================================
export function initInboundMonitoring() {
  bindEvents();
  if (unsub) unsub();
  unsub = subscribeCollection(COL.INBOUND, (rows) => {
    allEntries = rows.sort((a, b) => (b.reportDate || "").localeCompare(a.reportDate || ""));
    populateFilters();
    applyFilters();
  }, orderBy("reportDate", "desc"));

  // Vehicle status from same collection, filtered in render
  allVehicles = [];
}

function bindEvents() {
  $("ibAddBtn").addEventListener("click", () => openModal());
  $("ibExportBtn").addEventListener("click", exportExcel);
  $("ibImportBtn").addEventListener("click", () => $("ibImportFile").click());
  $("ibImportFile").addEventListener("change", importExcel);
  $("ibApplyBtn").addEventListener("click", applyFilters);
  $("ibResetBtn").addEventListener("click", resetFilters);

  ["ibFltClient", "ibFltStatus", "ibFltType", "ibFltRange", "ibFltFrom", "ibFltTo"]
    .forEach(id => $(id)?.addEventListener("change", applyFilters));

  // Tab switching
  document.querySelectorAll("[data-ibtab]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.ibtab;
      document.querySelectorAll("[data-ibtab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll("[data-ibpane]").forEach(p => p.classList.add("hidden"));
      document.querySelector(`[data-ibpane="${currentTab}"]`)?.classList.remove("hidden");
      if (currentTab === "vehicles") renderVehicleTable();
    });
  });
}

// ============================================================
// FILTERS
// ============================================================
function populateFilters() {
  const clients = [...new Set(allEntries.map(e => e.client).filter(Boolean))].sort();
  const sel = $("ibFltClient");
  const cur = sel.value;
  sel.innerHTML = `<option value="">All Clients</option>` +
    clients.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = cur;
}

function applyFilters() {
  const client = $("ibFltClient").value;
  const status = $("ibFltStatus").value;
  const type = $("ibFltType").value;
  const rangeKey = $("ibFltRange").value;
  const from = $("ibFltFrom").value;
  const to = $("ibFltTo").value;
  const { start, end } = dateRange(rangeKey, from, to);

  filteredEntries = allEntries.filter(e => {
    if (client && e.client !== client) return false;
    if (status && e.inboundStatus !== status) return false;
    if (type && e.inboundType !== type) return false;
    if (start || end) {
      const d = e.reportDate ? new Date(e.reportDate) : null;
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    return true;
  });

  renderKPIs();
  renderLogTable();
  renderVehicleTable();
}

function resetFilters() {
  ["ibFltClient", "ibFltStatus", "ibFltType", "ibFltFrom", "ibFltTo"].forEach(id => $(id).value = "");
  $("ibFltRange").value = "all";
  applyFilters();
}

// ============================================================
// KPIs
// ============================================================
function renderKPIs() {
  const total = filteredEntries.length;
  const done = filteredEntries.filter(e => e.inboundType === "Inbound Completed").length;
  const ontime = filteredEntries.filter(e => e.leadTimeStatus === "ontime").length;
  const ontimeRate = total ? Math.round(ontime / total * 100) : 0;

  const durations = filteredEntries
    .map(e => e.unloadDurationMin)
    .filter(d => d != null && d > 0);
  const avgUnload = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  $("ibKpiTotal").textContent = total;
  $("ibKpiDone").textContent = done;
  $("ibKpiOntime").textContent = ontimeRate + "%";
  $("ibKpiAvgUnload").textContent = avgUnload != null ? avgUnload : "--";
}

// ============================================================
// INBOUND LOG TABLE
// ============================================================
function renderLogTable() {
  const tbody = $("ibLogTable").querySelector("tbody");
  if (!filteredEntries.length) {
    tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;color:var(--muted);padding:32px">No inbound entries match the current filters.</td></tr>`;
    $("ibLogCount").textContent = "0 entries";
    return;
  }
  const display = filteredEntries.slice(0, 500);
  tbody.innerHTML = display.map(e => {
    const statusClass = e.inboundType === "Inbound Completed" ? "done"
      : e.inboundType === "Inbound Partial" ? "progress" : "open";
    const discrepancy = (e.shortExcess || e.docVsActual) ? "Yes" : "--";
    const discClass = discrepancy === "Yes" ? "style=\"color:var(--bad);font-weight:600\"" : "";
    return `
    <tr>
      <td>${esc(friendlyDate(e.reportDate))}</td>
      <td class="small">${esc(e.poNumber || "")}</td>
      <td><b>${esc(e.client || "")}</b></td>
      <td>${esc(e.vendor || "")}</td>
      <td>${esc(e.arrivalTime || "")}</td>
      <td>${esc(e.unloadBegin || "")}</td>
      <td>${esc(e.unloadFinish || "")}</td>
      <td>${esc(e.unloadDuration || "")}</td>
      <td>${esc(e.grnTime || "")}</td>
      <td>${e.leadTimeHrs != null ? e.leadTimeHrs.toFixed(1) + "h" : "--"}</td>
      <td><span class="${badgeClass(statusClass)}">${esc(e.inboundType || "")}</span></td>
      <td style="text-align:center">${e.skuActual || "--"}</td>
      <td style="text-align:center">${e.pcsActual || "--"}</td>
      <td ${discClass}>${esc(discrepancy)}</td>
      <td>${esc(e.operator || "")}</td>
      <td>
        <button class="secondary iconBtn" data-ibedit="${e.id}">Edit</button>
        <button class="danger iconBtn" data-ibdel="${e.id}">Del</button>
      </td>
    </tr>`;
  }).join("");

  $("ibLogCount").textContent = `${filteredEntries.length} entries`;

  tbody.querySelectorAll("[data-ibedit]").forEach(b =>
    b.addEventListener("click", () => openModal(b.dataset.ibedit)));
  tbody.querySelectorAll("[data-ibdel]").forEach(b =>
    b.addEventListener("click", () => removeEntry(b.dataset.ibdel)));
}

// ============================================================
// VEHICLE STATUS TABLE
// ============================================================
function renderVehicleTable() {
  const tbody = $("ibVehicleTable")?.querySelector("tbody");
  if (!tbody) return;
  // Use filtered entries to build vehicle view
  const vehicles = filteredEntries.filter(e => e.vehicleId);
  if (!vehicles.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:32px">No vehicle data.</td></tr>`;
    return;
  }
  tbody.innerHTML = vehicles.map((e, i) => {
    const st = (e.vehicleStatus || "").toUpperCase();
    const statusClass = st === "DONE" ? "done" : st === "ON PROCESS" ? "progress" : "open";
    return `
    <tr>
      <td>${esc(friendlyDate(e.reportDate))}</td>
      <td style="text-align:center">${i + 1}</td>
      <td class="small">${esc(e.poNumber || "")}</td>
      <td style="text-align:center">${e.totalQty || "--"}</td>
      <td><b>${esc(e.client || "")}</b></td>
      <td>${esc(e.unitType || "")}</td>
      <td>${esc(e.driverName || "")}</td>
      <td>${esc(e.transporter || "")}</td>
      <td>${esc(e.arrivalTime || "")}</td>
      <td>${esc(e.vehicleId || "")}</td>
      <td><span class="${badgeClass(statusClass)}">${esc(e.vehicleStatus || "")}</span></td>
    </tr>`;
  }).join("");
}

// ============================================================
// MODAL — Add / Edit Entry
// ============================================================
function openModal(id = null) {
  editingId = id;
  // Build modal if it doesn't exist
  if (!document.getElementById("ibModal")) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="ibModal" class="modal hidden">
        <div class="modalBox" style="max-width:640px">
          <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">x</button></div>
          <h2 id="ibModalTitle">New Inbound Entry</h2>
          <div class="form-grid">
            <div class="field"><label>Report Date *</label><input type="date" id="ib_reportDate"/></div>
            <div class="field"><label>PO / DN Number *</label><input type="text" id="ib_poNumber" placeholder="e.g. IB/LCKY/DAVINA-001"/></div>
            <div class="field"><label>Client *</label><input type="text" id="ib_client" placeholder="e.g. PERO"/></div>
            <div class="field"><label>Vendor</label><input type="text" id="ib_vendor" placeholder="e.g. PERO"/></div>
            <div class="field"><label>Transporter</label><input type="text" id="ib_transporter" placeholder="e.g. PT. PERO"/></div>
            <div class="field"><label>Vehicle ID</label><input type="text" id="ib_vehicleId" placeholder="e.g. B 9103 MS"/></div>
            <div class="field"><label>Unit Type</label>
              <select id="ib_unitType">
                <option value="">-- Select --</option>
                ${UNIT_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label>Driver Name</label><input type="text" id="ib_driverName"/></div>
            <div class="field"><label>Manpower</label><input type="number" id="ib_manpower" min="0"/></div>
            <div class="field"><label>Arrival Time</label><input type="time" id="ib_arrivalTime"/></div>
            <div class="field"><label>Unload Begin</label><input type="time" id="ib_unloadBegin"/></div>
            <div class="field"><label>Unload Finish</label><input type="time" id="ib_unloadFinish"/></div>
            <div class="field"><label>GRN Time</label><input type="time" id="ib_grnTime"/></div>
            <div class="field"><label>Inbound Type</label>
              <select id="ib_inboundType">
                ${INBOUND_STATUSES.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label>SKU (PO)</label><input type="number" id="ib_skuPo" min="0"/></div>
            <div class="field"><label>SKU (Actual)</label><input type="number" id="ib_skuActual" min="0"/></div>
            <div class="field"><label>PCS (PO Qty)</label><input type="number" id="ib_pcsPo" min="0"/></div>
            <div class="field"><label>PCS (Actual Qty)</label><input type="number" id="ib_pcsActual" min="0"/></div>
            <div class="field"><label>Total Carton</label><input type="number" id="ib_totalCarton" min="0"/></div>
            <div class="field"><label>Damaged</label><input type="number" id="ib_damaged" min="0"/></div>
            <div class="field"><label>Operator</label><input type="text" id="ib_operator" placeholder="e.g. Siti Marisa"/></div>
            <div class="field"><label>Category Product</label><input type="text" id="ib_category" placeholder="e.g. APPAREL"/></div>
          </div>
          <label class="pmLabel">Remarks</label>
          <textarea id="ib_remarks" rows="2" placeholder="Additional notes..."></textarea>
          <div class="btns" style="justify-content:flex-end;margin-top:14px">
            <button class="secondary" id="ibModalCancel">Cancel</button>
            <button class="primary" id="ibModalSave">Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
    $("ibModalCancel").addEventListener("click", closeModal);
    $("ibModalSave").addEventListener("click", saveEntry);
  }

  $("ibModalTitle").textContent = id ? "Edit Inbound Entry" : "New Inbound Entry";

  if (id) {
    const e = allEntries.find(x => x.id === id);
    if (!e) return;
    $("ib_reportDate").value = toDateStr(e.reportDate) || "";
    $("ib_poNumber").value = e.poNumber || "";
    $("ib_client").value = e.client || "";
    $("ib_vendor").value = e.vendor || "";
    $("ib_transporter").value = e.transporter || "";
    $("ib_vehicleId").value = e.vehicleId || "";
    $("ib_unitType").value = e.unitType || "";
    $("ib_driverName").value = e.driverName || "";
    $("ib_manpower").value = e.manpower || "";
    $("ib_arrivalTime").value = e.arrivalTime || "";
    $("ib_unloadBegin").value = e.unloadBegin || "";
    $("ib_unloadFinish").value = e.unloadFinish || "";
    $("ib_grnTime").value = e.grnTime || "";
    $("ib_inboundType").value = e.inboundType || "Inbound Completed";
    $("ib_skuPo").value = e.skuPo || "";
    $("ib_skuActual").value = e.skuActual || "";
    $("ib_pcsPo").value = e.pcsPo || "";
    $("ib_pcsActual").value = e.pcsActual || "";
    $("ib_totalCarton").value = e.totalCarton || "";
    $("ib_damaged").value = e.damaged || "";
    $("ib_operator").value = e.operator || "";
    $("ib_category").value = e.category || "";
    $("ib_remarks").value = e.remarks || "";
  } else {
    $("ib_reportDate").value = today();
    ["ib_poNumber", "ib_client", "ib_vendor", "ib_transporter", "ib_vehicleId",
     "ib_driverName", "ib_manpower", "ib_arrivalTime", "ib_unloadBegin",
     "ib_unloadFinish", "ib_grnTime", "ib_skuPo", "ib_skuActual",
     "ib_pcsPo", "ib_pcsActual", "ib_totalCarton", "ib_damaged",
     "ib_operator", "ib_category", "ib_remarks"].forEach(id => $(id).value = "");
    $("ib_unitType").value = "";
    $("ib_inboundType").value = "Inbound Completed";
  }
  $("ibModal").classList.remove("hidden");
}

function closeModal() {
  const m = $("ibModal");
  if (m) m.classList.add("hidden");
  editingId = null;
}

async function saveEntry() {
  const reportDate = $("ib_reportDate").value;
  const poNumber = $("ib_poNumber").value.trim();
  const client = $("ib_client").value.trim();

  if (!reportDate) return toast("Report Date is required", "error");
  if (!poNumber) return toast("PO / DN Number is required", "error");
  if (!client) return toast("Client is required", "error");

  const arrivalTime = $("ib_arrivalTime").value;
  const unloadBegin = $("ib_unloadBegin").value;
  const unloadFinish = $("ib_unloadFinish").value;
  const grnTime = $("ib_grnTime").value;

  // Calculate unload duration in minutes
  let unloadDuration = "";
  let unloadDurationMin = null;
  if (unloadBegin && unloadFinish) {
    const [bh, bm] = unloadBegin.split(":").map(Number);
    const [fh, fm] = unloadFinish.split(":").map(Number);
    const diffMin = (fh * 60 + fm) - (bh * 60 + bm);
    if (diffMin >= 0) {
      unloadDurationMin = diffMin;
      const hrs = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      unloadDuration = hrs > 0 ? `${hrs}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
    }
  }

  // Calculate lead time (arrival to GRN) in hours
  let leadTimeHrs = null;
  let leadTimeStatus = "";
  if (arrivalTime && grnTime) {
    const [ah, am] = arrivalTime.split(":").map(Number);
    const [gh, gm] = grnTime.split(":").map(Number);
    const diffMin = (gh * 60 + gm) - (ah * 60 + am);
    if (diffMin >= 0) {
      leadTimeHrs = +(diffMin / 60).toFixed(2);
      leadTimeStatus = leadTimeHrs <= 4 ? "ontime" : "late";
    }
  }

  // Discrepancy
  const skuPo = Number($("ib_skuPo").value) || 0;
  const skuActual = Number($("ib_skuActual").value) || 0;
  const pcsPo = Number($("ib_pcsPo").value) || 0;
  const pcsActual = Number($("ib_pcsActual").value) || 0;
  const shortExcess = pcsPo !== pcsActual ? pcsPo - pcsActual : 0;
  const docVsActual = skuPo !== skuActual ? skuPo - skuActual : 0;

  const data = {
    reportDate,
    poNumber,
    client,
    vendor: $("ib_vendor").value.trim(),
    transporter: $("ib_transporter").value.trim(),
    vehicleId: $("ib_vehicleId").value.trim(),
    unitType: $("ib_unitType").value,
    driverName: $("ib_driverName").value.trim(),
    manpower: Number($("ib_manpower").value) || null,
    arrivalTime,
    unloadBegin,
    unloadFinish,
    unloadDuration,
    unloadDurationMin,
    grnTime,
    leadTimeHrs,
    leadTimeStatus,
    inboundType: $("ib_inboundType").value,
    inboundStatus: $("ib_inboundType").value,
    vehicleStatus: $("ib_inboundType").value === "Inbound Completed" ? "DONE" : "ON PROCESS",
    totalQty: pcsActual || pcsPo || null,
    skuPo, skuActual, pcsPo, pcsActual,
    totalCarton: Number($("ib_totalCarton").value) || null,
    damaged: Number($("ib_damaged").value) || null,
    shortExcess,
    docVsActual,
    operator: $("ib_operator").value.trim(),
    category: $("ib_category").value.trim(),
    remarks: $("ib_remarks").value.trim()
  };

  try {
    if (editingId) {
      await updateDocument(COL.INBOUND, editingId, data);
      toast("Entry updated", "success");
    } else {
      await addDocument(COL.INBOUND, data);
      toast("Entry created", "success");
    }
    closeModal();
  } catch (e) {
    toast("Save failed: " + e.message, "error");
  }
}

async function removeEntry(id) {
  if (!confirmAction("Delete this inbound entry?")) return;
  try {
    await deleteDocument(COL.INBOUND, id);
    toast("Entry deleted", "success");
  } catch (e) {
    toast("Delete failed: " + e.message, "error");
  }
}

// ============================================================
// EXPORT
// ============================================================
function exportExcel() {
  if (!filteredEntries.length) return toast("No entries to export", "error");
  const rows = [[
    "Report Date", "PO / DN", "Client", "Vendor", "Transporter",
    "Vehicle ID", "Unit Type", "Driver", "Manpower",
    "Arrival Time", "Unload Begin", "Unload Finish", "Unload Duration", "Unload Min",
    "GRN Time", "Lead Time (hrs)", "Lead Time Status",
    "Inbound Type", "SKU PO", "SKU Actual", "PCS PO", "PCS Actual",
    "Total Carton", "Damaged", "Short/Excess", "Doc vs Actual",
    "Operator", "Category", "Remarks"
  ]];
  filteredEntries.forEach(e => {
    rows.push([
      toDateStr(e.reportDate), e.poNumber || "", e.client || "", e.vendor || "", e.transporter || "",
      e.vehicleId || "", e.unitType || "", e.driverName || "", e.manpower || "",
      e.arrivalTime || "", e.unloadBegin || "", e.unloadFinish || "", e.unloadDuration || "", e.unloadDurationMin || "",
      e.grnTime || "", e.leadTimeHrs || "", e.leadTimeStatus || "",
      e.inboundType || "", e.skuPo || "", e.skuActual || "", e.pcsPo || "", e.pcsActual || "",
      e.totalCarton || "", e.damaged || "", e.shortExcess || "", e.docVsActual || "",
      e.operator || "", e.category || "", e.remarks || ""
    ]);
  });
  downloadXLSX(rows, `Flow_Inbound_Monitoring_${today()}.xlsx`, "Inbound");
  toast("Exported", "success");
}

// ============================================================
// IMPORT FROM EXCEL
// ============================================================
async function importExcel(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    // Try to find the imon or Update Status sheet
    let sheetName = wb.SheetNames.find(n => n.toLowerCase().includes("imon"))
      || wb.SheetNames.find(n => n.toLowerCase().includes("update status"))
      || wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Find header row (scan first 5 rows for best match)
    let headerRow = 0;
    let bestScore = 0;
    const keywords = ["po", "client", "arrival", "unloading", "grn", "vehicle", "status", "driver"];
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const rowStr = (rows[r] || []).map(c => String(c).toLowerCase()).join(" ");
      const score = keywords.filter(k => rowStr.includes(k)).length;
      if (score > bestScore) { bestScore = score; headerRow = r; }
    }

    const headers = rows[headerRow].map(h => String(h).toLowerCase().trim());
    const bodyRows = rows.slice(headerRow + 1).filter(r => r.some(c => String(c).trim() !== ""));

    if (!bodyRows.length) {
      toast("No data rows found in sheet: " + sheetName, "error");
      e.target.value = "";
      return;
    }

    // Column finder helper
    const findCol = (...terms) => headers.findIndex(h => terms.some(t => h.includes(t)));

    const colDate = findCol("report date", "date");
    const colPo = findCol("po#", "po ", "no dn", "dn");
    const colClient = findCol("client");
    const colVendor = findCol("vendor");
    const colTransporter = findCol("transporter");
    const colVehicle = findCol("vehicle id", "vehicle");
    const colType = findCol("unit type", "type");
    const colDriver = findCol("driver");
    const colManpower = findCol("manpower");
    const colArrival = findCol("arrival");
    const colUnloadBegin = findCol("begin");
    const colUnloadFinish = findCol("finish");
    const colGrn = findCol("grn");
    const colInboundType = findCol("inbound type");
    const colStatus = findCol("status");
    const colOperator = findCol("operator", "inbound by");
    const colCategory = findCol("category");
    const colRemarks = findCol("remark");

    let imported = 0, skipped = 0;
    for (const row of bodyRows) {
      const get = (idx) => idx >= 0 ? row[idx] : "";
      const dateVal = parseImportDate(get(colDate));
      if (!dateVal) { skipped++; continue; }
      const client = String(get(colClient) || "").trim();
      if (!client) { skipped++; continue; }

      const arrivalTime = parseTime(get(colArrival));
      const unloadBegin = parseTime(get(colUnloadBegin));
      const unloadFinish = parseTime(get(colUnloadFinish));
      const grnTime = parseTime(get(colGrn));

      let unloadDurationMin = null;
      let unloadDuration = "";
      if (unloadBegin && unloadFinish) {
        const [bh, bm] = unloadBegin.split(":").map(Number);
        const [fh, fm] = unloadFinish.split(":").map(Number);
        const diff = (fh * 60 + fm) - (bh * 60 + bm);
        if (diff >= 0) {
          unloadDurationMin = diff;
          unloadDuration = diff >= 60 ? `${Math.floor(diff/60)}h ${String(diff%60).padStart(2,"0")}m` : `${diff}m`;
        }
      }

      let leadTimeHrs = null, leadTimeStatus = "";
      if (arrivalTime && grnTime) {
        const [ah, am] = arrivalTime.split(":").map(Number);
        const [gh, gm] = grnTime.split(":").map(Number);
        const diff = (gh * 60 + gm) - (ah * 60 + am);
        if (diff >= 0) {
          leadTimeHrs = +(diff / 60).toFixed(2);
          leadTimeStatus = leadTimeHrs <= 4 ? "ontime" : "late";
        }
      }

      const doc = {
        reportDate: dateVal,
        poNumber: String(get(colPo) || "").trim(),
        client,
        vendor: String(get(colVendor) || "").trim(),
        transporter: String(get(colTransporter) || "").trim(),
        vehicleId: String(get(colVehicle) || "").trim(),
        unitType: String(get(colType) || "").trim(),
        driverName: String(get(colDriver) || "").trim(),
        manpower: Number(get(colManpower)) || null,
        arrivalTime, unloadBegin, unloadFinish, unloadDuration, unloadDurationMin,
        grnTime, leadTimeHrs, leadTimeStatus,
        inboundType: String(get(colInboundType) || get(colStatus) || "").trim() || "Inbound Completed",
        inboundStatus: String(get(colInboundType) || get(colStatus) || "").trim() || "Inbound Completed",
        vehicleStatus: "DONE",
        operator: String(get(colOperator) || "").trim(),
        category: String(get(colCategory) || "").trim(),
        remarks: String(get(colRemarks) || "").trim()
      };

      try {
        await addDocument(COL.INBOUND, doc);
        imported++;
      } catch (err) { skipped++; }
    }
    toast(`Imported ${imported} entries${skipped ? `, ${skipped} skipped` : ""}`, "success");
  } catch (err) {
    console.error(err);
    toast("Import failed: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
}

function parseImportDate(v) {
  if (!v) return "";
  if (typeof v === "number") {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 40000 && n < 100000) {
      const d = new Date((n - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  return !isNaN(d) ? d.toISOString().slice(0, 10) : "";
}

function parseTime(v) {
  if (!v) return "";
  if (typeof v === "number") {
    // Excel time fraction (0.5 = 12:00)
    const totalMin = Math.round(v * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return "";
}
