// ============================================================
// FLOW Mega Apps — Searchable Dropdown Component
//
// Standardised dropdown used for master-data fields (Client,
// Department, Issue Category). Replaces free-text inputs to
// stop typos like "PERO" vs "pero" vs "Peero".
//
// Usage:
//   const dd = createDropdown({
//     container: document.getElementById("im_client_dd"),
//     hiddenInput: document.getElementById("im_client"),
//     getItems: () => ["PERO", "Kintakun"],
//     onChange: (val) => { ... },
//     onAddNew: async (typedName) => "ResolvedName",  // optional
//     placeholder: "Select client...",
//     addNewLabel: "+ Add new client...",
//     recentKey: "flow.recent.client"
//   });
//   dd.setValue("PERO");
//   dd.getValue();   // → "PERO"
//   dd.refresh();    // re-render after items change
//
// Keeps last 5 selections in localStorage so the most-used
// items float to the top of the list — speed win after the
// list has > 20 items.
// ============================================================

let _ddCounter = 0;

export function createDropdown({
  container,
  hiddenInput,
  getItems,
  onChange,
  onAddNew,
  placeholder = "Select…",
  addNewLabel = null,        // pass to enable "+ Add new" footer
  recentKey = null,          // localStorage key for recents
  emptyMsg = "No items. Click + to add one."
}) {
  if (!container) throw new Error("createDropdown: container required");
  const id = "dd_" + (++_ddCounter);

  // Build skeleton
  container.classList.add("dd");
  container.innerHTML = `
    <button type="button" class="ddTrigger" id="${id}_trigger">
      <span class="ddValue ddPlaceholder">${escapeHtml(placeholder)}</span>
      <span class="ddCaret">▾</span>
    </button>
    <div class="ddPanel hidden" id="${id}_panel">
      <input type="search" class="ddSearch" id="${id}_search" placeholder="Type to filter…"/>
      <div class="ddList" id="${id}_list"></div>
      ${addNewLabel ? `<div class="ddFooter"><button type="button" class="ddAddNew" id="${id}_add">${escapeHtml(addNewLabel)}</button></div>` : ""}
    </div>
  `;

  const trigger = container.querySelector(".ddTrigger");
  const valueEl = container.querySelector(".ddValue");
  const panel   = container.querySelector(".ddPanel");
  const search  = container.querySelector(".ddSearch");
  const list    = container.querySelector(".ddList");
  const addBtn  = container.querySelector(".ddAddNew");

  let currentValue = hiddenInput?.value || "";
  let lastFilter = "";

  function getRecents() {
    if (!recentKey) return [];
    try {
      const raw = localStorage.getItem(recentKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function pushRecent(name) {
    if (!recentKey || !name) return;
    try {
      let arr = getRecents().filter(x => x !== name);
      arr.unshift(name);
      arr = arr.slice(0, 5);
      localStorage.setItem(recentKey, JSON.stringify(arr));
    } catch {}
  }

  function renderList() {
    const items = (getItems() || []).slice();
    const filter = lastFilter.toLowerCase().trim();
    const filtered = filter ? items.filter(i => i.toLowerCase().includes(filter)) : items;

    if (!filtered.length) {
      list.innerHTML = `<div class="ddEmpty">${escapeHtml(items.length ? "No matches." : emptyMsg)}</div>`;
      return;
    }

    // Sort: recents first, then alphabetical
    const recents = filter ? [] : getRecents().filter(r => filtered.includes(r));
    const rest = filtered.filter(i => !recents.includes(i)).sort((a, b) => a.localeCompare(b));

    let html = "";
    if (recents.length) {
      html += `<div class="ddSectionLabel">Recently used</div>`;
      html += recents.map(item => itemRow(item)).join("");
      html += `<div class="ddSectionLabel">All</div>`;
    }
    html += rest.map(item => itemRow(item)).join("");
    list.innerHTML = html;

    list.querySelectorAll("[data-ddval]").forEach(el => {
      el.addEventListener("click", () => {
        const v = el.dataset.ddval;
        setValue(v, true);
        close();
      });
    });
  }

  function itemRow(item) {
    const isSelected = item === currentValue;
    return `<div class="ddItem ${isSelected ? "selected" : ""}" data-ddval="${escapeAttr(item)}">${escapeHtml(item)}${isSelected ? " " : ""}</div>`;
  }

  function setValue(val, fireOnChange = false) {
    currentValue = val || "";
    if (hiddenInput) hiddenInput.value = currentValue;
    if (currentValue) {
      valueEl.textContent = currentValue;
      valueEl.classList.remove("ddPlaceholder");
    } else {
      valueEl.textContent = placeholder;
      valueEl.classList.add("ddPlaceholder");
    }
    if (fireOnChange) {
      pushRecent(currentValue);
      onChange?.(currentValue);
    }
    renderList();
  }

  function open() {
    panel.classList.remove("hidden");
    search.value = "";
    lastFilter = "";
    renderList();
    setTimeout(() => search.focus(), 30);
    document.addEventListener("click", outsideClickHandler);
  }

  function close() {
    panel.classList.add("hidden");
    document.removeEventListener("click", outsideClickHandler);
  }

  function outsideClickHandler(e) {
    if (!container.contains(e.target)) close();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.classList.contains("hidden")) open();
    else close();
  });

  search.addEventListener("input", () => {
    lastFilter = search.value;
    renderList();
  });

  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const first = list.querySelector("[data-ddval]");
      if (first) {
        setValue(first.dataset.ddval, true);
        close();
      } else if (addBtn && lastFilter.trim()) {
        // No match + Add-new is enabled + user typed something → trigger Add new with that text
        addBtn.click();
      }
    }
  });

  if (addBtn && onAddNew) {
    addBtn.addEventListener("click", async () => {
      const typed = search.value.trim();
      try {
        const newName = await onAddNew(typed);
        if (newName) {
          setValue(newName, true);
          close();
        }
      } catch (e) {
        console.error("Add new failed:", e);
      }
    });
  }

  // Initialize
  setValue(currentValue);

  return {
    setValue: (v) => setValue(v, false),
    getValue: () => currentValue,
    refresh: () => renderList(),
    open,
    close
  };
}

// ============================================================
// Helpers
// ============================================================
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// ============================================================
// Fuzzy-match helper — used when user types a new client name
// to suggest "Did you mean ...?" before creating a duplicate.
// ============================================================
export function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  const aLow = String(a).toLowerCase(), bLow = String(b).toLowerCase();
  if (aLow === bLow) return 1;
  if (aLow.length < 2 || bLow.length < 2) return aLow === bLow ? 1 : 0;
  const bigrams = new Map();
  for (let i = 0; i < aLow.length - 1; i++) {
    const bg = aLow.substr(i, 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < bLow.length - 1; i++) {
    const bg = bLow.substr(i, 2);
    const c = bigrams.get(bg) || 0;
    if (c > 0) { bigrams.set(bg, c - 1); intersection++; }
  }
  return (2 * intersection) / (aLow.length + bLow.length - 2);
}

export function findNearestMatch(typed, items, threshold = 0.7) {
  if (!typed || !items?.length) return null;
  let best = null;
  items.forEach(item => {
    const score = diceCoefficient(typed, item);
    if (!best || score > best.score) best = { name: item, score };
  });
  return best && best.score >= threshold ? best : null;
}
