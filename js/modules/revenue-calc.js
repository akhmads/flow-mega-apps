// ============================================================
// FLOW Mega Apps — Revenue Calculator
// Ported from Sales_Revenue_Form_B2B.html — scenarios saved to Firestore.
// ============================================================

import {
  COL, addDocument, deleteDocument, subscribeCollection, orderBy
} from "../firebase.js";
import {
  $, esc, fmt, fmtIDR, fmtShort, today, toast, downloadXLSX, friendlyDate, confirmAction
} from "../utils.js";

const ROWS = [
  { id:"inbound",     label:"Inbound",                uom:"Per PCS",       autoQty: s => Math.round(s.vol_pcs * 1.2926), group: null },
  { id:"storage",     label:"Storage",                uom:"IDR/Cbm/Month", autoQty: null,                                 group: null },
  { id:"outbound_s",  label:"Outbound — S",           uom:"Per PCS",       autoQty: null, group:"outbound" },
  { id:"outbound_m",  label:"Outbound — M",           uom:"Per PCS",       autoQty: null, group:"outbound" },
  { id:"outbound_l",  label:"Outbound — L",           uom:"Per PCS",       autoQty: null, group:"outbound" },
  { id:"outbound_xl", label:"Outbound — XL",          uom:"Per PCS",       autoQty: null, group:"outbound" },
  { id:"rtv",         label:"RTV (Return to Vendor)", uom:"Per PCS",       autoQty: null, group: null },
  { id:"rma",         label:"RMA (Return Customer)",  uom:"Per PCS",       autoQty: null, group: null },
  { id:"oms",         label:"OMS",                    uom:"Per Order",     autoQty: s => s.vol_orders, group: null }
];

const B2B_ROWS = [
  { id:"b2b_inbound",  label:"Inbound B2B",  uom:"Per Box",        hasBox:true,  color:"#1e40af" },
  { id:"b2b_storage",  label:"Storage B2B",  uom:"IDR/Cbm/Month",  hasBox:false, color:"#b45309" },
  { id:"b2b_outbound", label:"Outbound B2B", uom:"Per Box",        hasBox:true,  color:"#15803d" }
];

let savedScenarios = [];
let scenarioUnsub = null;
let breakdownChart = null;

// ============================================================
// INIT
// ============================================================
export function initRevenueCalc() {
  buildRevTable();
  buildB2BTable();
  bindEvents();

  // Date default
  if (!$("rev_input_date").value) $("rev_input_date").value = today();

  calc();

  // Subscribe to saved scenarios
  if (scenarioUnsub) scenarioUnsub();
  scenarioUnsub = subscribeCollection(COL.REVENUE_SCENARIOS, rows => {
    savedScenarios = rows.sort((a, b) => (b.savedAtMs || 0) - (a.savedAtMs || 0));
    renderScenarios();
  }, orderBy("savedAtMs", "desc"));
}

function bindEvents() {
  // recalc on any input
  document.querySelectorAll('#revenueCalc input[type="number"], #revenueCalc input[type="text"], #revenueCalc select')
    .forEach(el => el.addEventListener("input", calc));

  $("rev_b2b_on").addEventListener("change", () => {
    $("rev_b2b_content").classList.toggle("hidden", !$("rev_b2b_on").checked);
    calc();
  });
  $("rev_min_billing_on").addEventListener("change", calc);

  $("rev_autofill_btn").onclick = autoFillQty;
  $("rev_vas_add_btn").onclick = addVasRow;
  $("revResetBtn").onclick = resetAll;
  $("revSaveBtn").onclick = saveScenario;
  $("revExportBtn").onclick = exportExcel;

  // Tabs
  document.querySelectorAll("[data-revtab]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("[data-revtab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".revTab").forEach(t => t.classList.add("hidden"));
      $("revTab-" + btn.dataset.revtab).classList.remove("hidden");
      if (btn.dataset.revtab === "breakdown") renderBreakdownChart();
    };
  });
}

// ============================================================
// BUILD TABLES
// ============================================================
function buildRevTable() {
  const tbody = $("rev_body");
  tbody.innerHTML = "";
  ROWS.forEach(r => {
    const tr = document.createElement("tr");
    tr.id = "rev_tr_" + r.id;
    tr.innerHTML = `
      <td><input type="checkbox" class="row-toggle" id="rev_chk_${r.id}" checked></td>
      <td><b>${esc(r.label)}</b></td>
      <td><input type="number" id="rev_rate_${r.id}" placeholder="0" style="width:140px"></td>
      <td><span class="small">${esc(r.uom)}</span></td>
      <td><input type="number" id="rev_qty_${r.id}" placeholder="0" style="width:120px"></td>
      <td id="rev_rev_${r.id}" style="font-variant-numeric:tabular-nums">—</td>
    `;
    tbody.appendChild(tr);
    tr.querySelectorAll("input").forEach(el => el.addEventListener("input", calc));
    tr.querySelector(".row-toggle").addEventListener("change", calc);
  });
}

function buildB2BTable() {
  const tbody = $("rev_b2b_body");
  tbody.innerHTML = "";
  B2B_ROWS.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" class="row-toggle" id="rev_b2b_chk_${r.id}" checked></td>
      <td><b style="color:${r.color}">${esc(r.label)}</b></td>
      <td><input type="number" id="rev_b2b_rate_${r.id}" placeholder="0" style="width:140px"></td>
      <td><span class="small">${esc(r.uom)}</span></td>
      <td><input type="number" id="rev_b2b_qty_${r.id}" placeholder="0" style="width:120px"></td>
      <td>${r.hasBox ? `<input type="number" id="rev_b2b_box_${r.id}" placeholder="0" style="width:120px">` : '<span class="small">—</span>'}</td>
      <td id="rev_b2b_rev_${r.id}" style="font-variant-numeric:tabular-nums">—</td>
    `;
    tbody.appendChild(tr);
    tr.querySelectorAll("input").forEach(el => el.addEventListener("input", calc));
  });
}

// ============================================================
// CALC
// ============================================================
function calc() {
  const g = id => parseFloat($(id)?.value) || 0;
  const s = {
    working_days: g("rev_working_days"),
    vol_orders: g("rev_vol_orders"),
    vol_pcs: g("rev_vol_pcs"),
    aipo: g("rev_aipo")
  };

  // Derived
  const orderDay = s.working_days > 0 ? s.vol_orders / s.working_days : 0;
  const pcsDay = s.working_days > 0 ? s.vol_pcs / s.working_days : 0;
  const gmvRaw = g("rev_gmv_input");
  const appiRaw = g("rev_appi_input");
  const aov = gmvRaw > 0 && s.vol_orders > 0 ? gmvRaw / s.vol_orders : 0;

  $("rev_m_order_day").textContent = orderDay > 0 ? fmt(orderDay) : "—";
  $("rev_m_pcs_day").textContent = pcsDay > 0 ? fmt(pcsDay) : "—";
  $("rev_m_aov").textContent = aov > 0 ? fmtIDR(aov) : "—";
  $("rev_m_gmv").textContent = gmvRaw > 0 ? fmtIDR(gmvRaw) : "—";

  // Main rows
  let subtotal = 0;
  ROWS.forEach(r => {
    const on = $("rev_chk_" + r.id).checked;
    const rate = g("rev_rate_" + r.id);
    const qty = g("rev_qty_" + r.id);
    const rev = on ? rate * qty : 0;
    const el = $("rev_rev_" + r.id);
    el.textContent = (on && rate > 0 && qty > 0) ? fmtIDR(rev) : "—";
    if (on && rate > 0 && qty > 0) subtotal += rev;
  });
  $("rev_sub_total_val").textContent = subtotal > 0 ? fmtIDR(subtotal) : "—";

  // VAS
  let vasTotal = 0;
  document.querySelectorAll(".vas-row").forEach(row => {
    const rate = parseFloat(row.querySelector(".vas-rate").value) || 0;
    const qty = parseFloat(row.querySelector(".vas-qty").value) || 0;
    const rev = rate * qty;
    vasTotal += rev;
    row.querySelector(".vas-rev").textContent = (rate > 0 && qty > 0) ? fmtIDR(rev) : "—";
  });
  $("rev_vas_total").textContent = vasTotal > 0 ? fmtIDR(vasTotal) : "—";
  $("rev_vas_empty").style.display = document.querySelectorAll(".vas-row").length === 0 ? "block" : "none";

  // B2B
  let b2bTotal = 0;
  if ($("rev_b2b_on").checked) {
    B2B_ROWS.forEach(r => {
      const on = $("rev_b2b_chk_" + r.id).checked;
      const rate = g("rev_b2b_rate_" + r.id);
      const qty = g("rev_b2b_qty_" + r.id);
      const box = r.hasBox ? g("rev_b2b_box_" + r.id) : 1;
      const rev = on ? (r.hasBox ? rate * qty * box : rate * qty) : 0;
      $("rev_b2b_rev_" + r.id).textContent = rev > 0 ? fmtIDR(rev) : "—";
      b2bTotal += rev;
    });
  }
  $("rev_b2b_total").textContent = b2bTotal > 0 ? fmtIDR(b2bTotal) : "—";

  // Minimum billing
  let total = subtotal + vasTotal + b2bTotal;
  const minOn = $("rev_min_billing_on").checked;
  const minVal = g("rev_min_billing_value");
  if (minOn && minVal > 0) {
    if (total < minVal) {
      total = minVal;
      $("rev_min_billing_status").textContent = `Minimum billing applied (was ${fmtIDR(subtotal + vasTotal + b2bTotal)})`;
    } else {
      $("rev_min_billing_status").textContent = "Above minimum — no adjustment";
    }
  } else {
    $("rev_min_billing_status").textContent = "Minimum billing not active";
  }

  $("rev_total_value").textContent = fmtIDR(total);
  $("rev_total_sub").textContent =
    `Activity: ${fmtIDR(subtotal)} · VAS: ${fmtIDR(vasTotal)} · B2B: ${fmtIDR(b2bTotal)}`;
}

// ============================================================
// VAS rows
// ============================================================
function addVasRow() {
  const tbody = $("rev_vas_body");
  const tr = document.createElement("tr");
  tr.className = "vas-row";
  tr.innerHTML = `
    <td><input type="text" class="vas-name" placeholder="Activity name"></td>
    <td><input type="number" class="vas-rate" placeholder="0" style="width:140px"></td>
    <td><input type="text" class="vas-uom" placeholder="UoM" style="width:120px"></td>
    <td><input type="number" class="vas-qty" placeholder="0" style="width:120px"></td>
    <td class="vas-rev" style="font-variant-numeric:tabular-nums">—</td>
    <td><button class="danger iconBtn" data-vasdel>×</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelectorAll("input").forEach(el => el.addEventListener("input", calc));
  tr.querySelector("[data-vasdel]").onclick = () => { tr.remove(); calc(); };
  calc();
}

// ============================================================
// AUTO-FILL
// ============================================================
function autoFillQty() {
  const s = {
    vol_orders: parseFloat($("rev_vol_orders").value) || 0,
    vol_pcs: parseFloat($("rev_vol_pcs").value) || 0
  };
  ROWS.forEach(r => {
    if (typeof r.autoQty === "function") {
      const q = r.autoQty(s);
      if (q > 0) $("rev_qty_" + r.id).value = q;
    }
    // Outbound: split equally across S/M/L/XL if no values
    if (r.group === "outbound" && !$("rev_qty_" + r.id).value && s.vol_pcs > 0) {
      $("rev_qty_" + r.id).value = Math.round(s.vol_pcs / 4);
    }
  });
  calc();
  toast("Auto-filled quantities", "success");
}

// ============================================================
// RESET / SAVE
// ============================================================
function resetAll() {
  if (!confirmAction("Reset all fields?")) return;
  document.querySelectorAll('#revenueCalc input[type="number"], #revenueCalc input[type="text"]').forEach(el => {
    if (el.id !== "rev_input_date") el.value = "";
  });
  $("rev_input_date").value = today();
  $("rev_proposal_status").value = "draft";
  $("rev_vas_body").innerHTML = "";
  $("rev_b2b_on").checked = false;
  $("rev_b2b_content").classList.add("hidden");
  $("rev_min_billing_on").checked = false;
  document.querySelectorAll(".row-toggle").forEach(c => c.checked = true);
  calc();
  toast("Form reset", "success");
}

async function saveScenario() {
  const client = $("rev_client_name").value.trim();
  const sales = $("rev_sales_name").value.trim();
  if (!client) return toast("Client name required", "error");
  if (!sales) return toast("Sales PIC required", "error");

  // Snapshot all values
  const snapshot = { activityRows: {}, b2bRows: {}, vasRows: [] };
  ROWS.forEach(r => {
    snapshot.activityRows[r.id] = {
      enabled: $("rev_chk_" + r.id).checked,
      rate: parseFloat($("rev_rate_" + r.id).value) || 0,
      qty: parseFloat($("rev_qty_" + r.id).value) || 0
    };
  });
  B2B_ROWS.forEach(r => {
    snapshot.b2bRows[r.id] = {
      enabled: $("rev_b2b_chk_" + r.id).checked,
      rate: parseFloat($("rev_b2b_rate_" + r.id).value) || 0,
      qty: parseFloat($("rev_b2b_qty_" + r.id).value) || 0,
      box: r.hasBox ? parseFloat($("rev_b2b_box_" + r.id)?.value) || 0 : 0
    };
  });
  document.querySelectorAll(".vas-row").forEach(row => {
    snapshot.vasRows.push({
      name: row.querySelector(".vas-name").value,
      rate: parseFloat(row.querySelector(".vas-rate").value) || 0,
      uom: row.querySelector(".vas-uom").value,
      qty: parseFloat(row.querySelector(".vas-qty").value) || 0
    });
  });

  const data = {
    client, sales,
    inputDate: $("rev_input_date").value,
    proposalStatus: $("rev_proposal_status").value,
    workingDays: parseFloat($("rev_working_days").value) || 0,
    volOrders: parseFloat($("rev_vol_orders").value) || 0,
    volPcs: parseFloat($("rev_vol_pcs").value) || 0,
    aipo: parseFloat($("rev_aipo").value) || 0,
    gmv: parseFloat($("rev_gmv_input").value) || 0,
    appi: parseFloat($("rev_appi_input").value) || 0,
    minBillingOn: $("rev_min_billing_on").checked,
    minBillingValue: parseFloat($("rev_min_billing_value").value) || 0,
    b2bOn: $("rev_b2b_on").checked,
    totalRevenue: parseFloat($("rev_total_value").textContent.replace(/[^0-9]/g, "")) || 0,
    snapshot,
    savedAtMs: Date.now()
  };

  try {
    await addDocument(COL.REVENUE_SCENARIOS, data);
    toast(`Scenario saved for ${client}`, "success");
  } catch (e) {
    console.error(e);
    toast("Save failed: " + e.message, "error");
  }
}

// ============================================================
// SCENARIOS TAB
// ============================================================
function renderScenarios() {
  const tbody = $("rev_scenarios_body");
  if (!savedScenarios.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No saved scenarios yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = savedScenarios.map(s => `
    <tr>
      <td>${esc(friendlyDate(new Date(s.savedAtMs || Date.now())))}</td>
      <td><b>${esc(s.client)}</b></td>
      <td>${esc(s.sales)}</td>
      <td>${esc(s.proposalStatus || "")}</td>
      <td>${fmtIDR(s.totalRevenue || 0)}</td>
      <td>
        <button class="secondary iconBtn" data-load="${s.id}">Load</button>
        <button class="danger iconBtn" data-delsc="${s.id}">Del</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-load]").forEach(b =>
    b.addEventListener("click", () => loadScenario(b.dataset.load)));
  tbody.querySelectorAll("[data-delsc]").forEach(b =>
    b.addEventListener("click", () => deleteScenario(b.dataset.delsc)));
}

function loadScenario(id) {
  const s = savedScenarios.find(x => x.id === id);
  if (!s) return;
  $("rev_client_name").value = s.client || "";
  $("rev_sales_name").value = s.sales || "";
  $("rev_input_date").value = s.inputDate || today();
  $("rev_proposal_status").value = s.proposalStatus || "draft";
  $("rev_working_days").value = s.workingDays || "";
  $("rev_vol_orders").value = s.volOrders || "";
  $("rev_vol_pcs").value = s.volPcs || "";
  $("rev_aipo").value = s.aipo || "";
  $("rev_gmv_input").value = s.gmv || "";
  $("rev_appi_input").value = s.appi || "";
  $("rev_min_billing_on").checked = !!s.minBillingOn;
  $("rev_min_billing_value").value = s.minBillingValue || "";
  $("rev_b2b_on").checked = !!s.b2bOn;
  $("rev_b2b_content").classList.toggle("hidden", !s.b2bOn);

  if (s.snapshot) {
    Object.entries(s.snapshot.activityRows || {}).forEach(([id, v]) => {
      if ($("rev_chk_" + id)) $("rev_chk_" + id).checked = v.enabled;
      if ($("rev_rate_" + id)) $("rev_rate_" + id).value = v.rate || "";
      if ($("rev_qty_" + id)) $("rev_qty_" + id).value = v.qty || "";
    });
    Object.entries(s.snapshot.b2bRows || {}).forEach(([id, v]) => {
      if ($("rev_b2b_chk_" + id)) $("rev_b2b_chk_" + id).checked = v.enabled;
      if ($("rev_b2b_rate_" + id)) $("rev_b2b_rate_" + id).value = v.rate || "";
      if ($("rev_b2b_qty_" + id)) $("rev_b2b_qty_" + id).value = v.qty || "";
      if (v.box && $("rev_b2b_box_" + id)) $("rev_b2b_box_" + id).value = v.box;
    });
    $("rev_vas_body").innerHTML = "";
    (s.snapshot.vasRows || []).forEach(v => {
      addVasRow();
      const last = $("rev_vas_body").lastElementChild;
      last.querySelector(".vas-name").value = v.name || "";
      last.querySelector(".vas-rate").value = v.rate || "";
      last.querySelector(".vas-uom").value = v.uom || "";
      last.querySelector(".vas-qty").value = v.qty || "";
    });
  }
  calc();
  // switch to calculator tab
  document.querySelector('[data-revtab="calculator"]').click();
  toast(`Loaded scenario for ${s.client}`, "success");
}

async function deleteScenario(id) {
  if (!confirmAction("Delete this saved scenario?")) return;
  try {
    await deleteDocument(COL.REVENUE_SCENARIOS, id);
    toast("Scenario deleted", "success");
  } catch (e) {
    toast("Delete failed", "error");
  }
}

// ============================================================
// EXPORT
// ============================================================
function exportExcel() {
  const client = $("rev_client_name").value.trim() || "Client";
  const rows = [
    ["FLOW REVENUE CALCULATOR"],
    ["Client", client],
    ["Sales PIC", $("rev_sales_name").value],
    ["Input Date", $("rev_input_date").value],
    ["Proposal Status", $("rev_proposal_status").value],
    [],
    ["ACTIVITY BASE"],
    ["Working Days / Month", $("rev_working_days").value],
    ["Vol Orders / Month", $("rev_vol_orders").value],
    ["Vol Pcs / Month", $("rev_vol_pcs").value],
    ["AIPO", $("rev_aipo").value],
    ["GMV", $("rev_gmv_input").value],
    [],
    ["REVENUE BREAKDOWN"],
    ["Activity", "Rate", "UoM", "Qty", "Revenue"]
  ];
  ROWS.forEach(r => {
    if (!$("rev_chk_" + r.id).checked) return;
    rows.push([
      r.label,
      $("rev_rate_" + r.id).value,
      r.uom,
      $("rev_qty_" + r.id).value,
      $("rev_rev_" + r.id).textContent
    ]);
  });
  rows.push([], ["GRAND TOTAL", "", "", "", $("rev_total_value").textContent]);
  const filename = `Flow_Revenue_${client.replace(/\s+/g, "_")}_${today()}.xlsx`;
  downloadXLSX(rows, filename, "Revenue Calc");
  toast("Exported " + filename, "success");
}

// ============================================================
// BREAKDOWN CHART
// ============================================================
function renderBreakdownChart() {
  const data = [];
  const labels = [];
  const colors = ["#7c3aed", "#22d3ee", "#f59e0b", "#22c55e", "#ef4444", "#3b82f6", "#ec4899", "#84cc16", "#a855f7"];

  ROWS.forEach((r, i) => {
    const on = $("rev_chk_" + r.id).checked;
    const rate = parseFloat($("rev_rate_" + r.id).value) || 0;
    const qty = parseFloat($("rev_qty_" + r.id).value) || 0;
    if (on && rate > 0 && qty > 0) {
      labels.push(r.label);
      data.push(rate * qty);
    }
  });

  let vasTotal = 0;
  document.querySelectorAll(".vas-row").forEach(row => {
    vasTotal += (parseFloat(row.querySelector(".vas-rate").value) || 0) *
                (parseFloat(row.querySelector(".vas-qty").value) || 0);
  });
  if (vasTotal > 0) { labels.push("VAS"); data.push(vasTotal); }

  if ($("rev_b2b_on").checked) {
    let b2bTotal = 0;
    B2B_ROWS.forEach(r => {
      const rate = parseFloat($("rev_b2b_rate_" + r.id).value) || 0;
      const qty = parseFloat($("rev_b2b_qty_" + r.id).value) || 0;
      const box = r.hasBox ? parseFloat($("rev_b2b_box_" + r.id).value) || 0 : 1;
      if ($("rev_b2b_chk_" + r.id).checked) {
        b2bTotal += r.hasBox ? rate * qty * box : rate * qty;
      }
    });
    if (b2bTotal > 0) { labels.push("B2B"); data.push(b2bTotal); }
  }

  if (breakdownChart) breakdownChart.destroy();
  const canvas = $("revChartBreakdown");
  if (!canvas) return;
  breakdownChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 0 }]
    },
    options: { plugins: { legend: { position: "right" } } }
  });
}
