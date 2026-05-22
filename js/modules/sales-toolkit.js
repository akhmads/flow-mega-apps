// ============================================================
// FLOW Mega Apps — Sales Toolkit (Warehouse Fulfillment)
//
// The toolkit UI ships as a standalone page at /tools/sales-toolkit.html
// (its own dark-on-light theme, loaded in an <iframe> for full style
// isolation). This module is the HOST side of a small postMessage
// bridge: the iframe itself is NOT signed in to Firebase, so all
// privileged work — role checks, Firestore reads/writes, and the
// audit-log trail — happens here, in the app's authenticated context.
//
// Editable features backed by this bridge:
//   • toolkit_templates  — custom follow-up templates  (supervisor add/delete)
//   • toolkit_objections — custom objection scripts     (supervisor add/delete)
//   • toolkit_deals      — saved deal scores            (any user saves)
//
// Every add/delete goes through addDocument/deleteDocument, which write
// to the audit_log collection automatically → all of it shows up in the
// Activity Log with no extra work.
// ============================================================

import { $ } from "../utils.js";
import { isSupervisor, getCurrentEmail, getCurrentRole, getStaffForTeam } from "../roles.js";
import { addDocument, getDocuments, deleteDocument } from "../firebase.js";

const TOOLKIT_SRC = "./tools/sales-toolkit.html";

// Collection names backing each editable feature.
const COLLECTIONS = {
  templates: "toolkit_templates",
  objections: "toolkit_objections",
  deals: "toolkit_deals"
};

let _frame = null;
let _listening = false;

export function initSalesToolkit() {
  _frame = $("salesToolkitFrame");
  if (_frame && !_frame.getAttribute("src")) {
    _frame.addEventListener("load", sendUserContext);
    _frame.setAttribute("src", TOOLKIT_SRC);
  }
  if (!_listening) {
    _listening = true;
    window.addEventListener("message", onToolkitMessage);
  }
}

/** Tell the toolkit who the current user is (so it can show/hide the
 *  supervisor-only "Add" controls and stamp saved deals). */
function sendUserContext() {
  postToFrame({
    type: "flow-user",
    email: getCurrentEmail() || "",
    role: getCurrentRole() || "",
    canManage: isSupervisor()
  });
}

function postToFrame(msg) {
  if (_frame && _frame.contentWindow) {
    _frame.contentWindow.postMessage({ ...msg, channel: "flow-toolkit-host" }, "*");
  }
}

async function onToolkitMessage(e) {
  const m = e.data;
  if (!m || m.channel !== "flow-toolkit") return;
  if (!_frame || e.source !== _frame.contentWindow) return;

  if (m.action === "ready") { sendUserContext(); return; }

  const { reqId, action, payload } = m;
  try {
    let data = null;

    if (action === "list") {
      const col = COLLECTIONS[payload && payload.kind];
      if (!col) throw new Error("Unknown data type");
      data = await getDocuments(col);

    } else if (action === "add") {
      const kind = payload && payload.kind;
      const col = COLLECTIONS[kind];
      if (!col) throw new Error("Unknown data type");
      // Templates & objections are shared reference data — supervisors only.
      // Deals can be saved by any signed-in user.
      if ((kind === "templates" || kind === "objections") && !isSupervisor()) {
        throw new Error("Only supervisors can add this.");
      }
      const id = await addDocument(col, payload.data || {});
      data = { id };

    } else if (action === "delete") {
      const kind = payload && payload.kind;
      const col = COLLECTIONS[kind];
      if (!col) throw new Error("Unknown data type");
      if (!isSupervisor()) throw new Error("Only supervisors can delete this.");
      await deleteDocument(col, payload.id);
      data = { id: payload.id };

    } else if (action === "salesPics") {
      // Sales PIC dropdown source — the Sales-team roster from /users.
      const staff = await getStaffForTeam("sales");
      data = [...new Set((staff || []).map(s => (s.name || s.email || "").trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    } else if (action === "exportDeals") {
      exportDealsExcel(payload.headers || [], payload.rows || []);
      data = { ok: true };

    } else {
      throw new Error("Unknown action");
    }

    postToFrame({ type: "reply", reqId, ok: true, data });
  } catch (err) {
    console.error("[Sales Toolkit] " + action + " failed:", err);
    postToFrame({ type: "reply", reqId, ok: false, error: err.message || String(err) });
  }
}

/** Build and download an .xlsx of saved deals using SheetJS, which is
 *  already loaded globally by index.html. */
function exportDealsExcel(headers, rows) {
  const XLSX = window.XLSX;
  if (!XLSX) { alert("Excel library not available."); return; }
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Saved Deals");
  XLSX.writeFile(wb, "sales-deals.xlsx");
}
