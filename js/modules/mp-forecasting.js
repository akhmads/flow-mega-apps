// ============================================================
// FLOW Mega Apps — MP Forecasting (Operations)
//
// Manpower forecast planning based on volume targets and
// productivity rates. Import roster + pool data from Excel.
// ============================================================

import { $, esc, toast, today, downloadXLSX } from "../utils.js";

// Default productivity rates (from Flow's Planning Outbound sheet)
const FUNCTIONS = [
  { name: "Admin",      type: "In-Direct", prodPerHr: 40,  uom: "Order" },
  { name: "Picker",     type: "Direct",    prodPerHr: 160, uom: "Pcs" },
  { name: "Checker",    type: "Direct",    prodPerHr: 120, uom: "Pcs" },
  { name: "Packer",     type: "Direct",    prodPerHr: 100, uom: "Pcs" },
  { name: "Dispatcher", type: "In-Direct", prodPerHr: 30,  uom: "Order" },
  { name: "Unloading",  type: "Direct",    prodPerHr: 200, uom: "Pcs" },
  { name: "Putaway",    type: "Direct",    prodPerHr: 150, uom: "Pcs" },
  { name: "QC",         type: "Direct",    prodPerHr: 100, uom: "Pcs" }
];

const SHIFT_HOURS = { "1": 8, "M": 8, "2": 8, "3": 7 };
const SHIFT_ALLOC = { "1": 0.6, "M": 0.0, "2": 0.2, "3": 0.2 };

let rosterData = [];
let poolData = [];
let forecastResult = [];
let currentTab = "forecast";

// ============================================================
// INIT
// ============================================================
export function initMPForecasting() {
  bindEvents();
  renderForecastDefaults();
  renderPool();
  renderRoster();
}

function bindEvents() {
  $("mpImportBtn")?.addEventListener("click", () => $("mpImportFile").click());
  $("mpImportFile")?.addEventListener("change", importExcel);
  $("mpExportBtn")?.addEventListener("click", exportExcel);
  $("mpCalcBtn")?.addEventListener("click", calculateForecast);

  // Tab switching
  document.querySelectorAll("[data-mptab]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.mptab;
      document.querySelectorAll("[data-mptab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll("[data-mppane]").forEach(p => p.classList.add("hidden"));
      document.querySelector(`[data-mppane="${currentTab}"]`)?.classList.remove("hidden");
    });
  });

  // Pool filters
  ["mpPoolDiv", "mpPoolStatus"].forEach(id => $(id)?.addEventListener("change", renderPool));
  $("mpPoolSearch")?.addEventListener("input", renderPool);

  // Roster filters
  ["mpRstDiv", "mpRstFunc", "mpRstShift"].forEach(id => $(id)?.addEventListener("change", renderRoster));
}

// ============================================================
// FORECAST CALCULATION
// ============================================================
function calculateForecast() {
  const volume = Number($("mpFcVolume")?.value) || 0;
  const divFilter = $("mpFcDiv")?.value || "";

  if (!volume) return toast("Enter a target volume", "error");

  forecastResult = FUNCTIONS.map(fn => {
    const hoursPerShift = SHIFT_HOURS["1"];
    const capacityPerPerson = fn.prodPerHr * hoursPerShift;
    const s1 = Math.ceil((volume * SHIFT_ALLOC["1"]) / capacityPerPerson);
    const sm = fn.type === "In-Direct" ? Math.ceil(volume * 0.05 / capacityPerPerson) : 0;
    const s2 = Math.ceil((volume * SHIFT_ALLOC["2"]) / capacityPerPerson);
    const s3 = Math.ceil((volume * SHIFT_ALLOC["3"]) / capacityPerPerson);
    return { ...fn, s1, sm, s2, s3, total: s1 + sm + s2 + s3 };
  });

  if (divFilter) {
    // Filter based on division mapping
    const obFuncs = ["Admin", "Picker", "Checker", "Packer", "Dispatcher"];
    const ibFuncs = ["Admin", "Unloading", "Putaway", "QC"];
    const invFuncs = ["Admin", "QC"];
    const allowed = divFilter === "OUTBOUND" ? obFuncs
      : divFilter === "INBOUND" ? ibFuncs
      : divFilter === "INVENTORY" ? invFuncs : null;
    if (allowed) forecastResult = forecastResult.filter(f => allowed.includes(f.name));
  }

  renderForecastTable();
  renderDivisionSummary(volume);
}

function renderForecastDefaults() {
  renderForecastTable();
  renderDivisionSummary(0);
}

function renderForecastTable() {
  const tbody = $("mpFcTable")?.querySelector("tbody");
  if (!tbody) return;

  if (!forecastResult.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px">Enter a volume target and click Calculate.</td></tr>`;
    $("mpKpiTotal").textContent = "0";
    $("mpKpiS1").textContent = "0";
    $("mpKpiS2").textContent = "0";
    $("mpKpiS3").textContent = "0";
    return;
  }

  tbody.innerHTML = forecastResult.map(f => `
    <tr>
      <td><b>${esc(f.name)}</b></td>
      <td>${esc(f.type)}</td>
      <td style="text-align:center">${f.prodPerHr}</td>
      <td>${esc(f.uom)}</td>
      <td style="text-align:center">${f.s1}</td>
      <td style="text-align:center">${f.sm}</td>
      <td style="text-align:center">${f.s2}</td>
      <td style="text-align:center">${f.s3}</td>
      <td style="text-align:center"><b>${f.total}</b></td>
    </tr>
  `).join("");

  // Totals
  const totS1 = forecastResult.reduce((s, f) => s + f.s1, 0);
  const totSm = forecastResult.reduce((s, f) => s + f.sm, 0);
  const totS2 = forecastResult.reduce((s, f) => s + f.s2, 0);
  const totS3 = forecastResult.reduce((s, f) => s + f.s3, 0);
  const totAll = forecastResult.reduce((s, f) => s + f.total, 0);

  tbody.innerHTML += `
    <tr style="font-weight:700;background:var(--bg)">
      <td colspan="4">TOTAL</td>
      <td style="text-align:center">${totS1}</td>
      <td style="text-align:center">${totSm}</td>
      <td style="text-align:center">${totS2}</td>
      <td style="text-align:center">${totS3}</td>
      <td style="text-align:center">${totAll}</td>
    </tr>`;

  $("mpKpiTotal").textContent = totAll;
  $("mpKpiS1").textContent = totS1;
  $("mpKpiS2").textContent = totS2;
  $("mpKpiS3").textContent = totS3;
}

function renderDivisionSummary(volume) {
  const tbody = $("mpDivTable")?.querySelector("tbody");
  if (!tbody) return;
  if (!volume) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Run a forecast to see division breakdown.</td></tr>`;
    return;
  }

  const divisions = [
    { name: "OUTBOUND", funcs: ["Admin", "Picker", "Checker", "Packer", "Dispatcher"] },
    { name: "INBOUND", funcs: ["Admin", "Unloading", "Putaway", "QC"] },
    { name: "INVENTORY", funcs: ["Admin", "QC"] }
  ];

  const allFuncs = FUNCTIONS.map(fn => {
    const hoursPerShift = SHIFT_HOURS["1"];
    const cap = fn.prodPerHr * hoursPerShift;
    return {
      ...fn,
      s1: Math.ceil((volume * SHIFT_ALLOC["1"]) / cap),
      sm: fn.type === "In-Direct" ? Math.ceil(volume * 0.05 / cap) : 0,
      s2: Math.ceil((volume * SHIFT_ALLOC["2"]) / cap),
      s3: Math.ceil((volume * SHIFT_ALLOC["3"]) / cap)
    };
  });

  const rows = divisions.map(div => {
    const fns = allFuncs.filter(f => div.funcs.includes(f.name));
    const s1 = fns.reduce((s, f) => s + f.s1, 0);
    const sm = fns.reduce((s, f) => s + f.sm, 0);
    const s2 = fns.reduce((s, f) => s + f.s2, 0);
    const s3 = fns.reduce((s, f) => s + f.s3, 0);
    return { name: div.name, s1, sm, s2, s3, total: s1 + sm + s2 + s3 };
  });

  const grand = { s1: 0, sm: 0, s2: 0, s3: 0, total: 0 };
  rows.forEach(r => { grand.s1 += r.s1; grand.sm += r.sm; grand.s2 += r.s2; grand.s3 += r.s3; grand.total += r.total; });

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><b>${esc(r.name)}</b></td>
      <td style="text-align:center">${r.s1}</td>
      <td style="text-align:center">${r.sm}</td>
      <td style="text-align:center">${r.s2}</td>
      <td style="text-align:center">${r.s3}</td>
      <td style="text-align:center"><b>${r.total}</b></td>
    </tr>
  `).join("") + `
    <tr style="font-weight:700;background:var(--bg)">
      <td>TOTAL</td>
      <td style="text-align:center">${grand.s1}</td>
      <td style="text-align:center">${grand.sm}</td>
      <td style="text-align:center">${grand.s2}</td>
      <td style="text-align:center">${grand.s3}</td>
      <td style="text-align:center">${grand.total}</td>
    </tr>`;
}

// ============================================================
// ROSTER
// ============================================================
function renderRoster() {
  const tbody = $("mpRosterTable")?.querySelector("tbody");
  if (!tbody) return;

  let data = [...rosterData];
  const div = $("mpRstDiv")?.value;
  const func = $("mpRstFunc")?.value;
  const shift = $("mpRstShift")?.value;
  if (div) data = data.filter(r => (r.division || "").toUpperCase() === div);
  if (func) data = data.filter(r => (r.function || "").toUpperCase() === func.toUpperCase());
  if (shift) data = data.filter(r => String(r.shift) === shift);

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">No roster data. Import from Excel.</td></tr>`;
    $("mpRosterCount").textContent = "0 employees";
    return;
  }

  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><b>${esc(r.name || "")}</b></td>
      <td>${esc(r.function || "")}</td>
      <td>${esc(r.division || "")}</td>
      <td>${esc(r.status || "")}</td>
      <td>${esc(r.type || "")}</td>
      <td>${esc(r.grade || "")}</td>
      <td>${esc(r.task || "")}</td>
    </tr>
  `).join("");
  $("mpRosterCount").textContent = `${data.length} employees`;

  // Populate function filter
  const funcs = [...new Set(rosterData.map(r => r.function).filter(Boolean))].sort();
  const funcSel = $("mpRstFunc");
  if (funcSel) {
    const cur = funcSel.value;
    funcSel.innerHTML = `<option value="">All</option>` + funcs.map(f => `<option>${esc(f)}</option>`).join("");
    funcSel.value = cur;
  }
}

// ============================================================
// POOL
// ============================================================
function renderPool() {
  const tbody = $("mpPoolTable")?.querySelector("tbody");
  if (!tbody) return;

  let data = [...poolData];
  const div = $("mpPoolDiv")?.value;
  const status = $("mpPoolStatus")?.value;
  const search = ($("mpPoolSearch")?.value || "").toLowerCase();
  if (div) data = data.filter(r => (r.division || "").toUpperCase() === div);
  if (status) data = data.filter(r => (r.status || "").toLowerCase() === status.toLowerCase());
  if (search) data = data.filter(r => (r.name || "").toLowerCase().includes(search));

  $("mpPoolTotal").textContent = poolData.length;
  $("mpPoolActive").textContent = poolData.filter(r => (r.status || "").toLowerCase() === "active").length;
  $("mpPoolOB").textContent = poolData.filter(r => (r.division || "").toUpperCase() === "OUTBOUND").length;
  $("mpPoolIB").textContent = poolData.filter(r => (r.division || "").toUpperCase() === "INBOUND").length;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No pool data. Import from Excel.</td></tr>`;
    $("mpPoolCount").textContent = "0 employees";
    return;
  }

  tbody.innerHTML = data.slice(0, 500).map(r => `
    <tr>
      <td><b>${esc(r.name || "")}</b></td>
      <td>${esc(r.function || "")}</td>
      <td>${esc(r.division || "")}</td>
      <td>${esc(r.status || "")}</td>
      <td>${esc(r.type || "")}</td>
      <td>${esc(r.grade || "")}</td>
      <td>${esc(r.source || "")}</td>
    </tr>
  `).join("");
  $("mpPoolCount").textContent = `${data.length} employees`;
}

// ============================================================
// IMPORT
// ============================================================
async function importExcel(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);

    // Import Roster
    const rosterSheet = wb.SheetNames.find(n => n.toLowerCase().includes("roster"))
      || wb.SheetNames.find(n => n.toLowerCase().includes("roaster"));
    if (rosterSheet) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[rosterSheet], { header: 1, defval: "" });
      const hdrIdx = rows.findIndex(r => r.some(c => String(c).toLowerCase().includes("nama") || String(c).toLowerCase().includes("name")));
      if (hdrIdx >= 0) {
        const headers = rows[hdrIdx].map(h => String(h).toLowerCase().trim());
        const body = rows.slice(hdrIdx + 1).filter(r => r.some(c => String(c).trim()));
        const col = (...terms) => headers.findIndex(h => terms.some(t => h.includes(t)));
        const cName = col("nama", "name");
        const cFunc = col("function");
        const cDiv = col("division");
        const cStatus = col("status");
        const cType = col("type");
        const cGrade = col("grade");
        const cTask = col("task");
        const cShift = col("shift");

        rosterData = body.filter(r => String(r[cName] || "").trim()).map(r => ({
          name: String(r[cName] || "").trim(),
          function: String(r[cFunc >= 0 ? cFunc : 0] || "").trim(),
          division: String(r[cDiv >= 0 ? cDiv : 0] || "").trim(),
          status: String(r[cStatus >= 0 ? cStatus : 0] || "").trim(),
          type: String(r[cType >= 0 ? cType : 0] || "").trim(),
          grade: String(r[cGrade >= 0 ? cGrade : 0] || "").trim(),
          task: String(r[cTask >= 0 ? cTask : 0] || "").trim(),
          shift: r[cShift >= 0 ? cShift : 0] || ""
        }));
        toast(`Roster: ${rosterData.length} employees imported`, "success");
      }
    }

    // Import Pool
    const poolSheet = wb.SheetNames.find(n => n.toLowerCase().includes("pool"));
    if (poolSheet) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[poolSheet], { header: 1, defval: "" });
      const hdrIdx = rows.findIndex(r => r.some(c => String(c).toLowerCase().includes("employee") || String(c).toLowerCase().includes("name")));
      if (hdrIdx >= 0) {
        const headers = rows[hdrIdx].map(h => String(h).toLowerCase().trim());
        const body = rows.slice(hdrIdx + 1).filter(r => r.some(c => String(c).trim()));
        const col = (...terms) => headers.findIndex(h => terms.some(t => h.includes(t)));
        const cName = col("employee", "name");
        const cFunc = col("function");
        const cDiv = col("division");
        const cStatus = col("status");
        const cType = col("type");
        const cGrade = col("grade");
        const cSource = col("source");

        poolData = body.filter(r => String(r[cName] || "").trim()).map(r => ({
          name: String(r[cName] || "").trim(),
          function: String(r[cFunc >= 0 ? cFunc : 0] || "").trim(),
          division: String(r[cDiv >= 0 ? cDiv : 0] || "").trim(),
          status: String(r[cStatus >= 0 ? cStatus : 0] || "").trim(),
          type: String(r[cType >= 0 ? cType : 0] || "").trim(),
          grade: String(r[cGrade >= 0 ? cGrade : 0] || "").trim(),
          source: String(r[cSource >= 0 ? cSource : 0] || "").trim()
        }));
        toast(`Pool: ${poolData.length} employees imported`, "success");
      }
    }

    if (!rosterSheet && !poolSheet) {
      toast("No Roster or Pool sheet found in the file", "error");
    }

    renderRoster();
    renderPool();
  } catch (err) {
    console.error(err);
    toast("Import failed: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
}

// ============================================================
// EXPORT
// ============================================================
function exportExcel() {
  if (!forecastResult.length && !rosterData.length && !poolData.length) {
    return toast("No data to export", "error");
  }
  if (typeof XLSX === "undefined") return toast("XLSX library not loaded", "error");

  const wb = XLSX.utils.book_new();

  if (forecastResult.length) {
    const rows = [["Function", "Type", "Prod/Hr", "UoM", "Shift 1", "Shift M", "Shift 2", "Shift 3", "Total"]];
    forecastResult.forEach(f => rows.push([f.name, f.type, f.prodPerHr, f.uom, f.s1, f.sm, f.s2, f.s3, f.total]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Forecast");
  }
  if (rosterData.length) {
    const rows = [["Name", "Function", "Division", "Status", "Type", "Grade", "Task"]];
    rosterData.forEach(r => rows.push([r.name, r.function, r.division, r.status, r.type, r.grade, r.task]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Roster");
  }
  if (poolData.length) {
    const rows = [["Name", "Function", "Division", "Status", "Type", "Grade", "Source"]];
    poolData.forEach(r => rows.push([r.name, r.function, r.division, r.status, r.type, r.grade, r.source]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Pool");
  }

  XLSX.writeFile(wb, `Flow_MP_Forecast_${today()}.xlsx`);
  toast("Exported", "success");
}
