// ============================================================
// FLOW Mega Apps — Client Marketplace Links
//
// Centralized URL directory for SS team. Each client has multiple
// marketplace shopfronts (Shopee, TikTok Shop, Tokopedia, etc.) —
// staff used to open 10+ browser bookmarks daily. This module is
// the single source of truth, filterable by client + marketplace.
//
// Schema (Firestore collection: marketplace_links):
//   { clientName, marketplace, label, url, notes,
//     createdAt, createdBy, updatedAt, updatedBy }
//
// Permissions:
//   • View: every signed-in user (shared reference data)
//   • Add / Edit / Delete: supervisor + master only (keeps the list clean)
// ============================================================

import {
  COL, addDocument, updateDocument, deleteDocument,
  subscribeCollection, orderBy
} from "../firebase.js";
import { $, esc, toast, confirmAction } from "../utils.js";
import { canCreate, canDelete, canEditRecord, getCurrentEmail } from "../roles.js";
import { subscribeMasterData } from "./master-data.js";

// Marketplaces are now master-data (editable in Master Data → Marketplaces).
// First render shows a fallback list while the master-data subscription
// fires — gets replaced with the live list as soon as the cache populates.
const FALLBACK_MARKETPLACES = [
  "Shopee", "TikTok Shop", "Tokopedia", "Lazada", "Blibli",
  "Bukalapak", "JD.ID", "Zalora", "Instagram", "WhatsApp",
  "Website (own)", "Other"
];

let allLinks = [];
let clientList = [];
let marketplaceList = FALLBACK_MARKETPLACES.slice();

export function initClientLinks() {
  const root = $("clientLinksRoot");
  if (!root) return;
  root.innerHTML = renderShell();
  bindEvents();

  // Stream the link list — auto-updates when anyone adds/edits
  subscribeCollection(COL.MARKETPLACE_LINKS, (rows) => {
    allLinks = rows.sort((a, b) => {
      const c = (a.clientName || "").localeCompare(b.clientName || "");
      return c !== 0 ? c : (a.marketplace || "").localeCompare(b.marketplace || "");
    });
    refreshFilters();
    renderTable();
  }, orderBy("clientName", "asc"));

  // Stream the client master data for the dropdowns
  subscribeMasterData("clients", (clients) => {
    clientList = clients;
    refreshClientSelects();
  });
  // Stream the marketplace master data for the dropdowns
  subscribeMasterData("marketplaces", (marketplaces) => {
    marketplaceList = (marketplaces && marketplaces.length) ? marketplaces : FALLBACK_MARKETPLACES.slice();
    refreshMarketplaceSelects();
  });
}

// ============================================================
// SHELL
// ============================================================
function renderShell() {
  const canEdit = canCreate();
  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left">
          <h2 style="margin:0">Client Marketplace Links</h2>
          <p style="color:var(--muted);margin:6px 0 0">All client marketplace URLs in one place. Filter by client or marketplace, click to open.</p>
        </div>
        <div class="right">
          ${canEdit ? `<button class="primary" id="cl_addBtn">+ Add Link</button>` : ""}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="filterGrid">
        <div>
          <label class="pmLabel">Search</label>
          <input type="search" id="cl_filterSearch" placeholder="Find by URL, label, notes…"/>
        </div>
        <div>
          <label class="pmLabel">Client</label>
          <select id="cl_filterClient"><option value="">All Clients</option></select>
        </div>
        <div>
          <label class="pmLabel">Marketplace</label>
          <select id="cl_filterMarketplace">
            <option value="">All Marketplaces</option>
          </select>
        </div>
        <div>
          <label class="pmLabel">&nbsp;</label>
          <button class="secondary" id="cl_filterReset">Reset Filters</button>
        </div>
      </div>
      <div id="cl_grid" class="cl-grid"></div>
      <p class="small" id="cl_count" style="color:var(--muted)">Loading…</p>
    </div>

    <!-- Add / Edit modal -->
    <div id="cl_modal" class="modal hidden">
      <div class="modalBox" style="max-width:560px">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2 id="cl_modalTitle">Add Marketplace Link</h2>
        <div class="form-grid">
          <div class="field">
            <label>Client *</label>
            <select id="cl_client"><option value="">— Pick client —</option></select>
          </div>
          <div class="field">
            <label>Marketplace *</label>
            <select id="cl_marketplace">
              <option value="">— Pick marketplace —</option>
            </select>
          </div>
          <div class="field" style="grid-column:1 / -1">
            <label>Label <span class="small" style="color:var(--muted)">(optional — e.g. "Main shop", "Reseller")</span></label>
            <input type="text" id="cl_label" placeholder="Main shop"/>
          </div>
          <div class="field" style="grid-column:1 / -1">
            <label>URL *</label>
            <input type="url" id="cl_url" placeholder="https://shopee.co.id/…" autocomplete="off"/>
          </div>
          <div class="field" style="grid-column:1 / -1">
            <label>Notes <span class="small" style="color:var(--muted)">(optional)</span></label>
            <textarea id="cl_notes" rows="2" placeholder="Login credentials kept elsewhere — do not paste passwords here."></textarea>
          </div>
        </div>
        <div class="btns" style="justify-content:flex-end;margin-top:14px">
          <button class="secondary" id="cl_modalCancel">Cancel</button>
          <button class="primary" id="cl_modalSave">Save</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// EVENT WIRING
// ============================================================
function bindEvents() {
  const addBtn = $("cl_addBtn");
  if (addBtn) addBtn.onclick = () => openModal();
  $("cl_modalCancel").onclick = closeModal;
  $("cl_modalSave").onclick = saveLink;
  $("cl_filterSearch").addEventListener("input", renderTable);
  $("cl_filterClient").addEventListener("change", renderTable);
  $("cl_filterMarketplace").addEventListener("change", renderTable);
  $("cl_filterReset").onclick = () => {
    $("cl_filterSearch").value = "";
    $("cl_filterClient").value = "";
    $("cl_filterMarketplace").value = "";
    renderTable();
  };
}

function refreshFilters() {
  refreshClientSelects();
  refreshMarketplaceSelects();
}

function refreshMarketplaceSelects() {
  const opts = marketplaceList.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
  // Filter dropdown
  const filterSel = $("cl_filterMarketplace");
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = `<option value="">All Marketplaces</option>` + opts;
    filterSel.value = cur;
  }
  // Add/Edit modal dropdown
  const modalSel = $("cl_marketplace");
  if (modalSel) {
    const cur = modalSel.value;
    modalSel.innerHTML = `<option value="">— Pick marketplace —</option>` + opts;
    modalSel.value = cur;
  }
}

function refreshClientSelects() {
  // Filter dropdown
  const filterSel = $("cl_filterClient");
  if (filterSel) {
    const cur = filterSel.value;
    filterSel.innerHTML = `<option value="">All Clients</option>` +
      clientList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    filterSel.value = cur;
  }
  // Add/Edit modal dropdown
  const modalSel = $("cl_client");
  if (modalSel) {
    const cur = modalSel.value;
    modalSel.innerHTML = `<option value="">— Pick client —</option>` +
      clientList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    modalSel.value = cur;
  }
}

// ============================================================
// RENDER
// ============================================================
function renderTable() {
  const grid = $("cl_grid");
  if (!grid) return;
  const search = ($("cl_filterSearch")?.value || "").toLowerCase().trim();
  const clientFilter = $("cl_filterClient")?.value || "";
  const marketplaceFilter = $("cl_filterMarketplace")?.value || "";

  let rows = allLinks;
  if (clientFilter) rows = rows.filter(r => r.clientName === clientFilter);
  if (marketplaceFilter) rows = rows.filter(r => r.marketplace === marketplaceFilter);
  if (search) {
    rows = rows.filter(r =>
      (r.url || "").toLowerCase().includes(search) ||
      (r.label || "").toLowerCase().includes(search) ||
      (r.notes || "").toLowerCase().includes(search) ||
      (r.clientName || "").toLowerCase().includes(search) ||
      (r.marketplace || "").toLowerCase().includes(search));
  }

  if (!rows.length) {
    grid.innerHTML = `<p style="color:var(--muted);padding:24px;text-align:center">${allLinks.length ? "No links match your filters." : 'No links yet. Click "+ Add Link" to add the first one.'}</p>`;
    $("cl_count").textContent = `${rows.length} of ${allLinks.length} links`;
    return;
  }

  grid.innerHTML = rows.map(r => {
    const editable = canEditRecord(r) || canDelete();
    const safeUrl = esc(r.url || "");
    return `
      <div class="cl-card" data-id="${esc(r.id)}">
        <div class="cl-card-head">
          <div>
            <span class="cl-client">${esc(r.clientName || "—")}</span>
            <span class="cl-mp">${esc(r.marketplace || "—")}</span>
          </div>
          ${editable ? `
            <div class="cl-card-actions">
              <button class="iconBtn" data-edit="${esc(r.id)}" title="Edit">✎</button>
              ${canDelete() ? `<button class="iconBtn danger" data-del="${esc(r.id)}" title="Delete">🗑</button>` : ""}
            </div>` : ""}
        </div>
        ${r.label ? `<div class="cl-label">${esc(r.label)}</div>` : ""}
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="cl-url" title="Open in new tab">${safeUrl}</a>
        ${r.notes ? `<div class="cl-notes">${esc(r.notes)}</div>` : ""}
        <div class="cl-foot">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="primary cl-openBtn">Open ↗</a>
          <button class="secondary" data-copy="${safeUrl}">Copy URL</button>
        </div>
      </div>
    `;
  }).join("");

  // Wire row buttons
  grid.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openModal(b.dataset.edit));
  grid.querySelectorAll("[data-del]").forEach(b => b.onclick = () => removeLink(b.dataset.del));
  grid.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.copy).then(
      () => toast("URL copied", "success"),
      () => toast("Copy failed — select the link and copy manually", "error")
    );
  });

  $("cl_count").textContent = `${rows.length} of ${allLinks.length} links`;
}

// ============================================================
// ADD / EDIT
// ============================================================
let editingId = null;

function openModal(id = null) {
  editingId = id;
  refreshClientSelects();
  refreshMarketplaceSelects();
  if (id) {
    const r = allLinks.find(x => x.id === id);
    if (!r) return;
    $("cl_modalTitle").textContent = "Edit Marketplace Link";
    $("cl_client").value = r.clientName || "";
    $("cl_marketplace").value = r.marketplace || "";
    $("cl_label").value = r.label || "";
    $("cl_url").value = r.url || "";
    $("cl_notes").value = r.notes || "";
  } else {
    $("cl_modalTitle").textContent = "Add Marketplace Link";
    $("cl_client").value = "";
    $("cl_marketplace").value = "";
    $("cl_label").value = "";
    $("cl_url").value = "";
    $("cl_notes").value = "";
  }
  $("cl_modal").classList.remove("hidden");
  setTimeout(() => ($("cl_url").value ? $("cl_label") : $("cl_client")).focus(), 50);
}

function closeModal() {
  $("cl_modal").classList.add("hidden");
  editingId = null;
}

async function saveLink() {
  const clientName = $("cl_client").value.trim();
  const marketplace = $("cl_marketplace").value.trim();
  const label = $("cl_label").value.trim();
  const url = $("cl_url").value.trim();
  const notes = $("cl_notes").value.trim();

  if (!clientName) return toast("Pick a client", "error");
  if (!marketplace) return toast("Pick a marketplace", "error");
  if (!url) return toast("URL is required", "error");
  if (!/^https?:\/\//i.test(url)) return toast("URL must start with http:// or https://", "error");

  try {
    if (editingId) {
      await updateDocument(COL.MARKETPLACE_LINKS, editingId, {
        clientName, marketplace, label, url, notes
      });
      toast(`Updated · ${clientName} on ${marketplace}`, "success");
    } else {
      await addDocument(COL.MARKETPLACE_LINKS, {
        clientName, marketplace, label, url, notes
      });
      toast(`Added · ${clientName} on ${marketplace}`, "success");
    }
    closeModal();
  } catch (e) {
    toast("Save failed: " + e.message, "error");
  }
}

async function removeLink(id) {
  const r = allLinks.find(x => x.id === id);
  if (!r) return;
  if (!confirmAction(`Delete the ${r.marketplace} link for ${r.clientName}?`)) return;
  try {
    await deleteDocument(COL.MARKETPLACE_LINKS, id);
    toast("Link deleted", "success");
  } catch (e) {
    toast("Delete failed: " + e.message, "error");
  }
}
