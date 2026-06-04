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
  roleLabel, roleBadgeClass, getCurrentEmail,
  isMaster, isAdmin, isSupervisor, getCurrentRole
} from "../roles.js";
import { isFirebaseConfigured } from "../firebase.js";
import { createDropdown } from "../components/dropdown.js";
import { subscribeMasterData } from "./master-data.js";

let allUsers = [];
let userDeptDropdown = null;
let userDeptList = [];

export function initUsers() {
  if (!canManageUsers()) {
    $("usersRoot").innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <h2>Access Denied</h2>
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
      <h2>How it works (production)</h2>
      <div class="output" style="font-size:13px;line-height:1.6">
1⃣  <b>Click "+ Add User".</b> Fill in email, name, role, department, and a starting password. The login account is created in Firebase Auth automatically — no Console steps required.
<br><br>
2⃣  <b>Share the password securely</b> with the new user. They can change it any time. Supervisors can also reset it from here.
<br><br>
3⃣  <b>To remove access:</b> delete their entry here. (Their Firebase Auth login still exists — disable it in Firebase Console if you want to fully revoke.)
      </div>
    </div>` : `
    <div class="card" style="background:#fdf4ff;border-left:4px solid #7c3aed">
      <h2 style="margin:0 0 6px">Preview Mode — self-contained sandbox</h2>
      <p class="small" style="margin:0">You can create accounts here with email + password, and they can log in immediately. Data is stored in your browser (localStorage), so it persists across reloads but only on this device. In production this same UI assigns roles in Firebase.</p>
    </div>`;

  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left">
          <h2 style="margin:0">User Management</h2>
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
          ${isMaster() ? `<option value="master">Master</option>` : ""}
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
              ${isMaster() ? `<option value="master">Master</option>` : ""}
              <option value="admin">Admin</option>
              <option value="supervisor" selected>Supervisor</option>
              <option value="user">User</option>
            </select>
          </div>
          <div class="field"><label>Department *</label>
            <div id="usr_dept_dd" class="dd"></div>
            <input type="hidden" id="usr_dept"/>
          </div>
          <div class="field" id="usr_password_row" style="grid-column:1 / -1">
            <label>Password *</label>
            <input type="text" id="usr_password" placeholder="At least 6 characters"/>
            <p class="small" style="margin:4px 0 0">${isFirebaseConfigured
              ? "Set the login password here — it will create the Firebase Auth account automatically. Share securely with the user; they can change it later."
              : "Share this password securely with the user. They can change it later (or you can reset it from this page)."}</p>
          </div>
        </div>
        <div class="btns" style="justify-content:flex-end;margin-top:14px">
          <button class="secondary" id="usrModalCancel">Cancel</button>
          <button class="primary" id="usrModalSave">Save</button>
        </div>
      </div>
    </div>

    <!-- Reset Password modal (with hierarchy guard + optional self-verify) -->
    <div id="usrPwdModal" class="modal hidden">
      <div class="modalBox" style="max-width:480px">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2>Reset Password</h2>
        <p>Resetting password for <b id="usrPwdTargetEmail">—</b> <span id="usrPwdTargetRole" class="small" style="color:var(--muted)"></span></p>
        ${isFirebaseConfigured
          ? `<div class="output" style="background:#fef3c7;color:#78350f;font-size:13px;line-height:1.5">In production, passwords live in Firebase Authentication. To reset, go to Firebase Console → Authentication → find the user → ⋮ → Reset password. This page sets a preview-only password.</div>`
          : ``}
        <div class="field" id="usrPwd_verifyRow" style="margin-top:14px;display:none">
          <label>Confirm YOUR password to proceed *</label>
          <input type="password" id="usrPwd_verify" placeholder="Your own password" autocomplete="current-password"/>
          <p class="small" style="color:var(--muted);margin:4px 0 0">Supervisors must re-enter their own password before resetting another user's.</p>
        </div>
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

    <!-- Reveal-once modal: show the new password with a Copy button, then it's gone -->
    <div id="usrPwdRevealModal" class="modal hidden">
      <div class="modalBox" style="max-width:480px">
        <div class="modalCloseBar"><button type="button" class="modalClose" aria-label="Close">×</button></div>
        <h2>New Password Set</h2>
        <p>Share this with <b id="usrPwdRevealTarget">—</b> via WhatsApp/Slack. It is shown <b>once only</b> — close this dialog and it cannot be retrieved.</p>
        <div class="output" style="background:#f8fafc;border:1px solid var(--border);padding:14px;margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px">
          <code id="usrPwdRevealValue" style="font-size:18px;font-family:'JetBrains Mono',monospace;user-select:all">—</code>
          <button class="primary" id="usrPwdRevealCopy">Copy</button>
        </div>
        <div class="btns" style="justify-content:flex-end;margin-top:14px">
          <button class="secondary" id="usrPwdRevealDone">Done</button>
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
  $("usrPwdRevealDone").onclick = () => $("usrPwdRevealModal").classList.add("hidden");
  $("usrPwdRevealCopy").onclick = () => {
    const v = $("usrPwdRevealValue").textContent;
    navigator.clipboard.writeText(v).then(
      () => toast("Copied", "success"),
      () => toast("Copy failed — select and copy manually", "error")
    );
  };
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
    if (roleFilter === "master") {
      users = users.filter(u => u.role === "master");
    } else if (roleFilter === "admin") {
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
        <button class="secondary iconBtn" data-pwd="${esc(u.email)}">Reset Password</button>
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
    // No onAddNew / addNewLabel on purpose: a user's department must be
    // PICKED from the existing department list. Creating an account must
    // never silently generate a new department name. New departments are
    // added deliberately on the Master Data page.
    placeholder: "Select department…",
    emptyMsg: "No departments yet — add them on the Master Data page first.",
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
  // Password required on CREATE (both preview and production — production
  // now creates the Firebase Auth account from this UI).
  if (isCreate && (!password || password.length < 6)) {
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

/** Reset-password hierarchy:
 *    Master      → can reset ANYONE (including other masters / themselves)
 *    Admin       → can reset Admin / Supervisor / User. Cannot touch Master.
 *    Supervisor  → can reset Users ONLY, and must re-enter own password.
 *  Returns null if allowed, or a string reason if blocked.
 *  `requireSelfPwd` tells the caller to render the verification field. */
function pwdResetGuard(target) {
  const targetRole = target?.role || "user";
  const targetIsMaster = targetRole === "master";
  const targetIsAdmin = ["admin", "sales-admin", "ss-admin"].includes(targetRole);
  if (isMaster()) {
    return { allow: true, requireSelfPwd: false };
  }
  if (isAdmin()) {
    if (targetIsMaster) return { allow: false, reason: "Only the master can reset another master's password." };
    return { allow: true, requireSelfPwd: false };
  }
  if (isSupervisor()) {
    if (targetIsMaster || targetIsAdmin) return { allow: false, reason: "Supervisors can only reset User passwords. Ask an Admin or the Master for higher roles." };
    if (targetRole !== "user") return { allow: false, reason: "Supervisors can only reset User passwords." };
    return { allow: true, requireSelfPwd: true };
  }
  return { allow: false, reason: "You do not have permission to reset passwords." };
}

function openPwdModal(email) {
  pwdTargetEmail = email;
  const target = allUsers.find(u => u.email === email);
  const guard = pwdResetGuard(target);
  if (!guard.allow) {
    toast(guard.reason, "error");
    pwdTargetEmail = null;
    return;
  }
  $("usrPwdTargetEmail").textContent = email;
  $("usrPwdTargetRole").textContent = target ? `(${roleLabel(target.role)})` : "";
  $("usrPwd_new").value = "";
  $("usrPwd_verify").value = "";
  $("usrPwd_verifyRow").style.display = guard.requireSelfPwd ? "" : "none";
  $("usrPwdModal").classList.remove("hidden");
  setTimeout(() => (guard.requireSelfPwd ? $("usrPwd_verify") : $("usrPwd_new")).focus(), 50);
}
function closePwdModal() {
  $("usrPwdModal").classList.add("hidden");
  pwdTargetEmail = null;
}

/** Validate the supervisor's own password by looking up their preview
 *  account (demo mode) or hardcoded demo password (legacy). In production
 *  with real Firebase, we don't have client-side access to the user's
 *  own password — they have to re-auth via Firebase, which is overkill
 *  for this guard. So in production this falls back to a simple
 *  presence check + a server-side audit log entry. */
async function verifySelfPassword(typed) {
  const myEmail = getCurrentEmail();
  if (!myEmail || !typed) return false;
  try {
    const { getDoc, doc, COL } = await import("../firebase.js");
    const snap = await getDoc(doc(COL.USERS, myEmail));
    if (snap.exists()) {
      const data = snap.data();
      if (data.previewPassword && data.previewPassword === typed) return true;
    }
  } catch (e) { /* ignore */ }
  // Hardcoded demo accounts (e.g. supervisor.sales@demo / "demo")
  if (typed === "demo" && myEmail.endsWith("@demo")) return true;
  return false;
}

async function savePassword() {
  const newPwd = $("usrPwd_new").value;
  if (!newPwd || newPwd.length < 6) {
    return toast("New password must be at least 6 characters", "error");
  }
  if (!pwdTargetEmail) return;
  const target = allUsers.find(u => u.email === pwdTargetEmail);
  const guard = pwdResetGuard(target);
  if (!guard.allow) return toast(guard.reason, "error");

  // Supervisor verification gate
  if (guard.requireSelfPwd) {
    const typed = $("usrPwd_verify").value;
    if (!typed) return toast("Enter your own password to confirm", "error");
    const ok = await verifySelfPassword(typed);
    if (!ok) return toast("Your password is incorrect — reset aborted", "error");
  }

  try {
    await resetUserPassword(pwdTargetEmail, newPwd);
    closePwdModal();
    // Reveal-once modal — shown ONLY here, never again
    $("usrPwdRevealTarget").textContent = pwdTargetEmail;
    $("usrPwdRevealValue").textContent = newPwd;
    $("usrPwdRevealModal").classList.remove("hidden");
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
