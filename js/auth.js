// ============================================================
// FLOW Mega Apps — Auth (v3.9.2)
//
// Email/password login only. No "forgot password" — supervisors
// reset passwords on the user's behalf via User Management.
// (Self-service password reset removed by request: keeps the
// account flow tight and ensures only authorized people can
// trigger a password change.)
// ============================================================

import {
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "./firebase.js";
import { $, toast } from "./utils.js";

export function initAuth(onSignedIn, onSignedOut) {
  // Bind UI
  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("loginPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });

  // Watch auth state
  onAuthStateChanged(auth, user => {
    if (user) {
      $("loginGate").classList.add("hidden");
      $("appShell").classList.remove("hidden");
      $("userBadgeEmail").textContent = user.email;
      onSignedIn?.(user);
    } else {
      $("loginGate").classList.remove("hidden");
      $("appShell").classList.add("hidden");
      onSignedOut?.();
    }
  });
}

async function login() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  if (!email || !password) {
    return showError("Email and password are required.");
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    hideError();
  } catch (e) {
    console.error(e);
    showError(humanError(e.code) || e.message);
  }
}

async function logout() {
  try {
    await signOut(auth);
    toast("Signed out", "success");
  } catch (e) {
    toast("Sign out failed", "error");
  }
}

function showError(msg, kind = "error") {
  const el = $("loginError");
  el.textContent = msg;
  el.classList.remove("hidden");
  if (kind === "info") {
    el.style.background = "#dbeafe";
    el.style.color = "#1e40af";
  } else {
    el.style.background = "";
    el.style.color = "";
  }
}

function hideError() {
  $("loginError").classList.add("hidden");
}

function humanError(code) {
  return {
    "auth/invalid-email": "That email doesn't look right.",
    "auth/user-not-found": "No account with that email. Ask a supervisor to create one for you.",
    "auth/wrong-password": "Wrong password. Ask a supervisor to reset it.",
    "auth/invalid-credential": "Invalid email or password. Ask a supervisor to verify your account.",
    "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
    "auth/network-request-failed": "Network error. Check your connection."
  }[code];
}
