// ============================================================
// FLOW Mega Apps — Shared Utilities
// ============================================================

/** Shortcut for document.getElementById */
export const $ = (id) => document.getElementById(id);

/** Escape HTML so user-supplied content can't break the DOM */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}

/** Format number to Indonesian locale (1.234.567) */
export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("id-ID");
}

/** Short format with K/M/B */
export function fmtShort(n) {
  if (!n || isNaN(n)) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

/** Format as IDR currency */
export function fmtIDR(n) {
  return "IDR " + fmt(n);
}

/** Today in YYYY-MM-DD */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Friendly date e.g. "12 May 2026" */
export function friendlyDate(s) {
  if (!s) return "—";
  try {
    const d = (s instanceof Date) ? s : new Date(s);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return String(s); }
}

/** Day name in Indonesian */
const ID_DAYS = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
export function dayName(s) {
  if (!s) return "";
  try {
    const d = (s instanceof Date) ? s : new Date(s);
    return ID_DAYS[d.getDay()] || "";
  } catch { return ""; }
}

/** Get ISO week number */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/** Convert Firestore Timestamp / Date / string to YYYY-MM-DD */
export function toDateStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val.slice(0, 10);
  if (val.toDate) return val.toDate().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return "";
}

/** Get start/end Date objects for a named range */
export function dateRange(rangeKey, customFrom, customTo) {
  const now = new Date();
  const start = new Date(now);
  let end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (rangeKey) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      const dayOfWeek = (start.getDay() + 6) % 7; // Mon=0
      start.setDate(start.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "quarter":
      const q = Math.floor(start.getMonth() / 3);
      start.setMonth(q * 3, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "custom":
      return {
        start: customFrom ? new Date(customFrom + "T00:00:00") : null,
        end: customTo ? new Date(customTo + "T23:59:59") : null
      };
    case "all":
      return { start: null, end: null };
  }
  return { start, end };
}

/** Show toast notification */
export function toast(msg, type = "") {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast hidden"; }, 2800);
}

/** Generate human-readable ticket # */
export function generateTicketNumber(type, n = 0) {
  const prefix = type === "external" ? "EXT" : "INT";
  const y = new Date().getFullYear().toString().slice(-2);
  return `${prefix}-${y}-${String(n + 1).padStart(4, "0")}`;
}

/** Build a CSS class for status/priority badge */
export function badgeClass(value) {
  const v = String(value || "").toLowerCase().replace(/\s+/g, "-");
  return `badge badge-${v}`;
}

/** Confirm with custom message */
export function confirmAction(msg) {
  return window.confirm(msg);
}

/** Download an XLSX from a 2D array */
export function downloadXLSX(rows, filename, sheetName = "Sheet1") {
  // Uses global XLSX from CDN (already in index.html)
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/**
 * Aging / SLA severity for an open record.
 * @param {string|Date} dateStr  the record's start date (e.g. complain/created date)
 * @param {{ok?:number, warn?:number}} thresholds  day cut-offs
 * @returns {{days:number, level:string, label:string}}
 *   level ∈ "" | "fresh" | "ok" | "warn" | "stale"
 */
export function slaAge(dateStr, { ok = 3, warn = 7 } = {}) {
  const ds = toDateStr(dateStr);
  if (!ds) return { days: 0, level: "", label: "" };
  const start = new Date(ds + "T00:00:00");
  if (isNaN(start.getTime())) return { days: 0, level: "", label: "" };
  const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
  let level = "fresh";
  if (days > warn) level = "stale";
  else if (days > ok) level = "warn";
  else if (days >= 1) level = "ok";
  const label = days === 0 ? "today" : days === 1 ? "1d" : `${days}d`;
  return { days, level, label };
}

/** Hours between two date-likes */
export function hoursBetween(a, b) {
  if (!a || !b) return 0;
  const da = (a.toDate ? a.toDate() : new Date(a));
  const db = (b.toDate ? b.toDate() : new Date(b));
  return Math.round((db - da) / 36e5);
}
