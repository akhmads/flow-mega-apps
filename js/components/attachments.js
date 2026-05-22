// ============================================================
// FLOW Mega Apps — Attachment Field (reusable component)
//
// A small, optional file-attachment widget used by the Issue and
// Ticket modals. Files are read as base64 data URLs and stored
// inline on the record (collection doc) under an `attachments`
// array of { name, type, size, data }.
//
// base64-in-doc keeps it working in BOTH preview mode (localStorage)
// and Firestore without extra infra. To stay well under Firestore's
// 1 MB document limit each file is capped — see MAX_FILE_BYTES.
// For large-scale production use, swap this for Firebase Storage.
// ============================================================

import { esc, toast } from "../utils.js";

const MAX_FILE_BYTES = 700 * 1024;   // 700 KB per file
const MAX_FILES = 5;                  // per record

/**
 * Mount an attachment field into `container`.
 * @returns {{ setItems(arr):void, getItems():Array, clear():void }}
 */
export function createAttachmentField(container) {
  let items = [];

  container.classList.add("attachField");
  container.innerHTML = `
    <label class="attachAddBtn">
      + Add file
      <input type="file" multiple style="display:none"
             accept="image/*,application/pdf,.xlsx,.xls,.csv,.doc,.docx"/>
    </label>
    <div class="attachList"></div>
    <p class="small attachHint">Max ${MAX_FILES} files · ${Math.round(MAX_FILE_BYTES / 1024)} KB each.</p>
  `;

  const input = container.querySelector('input[type="file"]');
  const list = container.querySelector(".attachList");

  input.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = ""; // allow re-picking the same file
    for (const file of files) {
      if (items.length >= MAX_FILES) {
        toast(`Limit is ${MAX_FILES} files`, "error");
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast(`"${file.name}" is too large (max ${Math.round(MAX_FILE_BYTES / 1024)} KB)`, "error");
        continue;
      }
      try {
        const data = await readAsDataURL(file);
        items.push({ name: file.name, type: file.type || "", size: file.size, data });
      } catch (e) {
        toast(`Could not read "${file.name}"`, "error");
      }
    }
    render();
  });

  function render() {
    if (!items.length) {
      list.innerHTML = `<span class="small attachEmpty">No files attached.</span>`;
      return;
    }
    list.innerHTML = items.map((it, idx) => `
      <div class="attachItem">
        <span class="attachIcon">${isImage(it) ? "🖼" : "📄"}</span>
        <a href="${esc(it.data)}" target="_blank" rel="noopener" class="attachName" title="Open ${esc(it.name)}">${esc(it.name)}</a>
        <span class="small attachSize">${fmtSize(it.size)}</span>
        <button type="button" class="attachRemove" data-idx="${idx}" title="Remove">×</button>
      </div>
    `).join("");
    list.querySelectorAll(".attachRemove").forEach(btn =>
      btn.addEventListener("click", () => {
        items.splice(Number(btn.dataset.idx), 1);
        render();
      }));
  }

  render();

  return {
    setItems(arr) { items = Array.isArray(arr) ? arr.filter(Boolean) : []; render(); },
    getItems() { return items.map(it => ({ ...it })); },
    clear() { items = []; render(); }
  };
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function isImage(it) {
  return (it.type || "").startsWith("image/");
}

function fmtSize(bytes) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
