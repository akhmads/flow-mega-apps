// ============================================================
// FLOW Mega Apps — Sidebar Layout
//
// Master-curated, org-wide sidebar structure. Lets the master
// rename nav buttons, reorder them, and move items between groups.
// Everyone reads, only master writes.
//
// Storage:
//   /app_settings/global.sidebar = [
//     { kind: "item",  id: "dashboard",         label: "Dashboard" },
//     { kind: "group", id: "sales",             label: "Sales" },
//     { kind: "item",  id: "dailyTrackerSales", label: "Daily Tracker" },
//     ...
//   ]
//
// Items reference their data-menu attribute by `id`. Groups are
// addressed by a stable id derived from their data-i18n key
// (e.g. "sales" from "group.sales") — see groupKey() below.
//
// Apply algorithm:
//   • Snapshot every existing .nav button + .navGroup (by id)
//   • Re-append them to the .nav container in the saved order
//   • Apply label overrides (textContent) and strip data-i18n on the
//     element so applyI18n() doesn't overwrite the user's choice
//
// Items not in the saved layout (e.g. a newly-added module that
// shipped after the master last edited) are appended at the end
// of the nav so they remain reachable without an editor revisit.
// ============================================================

import { applyI18n, t } from "../i18n.js";

// Stable id for a .navGroup element. Prefers its data-i18n key
// ("group.sales" → "sales") but falls back to its text.
export function groupKey(el) {
  const k = el.getAttribute("data-i18n");
  if (k && k.startsWith("group.")) return k.slice("group.".length);
  return (el.textContent || "").trim().toLowerCase().replace(/\s+/g, "-") || "group";
}

// Snapshot the CURRENT nav structure (the order it sits in right now
// in the DOM) into a layout array. Used to seed the editor when the
// master opens it for the first time.
export function snapshotNavLayout() {
  const nav = document.querySelector(".sidebar .nav");
  if (!nav) return [];
  const layout = [];
  [...nav.children].forEach(el => {
    if (el.classList.contains("navGroup")) {
      const id = el.dataset.customGroup || groupKey(el);
      layout.push({ kind: "group", id, label: el.textContent.trim() });
    } else if (el.tagName === "BUTTON" && el.dataset.menu) {
      layout.push({ kind: "item", id: el.dataset.menu, label: el.textContent.trim() });
    }
  });
  return layout;
}

// Apply a saved layout to the live nav. Idempotent — safe to call on
// every Firestore snapshot. Re-applies i18n to anything still flagged
// as translatable so language switches keep working.
//
// Supported entry kinds:
//   • "group"    — section label. Reuses existing .navGroup by id, or
//                  creates a new one for custom departments.
//   • "item"     — built-in module button. Must match an existing
//                  data-menu in the static nav. Reorder + rename only.
//   • "tracker"  — Daily Tracker for a custom department. We synthesize
//                  a nav button with data-menu="tracker:<deptKey>"; the
//                  page handler in app.js builds the section lazily on
//                  first navigation.
export function applySidebarLayout(layout) {
  const nav = document.querySelector(".sidebar .nav");
  if (!nav || !Array.isArray(layout) || !layout.length) return;

  // Build lookup tables of existing DOM nodes so we can move them
  // (preserving role attributes + event listeners) instead of cloning.
  const groupsByKey = new Map();
  const itemsByMenu = new Map();
  const trackersByMenu = new Map();
  [...nav.children].forEach(el => {
    if (el.classList.contains("navGroup")) groupsByKey.set(groupKey(el), el);
    else if (el.tagName === "BUTTON" && el.dataset.menu) {
      if (el.dataset.menu.startsWith("tracker:")) trackersByMenu.set(el.dataset.menu, el);
      else itemsByMenu.set(el.dataset.menu, el);
    }
  });

  // Track which nodes we've placed so we can append any stragglers
  // (new modules added after the layout was saved) at the end.
  const placed = new Set();
  const liveTrackerMenus = new Set();

  layout.forEach(entry => {
    if (entry.kind === "group") {
      let el = groupsByKey.get(entry.id);
      if (!el) {
        // Custom department added by master — synthesize the label
        el = document.createElement("div");
        el.className = "navGroup";
        el.dataset.customGroup = entry.id;
        el.textContent = entry.label || "Group";
      } else {
        applyLabel(el, entry.label, `group.${entry.id}`);
      }
      nav.appendChild(el);
      placed.add(el);
    } else if (entry.kind === "item") {
      const el = itemsByMenu.get(entry.id);
      if (!el) return;
      applyLabel(el, entry.label, el.getAttribute("data-i18n"));
      nav.appendChild(el);
      placed.add(el);
    } else if (entry.kind === "tracker") {
      // id is the menu identifier ("tracker:<deptKey>"). On first apply
      // we synthesise the button + wire click → switchPage.
      const menuId = entry.id;
      liveTrackerMenus.add(menuId);
      let el = trackersByMenu.get(menuId);
      if (!el) {
        el = document.createElement("button");
        el.dataset.menu = menuId;
        el.addEventListener("click", () => {
          if (typeof window.__flowSwitchPage === "function") {
            window.__flowSwitchPage(menuId, el);
          }
        });
      }
      el.textContent = entry.label || "Daily Tracker";
      nav.appendChild(el);
      placed.add(el);
    }
  });

  // Drop tracker buttons that were removed.
  trackersByMenu.forEach((el, menuId) => {
    if (!liveTrackerMenus.has(menuId)) el.remove();
  });

  // Re-append any nodes that weren't in the saved layout (new modules,
  // role-gated items not yet visible to this user, etc.) so they remain
  // reachable. Their relative order is preserved from the DOM walk above.
  [...nav.children].forEach(el => {
    if (!placed.has(el)) nav.appendChild(el);
  });

  // Re-apply i18n in case any label was reset to its translation key.
  try { applyI18n(nav); } catch (_) {}
}

// Set a label override on an element. If the override matches the
// translation of the i18n key (i.e. nothing actually customized), we
// keep data-i18n active so language switching still works. If it
// differs, we strip data-i18n so it doesn't get overwritten.
function applyLabel(el, label, i18nKey) {
  if (label == null) return;
  const original = i18nKey ? t(i18nKey) : null;
  if (original != null && label === original) {
    // Default label — let i18n own it.
    if (i18nKey) el.setAttribute("data-i18n", i18nKey);
    el.textContent = label;
    return;
  }
  // Custom label — pin it and stop i18n from overwriting.
  el.removeAttribute("data-i18n");
  el.textContent = label;
}
