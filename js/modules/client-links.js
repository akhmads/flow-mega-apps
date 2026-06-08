// ============================================================
// FLOW Mega Apps — Marketplace Hub (v3.10.1)
//
// Single workspace for Sales Support to access every client's
// marketplace seller centers. Pick a marketplace → pick a store
// → connect to that store's seller URL inside an embedded viewer
// (with a one-click "Open Portal" fallback because most major
// marketplaces block iframe embedding via X-Frame-Options).
//
// Schema (Firestore collection: marketplace_links — unchanged so
// existing rows keep working):
//   { clientName, marketplace, label, url, notes,
//     createdAt, createdBy, updatedAt, updatedBy }
//
// Permissions:
//   • View:  every signed-in user (shared reference data)
//   • Add / Edit / Delete: supervisor + master only
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument,
  subscribeCollection, orderBy
} from "../firebase.js";
import { $, esc, toast, confirmAction } from "../utils.js";
import { canCreate, canDelete, canEditRecord } from "../roles.js";
import { subscribeMasterData } from "./master-data.js";

// Marketplace presets — color + seller-center home/orders URLs.
// Used as defaults when a row has no URL, and to colorize the
// marketplace picker. Anything not in this map still works, just
// shows a neutral gray dot and no preset URLs.
const MARKETPLACE_PRESETS = {
  "Shopee":      { color: "#f97316", home: "https://seller.shopee.co.id/", orders: "https://seller.shopee.co.id/portal/sale/order?type=toship&source=all&sort_by=ship_by_date_asc" },
  "TikTok Shop": { color: "#111827", home: "https://seller-id.tiktok.com/", orders: "https://seller-id.tiktok.com/order" },
  "Tokopedia":   { color: "#16a34a", home: "https://seller.tokopedia.com/", orders: "https://seller.tokopedia.com/order-list" },
  "Lazada":      { color: "#7c3aed", home: "https://sellercenter.lazada.co.id/", orders: "https://sellercenter.lazada.co.id/apps/order/list" },
  "Blibli":      { color: "#2563eb", home: "https://seller.blibli.com/", orders: "https://seller.blibli.com/mta/order-list" },
  "BliBli":      { color: "#2563eb", home: "https://seller.blibli.com/", orders: "https://seller.blibli.com/mta/order-list" },
  "Bukalapak":   { color: "#e11d48", home: "https://seller.bukalapak.com/", orders: "" },
  "JD.ID":       { color: "#dc2626", home: "https://shop.jd.id/",          orders: "" },
  "Zalora":      { color: "#0ea5e9", home: "https://seller.zalora.co.id/", orders: "" },
  "Instagram":   { color: "#db2777", home: "https://business.instagram.com/", orders: "" },
  "WhatsApp":    { color: "#16a34a", home: "https://business.whatsapp.com/",  orders: "" },
  "Website (own)": { color: "#6366f1", home: "", orders: "" },
  "Other":       { color: "#64748b", home: "", orders: "" }
};
const FALLBACK_MARKETPLACES = Object.keys(MARKETPLACE_PRESETS).filter(k => k !== "BliBli");

function presetFor(mp) {
  return MARKETPLACE_PRESETS[mp] || { color: "#64748b", home: "", orders: "" };
}

// ============================================================
// MODULE STATE
// ============================================================
let allStores = [];                    // Firestore rows
let clientList = [];
let marketplaceList = FALLBACK_MARKETPLACES.slice();
let activeMarketplace = localStorage.getItem("mhActiveMarketplace") || "";
let activeStoreId    = localStorage.getItem("mhActiveStoreId")    || "";
let editingId = null;
let lastIframeSrc = "";                // avoid reloading iframe on every render

// ============================================================
// ENTRY
// ============================================================
export function initClientLinks() {
  const root = $("clientLinksRoot");
  if (!root) return;
  root.innerHTML = renderShell();
  bindEvents();

  subscribeCollection(COL.MARKETPLACE_LINKS, (rows) => {
    allStores = rows.sort((a, b) => {
      const c = (a.marketplace || "").localeCompare(b.marketplace || "");
      if (c !== 0) return c;
      return (a.clientName || "").localeCompare(b.clientName || "");
    });
    ensureActiveSelection();
    renderAll();
  }, orderBy("clientName", "asc"));

  subscribeMasterData("clients", (clients) => {
    clientList = clients || [];
    refreshClientSelect();
  });
  subscribeMasterData("marketplaces", (mps) => {
    marketplaceList = (mps && mps.length) ? mps : FALLBACK_MARKETPLACES.slice();
    ensureActiveSelection();
    renderAll();
  });
}

// ============================================================
// SHELL
// ============================================================
function renderShell() {
  const canEdit = canCreate();
  return `
    <div class="mh-app">

      <!-- Filter chip rows at top (Metabase-style): marketplace + store
           pills horizontally. Iframe gets the full width below. -->
      <div class="mh-filters">
        <div class="mh-filter-row">
          <span class="mh-filter-label">Marketplace</span>
          <div class="mh-chips" id="mh_marketplaces"></div>
        </div>
        <div class="mh-filter-row">
          <span class="mh-filter-label">Toko <span id="mh_storeCount" class="mh-count"></span></span>
          <div class="mh-chips" id="mh_storeList"></div>
          <div class="mh-filter-actions">
            <input type="search" id="mh_search" placeholder="Cari toko / URL…" class="mh-search" />
            ${canEdit ? `<button class="primary mh-add" id="mh_addBtn" title="Tambah toko">+ Tambah Toko</button>` : ""}
          </div>
        </div>
      </div>

      <!-- Single toolbar + full-width iframe viewer -->
      <section class="mh-workspace" id="mh_workspace">
        <div class="mh-toolbar">
          <div class="mh-toolbar-title">
            <span class="mh-status-dot" id="mh_statusDot" style="background:#94a3b8"></span>
            <b id="mh_screenTitle">Pilih toko untuk mulai</b>
          </div>
          <div class="mh-toolbar-url">
            <input id="mh_urlInput" placeholder="https://seller.shopee.co.id/…" />
            <button class="mh-btn-success" id="mh_connectBtn" title="Muat URL di area kerja">Connect</button>
            <button class="mh-btn-dark"    id="mh_portalBtn"  title="Buka di tab baru">Portal ↗</button>
            <button class="mh-btn-full"    id="mh_fullBtn"    title="Layar penuh (Esc untuk keluar)" aria-label="Fullscreen">⛶</button>
          </div>
        </div>

        <div class="mh-viewer" id="mh_viewer">
          <iframe id="mh_frame" title="Marketplace Seller Center"
            referrerpolicy="no-referrer-when-downgrade"
            allowfullscreen
            style="display:none"></iframe>
          <div class="mh-fallback" id="mh_fallback">
            <div class="mh-fallback-card">
              <h2 id="mh_fallbackTitle">Pilih marketplace dan toko</h2>
              <p id="mh_fallbackText" style="color:var(--muted);line-height:1.5">Beberapa marketplace memblok tampilan di dalam iframe. Kalau halaman tidak muncul, klik <b>Portal ↗</b> untuk akses langsung.</p>
              <div class="mh-quick-links" id="mh_quickLinks"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Add / Edit modal -->
      <div id="mh_modal" class="modal hidden">
        <div class="modalBox" style="max-width:560px">
          <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
          <h2 id="mh_modalTitle">Tambah Toko</h2>
          <div class="form-grid">
            <div class="field">
              <label>Klien *</label>
              <select id="mh_client"><option value="">— Pilih klien —</option></select>
            </div>
            <div class="field">
              <label>Marketplace *</label>
              <select id="mh_marketplace"><option value="">— Pilih marketplace —</option></select>
            </div>
            <div class="field" style="grid-column:1 / -1">
              <label>Nama Toko / Label <span class="small" style="color:var(--muted)">(opsional — misal "Main shop", "Reseller")</span></label>
              <input type="text" id="mh_label" placeholder="Main shop" />
            </div>
            <div class="field" style="grid-column:1 / -1">
              <label>URL Seller Center *</label>
              <input type="url" id="mh_url" placeholder="https://seller.shopee.co.id/…" autocomplete="off" />
              <p class="small" style="color:var(--muted);margin:4px 0 0" id="mh_urlHint">Kosongkan untuk pakai URL default marketplace.</p>
            </div>
            <div class="field" style="grid-column:1 / -1">
              <label>Catatan <span class="small" style="color:var(--muted)">(opsional)</span></label>
              <textarea id="mh_notes" rows="2" placeholder="Login credentials disimpan di tempat lain — jangan paste password di sini."></textarea>
            </div>
          </div>
          <div class="btns" style="justify-content:space-between;margin-top:14px">
            <button class="iconBtn danger" id="mh_modalDelete" style="display:none">🗑 Hapus</button>
            <div style="display:flex;gap:8px;margin-left:auto">
              <button class="secondary" id="mh_modalCancel">Batal</button>
              <button class="primary"   id="mh_modalSave">Simpan</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// EVENT WIRING
// ============================================================
function bindEvents() {
  const addBtn = $("mh_addBtn");
  if (addBtn) addBtn.onclick = () => openModal();
  $("mh_modalCancel").onclick = closeModal;
  $("mh_modalSave").onclick   = saveStore;
  $("mh_modalDelete").onclick = () => editingId && removeStore(editingId);

  // Close on backdrop click and on the × button
  const modal = $("mh_modal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.classList.contains("modalClose")) closeModal();
  });

  $("mh_search").addEventListener("input", () => renderStoreList());

  $("mh_connectBtn").onclick = () => loadActiveUrl(($("mh_urlInput").value || "").trim());
  $("mh_portalBtn").onclick  = () => {
    const url = normalizeUrl($("mh_urlInput").value);
    if (!url) return toast("URL kosong", "error");
    window.open(url, "_blank", "noopener,noreferrer");
  };
  $("mh_fullBtn").onclick = toggleFullscreen;
  // Sync the button icon when entering/exiting fullscreen (also fires
  // when the user hits Esc to exit).
  document.addEventListener("fullscreenchange", () => {
    const btn = $("mh_fullBtn");
    if (!btn) return;
    btn.textContent = document.fullscreenElement ? "⛶" : "⛶";
    btn.title = document.fullscreenElement ? "Keluar layar penuh (Esc)" : "Layar penuh (Esc untuk keluar)";
  });
  $("mh_urlInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); loadActiveUrl(e.target.value); }
  });

  // Marketplace dropdown in modal — when changed, prefill the URL
  // with the marketplace's preset orders/home URL if the URL field is empty.
  $("mh_marketplace").addEventListener("change", () => {
    const urlEl = $("mh_url");
    if (urlEl.value.trim()) return;       // don't overwrite user input
    const preset = presetFor($("mh_marketplace").value);
    if (preset.orders) urlEl.value = preset.orders;
    else if (preset.home) urlEl.value = preset.home;
  });

  // Iframe load detection: if cross-origin blocks succeed we still get
  // a `load` event for about:blank or the X-Frame block page — we can't
  // be 100% sure embedding worked. So show a hint after a short delay.
  const frame = $("mh_frame");
  frame.addEventListener("load", () => {
    setStatus("connected", "Connected");
    fitFrame();
  });
  frame.addEventListener("error", () => {
    setStatus("error", "Gagal memuat");
    showFallback();
  });

  // Re-fit on resize and when entering/leaving fullscreen so the iframe
  // always matches the available viewer area without internal scrollbars.
  window.addEventListener("resize", fitFrame);
  document.addEventListener("fullscreenchange", fitFrame);

  // Auto-refit whenever the viewer's own size changes — collapsing/expanding
  // the sidebar, mobile drawer opening, parent containers reflowing, etc.
  // ResizeObserver catches anything window.resize misses.
  //
  // Defer the call via requestAnimationFrame: fitFrame() writes to viewer.style.height,
  // which itself counts as a resize. Without the rAF break, the observer would
  // re-fire in the same frame and the browser would emit the "ResizeObserver
  // loop completed with undelivered notifications" warning. The rAF puts the
  // height write in the NEXT frame so the observer's current cycle finishes
  // cleanly. A reentry flag stops any pending fit from stacking up.
  const viewer = $("mh_viewer");
  if (viewer && typeof ResizeObserver !== "undefined") {
    if (viewer._fitObs) viewer._fitObs.disconnect();
    let pending = false;
    viewer._fitObs = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        fitFrame();
      });
    });
    viewer._fitObs.observe(viewer);
  }
}

// ============================================================
// STATE HELPERS
// ============================================================
function getActiveStore() {
  if (!activeStoreId) return null;
  return allStores.find(s => s.id === activeStoreId) || null;
}

function storesForMarketplace(mp) {
  if (!mp) return [];
  const q = ($("mh_search")?.value || "").toLowerCase().trim();
  let rows = allStores.filter(s => s.marketplace === mp);
  if (q) {
    rows = rows.filter(s =>
      (s.clientName || "").toLowerCase().includes(q) ||
      (s.label      || "").toLowerCase().includes(q) ||
      (s.url        || "").toLowerCase().includes(q) ||
      (s.notes      || "").toLowerCase().includes(q));
  }
  return rows;
}

function ensureActiveSelection() {
  // Pick a sensible default marketplace if none is set or current
  // pick is no longer in the list.
  const available = marketplaceList.slice();
  // Add any marketplace that has stores but isn't in master-data yet
  for (const s of allStores) {
    if (s.marketplace && !available.includes(s.marketplace)) available.push(s.marketplace);
  }
  if (!available.includes(activeMarketplace)) {
    // Prefer the first marketplace that has stores
    const firstWithStores = available.find(mp => allStores.some(s => s.marketplace === mp));
    activeMarketplace = firstWithStores || available[0] || "";
  }
  // Validate active store: must match active marketplace
  const cur = getActiveStore();
  if (!cur || cur.marketplace !== activeMarketplace) {
    const first = allStores.find(s => s.marketplace === activeMarketplace);
    activeStoreId = first ? first.id : "";
  }
  persist();
}

function persist() {
  localStorage.setItem("mhActiveMarketplace", activeMarketplace || "");
  localStorage.setItem("mhActiveStoreId",    activeStoreId    || "");
}

// ============================================================
// RENDER
// ============================================================
function renderAll() {
  renderMarketplaces();
  renderStoreList();
  renderViewer();
}

function renderMarketplaces() {
  const root = $("mh_marketplaces");
  if (!root) return;

  // Merge master-data list with any marketplaces present in stores
  const seen = new Set();
  const list = [];
  for (const mp of marketplaceList) { if (!seen.has(mp)) { seen.add(mp); list.push(mp); } }
  for (const s of allStores)        { if (s.marketplace && !seen.has(s.marketplace)) { seen.add(s.marketplace); list.push(s.marketplace); } }

  root.innerHTML = list.map(mp => {
    const count = allStores.filter(s => s.marketplace === mp).length;
    const color = presetFor(mp).color;
    const isActive = mp === activeMarketplace;
    return `
      <button class="mh-mp ${isActive ? "active" : ""}" data-mp="${esc(mp)}" type="button">
        <span class="mh-dot" style="background:${esc(color)}"></span>
        <span class="mh-mp-name">${esc(mp)}</span>
        <span class="mh-mp-badge">${count}</span>
      </button>`;
  }).join("");

  root.querySelectorAll("[data-mp]").forEach(btn => {
    btn.onclick = () => selectMarketplace(btn.dataset.mp);
  });
}

function renderStoreList() {
  const root = $("mh_storeList");
  if (!root) return;

  const rows = storesForMarketplace(activeMarketplace);
  $("mh_storeCount").textContent = rows.length ? `(${rows.length})` : "";

  if (!rows.length) {
    root.innerHTML = `<span class="mh-empty">${allStores.some(s => s.marketplace === activeMarketplace)
      ? "Tidak ada toko cocok pencarian."
      : 'Belum ada toko · klik "+ Tambah Toko"'}</span>`;
    return;
  }

  root.innerHTML = rows.map(s => {
    const name = displayName(s);
    const isActive = s.id === activeStoreId;
    const editable = canEditRecord(s) || canDelete();
    return `
      <button class="mh-chip mh-chip-store ${isActive ? "active" : ""}" data-id="${esc(s.id)}" type="button" title="${esc(name)}${s.url ? "\n" + esc(s.url) : ""}">
        <span class="mh-chip-name">${esc(name)}</span>
        ${editable ? `<span class="mh-chip-edit" data-edit="${esc(s.id)}" title="Edit toko">✎</span>` : ""}
      </button>`;
  }).join("");

  root.querySelectorAll(".mh-chip-store").forEach(chip => {
    chip.onclick = (e) => {
      if (e.target.closest("[data-edit]")) {
        e.stopPropagation();
        openModal(e.target.dataset.edit);
        return;
      }
      selectStore(chip.dataset.id, { userInitiated: true });
    };
  });
}

function renderViewer() {
  const store = getActiveStore();
  const preset = presetFor(activeMarketplace);
  const url = (store && store.url) || preset.orders || preset.home || "";

  $("mh_screenTitle").textContent = store
    ? `${activeMarketplace} · ${displayName(store)}`
    : (activeMarketplace || "Marketplace Hub");

  $("mh_urlInput").value = url;

  const quick = $("mh_quickLinks");
  if (quick) {
    const links = [];
    if (preset.orders) links.push(`<a href="${esc(preset.orders)}" target="_blank" rel="noopener noreferrer">Buka halaman order ${esc(activeMarketplace)}</a>`);
    if (preset.home)   links.push(`<a href="${esc(preset.home)}"   target="_blank" rel="noopener noreferrer">Buka homepage seller ${esc(activeMarketplace)}</a>`);
    if (store && store.url && store.url !== preset.orders && store.url !== preset.home) {
      links.push(`<a href="${esc(store.url)}" target="_blank" rel="noopener noreferrer">Buka URL toko (${esc(displayName(store))})</a>`);
    }
    quick.innerHTML = links.join("");
  }

  if (!url) {
    showFallback("Belum ada URL", "Pilih toko atau tambahkan URL seller center untuk mulai.");
    setStatus("idle", "Belum siap");
    return;
  }
  loadActiveUrl(url, { silent: true });
}

// ============================================================
// SELECTION
// ============================================================
function selectMarketplace(mp) {
  if (mp === activeMarketplace) return;
  activeMarketplace = mp;
  const first = allStores.find(s => s.marketplace === mp);
  activeStoreId = first ? first.id : "";
  persist();
  renderAll();
}

function selectStore(id, opts = {}) {
  if (id === activeStoreId) return;
  activeStoreId = id;
  persist();
  renderStoreList();
  renderViewer();
  // Auto-fullscreen on user click — marketplaces render perfectly at
  // native 1366px when the iframe has 1920×1080 to work with, so no
  // sliders or scaling tricks are needed. Esc to return.
  if (opts.userInitiated && !document.fullscreenElement) {
    requestFullscreenIfEnabled();
  }
}

function requestFullscreenIfEnabled() {
  if (localStorage.getItem("mhAutoFullscreen") === "off") return;
  const viewer = $("mh_viewer");
  viewer?.requestFullscreen?.().catch(() => { /* user denied or unsupported */ });
}

// ============================================================
// IFRAME LOADER
// ============================================================
function loadActiveUrl(rawUrl, { silent = false } = {}) {
  const url = normalizeUrl(rawUrl || $("mh_urlInput").value || "");
  if (!url) {
    showFallback();
    return;
  }
  $("mh_urlInput").value = url;

  const frame    = $("mh_frame");
  const fallback = $("mh_fallback");

  // Avoid reloading the iframe with the same URL on every re-render —
  // that's the bug that made the preview HTML flicker on every store
  // click. Only reload when the URL actually changes.
  if (frame.src === url && lastIframeSrc === url) {
    frame.style.display  = "block";
    fallback.style.display = "none";
    return;
  }

  fallback.style.display = "none";
  frame.style.display = "block";
  setStatus("loading", "Memuat…");

  // Use a fresh src assignment for forced reload
  try {
    frame.src = url;
    lastIframeSrc = url;
  } catch (e) {
    setStatus("error", "URL tidak valid");
    showFallback("URL tidak valid", e.message || "Periksa kembali URL toko.");
    return;
  }

  // After a short grace period, show the fallback hint alongside the
  // iframe so users blocked by X-Frame-Options have an obvious next step.
  if (!silent) {
    setTimeout(() => {
      const text = $("mh_fallbackText");
      if (text) {
        text.innerHTML = `Kalau halaman <b>${esc(activeMarketplace)}</b> tidak muncul, marketplace ini memblok embed iframe. Gunakan <b>Buka Portal</b> di kanan atas untuk akses langsung.`;
      }
    }, 1500);
  }
}

function showFallback(title, body) {
  $("mh_fallback").style.display = "grid";
  $("mh_frame").style.display = "none";
  if (title) $("mh_fallbackTitle").textContent = title;
  if (body)  $("mh_fallbackText").textContent  = body;
}

function setStatus(kind /*, label */) {
  const colors = { idle: "#94a3b8", loading: "#f59e0b", connected: "#16a34a", error: "#ef4444" };
  const dot = $("mh_statusDot");
  if (dot) dot.style.background = colors[kind] || colors.idle;
}

// ============================================================
// ADD / EDIT MODAL
// ============================================================
function openModal(id = null) {
  editingId = id;
  refreshClientSelect();
  refreshMarketplaceSelect();
  const delBtn = $("mh_modalDelete");

  if (id) {
    const r = allStores.find(x => x.id === id);
    if (!r) return;
    $("mh_modalTitle").textContent = "Edit Toko";
    $("mh_client").value      = r.clientName  || "";
    $("mh_marketplace").value = r.marketplace || "";
    $("mh_label").value       = r.label       || "";
    $("mh_url").value         = r.url         || "";
    $("mh_notes").value       = r.notes       || "";
    delBtn.style.display = canDelete() ? "" : "none";
  } else {
    $("mh_modalTitle").textContent = "Tambah Toko";
    $("mh_client").value      = "";
    $("mh_marketplace").value = activeMarketplace || "";
    $("mh_label").value       = "";
    $("mh_url").value         = activeMarketplace ? (presetFor(activeMarketplace).orders || presetFor(activeMarketplace).home || "") : "";
    $("mh_notes").value       = "";
    delBtn.style.display = "none";
  }
  $("mh_modal").classList.remove("hidden");
  setTimeout(() => ($("mh_client").value ? $("mh_label") : $("mh_client")).focus(), 50);
}

function closeModal() {
  $("mh_modal").classList.add("hidden");
  editingId = null;
}

function refreshMarketplaceSelect() {
  const sel = $("mh_marketplace");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">— Pilih marketplace —</option>` +
    marketplaceList.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
  sel.value = cur || activeMarketplace || "";
}

function refreshClientSelect() {
  const sel = $("mh_client");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">— Pilih klien —</option>` +
    clientList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = cur;
}

async function saveStore() {
  const clientName  = $("mh_client").value.trim();
  const marketplace = $("mh_marketplace").value.trim();
  const label       = $("mh_label").value.trim();
  const url         = $("mh_url").value.trim();
  const notes       = $("mh_notes").value.trim();

  if (!clientName)  return toast("Pilih klien dulu", "error");
  if (!marketplace) return toast("Pilih marketplace dulu", "error");
  if (!url)         return toast("URL wajib diisi", "error");
  if (!/^https?:\/\//i.test(url)) return toast("URL harus diawali http:// atau https://", "error");

  try {
    if (editingId) {
      await updateDocument(COL.MARKETPLACE_LINKS, editingId, { clientName, marketplace, label, url, notes });
      toast(`Tersimpan · ${clientName} di ${marketplace}`, "success");
      // Keep this store selected after edit
      activeMarketplace = marketplace;
      activeStoreId = editingId;
      persist();
    } else {
      const newId = await addDocument(COL.MARKETPLACE_LINKS, { clientName, marketplace, label, url, notes });
      toast(`Ditambah · ${clientName} di ${marketplace}`, "success");
      // Jump to the new store
      activeMarketplace = marketplace;
      if (newId) activeStoreId = newId;
      persist();
    }
    closeModal();
  } catch (e) {
    toast("Gagal menyimpan: " + e.message, "error");
  }
}

async function removeStore(id) {
  const r = allStores.find(x => x.id === id);
  if (!r) return;
  if (!confirmAction(`Hapus toko ${displayName(r)} (${r.marketplace})?`)) return;
  try {
    await deleteDocument(COL.MARKETPLACE_LINKS, id);
    toast("Toko dihapus", "success");
    if (activeStoreId === id) activeStoreId = "";
    persist();
    closeModal();
  } catch (e) {
    toast("Gagal menghapus: " + e.message, "error");
  }
}

// ============================================================
// HELPERS
// ============================================================
function displayName(s) {
  if (!s) return "";
  if (s.label && s.clientName) return `${s.clientName} · ${s.label}`;
  return s.label || s.clientName || "(tanpa nama)";
}

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function normalizeUrl(url) {
  url = (url || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

// ============================================================
// FULLSCREEN — uses the standard Fullscreen API. We fullscreen
// the .mh-viewer (not the iframe) so the iframe and its parent
// keep their normal layout context; browsers handle Esc.
// ============================================================
function toggleFullscreen() {
  const viewer = $("mh_viewer");
  if (!viewer) return;
  if (!document.fullscreenElement) {
    const p = viewer.requestFullscreen?.();
    if (p && p.catch) p.catch(e => toast("Layar penuh ditolak: " + (e.message || e), "error"));
  } else {
    document.exitFullscreen?.();
  }
}

// ============================================================
// FIT-TO-VIEWER — scale by WIDTH so the iframe always fills the
// viewer horizontally (no internal horizontal scrollbar) and is
// tall enough that Shopee/Tokopedia content fits without an
// internal vertical scrollbar either. If the scaled iframe is
// taller than the viewport, the FLOW page itself scrolls —
// which is much smoother than the iframe's internal slider.
//
// In fullscreen, viewer becomes 100vw × 100vh and there's room
// to spare → reset the inline styles and let CSS take over.
// ============================================================
const FRAME_NATURAL_WIDTH      = 1366;
const FRAME_NATURAL_MIN_HEIGHT = 768;  // covers most seller-center landing pages

function fitFrame() {
  const viewer = $("mh_viewer");
  const frame  = $("mh_frame");
  if (!viewer || !frame) return;

  // Fullscreen path — CSS handles 100vw × 100vh.
  if (document.fullscreenElement === viewer) {
    frame.style.width = "";
    frame.style.height = "";
    frame.style.transform = "";
    viewer.style.height = "";
    return;
  }

  const vw = viewer.clientWidth;
  const vh = viewer.clientHeight;
  if (!vw) return;

  const scale = vw / FRAME_NATURAL_WIDTH;
  // Iframe must be tall enough that Shopee's content fits without
  // an internal scrollbar. If the viewer is tall, match it; if it's
  // short, fall back to the marketplace-content minimum.
  const iframeHeight = Math.max(FRAME_NATURAL_MIN_HEIGHT, (vh || 0) / scale);

  frame.style.width  = FRAME_NATURAL_WIDTH + "px";
  frame.style.height = iframeHeight + "px";
  frame.style.transform = `scale(${scale})`;
  frame.style.transformOrigin = "top left";

  // Reserve the scaled height so the iframe isn't clipped; this is
  // what makes the OUTER page scroll if the iframe sticks out below.
  viewer.style.height = (iframeHeight * scale) + "px";
}
