// ============================================================
// FLOW Mega Apps — Preview Store (v3.9.2)
//
// A lightweight in-memory + localStorage Firestore mock. Activates
// automatically when no real Firebase config is present (preview /
// offline mode). Lets the entire app run end-to-end locally — create
// issues, log tickets, edit master data, etc. — with data persisting
// across page reloads in localStorage.
//
// What it implements (Firestore-shaped API surface):
//   collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
//   deleteDoc, onSnapshot, query, where, orderBy, limit,
//   serverTimestamp, Timestamp
//
// What it does NOT implement (and isn't needed by this app):
//   transactions, batched writes, sub-collections, listCollections,
//   complex multi-clause where with array-contains-any across docs,
//   strict server-side ordering with Firestore's index quirks
//
// Storage shape in localStorage (key: flow_preview_store_v1):
//   { "<collectionName>": { "<docId>": { ...fields }, ... }, ... }
// ============================================================

const STORAGE_KEY = "flow_preview_store_v1";

// --- State ---------------------------------------------------------
const _data = new Map();              // collectionName -> Map<id, data>
const _subscribers = new Map();       // collectionName -> Set<{cb, queryFn, lastSnap}>

// --- Persistence ---------------------------------------------------
function _persist() {
  try {
    const obj = {};
    for (const [col, docs] of _data) {
      obj[col] = {};
      for (const [id, data] of docs) obj[col][id] = data;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn("[PreviewStore] Could not persist to localStorage:", e.message);
  }
}

function _hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const col of Object.keys(obj)) {
      const m = new Map();
      for (const id of Object.keys(obj[col])) m.set(id, obj[col][id]);
      _data.set(col, m);
    }
  } catch (e) {
    console.warn("[PreviewStore] Could not hydrate from localStorage:", e.message);
  }
}

_hydrate();

// --- Helpers -------------------------------------------------------
function _col(name) {
  if (!_data.has(name)) _data.set(name, new Map());
  return _data.get(name);
}

function _genId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function _notify(colName) {
  const subs = _subscribers.get(colName);
  if (!subs) return;
  for (const sub of subs) {
    try {
      const snap = _buildSnap(colName, sub.queryFn);
      sub.cb(snap);
    } catch (e) { console.warn("[PreviewStore] subscriber error:", e); }
  }
}

function _allDocs(colName) {
  const m = _data.get(colName);
  if (!m) return [];
  const arr = [];
  for (const [id, data] of m) arr.push({ id, data });
  return arr;
}

// Apply a query (chain of constraints) to an array of {id, data}
function _applyConstraints(docs, constraints) {
  let out = docs;
  for (const c of constraints) {
    if (c.type === "where") {
      out = out.filter(d => _whereMatch(d.data[c.field], c.op, c.value));
    }
  }
  // orderBy + limit are applied in order at the end
  const orders = constraints.filter(c => c.type === "orderBy");
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i];
    out = [...out].sort((a, b) => {
      const av = a.data[o.field], bv = b.data[o.field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return o.dir === "desc" ? 1 : -1;
      if (av > bv) return o.dir === "desc" ? -1 : 1;
      return 0;
    });
  }
  const lim = constraints.find(c => c.type === "limit");
  if (lim) out = out.slice(0, lim.value);
  return out;
}

function _whereMatch(fieldVal, op, queryVal) {
  switch (op) {
    case "==":  return fieldVal === queryVal;
    case "!=":  return fieldVal !== queryVal;
    case "<":   return fieldVal < queryVal;
    case "<=":  return fieldVal <= queryVal;
    case ">":   return fieldVal > queryVal;
    case ">=":  return fieldVal >= queryVal;
    case "in":  return Array.isArray(queryVal) && queryVal.includes(fieldVal);
    case "not-in": return Array.isArray(queryVal) && !queryVal.includes(fieldVal);
    case "array-contains":
      return Array.isArray(fieldVal) && fieldVal.includes(queryVal);
    case "array-contains-any":
      return Array.isArray(fieldVal) && Array.isArray(queryVal)
             && fieldVal.some(v => queryVal.includes(v));
    default: return false;
  }
}

function _buildSnap(colName, queryFn) {
  let docs = _allDocs(colName);
  if (queryFn) docs = queryFn(docs);
  return {
    docs: docs.map(d => ({
      id: d.id,
      data: () => ({ ...d.data }),
      exists: () => true
    })),
    forEach: function (fn) { this.docs.forEach(fn); },
    empty: docs.length === 0,
    size: docs.length
  };
}

// --- Firestore-shaped API exports ---------------------------------

/** Reference handle for a collection. */
export function collection(_db, name) {
  return { _kind: "collection", name, _constraints: [] };
}

/** Reference handle for a doc. Two call signatures:
 *  doc(db, colName, id) or doc(colRef, id) */
export function doc(...args) {
  let colName, id;
  if (args.length === 3) { colName = args[1]; id = args[2]; }
  else if (args.length === 2 && args[0] && args[0]._kind === "collection") {
    colName = args[0].name; id = args[1];
  } else {
    throw new Error("doc() expects (db, colName, id) or (colRef, id)");
  }
  return { _kind: "doc", col: colName, id };
}

/** query(colRef, ...constraints) → bundles constraints into a queryable ref. */
export function query(colRef, ...constraints) {
  return { _kind: "query", name: colRef.name, _constraints: constraints };
}

export function where(field, op, value)    { return { type: "where",   field, op, value }; }
export function orderBy(field, dir = "asc"){ return { type: "orderBy", field, dir }; }
export function limit(value)               { return { type: "limit",   value }; }

export function serverTimestamp() {
  // Real Firestore returns a sentinel; the modules use the value as a
  // sortable date so a plain ISO string works fine for preview.
  return new Date().toISOString();
}

/** Minimal Timestamp shim — real Firestore's Timestamp has toDate(). */
export const Timestamp = {
  now: () => new Date(),
  fromDate: (d) => d,
  fromMillis: (ms) => new Date(ms)
};

export async function getDocs(refOrQuery) {
  const colName = refOrQuery.name;
  const constraints = refOrQuery._constraints || [];
  return _buildSnap(colName, docs => _applyConstraints(docs, constraints));
}

export async function getDoc(docRef) {
  const m = _data.get(docRef.col);
  const data = m && m.get(docRef.id);
  return {
    id: docRef.id,
    exists: () => !!data,
    data: () => data ? { ...data } : undefined
  };
}

export async function addDoc(colRef, data) {
  const id = _genId();
  const col = _col(colRef.name);
  col.set(id, { ...data });
  _persist();
  _notify(colRef.name);
  return { id, _kind: "doc", col: colRef.name };
}

export async function setDoc(docRef, data, opts = {}) {
  const col = _col(docRef.col);
  if (opts.merge && col.has(docRef.id)) {
    col.set(docRef.id, { ...col.get(docRef.id), ...data });
  } else {
    col.set(docRef.id, { ...data });
  }
  _persist();
  _notify(docRef.col);
}

export async function updateDoc(docRef, data) {
  const col = _col(docRef.col);
  if (!col.has(docRef.id)) {
    // Real Firestore throws here; we mirror that behavior.
    throw new Error(`No document to update: ${docRef.col}/${docRef.id}`);
  }
  col.set(docRef.id, { ...col.get(docRef.id), ...data });
  _persist();
  _notify(docRef.col);
}

export async function deleteDoc(docRef) {
  const col = _col(docRef.col);
  col.delete(docRef.id);
  _persist();
  _notify(docRef.col);
}

export function onSnapshot(refOrQuery, cb) {
  const colName = refOrQuery.name;
  const constraints = refOrQuery._constraints || [];
  const queryFn = (docs) => _applyConstraints(docs, constraints);
  if (!_subscribers.has(colName)) _subscribers.set(colName, new Set());
  const sub = { cb, queryFn };
  _subscribers.get(colName).add(sub);
  // Fire immediately, like real Firestore
  try { cb(_buildSnap(colName, queryFn)); } catch (e) { console.warn(e); }
  // Unsubscribe fn
  return () => _subscribers.get(colName).delete(sub);
}

/** Utility (not part of Firestore API): reset the entire preview store.
 *  Wired to a debug button so users can wipe and start fresh. */
export function _resetPreviewStore() {
  _data.clear();
  _subscribers.clear();
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

/** Utility: seed the store with some demo data so a fresh visitor
 *  sees a populated app on first load. Idempotent — only seeds if the
 *  collection is empty. */
export function seedDemoData(currentEmail) {
  const TODAY = new Date().toISOString().split("T")[0];
  const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  const THREE_DAYS_AGO = new Date(Date.now() - 3 * 86_400_000).toISOString().split("T")[0];
  const me = currentEmail || "demo@flowgistik.id";

  // Daily issues — rich seed set for testing MBR export, data health,
  // charts, and SLA reporting. Includes some deliberately dirty data
  // so the data health card has warnings to display.
  if (_col("daily_issues").size === 0) {
    const _d = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().split("T")[0];
    const seeds = [
      // --- PERO (5 issues, mixed status) ---
      { updateBy: "Yoga",  client: "PERO",     complainDate: TODAY,    orderCode: "FLOW_P001",              issueSite: "Outbound",    categoriComplain: "Customer received wrong SKU",  detailsComplain: "Customer reported receiving wrong product code",  rootCause: "Picking error",            shortTermSolution: "Replace product",              longTermSolution: "Add second QC step",                status: "Open",  notes: "Awaiting client confirmation" },
      { updateBy: "Yoga",  client: "PERO",     complainDate: _d(5),   orderCode: "FLOW_P002, FLOW_P003",   issueSite: "Outbound",    categoriComplain: "Short shipment",               detailsComplain: "2 of 10 items missing in box",                   rootCause: "Picking error",            shortTermSolution: "Send remaining items",         longTermSolution: "Cross-check pick list vs pack list", status: "Open",  notes: "" },
      { updateBy: "Asih",  client: "PERO",     complainDate: _d(12),  solvingDate: _d(10), orderCode: "FLOW_P004", issueSite: "Lastmile", categoriComplain: "Late dispatch (SLA breach)", detailsComplain: "Delivered 3 days late",                     rootCause: "Courier capacity issue",   shortTermSolution: "Express courier reship",       longTermSolution: "Diversify last-mile partners",       status: "Close", notes: "Client accepted" },
      { updateBy: "Farah", client: "PERO",     complainDate: _d(20),  solvingDate: _d(18), orderCode: "FLOW_P005", issueSite: "Inbound",  categoriComplain: "Damaged carton on arrival",  detailsComplain: "5 cartons crushed on inbound",                rootCause: "Courier handling",         shortTermSolution: "Photo + claim",                longTermSolution: "Add padding requirements to SOP",    status: "Close", notes: "" },
      { updateBy: "Yoga",  client: "PERO",     complainDate: _d(25),  solvingDate: _d(25), orderCode: "FLOW_P006", issueSite: "Technology", categoriComplain: "System downtime",          detailsComplain: "WMS unavailable for 2 hours",                 rootCause: "Server OOM",               shortTermSolution: "Restart service",              longTermSolution: "Add memory alerts",                  status: "Close", notes: "Post-mortem done" },

      // --- Kintakun (4 issues) ---
      { updateBy: "Farah", client: "Kintakun", complainDate: YESTERDAY, orderCode: "FLOW_K001",            issueSite: "Inbound",     categoriComplain: "Damaged carton on arrival",    detailsComplain: "3 of 12 cartons crushed",                     rootCause: "Courier handling",         shortTermSolution: "Photo + claim filed",          longTermSolution: "Switch courier on this lane",         status: "Open",  notes: "" },
      { updateBy: "Farah", client: "Kintakun", complainDate: _d(8),   solvingDate: _d(7), orderCode: "FLOW_K002", issueSite: "Outbound", categoriComplain: "Customer received wrong SKU", detailsComplain: "Color mismatch",                             rootCause: "Labeling error",           shortTermSolution: "Send correct item",            longTermSolution: "Barcode scan verification",          status: "Close", notes: "" },
      { updateBy: "Asih",  client: "Kintakun", complainDate: _d(15),  solvingDate: _d(12), orderCode: "FLOW_K003, FLOW_K004, FLOW_K005", issueSite: "Inventory", categoriComplain: "Stock discrepancy", detailsComplain: "Physical count differs from WMS by 45 units", rootCause: "Unrecorded damage write-off", shortTermSolution: "Adjust WMS stock",       longTermSolution: "Monthly cycle count SOP",            status: "Close", notes: "Adjustment logged" },
      { updateBy: "Fauzi", client: "Kintakun", complainDate: _d(22),  solvingDate: _d(20), orderCode: "FLOW_K006", issueSite: "Commercial", categoriComplain: "Pricing discrepancy",    detailsComplain: "Invoice amount doesn't match PO",             rootCause: "Rate card not updated",    shortTermSolution: "Issue credit note",            longTermSolution: "Auto-sync rate card with billing",   status: "Close", notes: "" },

      // --- SummerID (3 issues) ---
      { updateBy: "Asih",  client: "SummerID", complainDate: THREE_DAYS_AGO, solvingDate: YESTERDAY, orderCode: "FLOW_S001", issueSite: "Marketplace", categoriComplain: "Late dispatch (SLA breach)", detailsComplain: "Order shipped 2 days after SLA",       rootCause: "Stock-out at pick face",   shortTermSolution: "Express courier",              longTermSolution: "Lower reorder point for this SKU",   status: "Close", notes: "Resolved with client" },
      { updateBy: "Yoga",  client: "SummerID", complainDate: _d(10),  orderCode: "FLOW_S002",             issueSite: "Buyer",       categoriComplain: "Wrong address from buyer",     detailsComplain: "Buyer entered incomplete address on Shopee",   rootCause: "Marketplace data issue",   shortTermSolution: "Contact buyer for correct addr", longTermSolution: "Address validation script",         status: "Open",  notes: "Waiting buyer response" },
      { updateBy: "Fauzi", client: "SummerID", complainDate: _d(18),  solvingDate: _d(14), orderCode: "FLOW_S003", issueSite: "Outbound", categoriComplain: "Short shipment",              detailsComplain: "1 of 5 items missing",                        rootCause: "Picking error",            shortTermSolution: "Reship missing item",          longTermSolution: "Double-scan at pack station",        status: "Close", notes: "" },

      // --- PT Gaon (2 issues) ---
      { updateBy: "Farah", client: "PT Gaon",  complainDate: _d(3),   orderCode: "FLOW_G001, FLOW_G002", issueSite: "Client",      categoriComplain: "Client data incomplete",       detailsComplain: "Master item dimensions missing for 30 SKUs",  rootCause: "Onboarding gap",           shortTermSolution: "Request data from client",     longTermSolution: "Onboarding checklist enforcement",   status: "Open",  notes: "Farah following up" },
      { updateBy: "Asih",  client: "PT Gaon",  complainDate: _d(14),  solvingDate: _d(11), orderCode: "FLOW_G003", issueSite: "Inbound", categoriComplain: "Damaged carton on arrival",   detailsComplain: "Water damage on 2 pallets",                   rootCause: "Leaking truck",            shortTermSolution: "Claim + re-wrap",              longTermSolution: "Inspect truck before loading",       status: "Close", notes: "" },

      // --- DIRTY DATA (for data health card testing) ---
      // Missing root cause
      { updateBy: "Yoga",  client: "PERO",     complainDate: _d(7),   orderCode: "FLOW_D001",             issueSite: "Outbound",    categoriComplain: "Customer received wrong SKU",  detailsComplain: "Wrong item delivered",                        rootCause: "",                         shortTermSolution: "",                             longTermSolution: "",                                   status: "Open",  notes: "Need to investigate" },
      // Closed but no solvingDate
      { updateBy: "Fauzi", client: "Kintakun", complainDate: _d(30),  orderCode: "FLOW_D002",             issueSite: "Marketplace", categoriComplain: "Late dispatch (SLA breach)",   detailsComplain: "2 day delay",                                 rootCause: "Backlog in warehouse",     shortTermSolution: "Priority processing",          longTermSolution: "Capacity planning",                  status: "Close", notes: "Forgot to set solving date" },
      // Missing both details and root cause
      { updateBy: "Asih",  client: "SummerID", complainDate: _d(9),   orderCode: "",                      issueSite: "Outbound",    categoriComplain: "Short shipment",               detailsComplain: "",                                            rootCause: "",                         shortTermSolution: "",                             longTermSolution: "",                                   status: "Open",  notes: "" },
    ];
    for (const s of seeds) {
      const cd = new Date(s.complainDate);
      const sd = s.solvingDate ? new Date(s.solvingDate) : null;
      const resDays = (s.solvingDate && s.complainDate)
        ? Math.max(0, Math.round((sd - cd) / 86_400_000))
        : null;
      _col("daily_issues").set(_genId(), {
        ...s,
        orderCodes: (s.orderCode || "").split(/[,;]+/).map(c => c.trim()).filter(Boolean),
        orderCount: (s.orderCode || "").split(/[,;]+/).map(c => c.trim()).filter(Boolean).length,
        years: cd.getFullYear(),
        week: _isoWeek(cd),
        resolutionDays: resDays,
        createdAt: new Date().toISOString(),
        createdBy: me,
        updatedAt: new Date().toISOString(),
        updatedBy: me
      });
    }
  }

  // Tickets — one in each status so the dashboard renders nicely
  if (_col("tickets").size === 0) {
    const seeds = [
      { title: "Master item missing for new client",  department: "Sales Support", priority: "high",   status: "open",        description: "PT Gaon master items need to be uploaded",         createdAt: new Date().toISOString(), createdBy: me },
      { title: "Slack integration request",            department: "Technology",    priority: "medium", status: "in-progress", description: "Want Slack alerts for SLA breaches",               createdAt: new Date().toISOString(), createdBy: me },
      { title: "Q3 commission calculation",            department: "Finance",       priority: "low",    status: "resolved",    description: "Question on the commission tier table",            createdAt: new Date().toISOString(), createdBy: me }
    ];
    for (const s of seeds) _col("tickets").set(_genId(), s);
  }

  // A few sales tasks
  if (_col("daily_tasks_sales").size === 0) {
    const seeds = [
      { person: "Dimas",  date: TODAY,     task: "Follow up PT Gaon quotation",  status: "in-progress", notes: "", createdAt: new Date().toISOString(), createdBy: me },
      { person: "Gratia", date: TODAY,     task: "Demo call with prospect ABC",  status: "done",         notes: "Went well, scheduling pilot", createdAt: new Date().toISOString(), createdBy: me },
      { person: "Dimas",  date: YESTERDAY, task: "Send proposal to client XYZ",  status: "done",         notes: "", createdAt: new Date().toISOString(), createdBy: me }
    ];
    for (const s of seeds) _col("daily_tasks_sales").set(_genId(), s);
  }

  // A few SS tasks
  if (_col("daily_tasks_ss").size === 0) {
    const seeds = [
      { person: "Yoga",   date: TODAY,     type: "Daily",      task: "Resolve PERO wrong-SKU complaint",   status: "in-progress", notes: "", createdAt: new Date().toISOString(), createdBy: me },
      { person: "Farah",  date: TODAY,     type: "Projection", task: "Onboarding checklist for new client", status: "in-progress", notes: "", createdAt: new Date().toISOString(), createdBy: me },
      { person: "Asih",   date: YESTERDAY, type: "Improvement", task: "Update return WI v3",                status: "done",         notes: "", createdAt: new Date().toISOString(), createdBy: me }
    ];
    for (const s of seeds) _col("daily_tasks_ss").set(_genId(), s);
  }

  // A few Operations tasks
  if (_col("daily_tasks_ops").size === 0) {
    const seeds = [
      { person: "Andi",  date: TODAY,     task: "Morning warehouse briefing",       status: "done",         notes: "Attendance 95%", createdAt: new Date().toISOString(), createdBy: me },
      { person: "Andi",  date: TODAY,     task: "Check inbound dock schedule",      status: "in-progress",  notes: "",               createdAt: new Date().toISOString(), createdBy: me },
      { person: "Rina",  date: TODAY,     task: "Inventory cycle count Zone A",     status: "open",         notes: "",               createdAt: new Date().toISOString(), createdBy: me },
      { person: "Rina",  date: YESTERDAY, task: "Review outbound SLA exceptions",  status: "done",         notes: "3 late shipments flagged", createdAt: new Date().toISOString(), createdBy: me }
    ];
    for (const s of seeds) _col("daily_tasks_ops").set(_genId(), s);
  }

  // A few General Affairs tasks
  if (_col("daily_tasks_ga").size === 0) {
    const seeds = [
      { person: "Budi",  date: TODAY,     task: "Process office supply request from Sales", status: "in-progress", notes: "Toner + A4 paper",      createdAt: new Date().toISOString(), createdBy: me },
      { person: "Sari",  date: TODAY,     task: "Coordinate AC maintenance visit",          status: "open",        notes: "Vendor arrives 2pm",    createdAt: new Date().toISOString(), createdBy: me },
      { person: "Budi",  date: YESTERDAY, task: "Vehicle permit renewal",                   status: "done",        notes: "Completed at Samsat",   createdAt: new Date().toISOString(), createdBy: me },
      { person: "Sari",  date: YESTERDAY, task: "Update asset inventory spreadsheet",       status: "done",        notes: "",                      createdAt: new Date().toISOString(), createdBy: me }
    ];
    for (const s of seeds) _col("daily_tasks_ga").set(_genId(), s);
  }

  // Master data — minimal so dropdowns aren't empty
  if (_col("clients").size === 0) {
    ["PERO", "Kintakun", "SummerID", "Gaon Indonesia"].forEach(name => {
      _col("clients").set(_genId(), { name, status: "active", createdAt: new Date().toISOString(), createdBy: me });
    });
  }
  if (_col("departments").size === 0) {
    ["Sales", "Sales Support", "Operations", "Technology", "Finance"].forEach(name => {
      _col("departments").set(_genId(), { name, status: "active", createdAt: new Date().toISOString(), createdBy: me });
    });
  }
  if (_col("issue_categories").size === 0) {
    [
      "Customer received wrong SKU",
      "Damaged carton on arrival",
      "Late dispatch (SLA breach)",
      "Missing item",
      "Stock discrepancy",
      "Return processing delay"
    ].forEach(name => {
      _col("issue_categories").set(_genId(), { name, status: "active", createdAt: new Date().toISOString(), createdBy: me });
    });
  }

  // 1-on-1 questions — admin (read-only on writes) can't trigger the
  // master-data auto-seed, so we seed here directly. Mirrors the defaults
  // in js/modules/master-data.js (SEED_PERSONAL_QUESTIONS + SEED_WORK_QUESTIONS_BY_DEPT).
  if (_col("one_on_one_questions").size === 0) {
    const PERSONAL = [
      "Bagaimana kondisi kamu secara keseluruhan belakangan ini?",
      "Bagaimana keseimbangan antara pekerjaan dan kehidupan pribadi kamu saat ini?",
      "Apa yang paling membuatmu semangat datang kerja belakangan ini?",
      "Adakah hal di luar pekerjaan yang sedang memengaruhi fokus atau energimu?",
      "Hal baru apa yang sedang kamu pelajari atau minati?",
      "Bagaimana hubungan kamu dengan rekan-rekan tim saat ini?",
      "Apakah ada yang bisa saya lakukan lebih baik untuk mendukung kamu?"
    ];
    const WORK_BY_DEPT = {
      "Sales": [
        "Bagaimana kondisi pipeline sales kamu saat ini? Ada deals prioritas?",
        "Seberapa jauh pencapaianmu terhadap target bulan ini? Apa rencana untuk gap yang ada?",
        "Apa tantangan terbesar dalam closing deals belakangan ini?",
        "Adakah klien atau prospek yang berisiko lost? Apa strateginya?",
        "Bagaimana kamu mengelola follow-up dengan leads dari marketing?",
        "Adakah support atau resource tambahan yang kamu butuhkan?",
        "Apa strategi utamamu untuk quarter berikutnya?",
        "Skill apa yang ingin kamu kembangkan untuk naik level dalam sales?",
        "Adakah feedback dari klien mengenai produk/layanan yang perlu disampaikan?"
      ],
      "Sales Support": [
        "Bagaimana workload kamu saat ini? Apakah ada yang terasa terlalu berat?",
        "Adakah proses atau prosedur yang perlu diperbaiki untuk efisiensi lebih baik?",
        "Bagaimana koordinasimu dengan tim Sales? Adakah friction yang perlu diselesaikan?",
        "Apa hambatan paling sering dalam mendukung aktivitas Sales sehari-hari?",
        "Apakah tools atau sistem yang digunakan sudah cukup mendukung pekerjaanmu?",
        "Bagaimana kamu memprioritaskan pekerjaan ketika ada banyak permintaan bersamaan?",
        "Apakah ada feedback dari tim Sales tentang support yang kamu berikan?",
        "Bagaimana kamu memastikan akurasi data dan dokumen yang kamu proses?",
        "Skill atau pengetahuan apa yang ingin kamu tingkatkan dalam peranmu saat ini?"
      ],
      "Marketing": [
        "Bagaimana performa campaign digital bulan ini dibanding target? Channel mana terbaik?",
        "Adakah insight dari analytics yang perlu kita tindaklanjuti?",
        "Bagaimana kualitas leads yang dihasilkan menurut feedback Sales?",
        "Konten atau format apa yang perform baik? Ada eksperimen baru yang ingin dicoba?",
        "Tren digital marketing terbaru apa yang relevan dan ingin kamu terapkan?",
        "Apa tantangan terbesar dalam eksekusi campaign saat ini?",
        "Apakah budget dan resource sudah cukup untuk mencapai target?",
        "Bagaimana kamu memastikan konsistensi brand di semua channel digital?",
        "Sertifikasi, tool, atau skill digital apa yang ingin kamu kuasai berikutnya?"
      ]
    };
    PERSONAL.forEach((text, order) => {
      _col("one_on_one_questions").set(_genId(), {
        text, type: "personal", department: "", order,
        archived: false, _seeded: true,
        createdAt: new Date().toISOString(), createdBy: me
      });
    });
    Object.entries(WORK_BY_DEPT).forEach(([dept, questions]) => {
      questions.forEach((text, order) => {
        _col("one_on_one_questions").set(_genId(), {
          text, type: "work", department: dept, order,
          archived: false, _seeded: true,
          createdAt: new Date().toISOString(), createdBy: me
        });
      });
    });
  }

  // Demo users — so User Management has real data to work with in
  // preview mode. Mirrors the demo accounts wired in app.js so a
  // supervisor can immediately see their team, edit roles, etc.
  if (_col("users").size === 0) {
    const demoUsers = [
      { email: "admin@demo",            name: "Demo Admin",            role: "admin",      department: "Operations" },
      { email: "supervisor.sales@demo", name: "Demo Sales Supervisor", role: "supervisor", department: "Sales" },
      { email: "supervisor.ss@demo",    name: "Demo SS Supervisor",    role: "supervisor", department: "Sales Support" },
      { email: "user.sales@demo",       name: "Demo Sales User",       role: "user",       department: "Sales" },
      { email: "user.ss@demo",          name: "Demo SS User",          role: "user",       department: "Sales Support" },
      // Realistic Flow staff so dropdowns feel real
      { email: "bryan@flowgistik.id",   name: "Bryan",   role: "admin",      department: "Operations" },
      { email: "prayoga@flowgistik.id", name: "Prayoga", role: "admin",      department: "Sales Support" },
      { email: "dimas@flowgistik.id",   name: "Dimas",   role: "supervisor", department: "Sales" },
      { email: "gratia@flowgistik.id",  name: "Gratia",  role: "supervisor", department: "Sales" },
      { email: "yoga@flowgistik.id",    name: "Yoga",    role: "supervisor", department: "Sales Support" },
      { email: "farah@flowgistik.id",   name: "Farah",   role: "supervisor", department: "Sales Support" },
      { email: "asih@flowgistik.id",    name: "Asih",    role: "supervisor", department: "Sales Support" },
      { email: "fauzi@flowgistik.id",   name: "Fauzi",   role: "supervisor", department: "Sales Support" },
      { email: "andi@flowgistik.id",    name: "Andi",    role: "supervisor", department: "Operations" },
      { email: "rina@flowgistik.id",    name: "Rina",    role: "supervisor", department: "Operations" },
      { email: "budi@flowgistik.id",    name: "Budi",    role: "supervisor", department: "General Affairs" },
      { email: "sari@flowgistik.id",    name: "Sari",    role: "supervisor", department: "General Affairs" },
      { email: "supervisor.ops@demo",   name: "Demo Ops Supervisor",  role: "supervisor", department: "Operations" },
      { email: "supervisor.ga@demo",    name: "Demo GA Supervisor",   role: "supervisor", department: "General Affairs" },
      { email: "user.ops@demo",         name: "Demo Ops User",        role: "user",       department: "Operations" },
      { email: "user.ga@demo",          name: "Demo GA User",         role: "user",       department: "General Affairs" }
    ];
    for (const u of demoUsers) {
      _col("users").set(u.email, { ...u, createdAt: new Date().toISOString(), createdBy: "system" });
    }
  }

  _persist();
}

function _isoWeek(d) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

// Marker so other modules can detect they're talking to the mock
export const IS_PREVIEW_STORE = true;
