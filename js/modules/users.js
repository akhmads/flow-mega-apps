// ============================================================
// FLOW Mega Apps — User Management (v3.9.2)
//
// Admins and Supervisors both manage user accounts.
// Supervisors are responsible for day-to-day onboarding: create
// accounts, assign roles, reset passwords.
//
// PREVIEW MODE: the app is fully self-contained. Passwords are
// stored in the preview store (localStorage) on a `previewPassword`
// field. Users created here can log in immediately.
//
// PRODUCTION MODE: this UI sets the role profile in Firestore. The
// Firebase Auth account itself (with the real password) must be
// created via Firebase Console → Authentication, or the Admin SDK
// on your backend. The client SDK can't create Auth users without
// signing the current admin out. The guidance card below explains
// the production path.
// ============================================================

import { $, esc, toast, friendlyDate, confirmAction } from "../utils.js";
import {
  canManageUsers, listUsers, upsertUserProfile, deleteUserProfile,
  resetUserPassword,
  roleLabel, roleBadgeClass, getCurrentEmail
} from "../roles.js";
import { isFirebaseConfigured } from "../firebase.js";
import { createDropdown } from "../components/dropdown.js";
import { subscribeMasterData, addMasterItem } from "./master-data.js";

let allUsers = [];
let userDeptDropdown = null;
let userDeptList = [];

export function initUsers() {
  if (!canManageUsers()) {
    $("usersRoot").innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <h2>🔒 Access Denied</h2>
        <p>Only Admins and Supervisors can manage user accounts.</p>
      </div>`;
    return;
  }
  $("usersRoot").innerHTML = renderShell();
  bindEvents();
  refresh();
}

function renderShell() {
  const productionNotice = isFirebaseConfigured ? `
    <div class="card">
      <h2>📘 How it works (production)</h2>
      <div class="output" style="font-size:13px;line-height:1.6">
1️⃣  <b>Create the Firebase Auth account first.</b> Go to Firebase Console → Authentication → Users → Add user. Set email + temporary password. Share the password with the staff member.
<br><br>
2️⃣  <b>Then come back here and assign their role.</b> Use the same email. The role takes effect on their next login.
<br><br>
3️⃣  <b>To remove access:</b> delete their entry here AND disable their Auth account in Firebase Console.
      </div>
    </div>` : `
    <div class="card" style="background:#fdf4ff;border-left:4px solid #7c3aed">
      <h2 style="margin:0 0 6px">🧪 Preview Mode — self-contained sandbox</h2>
      <p class="small" style="margin:0">You can create accounts here with email + password, and they can log in immediately. Data is stored in your browser (localStorage), so it persists across reloads but only on this device. In production this same UI assigns roles in Firebase.</p>
    </div>`;

  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left">
          <h2 style="margin:0">👤 User Management</h2>
          <p style="color:var(--muted);margin:6px 0 0">Create accounts, assign roles, reset passwords. Admins + Supervisors.</p>
        </div>
        <div class="right">
          <button class="primary" id="usrAddBtn">+ Add User</button>
        </div>
      </div>
    </div>

    ${productionNotice}

    <div class="card">
      <h2>Team Members</h2>
      <div class="usrFilters">
        <input type="search" id="usrFilterSearch" placeholder="Search by name or email…"/>
        <select id="usrFilterRole">
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="supervisor">Supervisor</option>
          <option value="user">User</option>
        </select>
        <select id="usrFilterDept"><option value="">All Departments</option></select>
        <button class="secondary" id="usrFilterReset">Reset</button>
      </div>
      <div class="tableWrap">
        <table id="usrTable">
          <thead><tr>
            <th>Email</th><th>Name</th><th>Role</th><th>Department</th><th>Added</th><th>Actions</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="small" id="usrCount">Loading…</p>
    </div>

    <!-- Add/Update modal -->
    <div id="usrModal" class="modal hidden">
      <div class="modalBox">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2 id="usrModalTitle">Add User</h2>
        <div class="form-grid">
          <div class="field"><label>Email *</label><input type="email" id="usr_email" placeholder="name@flowgistik.id"/></div>
          <div class="field"><label>Display Name *</label><input type="text" id="usr_name" placeholder="e.g. Yoga"/></div>
          <div class="field"><label>Role *</label>
            <select id="usr_role">
              <option value="admin">👁️ Admin · sees everything, READ-ONLY</option>
              <option value="supervisor" selected>✏️ Supervisor · full edit power</option>
              <option value="user">👤 User · limited (own records only)</option>
            </select>
          </div>
          <div class="field"><label>Department *</label>
            <div id="usr_dept_dd" class="dd"></div>
            <input type="hidden" id="usr_dept"/>
          </div>
          <div class="field" id="usr_password_row" style="grid-column:1 / -1">
            <label>Password ${isFirebaseConfigured ? "(production: set in Firebase Console)" : "*"}</label>
            <input type="text" id="usr_password" placeholder="${isFirebaseConfigured ? "Not used in production" : "Pick a password for them"}"${isFirebaseConfigured ? " disabled" : ""}/>
            <p class="small" style="margin:4px 0 0">${isFirebaseConfigured
              ? "In production, passwords live in Firebase Authentication and must be created/reset in the Firebase Console."
              : "Share this password securely with the user. They can change it later (or you can reset it from this page)."}</p>
          </div>
        </div>
        <div class="btns" style="justify-content:flex-end;margin-top:14px">
          <button class="secondary" id="usrModalCancel">Cancel</button>
          <button class="primary" id="usrModalSave">Save</button>
        </div>
      </div>
    </div>

    <!-- Reset Password modal -->
    <div id="usrPwdModal" class="modal hidden">
      <div class="modalBox" style="max-width:480px">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2>Reset Password</h2>
        <p>Resetting password for <b id="usrPwdTargetEmail">—</b></p>
        ${isFirebaseConfigured
          ? `<div class="output" style="background:#fef3c7;color:#78350f;font-size:13px;line-height:1.5">⚠️ In production, passwords live in Firebase Authentication. To reset, go to Firebase Console → Authentication → find the user → ⋮ → Reset password. This page sets a preview-only password.</div>`
          : ``}
        <div class="field" style="margin-top:14px">
          <label>New Password *</label>
          <input type="text" id="usrPwd_new" placeholder="At least 6 characters"/>
        </div>
        <div class="btns" style="justify-content:flex-end;margin-top:14px">
          <button class="secondary" id="usrPwdCancel">Cancel</button>
          <button class="primary" id="usrPwdSave">Reset Password</button>
        </div>
      </div>
    </div>
  `;
}

function bindEvents() {
  $("usrAddBtn").onclick = () => openModal();
  $("usrModalCancel").onclick = closeModal;
  $("usrModalSave").onclick = saveUser;
  $("usrPwdCancel").onclick = closePwdModal;
  $("usrPwdSave").onclick = savePassword;
  $("usrFilterSearch").addEventListener("input", renderTable);
  $("usrFilterRole").addEventListener("change", renderTable);
  $("usrFilterDept").addEventListener("change", renderTable);
  $("usrFilterReset").onclick = () => {
    $("usrFilterSearch").value = "";
    $("usrFilterRole").value = "";
    $("usrFilterDept").value = "";
    renderTable();
  };
  subscribeMasterData("departments", (depts) => {
    userDeptList = depts;
    const sel = $("usrFilterDept");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = `<option value="">All Departments</option>` +
        depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
      sel.value = cur;
    }
  });
}

async function refresh() {
  try {
    allUsers = await listUsers();
    allUsers.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    renderTable();
  } catch (e) {
    console.error(e);
    toast("Failed to load users: " + e.message, "error");
  }
}

function renderTable() {
  const tbody = $("usrTable").querySelector("tbody");
  const search = ($("usrFilterSearch")?.value || "").toLowerCase().trim();
  const roleFilter = $("usrFilterRole")?.value || "";
  const deptFilter = $("usrFilterDept")?.value || "";

  let users = allUsers;
  if (search) {
    users = users.filter(u =>
      (u.email || "").toLowerCase().includes(search) ||
      (u.name || "").toLowerCase().includes(search));
  }
  if (roleFilter) {
    if (roleFilter === "admin") {
      users = users.filter(u => ["admin", "sales-admin", "ss-admin"].includes(u.role));
    } else if (roleFilter === "supervisor") {
      users = users.filter(u => ["supervisor", "sales", "ss"].includes(u.role));
    } else {
      users = users.filter(u => u.role === roleFilter);
    }
  }
  if (deptFilter) users = users.filter(u => u.department === deptFilter);

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">${allUsers.length ? "No users match the filters." : 'No users yet. Click "+ Add User" to create one.'}</td></tr>`;
    $("usrCount").textContent = `${users.length} of ${allUsers.length} users`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><b>${esc(u.email)}</b></td>
      <td>${esc(u.name || "—")}</td>
      <td><span class="${roleBadgeClass(u.role)}">${esc(roleLabel(u.role))}</span></td>
      <td>${esc(u.department || "—")}</td>
      <td>${esc(friendlyDate(u.createdAt?.toDate?.() || u.createdAt))}</td>
      <td>
        <button class="secondary iconBtn" data-edit="${esc(u.email)}">Edit</button>
        <button class="secondary iconBtn" data-pwd="${esc(u.email)}">🔑 Reset Password</button>
        ${u.email === getCurrentEmail() ? '' : `<button class="danger iconBtn" data-del="${esc(u.email)}">Delete</button>`}
      </td>
    </tr>
  `).join("");
  $("usrCount").textContent = `${users.length} of ${allUsers.length} users`;

  tbody.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openModal(b.dataset.edit));
  tbody.querySelectorAll("[data-pwd]").forEach(b => b.onclick = () => openPwdModal(b.dataset.pwd));
  tbody.querySelectorAll("[data-del]").forEach(b => b.onclick = () => removeUser(b.dataset.del));
}

function ensureUserDeptDropdown() {
  if (userDeptDropdown) return;
  const container = $("usr_dept_dd");
  const hiddenInput = $("usr_dept");
  if (!container || !hiddenInput) return;
  userDeptDropdown = createDropdown({
    container,
    hiddenInput,
    getItems: () => userDeptList,
    onAddNew: async (value) => {
      try {
        await addMasterItem("departments", value);
        return value;
      } catch (e) {
        toast("Failed to add department: " + e.message, "error");
        return null;
      }
    },
    placeholder: "Select department…",
    addNewLabel: "+ Add new department…",
    recentKey: "flow.recent.dept"
  });
  subscribeMasterData("departments", (items) => {
    userDeptList = items;
    userDeptDropdown?.refresh();
  });
}

function openModal(email = null) {
  ensureUserDeptDropdown();
  if (email) {
    const u = allUsers.find(x => x.email === email);
    if (!u) return;
    $("usrModalTitle").textContent = "Update User";
    $("usr_email").value = u.email;
    $("usr_email").disabled = true;
    $("usr_name").value = u.name || "";
    $("usr_role").value = u.role || "supervisor";
    userDeptDropdown?.setValue(u.department || "");
    // Don't show password on edit — use the dedicated Reset Password flow
    $("usr_password").value = "";
    $("usr_password_row").style.display = "none";
  } else {
    $("usrModalTitle").textContent = "Add User";
    $("usr_email").value = "";
    $("usr_email").disabled = false;
    $("usr_name").value = "";
    $("usr_role").value = "supervisor";
    userDeptDropdown?.setValue("");
    $("usr_password").value = "";
    $("usr_password_row").style.display = "";
  }
  $("usrModal").classList.remove("hidden");
}

function closeModal() {
  $("usrModal").classList.add("hidden");
}

async function saveUser() {
  const email = $("usr_email").value.trim().toLowerCase();
  const name = $("usr_name").value.trim();
  const role = $("usr_role").value;
  const department = $("usr_dept").value.trim();
  const password = $("usr_password").value;
  const isCreate = !$("usr_email").disabled;

  if (!email) return toast("Email required", "error");
  if (!email.includes("@")) return toast("Invalid email", "error");
  if (!name) return toast("Display name required", "error");
  if (!department) return toast("Department required — pick from the dropdown", "error");
  // Password required on CREATE in preview mode
  if (isCreate && !isFirebaseConfigured && (!password || password.length < 6)) {
    return toast("Password required (at least 6 characters)", "error");
  }

  try {
    await upsertUserProfile({ email, name, role, department, password });
    toast(`${isCreate ? "Created" : "Updated"}: ${name} (${roleLabel(role)})`, "success");
    closeModal();
    refresh();
  } catch (e) {
    console.error(e);
    toast("Save failed: " + e.message, "error");
  }
}

let pwdTargetEmail = null;
function openPwdModal(email) {
  pwdTargetEmail = email;
  $("usrPwdTargetEmail").textContent = email;
  $("usrPwd_new").value = "";
  $("usrPwdModal").classList.remove("hidden");
  setTimeout(() => $("usrPwd_new").focus(), 50);
}
function closePwdModal() {
  $("usrPwdModal").classList.add("hidden");
  pwdTargetEmail = null;
}
async function savePassword() {
  const newPwd = $("usrPwd_new").value;
  if (!newPwd || newPwd.length < 6) {
    return toast("Password must be at least 6 characters", "error");
  }
  if (!pwdTargetEmail) return;
  try {
    await resetUserPassword(pwdTargetEmail, newPwd);
    toast(`Password reset for ${pwdTargetEmail}. Share it securely.`, "success");
    closePwdModal();
  } catch (e) {
    toast("Reset failed: " + e.message, "error");
  }
}

async function removeUser(email) {
  if (!confirmAction(`Remove ${email}? They will lose app access immediately.${isFirebaseConfigured ? " (Their Firebase Auth account is NOT deleted — do that in Firebase Console.)" : ""}`)) return;
  try {
    await deleteUserProfile(email);
    toast(`Removed ${email}`, "success");
    refresh();
  } catch (e) {
    toast("Delete failed: " + e.message, "error");
  }
}
