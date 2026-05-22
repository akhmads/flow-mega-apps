// ============================================================
// FLOW Mega Apps — App-shell internationalization (ID / EN)
//
// SCOPE (phase 1): the app shell only — navigation, page titles,
// login screen, and common buttons. Individual modules still
// render Indonesian text; they can be migrated to t() later.
//
// HOW IT WORKS:
//   • Translatable elements carry data-i18n="key" (textContent)
//     or data-i18n-ph="key" (placeholder).
//   • applyI18n() walks the DOM and fills them in.
//   • The chosen language is saved to localStorage("flow.lang"),
//     the SAME key the Sales Toolkit iframe reads — so the two
//     stay in sync via the cross-document `storage` event.
// ============================================================

const STR = {
  id: {
    // nav groups
    "group.sales":"Sales", "group.ss":"Sales Support", "group.ops":"Operasional",
    "group.ga":"General Affairs", "group.department":"Departemen",
    "group.tools":"Alat", "group.management":"Manajemen",
    // nav buttons
    "nav.dashboard":"Dasbor", "nav.dailyTracker":"Pelacak Harian",
    "nav.revenueCalc":"Kalkulator Pendapatan", "nav.salesToolkit":"Sales Toolkit",
    "nav.dailyIssue":"Pelacak Isu Harian", "nav.inboundMonitoring":"Monitoring Inbound",
    "nav.mpForecasting":"Forecasting MP", "nav.ticketing":"Tiket Internal",
    "nav.projectManagement":"Manajemen Proyeksi", "nav.mergerSystem":"Sistem Merge",
    "nav.orderProcessing":"Transaksi", "nav.dailyReconcile":"Rekonsiliasi Harian",
    "nav.weeklyReportGen":"Generator Laporan Mingguan",
    "nav.forecastOrdersGen":"Generator Forecast Order",
    "nav.oneOnOne":"Ringkasan 1-on-1", "nav.masterData":"Master Data",
    "nav.auditLog":"Log Aktivitas", "nav.users":"Manajemen Pengguna",
    // login
    "login.email":"Email", "login.password":"Kata Sandi",
    "login.remember":"Ingat saya", "login.signin":"Masuk",
    "login.help":"Belum punya akun? Minta supervisor membuatkannya untuk Anda. Lupa kata sandi? Supervisor dapat meresetnya dari Manajemen Pengguna.",
    "login.demoTitle":"MODE DEMO — klik akun mana saja untuk mengisi otomatis:",
    // common
    "common.signout":"Keluar",
    "search.placeholder":"Cari isu, tiket, tugas…  (Ctrl+K)",
    // page titles + subtitles
    "page.dashboard.title":"Dasbor", "page.dashboard.sub":"Ringkasan operasional hari ini",
    "page.dailyIssue.title":"Pelacak Isu Harian", "page.dailyIssue.sub":"Sales Support · Log analisis akar masalah",
    "page.dailyTrackerSales.title":"Pelacak Harian — Sales", "page.dailyTrackerSales.sub":"Tugas harian tim Sales",
    "page.dailyTrackerSS.title":"Pelacak Harian — Sales Support", "page.dailyTrackerSS.sub":"Tugas Harian / Proyeksi / Improvement",
    "page.inboundMonitoring.title":"Monitoring Inbound", "page.inboundMonitoring.sub":"Kedatangan kendaraan, bongkar muat, proses GRN",
    "page.mpForecasting.title":"Forecasting MP", "page.mpForecasting.sub":"Perencanaan forecast manpower dan manajemen roster",
    "page.dailyTrackerGA.title":"Pelacak Harian — General Affairs", "page.dailyTrackerGA.sub":"Tugas dan permintaan harian tim GA",
    "page.ticketing.title":"Tiket Internal", "page.ticketing.sub":"Sistem tiket lintas departemen",
    "page.revenueCalc.title":"Kalkulator Pendapatan", "page.revenueCalc.sub":"Hitung pendapatan bulanan per klien",
    "page.salesToolkit.title":"Sales Toolkit", "page.salesToolkit.sub":"Deal scoring, template follow-up & objection playbook",
    "page.projectManagement.title":"Manajemen Proyeksi", "page.projectManagement.sub":"Proyek onboarding klien · multi-user, real-time",
    "page.mergerSystem.title":"Sistem Merge", "page.mergerSystem.sub":"Gabungkan order, Excel, PDF (v21)",
    "page.orderProcessing.title":"Transaksi", "page.orderProcessing.sub":"Master item, screening stok, generator order (v21)",
    "page.dailyReconcile.title":"Rekonsiliasi Harian", "page.dailyReconcile.sub":"Rekonsiliasi order harian (v21)",
    "page.weeklyReportGen.title":"Generator Laporan Mingguan", "page.weeklyReportGen.sub":"Generator Excel volume inbound/outbound (v21)",
    "page.forecastOrdersGen.title":"Generator Forecast Order", "page.forecastOrdersGen.sub":"Ringkasan forecast outbound · grafik + tabel per klien (v21)",
    "page.masterData.title":"Master Data", "page.masterData.sub":"Standarisasi departemen, klien, dan kategori",
    "page.auditLog.title":"Log Aktivitas", "page.auditLog.sub":"Jejak audit — siapa mengubah apa, dan kapan",
    "page.oneOnOne.title":"Ringkasan 1-on-1", "page.oneOnOne.sub":"Jalankan sesi 1-on-1 terstruktur · ringkasan AI",
    "page.users.title":"Manajemen Pengguna", "page.users.sub":"Kelola akun dan peran tim"
  },
  en: {
    "group.sales":"Sales", "group.ss":"Sales Support", "group.ops":"Operations",
    "group.ga":"General Affairs", "group.department":"Department",
    "group.tools":"Tools", "group.management":"Management",
    "nav.dashboard":"Dashboard", "nav.dailyTracker":"Daily Tracker",
    "nav.revenueCalc":"Revenue Calculator", "nav.salesToolkit":"Sales Toolkit",
    "nav.dailyIssue":"Daily Issue Tracker", "nav.inboundMonitoring":"Inbound Monitoring",
    "nav.mpForecasting":"MP Forecasting", "nav.ticketing":"Internal Tickets",
    "nav.projectManagement":"Projection Management", "nav.mergerSystem":"Merge System",
    "nav.orderProcessing":"Transaction", "nav.dailyReconcile":"Daily Reconcile",
    "nav.weeklyReportGen":"Weekly Report Generator",
    "nav.forecastOrdersGen":"Forecast Orders Generator",
    "nav.oneOnOne":"1-on-1 Summarizer", "nav.masterData":"Master Data",
    "nav.auditLog":"Activity Log", "nav.users":"User Management",
    "login.email":"Email", "login.password":"Password",
    "login.remember":"Remember me", "login.signin":"Sign In",
    "login.help":"No account yet? Ask a supervisor to create one for you. Forgot your password? A supervisor can reset it from User Management.",
    "login.demoTitle":"DEMO MODE — click any account to auto-fill:",
    "common.signout":"Sign Out",
    "search.placeholder":"Search issues, tickets, tasks…  (Ctrl+K)",
    "page.dashboard.title":"Dashboard", "page.dashboard.sub":"Overview of today's operations",
    "page.dailyIssue.title":"Daily Issue Tracker", "page.dailyIssue.sub":"Sales Support · Root-cause analysis log",
    "page.dailyTrackerSales.title":"Daily Tracker — Sales", "page.dailyTrackerSales.sub":"Daily tasks for the Sales team",
    "page.dailyTrackerSS.title":"Daily Tracker — Sales Support", "page.dailyTrackerSS.sub":"Daily / Projection / Improvement tasks",
    "page.inboundMonitoring.title":"Inbound Monitoring", "page.inboundMonitoring.sub":"Vehicle arrivals, unloading, GRN processing",
    "page.mpForecasting.title":"MP Forecasting", "page.mpForecasting.sub":"Manpower forecast planning and roster management",
    "page.dailyTrackerGA.title":"Daily Tracker — General Affairs", "page.dailyTrackerGA.sub":"Daily tasks and requests for the GA team",
    "page.ticketing.title":"Internal Tickets", "page.ticketing.sub":"Department-wide ticket system",
    "page.revenueCalc.title":"Revenue Calculator", "page.revenueCalc.sub":"Calculate monthly revenue per client",
    "page.salesToolkit.title":"Sales Toolkit", "page.salesToolkit.sub":"Deal scoring, follow-up templates & objection playbook",
    "page.projectManagement.title":"Projection Management", "page.projectManagement.sub":"Client onboarding projects · multi-user, real-time",
    "page.mergerSystem.title":"Merge System", "page.mergerSystem.sub":"Merge orders, Excel, PDF (v21)",
    "page.orderProcessing.title":"Transaction", "page.orderProcessing.sub":"Master item, screening stock, orders generator (v21)",
    "page.dailyReconcile.title":"Daily Reconcile", "page.dailyReconcile.sub":"Reconcile daily orders (v21)",
    "page.weeklyReportGen.title":"Weekly Report Generator", "page.weeklyReportGen.sub":"Inbound/outbound volume Excel generator (v21)",
    "page.forecastOrdersGen.title":"Forecast Orders Generator", "page.forecastOrdersGen.sub":"Outbound forecast summary · chart + by-client tables (v21)",
    "page.masterData.title":"Master Data", "page.masterData.sub":"Standardize departments, clients, and categories",
    "page.auditLog.title":"Activity Log", "page.auditLog.sub":"Audit trail — who changed what, and when",
    "page.oneOnOne.title":"1-on-1 Summarizer", "page.oneOnOne.sub":"Run structured 1-on-1s · AI summary",
    "page.users.title":"User Management", "page.users.sub":"Manage team accounts and roles"
  }
};

let _lang = "id";
try { const s = localStorage.getItem("flow.lang"); if (s === "en" || s === "id") _lang = s; } catch (e) {}

const _listeners = [];

/** Current language code ("id" | "en"). */
export function getLang() { return _lang; }

/** Translate a key. Falls back to Indonesian, then the raw key. */
export function t(key) {
  return (STR[_lang] && STR[_lang][key]) || STR.id[key] || key;
}

/** Register a callback fired after the language changes. */
export function onLangChange(fn) { if (typeof fn === "function") _listeners.push(fn); }

/** Fill every [data-i18n] / [data-i18n-ph] element under `root`. */
export function applyI18n(root) {
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = _lang;
  document.querySelectorAll(".langToggle button[data-lang]").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === _lang);
  });
}

/** Switch language, persist it, re-render, and notify listeners. */
export function setLang(lang) {
  if ((lang !== "en" && lang !== "id") || lang === _lang) return;
  _lang = lang;
  try { localStorage.setItem("flow.lang", lang); } catch (e) {}
  applyI18n();
  _listeners.forEach(fn => { try { fn(lang); } catch (e) { console.warn("i18n listener failed:", e); } });
}

/** Wire the header ID/EN toggle + apply translations. Call once at startup. */
export function initI18n() {
  applyI18n();
  document.querySelectorAll(".langToggle button[data-lang]").forEach(b => {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });
  // Stay in sync with the Sales Toolkit iframe: it writes the same
  // localStorage key, and `storage` events fire across same-origin docs.
  window.addEventListener("storage", e => {
    if (e.key === "flow.lang" && (e.newValue === "en" || e.newValue === "id")) {
      setLang(e.newValue);
    }
  });
}
