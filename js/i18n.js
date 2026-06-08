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
    "group.tools":"Alat", "group.management":"Manajemen", "group.master":"Master",
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
    "nav.masterConsole":"Master Console",
    "nav.clientLinks":"Marketplace Hub",
    "nav.commandCenter":"Command Center",
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
    "page.users.title":"Manajemen Pengguna", "page.users.sub":"Kelola akun dan peran tim",
    "page.clientLinks.title":"Marketplace Hub", "page.clientLinks.sub":"Workspace akses seller center · pilih marketplace → pilih toko → connect",
    "page.commandCenter.title":"Command Center", "page.commandCenter.sub":"Peluncur aplikasi tim · semua tool dalam satu klik",
    "page.masterConsole.title":"Master Console", "page.masterConsole.sub":"Kontrol master · mode, broadcast, kill switch, impersonasi",

    // Command Center module
    "cc.title":"Command Center",
    "cc.intro":"Satu peluncur untuk setiap tool yang dipakai tim. Klik kartu mana saja untuk membuka di tab baru.",
    "cc.intro.editable":"Edit, simpan, dan hapus tercatat di <b>Log Aktivitas</b>.",
    "cc.intro.limited":"User biasa bisa menambah aplikasi; hanya supervisor yang bisa mengedit atau menghapus.",
    "cc.search":"Cari aplikasi…",
    "cc.addApp":"+ Tambah Aplikasi",
    "cc.addDept":"+ Tambah Departemen",
    "cc.addAppShort":"+ Aplikasi",
    "cc.editDept":"Edit / ganti nama departemen",
    "cc.dragDept":"Geser untuk mengurutkan departemen",
    "cc.dragApp":"Geser untuk mengurutkan atau memindahkan",
    "cc.empty.noDepts.sup":"Belum ada departemen. Klik <b>+ Tambah Departemen</b> untuk membuatnya.",
    "cc.empty.noDepts.user":"Belum ada departemen. Minta supervisor untuk menyiapkannya.",
    "cc.empty.noApps":"Belum ada aplikasi",
    "cc.empty.noApps.cta":" · klik <b>+ Aplikasi</b> untuk menambahkan",
    "cc.untitled":"(tanpa judul)",
    "cc.modal.appAdd":"Tambah Aplikasi",
    "cc.modal.appEdit":"Edit Aplikasi",
    "cc.modal.appName":"Nama aplikasi *",
    "cc.modal.appDept":"Departemen *",
    "cc.modal.appUrl":"URL *",
    "cc.modal.appDesc":"Deskripsi singkat",
    "cc.modal.appDescHint":"(opsional)",
    "cc.modal.appIcon":"Ikon",
    "cc.modal.appIconHint":"(emoji atau huruf)",
    "cc.modal.appColor":"Warna",
    "cc.modal.deptAdd":"Tambah Departemen",
    "cc.modal.deptEdit":"Edit Departemen",
    "cc.modal.deptName":"Nama departemen *",
    "cc.modal.deptDelete":"🗑 Hapus Departemen",
    "cc.btn.cancel":"Batal",
    "cc.btn.save":"Simpan",
    "cc.btn.delete":"🗑 Hapus",
    "cc.btn.editTitle":"Edit / Simpan",
    "cc.toast.nameRequired":"Nama aplikasi wajib diisi.",
    "cc.toast.urlRequired":"URL wajib diisi.",
    "cc.toast.deptRequired":"Pilih departemen.",
    "cc.toast.urlInvalid":"URL harus diawali http:// atau https://",
    "cc.toast.deptNameRequired":"Nama departemen wajib diisi.",
    "cc.toast.deptDup":"Departemen dengan nama \"{name}\" sudah ada.",
    "cc.toast.editPermission":"Hanya supervisor yang bisa mengedit aplikasi.",
    "cc.toast.addPermission":"Kamu nggak punya izin untuk menambah aplikasi.",
    "cc.toast.deletePermission":"Hanya supervisor yang bisa menghapus aplikasi.",
    "cc.toast.deptPermission":"Hanya supervisor yang bisa menambah atau mengedit departemen.",
    "cc.toast.signin":"Masuk untuk menambah aplikasi.",
    "cc.toast.saved":"Tersimpan · {name}",
    "cc.toast.added":"Ditambahkan · {name}",
    "cc.toast.appDeleted":"Aplikasi dihapus.",
    "cc.toast.deptDeleted":"Departemen dihapus.",
    "cc.toast.saveFailed":"Gagal menyimpan: {msg}",
    "cc.toast.deleteFailed":"Gagal menghapus: {msg}",
    "cc.toast.reorderFailed":"Gagal mengurutkan: {msg}",
    "cc.confirm.deleteApp":"Hapus \"{name}\"? Aksi ini tidak bisa dibatalkan.",
    "cc.confirm.deleteDept":"Hapus departemen \"{name}\"?{extra} Aksi ini tidak bisa dibatalkan.",
    "cc.confirm.deleteDeptExtra":" Ini juga akan menghapus {count} aplikasi di dalamnya.",

    // Dashboard module
    "dash.greet.morning":"Selamat pagi",
    "dash.greet.noon":"Selamat siang",
    "dash.greet.afternoon":"Selamat sore",
    "dash.greet.evening":"Selamat malam",
    "dash.greet.hello":"Halo",
    "dash.greet.fallbackName":"di sana",
    "dash.motivation.0":"Yuk, manfaatkan hari ini sebaik-baiknya.",
    "dash.motivation.1":"Gerak cepat, perbaiki yang perlu diperbaiki.",
    "dash.motivation.2":"Bangun sistem yang bikin Flow naik kelas.",
    "dash.motivation.3":"Kualitas adalah disiplin harian.",
    "dash.motivation.4":"Kecepatan adalah keunggulan kompetitif.",
    "dash.motivation.5":"Langkah kecil tiap hari, hasilnya besar.",
    "dash.kpi.openIssues":"Issue Terbuka",
    "dash.kpi.critical":"Kritis (Outbound)",
    "dash.kpi.openTickets":"Tiket Terbuka",
    "dash.kpi.openTeamTasks":"Tugas Tim Terbuka",
    "dash.kpi.inboundRange":"Inbound (rentang)",
    "dash.kpi.completedInbound":"Inbound Selesai",
    "dash.kpi.onTimeRate":"Tingkat Tepat Waktu",
    "dash.kpi.teamTasksRange":"Tugas Tim (rentang)",
    "dash.kpi.done":"Selesai",
    "dash.kpi.completion":"Penyelesaian",
    "dash.kpi.tasksRange":"Tugas (rentang)",
    "dash.panel.latestIssues":"Issue Terbaru",
    "dash.panel.latestTickets":"Tiket Terbaru",
    "dash.panel.recentInbound":"Inbound Terbaru",
    "dash.panel.latestTeamTasks":"Tugas {label} Terbaru",
    "dash.empty.noIssues":"Tidak ada issue di rentang ini.",
    "dash.empty.noTickets":"Tidak ada tiket di rentang ini.",
    "dash.empty.noInbound":"Tidak ada entri inbound di rentang ini.",
    "dash.empty.noTeamTasks":"Tidak ada tugas tim di rentang ini.",
    "dash.action.title":"Action Items Saya",
    "dash.action.sub":"Tiket yang ditugaskan ke kamu + tugas terbuka kamu. Acknowledge atau resolve langsung dari sini.",
    "dash.action.clear":"Kamu sudah bersih!",
    "dash.action.clearSub":"Tidak ada tiket atau tugas yang ditugaskan ke kamu saat ini.",
    "dash.action.myTickets":"Tiket Saya",
    "dash.action.myTasks":"Tugas Terbuka Saya",
    "dash.action.moreTasks":"+ {count} lagi — lihat di Daily Tracker",
    "dash.action.ack":"Ack",
    "dash.action.ackTitle":"Acknowledge — set ke In Progress",
    "dash.action.resolve":"Selesai",
    "dash.action.resolveTitle":"Tandai selesai",
    "dash.action.openInTicketing":"Buka di Ticketing",
    "dash.action.untitledTask":"(tugas tanpa judul)",
    "dash.action.from":"dari",
    "dash.age.today":"hari ini",
    "dash.age.oneDay":"1 hari",
    "dash.age.daysCount":"{n} hari",
    "dash.toast.ticketUpdated":"Tiket → {status}",
    "dash.toast.updateFailed":"Gagal memperbarui: {msg}",
    "dash.section.overview":"Overview",
    "dash.section.overviewSub":"KPI live untuk departemen kamu. Filter berdasarkan rentang tanggal.",
    "dash.label.dateRange":"Rentang Tanggal",
    "dash.label.from":"Dari",
    "dash.label.to":"Sampai",
    "dash.range.all":"Semua",
    "dash.range.today":"Hari Ini",
    "dash.range.yesterday":"Kemarin",
    "dash.range.thisWeek":"Minggu Ini",
    "dash.range.thisMonth":"Bulan Ini",
    "dash.range.last30":"30 Hari Terakhir",
    "dash.range.custom":"Kustom",
    "dash.preview.title":"Mode Preview / Demo",
    "dash.preview.body":"Kamu menjalankan app tanpa Firebase. <b>Semua fitur jalan</b> — buat issue, tiket, user, dll. Data tersimpan di localStorage browser dan bertahan setelah reload. Klik <b>tombol +</b> di halaman manapun untuk menambah data; supervisor juga bisa buat akun login baru di <b>Manajemen Pengguna</b>. Untuk hapus semua data demo dan mulai dari nol, buka DevTools console dan jalankan <code>localStorage.clear()</code> lalu refresh.",
    "dash.preview.wipe":"Hapus data demo"
  },
  en: {
    "group.sales":"Sales", "group.ss":"Sales Support", "group.ops":"Operations",
    "group.ga":"General Affairs", "group.department":"Department",
    "group.tools":"Tools", "group.management":"Management", "group.master":"Master",
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
    "nav.masterConsole":"Master Console",
    "nav.clientLinks":"Marketplace Hub",
    "nav.commandCenter":"Command Center",
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
    "page.users.title":"User Management", "page.users.sub":"Manage team accounts and roles",
    "page.clientLinks.title":"Marketplace Hub", "page.clientLinks.sub":"Seller center workspace · pick marketplace → pick store → connect",
    "page.commandCenter.title":"Command Center", "page.commandCenter.sub":"Team-shared app launcher · every tool one click away",
    "page.masterConsole.title":"Master Console", "page.masterConsole.sub":"Master-only controls · mode, broadcast, kill switches, impersonation",

    // Command Center module
    "cc.title":"Command Center",
    "cc.intro":"One launcher for every tool the team uses. Click any tile to open it in a new tab.",
    "cc.intro.editable":"Edit, save and delete are recorded in <b>Activity Log</b>.",
    "cc.intro.limited":"Limited users can add new apps; only supervisors can edit or delete.",
    "cc.search":"Search apps…",
    "cc.addApp":"+ Add App",
    "cc.addDept":"+ Add Department",
    "cc.addAppShort":"+ App",
    "cc.editDept":"Edit / rename department",
    "cc.dragDept":"Drag to reorder department",
    "cc.dragApp":"Drag to reorder or move",
    "cc.empty.noDepts.sup":"No departments yet. Click <b>+ Add Department</b> to create one.",
    "cc.empty.noDepts.user":"No departments yet. Ask a supervisor to set one up.",
    "cc.empty.noApps":"No apps yet",
    "cc.empty.noApps.cta":" · click <b>+ App</b> to add",
    "cc.untitled":"(untitled)",
    "cc.modal.appAdd":"Add App",
    "cc.modal.appEdit":"Edit App",
    "cc.modal.appName":"App name *",
    "cc.modal.appDept":"Department *",
    "cc.modal.appUrl":"URL *",
    "cc.modal.appDesc":"Short description",
    "cc.modal.appDescHint":"(optional)",
    "cc.modal.appIcon":"Icon",
    "cc.modal.appIconHint":"(emoji or letter)",
    "cc.modal.appColor":"Color",
    "cc.modal.deptAdd":"Add Department",
    "cc.modal.deptEdit":"Edit Department",
    "cc.modal.deptName":"Department name *",
    "cc.modal.deptDelete":"🗑 Delete Department",
    "cc.btn.cancel":"Cancel",
    "cc.btn.save":"Save",
    "cc.btn.delete":"🗑 Delete",
    "cc.btn.editTitle":"Edit / Save",
    "cc.toast.nameRequired":"App name is required.",
    "cc.toast.urlRequired":"URL is required.",
    "cc.toast.deptRequired":"Pick a department.",
    "cc.toast.urlInvalid":"URL must start with http:// or https://",
    "cc.toast.deptNameRequired":"Department name is required.",
    "cc.toast.deptDup":"A department named \"{name}\" already exists.",
    "cc.toast.editPermission":"Only supervisors can edit apps.",
    "cc.toast.addPermission":"You don't have permission to add apps.",
    "cc.toast.deletePermission":"Only supervisors can delete apps.",
    "cc.toast.deptPermission":"Only supervisors can add or edit departments.",
    "cc.toast.signin":"Sign in to add an app.",
    "cc.toast.saved":"Saved · {name}",
    "cc.toast.added":"Added · {name}",
    "cc.toast.appDeleted":"App deleted.",
    "cc.toast.deptDeleted":"Department deleted.",
    "cc.toast.saveFailed":"Save failed: {msg}",
    "cc.toast.deleteFailed":"Delete failed: {msg}",
    "cc.toast.reorderFailed":"Reorder failed: {msg}",
    "cc.confirm.deleteApp":"Delete \"{name}\"? This cannot be undone.",
    "cc.confirm.deleteDept":"Delete department \"{name}\"?{extra} This cannot be undone.",
    "cc.confirm.deleteDeptExtra":" This will also delete {count} app{plural} inside it.",

    // Dashboard module
    "dash.greet.morning":"Good morning",
    "dash.greet.noon":"Good afternoon",
    "dash.greet.afternoon":"Good afternoon",
    "dash.greet.evening":"Good evening",
    "dash.greet.hello":"Hello",
    "dash.greet.fallbackName":"there",
    "dash.motivation.0":"Let's make today count.",
    "dash.motivation.1":"Move fast, fix things.",
    "dash.motivation.2":"Build the systems Flow needs to scale.",
    "dash.motivation.3":"Excellence is daily discipline.",
    "dash.motivation.4":"Speed is a competitive advantage.",
    "dash.motivation.5":"Small steps, compounded daily.",
    "dash.kpi.openIssues":"Open Issues",
    "dash.kpi.critical":"Critical (Outbound)",
    "dash.kpi.openTickets":"Open Tickets",
    "dash.kpi.openTeamTasks":"Open Team Tasks",
    "dash.kpi.inboundRange":"Inbound (range)",
    "dash.kpi.completedInbound":"Completed Inbound",
    "dash.kpi.onTimeRate":"On-Time Rate",
    "dash.kpi.teamTasksRange":"Team Tasks (range)",
    "dash.kpi.done":"Done",
    "dash.kpi.completion":"Completion",
    "dash.kpi.tasksRange":"Tasks (range)",
    "dash.panel.latestIssues":"Latest Issues",
    "dash.panel.latestTickets":"Latest Tickets",
    "dash.panel.recentInbound":"Recent Inbound",
    "dash.panel.latestTeamTasks":"Latest {label} Tasks",
    "dash.empty.noIssues":"No issues in this range.",
    "dash.empty.noTickets":"No tickets in this range.",
    "dash.empty.noInbound":"No inbound entries in this range.",
    "dash.empty.noTeamTasks":"No team tasks in this range.",
    "dash.action.title":"My Action Items",
    "dash.action.sub":"Tickets assigned to you + your open tasks. Acknowledge or resolve right from here.",
    "dash.action.clear":"You're all clear!",
    "dash.action.clearSub":"No open tickets or tasks assigned to you right now.",
    "dash.action.myTickets":"My Tickets",
    "dash.action.myTasks":"My Open Tasks",
    "dash.action.moreTasks":"+ {count} more — see Daily Tracker",
    "dash.action.ack":"Ack",
    "dash.action.ackTitle":"Acknowledge — set to In Progress",
    "dash.action.resolve":"Resolve",
    "dash.action.resolveTitle":"Mark resolved",
    "dash.action.openInTicketing":"Open in Ticketing",
    "dash.action.untitledTask":"(untitled task)",
    "dash.action.from":"from",
    "dash.age.today":"today",
    "dash.age.oneDay":"1 day",
    "dash.age.daysCount":"{n} days",
    "dash.toast.ticketUpdated":"Ticket → {status}",
    "dash.toast.updateFailed":"Update failed: {msg}",
    "dash.section.overview":"Overview",
    "dash.section.overviewSub":"Live KPIs for your department. Filter by date range.",
    "dash.label.dateRange":"Date Range",
    "dash.label.from":"From",
    "dash.label.to":"To",
    "dash.range.all":"All Time",
    "dash.range.today":"Today",
    "dash.range.yesterday":"Yesterday",
    "dash.range.thisWeek":"This Week",
    "dash.range.thisMonth":"This Month",
    "dash.range.last30":"Last 30 Days",
    "dash.range.custom":"Custom",
    "dash.preview.title":"Preview / Demo Mode",
    "dash.preview.body":"You're running the app without Firebase. <b>Every feature works</b> — create issues, tickets, users, etc. Data is saved to your browser's localStorage and survives page reloads. Click <b>+ buttons</b> on any page to add data; supervisors can also create new login accounts under <b>User Management</b>. To wipe all demo data and start fresh, open browser DevTools console and run <code>localStorage.clear()</code> then refresh.",
    "dash.preview.wipe":"Wipe demo data"
  }
};

let _lang = "id";
try { const s = localStorage.getItem("flow.lang"); if (s === "en" || s === "id") _lang = s; } catch (e) {}

const _listeners = [];

/** Current language code ("id" | "en"). */
export function getLang() { return _lang; }

/** Translate a key. Falls back to Indonesian, then the raw key.
 *  Optional `vars` object substitutes {name}-style placeholders. */
export function t(key, vars) {
  let s = (STR[_lang] && STR[_lang][key]) || STR.id[key] || key;
  if (vars && typeof vars === "object") {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
  }
  return s;
}

/** Register a callback fired after the language changes. */
export function onLangChange(fn) { if (typeof fn === "function") _listeners.push(fn); }

/** Fill every [data-i18n] / [data-i18n-ph] / [data-i18n-html] element under `root`.
 *  - data-i18n      → textContent (safe, escapes HTML)
 *  - data-i18n-html → innerHTML (use only with trusted keys you control)
 *  - data-i18n-ph   → placeholder
 *  - data-i18n-title → title attribute */
export function applyI18n(root) {
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
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
