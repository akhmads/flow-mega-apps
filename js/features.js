// ============================================================
// FLOW Mega Apps — Feature Flags + App Version
//
// Optional features that can be turned on/off in one place.
// Flip a flag to false to completely remove that feature's UI.
//
// RUNTIME OVERRIDES: the Debug Panel can flip a flag without a code
// change — it writes to localStorage("flow.featureOverrides"), which
// is merged over the defaults below at load time. Clearing that key
// (Debug Panel → Clear Cache) restores these defaults.
// ============================================================

const DEFAULTS = {
  // Attachments on Issues and Tickets. When false, no attachment
  // field appears in the modals and existing attachments are ignored.
  attachments: true,

  // Global search box in the top bar.
  globalSearch: true,

  // Aging / SLA colour-coding on Issue and Ticket tables.
  slaHighlight: true,

  // Notification bell + nav badges for items needing attention.
  notifications: true,

  // Activity Log page (audit trail of every change).
  auditLog: true,

  // "→ Ticket" button on issues — spin an issue into an Internal Ticket.
  issueToTicket: true
};

// Runtime overrides from the Debug Panel (best-effort).
let _overrides = {};
try {
  _overrides = JSON.parse(localStorage.getItem("flow.featureOverrides") || "{}") || {};
} catch (e) {
  _overrides = {};
}

/** The default flag values — used by the Debug Panel to show which
 *  flags have been overridden. */
export const FEATURE_DEFAULTS = DEFAULTS;

/** Effective feature flags: defaults with any runtime overrides applied. */
export const FEATURES = { ...DEFAULTS, ..._overrides };

// ============================================================
// APP VERSION — shown in the Debug Panel. Bump on each release so a
// bug report can be tied to exactly what was deployed.
// ============================================================
export const APP_VERSION = "3.9.8";
export const BUILD_DATE = "2026-05-22";
