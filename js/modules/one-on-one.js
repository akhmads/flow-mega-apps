// ============================================================
// FLOW Mega Apps — 1-on-1 Summarizer
//
// Wizard for running structured 1-on-1 sessions with team members.
// 4 steps:
//   1. Pick team member (from real users in the system)
//   2. Rate 5 dimensions on 1-5 scale
//   3. Answer department-specific personal + work questions
//   4. Generate AI summary (via Gemini API) or structured fallback
//
// Sessions saved to Firestore (collection: one_on_ones) for history.
// AI summary uses the Gemini API if the user has set their key
// in localStorage (`flow.gemini.apiKey`); otherwise generates a
// clean structured report client-side.
// ============================================================

import {
  COL, addDocument, subscribeCollection, orderBy, getDoc, doc
} from "../firebase.js";
import {
  $, esc, toast, friendlyDate, today, downloadXLSX
} from "../utils.js";
import { getCurrentEmail, getCurrentProfile, listUsers, canAccess1on1 } from "../roles.js";
import { getOneOnOneQuestions } from "./master-data.js";

// ---------------- DATA ----------------
const RATINGS = [
  { key: "beban",      label: "Beban Kerja (Workload)",     desc: "1 = Sangat Ringan · 5 = Sangat Berat" },
  { key: "kepuasan",   label: "Kepuasan Kerja",              desc: "1 = Tidak Puas · 5 = Sangat Puas" },
  { key: "energi",     label: "Energi & Mood",               desc: "1 = Sangat Rendah · 5 = Sangat Tinggi" },
  { key: "kolaborasi", label: "Kolaborasi Tim",              desc: "1 = Sangat Buruk · 5 = Sangat Baik" },
  { key: "motivasi",   label: "Motivasi",                    desc: "1 = Sangat Rendah · 5 = Sangat Tinggi" }
];

// Personal questions FALLBACK — used only when Master Data has no personal questions yet
const FALLBACK_PERSONAL_QUESTIONS = [
  "Bagaimana kondisi kamu secara keseluruhan belakangan ini?",
  "Bagaimana keseimbangan antara pekerjaan dan kehidupan pribadi kamu saat ini?",
  "Apa yang paling membuatmu semangat datang kerja belakangan ini?",
  "Adakah hal di luar pekerjaan yang sedang memengaruhi fokus atau energimu?",
  "Hal baru apa yang sedang kamu pelajari atau minati?",
  "Bagaimana hubungan kamu dengan rekan-rekan tim saat ini?",
  "Apakah ada yang bisa saya lakukan lebih baik untuk mendukung kamu?"
];

// Work questions FALLBACK by dept (used only when Master Data has nothing for the dept)
const FALLBACK_WORK_BY_DEPT = {
  "Sales": [
    "Bagaimana kondisi pipeline sales kamu saat ini? Ada deals prioritas?",
    "Seberapa jauh pencapaianmu terhadap target bulan ini? Apa rencana untuk gap yang ada?",
    "Apa tantangan terbesar dalam closing deals belakangan ini?",
    "Adakah klien atau prospek yang berisiko lost? Apa strateginya?",
    "Bagaimana kamu mengelola follow-up dengan leads dari marketing?",
    "Adakah support atau resource tambahan yang kamu butuhkan?",
    "Apa strategi utamamu untuk quarter berikutnya?",
    "Skill apa yang ingin kamu kembangkan untuk naik level dalam sales?",
    "Adakah feedback dari klien mengenai produk/layanan yang perlu disampaikan?"
  ],
  "Sales Support": [
    "Bagaimana workload kamu saat ini? Apakah ada yang terasa terlalu berat?",
    "Adakah proses atau prosedur yang perlu diperbaiki untuk efisiensi lebih baik?",
    "Bagaimana koordinasimu dengan tim Sales? Adakah friction yang perlu diselesaikan?",
    "Apa hambatan paling sering dalam mendukung aktivitas Sales sehari-hari?",
    "Apakah tools atau sistem yang digunakan sudah cukup mendukung pekerjaanmu?",
    "Bagaimana kamu memprioritaskan pekerjaan ketika ada banyak permintaan bersamaan?",
    "Apakah ada feedback dari tim Sales tentang support yang kamu berikan?",
    "Bagaimana kamu memastikan akurasi data dan dokumen yang kamu proses?",
    "Skill atau pengetahuan apa yang ingin kamu tingkatkan dalam peranmu saat ini?"
  ],
  "Marketing": [
    "Bagaimana performa campaign digital bulan ini dibanding target? Channel mana terbaik?",
    "Adakah insight dari analytics yang perlu kita tindaklanjuti?",
    "Bagaimana kualitas leads yang dihasilkan menurut feedback Sales?",
    "Konten atau format apa yang perform baik? Ada eksperimen baru yang ingin dicoba?",
    "Tren digital marketing terbaru apa yang relevan dan ingin kamu terapkan?",
    "Apa tantangan terbesar dalam eksekusi campaign saat ini?",
    "Apakah budget dan resource sudah cukup untuk mencapai target?",
    "Sertifikasi, tool, atau skill digital apa yang ingin kamu kuasai berikutnya?"
  ]
};

const GENERIC_WORK_QUESTIONS = [
  "Bagaimana workload kamu saat ini? Apakah ada yang terasa terlalu berat?",
  "Apa pencapaian terbesar kamu di periode ini?",
  "Apa tantangan paling besar di pekerjaan saat ini?",
  "Adakah proses atau tool yang perlu diperbaiki untuk efisiensi?",
  "Bagaimana koordinasi kamu dengan departemen lain?",
  "Apakah ada support atau resource tambahan yang kamu butuhkan?",
  "Skill atau pengetahuan apa yang ingin kamu kembangkan?",
  "Apa goal utama kamu untuk quarter berikutnya?"
];

// Live readers — pull from master data, fall back to hardcoded
function getPersonalQuestions() {
  const fromMaster = getOneOnOneQuestions({ type: "personal" });
  if (fromMaster.length) return fromMaster.map(q => q.text);
  return FALLBACK_PERSONAL_QUESTIONS;
}

function getWorkQuestions(department) {
  const fromMaster = getOneOnOneQuestions({ type: "work", department: department || "" });
  if (fromMaster.length) return fromMaster.map(q => q.text);
  return FALLBACK_WORK_BY_DEPT[department] || GENERIC_WORK_QUESTIONS;
}

// Backwards-compat shims (kept as live getters)
const PERSONAL_QUESTIONS = new Proxy([], {
  get(_, prop) {
    const arr = getPersonalQuestions();
    if (prop === "length") return arr.length;
    if (prop === "forEach") return arr.forEach.bind(arr);
    if (prop === "map") return arr.map.bind(arr);
    if (prop === "filter") return arr.filter.bind(arr);
    if (typeof prop === "string" && !isNaN(prop)) return arr[prop];
    return arr[prop];
  }
});

// ---------------- STATE ----------------
let allMembers = [];
let pastSessions = [];
let state = { member: null, ratings: {}, answers: { personal: {}, work: {} }, lastSummary: null };
let currentStep = 1;
// Signature of the (member + ratings + answers) the cached summary was
// built from. If inputs change, we regenerate; if step 4 is revisited
// with unchanged inputs, we reuse the cached summary instead of burning
// another Gemini API call.
let _summarySig = null;
function _currentInputSig() {
  return JSON.stringify({
    m: state.member?.email,
    r: state.ratings,
    a: state.answers
  });
}

// ---------------- INIT ----------------
export function initOneOnOne() {
  if (!canAccess1on1()) {
    $("oneOnOneRoot").innerHTML = `
      <div class="card" style="text-align:center;padding:48px">
        <h2>Access Denied</h2>
        <p>1-on-1 Summarizer is for Admins and Supervisors only.</p>
      </div>`;
    return;
  }
  $("oneOnOneRoot").innerHTML = renderShell();
  bindEvents();
  loadMembers();
  subscribeCollection(COL.ONE_ON_ONES, (rows) => {
    pastSessions = rows.sort((a, b) => (b.sessionAtMs || 0) - (a.sessionAtMs || 0));
    if (state.member) renderPastSessions();
  }, orderBy("sessionAtMs", "desc"));
}

async function loadMembers() {
  try {
    allMembers = await listUsers();
    // Don't include yourself
    const me = getCurrentEmail();
    allMembers = allMembers.filter(u => u.email !== me);
    renderMemberGrid();
  } catch (e) {
    console.error(e);
    toast("Failed to load team: " + e.message, "error");
  }
}

function renderShell() {
  return `
    <div class="card">
      <div class="pmHeaderActions">
        <div class="left">
          <h2 style="margin:0">1-on-1 Summarizer</h2>
          <p style="color:var(--muted);margin:6px 0 0">Structured 1-on-1 sessions with your team. Rate workload, ask role-specific questions, generate an AI summary for management review.</p>
        </div>
      </div>
      <div class="o1oSteps">
        <div class="o1oStep active" data-stepnum="1">
          <span class="o1oStepNum">1</span>
          <div><b>Pick Member</b><br><span class="small">Siapa yang di-review?</span></div>
        </div>
        <div class="o1oStep" data-stepnum="2">
          <span class="o1oStepNum">2</span>
          <div><b>Rate Satisfaction</b><br><span class="small">Skor 1-5</span></div>
        </div>
        <div class="o1oStep" data-stepnum="3">
          <span class="o1oStepNum">3</span>
          <div><b>Answer Questions</b><br><span class="small">Hasil diskusi</span></div>
        </div>
        <div class="o1oStep" data-stepnum="4">
          <span class="o1oStepNum">4</span>
          <div><b>Generate Summary</b><br><span class="small">AI ringkasan</span></div>
        </div>
      </div>
    </div>

    <!-- STEP 1: Pick Member -->
    <div class="card o1oPane" data-pane="1">
      <h2>Step 1 — Pilih Member</h2>
      <p class="small" style="color:var(--muted)">Click on a team member to start the session.</p>
      <div class="o1oMemberGrid" id="o1o_memberGrid"></div>
      <div class="btns" style="margin-top:16px;justify-content:flex-end">
        <button class="primary" id="o1o_next1" disabled>Next → Rate Satisfaction</button>
      </div>
    </div>

    <!-- STEP 2: Ratings -->
    <div class="card o1oPane hidden" data-pane="2">
      <h2>Step 2 — Rate Satisfaction</h2>
      <p class="small" style="color:var(--muted)">Click stars to rate (1 = lowest, 5 = highest).</p>
      <div id="o1o_ratings"></div>
      <div class="btns" style="margin-top:16px;justify-content:space-between">
        <button class="secondary" data-goto="1">← Back</button>
        <button class="primary" data-goto="3">Next → Answer Questions</button>
      </div>
    </div>

    <!-- STEP 3: Questions -->
    <div class="card o1oPane hidden" data-pane="3">
      <h2>Step 3 — Answer Questions</h2>
      <p class="small" style="color:var(--muted)">Fill in whichever questions are relevant. Empty answers are skipped.</p>
      <div class="o1oQSection">
        <h3>Personal & Wellbeing</h3>
        <div id="o1o_personalQs"></div>
      </div>
      <div class="o1oQSection">
        <h3>Pekerjaan</h3>
        <div id="o1o_workQs"></div>
      </div>
      <div class="btns" style="margin-top:16px;justify-content:space-between">
        <button class="secondary" data-goto="2">← Back</button>
        <button class="primary" data-goto="4">Generate Summary </button>
      </div>
    </div>

    <!-- STEP 4: Summary -->
    <div class="card o1oPane hidden" data-pane="4">
      <h2>Step 4 — Summary</h2>
      <div id="o1o_summaryMeta" class="o1oSummaryMeta"></div>
      <div id="o1o_summaryBox" class="o1oSummaryBox">Generating…</div>
      <div class="btns" style="margin-top:14px;justify-content:space-between">
        <button class="secondary" data-goto="3">← Edit Answers</button>
        <div>
          <button class="secondary" id="o1o_copy">Copy</button>
          <button class="secondary" id="o1o_regen">↺ Regenerate</button>
          <button class="secondary" id="o1o_save">Save Session</button>
          <button class="primary" id="o1o_new">+ New Session</button>
        </div>
      </div>
    </div>

    <!-- Past sessions for selected member -->
    <div class="card o1oPane hidden" data-pane-pastsessions>
      <h2>Past Sessions with <span id="o1o_pastName">—</span></h2>
      <div id="o1o_pastList"></div>
    </div>
  `;
}

function bindEvents() {
  $("o1o_next1").onclick = () => goStep(2);
  document.querySelectorAll("[data-goto]").forEach(b => {
    b.addEventListener("click", () => goStep(parseInt(b.dataset.goto)));
  });
  document.querySelectorAll("[data-stepnum]").forEach(s => {
    s.addEventListener("click", () => {
      const n = parseInt(s.dataset.stepnum);
      if (n === 1 || state.member) goStep(n);
    });
  });
  $("o1o_copy").onclick = copySummary;
  $("o1o_regen").onclick = generateSummary;
  $("o1o_save").onclick = saveSession;
  $("o1o_new").onclick = newSession;
}

// ---------------- STEP NAVIGATION ----------------
function goStep(n) {
  if (n > 1 && !state.member) {
    toast("Pick a member first", "error");
    return;
  }
  // STEP 2 → 3: all 5 ratings must be set
  if (n === 3) {
    const missingRatings = RATINGS.filter(r => !state.ratings[r.key]);
    if (missingRatings.length) {
      toast(`Please rate all ${RATINGS.length} dimensions before continuing — missing: ${missingRatings.map(r => r.label).join(", ")}`, "error");
      // Highlight missing rating rows
      document.querySelectorAll(".o1oStars").forEach(row => {
        const key = row.dataset.rkey;
        row.closest(".o1oRatingRow")?.classList.toggle("missingField", !state.ratings[key]);
      });
      return;
    }
  }
  // STEP 3 → 4: all personal + all work questions must have non-empty answers
  if (n === 4) {
    const workQs = getWorkQuestionsForMember(state.member);
    const missingPersonal = [];
    PERSONAL_QUESTIONS.forEach((q, i) => {
      if (!(state.answers.personal[i] || "").trim()) missingPersonal.push(i);
    });
    const missingWork = [];
    workQs.forEach((q, i) => {
      if (!(state.answers.work[i] || "").trim()) missingWork.push(i);
    });
    if (missingPersonal.length || missingWork.length) {
      toast(`Please fill in all ${PERSONAL_QUESTIONS.length + workQs.length} questions before generating the summary — ${missingPersonal.length} personal + ${missingWork.length} work questions still empty.`, "error");
      // Highlight missing question textareas + scroll to first empty
      document.querySelectorAll("[data-qkey]").forEach(ta => {
        const qi = parseInt(ta.dataset.qi);
        const isMissing = ta.dataset.qkey === "personal"
          ? missingPersonal.includes(qi)
          : missingWork.includes(qi);
        ta.closest(".o1oQItem")?.classList.toggle("missingField", isMissing);
      });
      const firstMissing = document.querySelector(".o1oQItem.missingField");
      if (firstMissing) firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
  currentStep = n;
  document.querySelectorAll(".o1oStep").forEach((s, i) => {
    const num = i + 1;
    s.classList.remove("active", "done");
    if (num < n) s.classList.add("done");
    else if (num === n) s.classList.add("active");
  });
  document.querySelectorAll("[data-pane]").forEach(p => {
    p.classList.toggle("hidden", parseInt(p.dataset.pane) !== n);
  });

  if (n === 2) renderRatings();
  if (n === 3) renderQuestions();
  if (n === 4) {
    // Only regenerate if inputs changed since the last cached summary.
    // Going back to step 3, tweaking nothing, and forward to step 4
    // used to fire a fresh Gemini call every time — wasted tokens.
    const sig = _currentInputSig();
    if (sig !== _summarySig || !state.lastSummary) {
      _summarySig = sig;
      generateSummary();
    } else {
      // Re-render the cached summary into the box so it's visible
      // again after the pane was hidden.
      const summaryBox = $("o1o_summaryBox");
      if (summaryBox) {
        summaryBox.className = "o1oSummaryBox";
        summaryBox.textContent = state.lastSummary;
      }
    }
  }
}

// ---------------- STEP 1 ----------------
function renderMemberGrid() {
  const grid = $("o1o_memberGrid");
  if (!grid) return;
  if (!allMembers.length) {
    grid.innerHTML = `<p style="color:var(--muted)">No team members found. Add users in User Management first.</p>`;
    return;
  }
  grid.innerHTML = allMembers.map(m => `
    <button type="button" class="o1oMemberBtn" data-email="${esc(m.email)}">
      <div class="o1oAvatar">${esc(initials(m.name || m.email))}</div>
      <div class="o1oMName">${esc(m.name || m.email.split("@")[0])}</div>
      <div class="o1oMRole">${esc(m.department || "—")}</div>
    </button>
  `).join("");
  grid.querySelectorAll(".o1oMemberBtn").forEach(b =>
    b.addEventListener("click", () => selectMember(b.dataset.email)));
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function selectMember(email) {
  const m = allMembers.find(x => x.email === email);
  if (!m) return;
  state.member = m;
  state.ratings = {};
  state.answers = { personal: {}, work: {} };
  document.querySelectorAll(".o1oMemberBtn").forEach(b =>
    b.classList.toggle("selected", b.dataset.email === email));
  $("o1o_next1").disabled = false;
  renderPastSessions();
}

function renderPastSessions() {
  if (!state.member) return;
  const pane = document.querySelector("[data-pane-pastsessions]");
  if (!pane) return;
  $("o1o_pastName").textContent = state.member.name || state.member.email;
  const mine = pastSessions.filter(s => s.memberEmail === state.member.email);
  if (!mine.length) {
    pane.classList.add("hidden");
    return;
  }
  pane.classList.remove("hidden");
  $("o1o_pastList").innerHTML = mine.slice(0, 5).map(s => `
    <div class="o1oPastItem">
      <div>
        <b>${esc(friendlyDate(s.sessionAt))}</b>
        <span class="small" style="color:var(--muted)">· Avg ${s.avgScore ?? "—"}/5 · ${(s.summary || "").length} chars</span>
      </div>
      <div class="small" style="color:var(--muted);margin-top:4px">${esc((s.summary || "").slice(0, 200))}…</div>
    </div>
  `).join("");
}

// ---------------- STEP 2 ----------------
function renderRatings() {
  const wrap = $("o1o_ratings");
  if (!wrap) return;
  wrap.innerHTML = RATINGS.map(r => `
    <div class="o1oRatingRow">
      <div>
        <b>${esc(r.label)}</b>
        <div class="small" style="color:var(--muted)">${esc(r.desc)}</div>
      </div>
      <div class="o1oStars" data-rkey="${r.key}">
        ${[1, 2, 3, 4, 5].map(n =>
          `<button type="button" class="o1oStar ${(state.ratings[r.key] || 0) >= n ? "on" : ""}" data-val="${n}">${n}</button>`
        ).join("")}
      </div>
    </div>
  `).join("");
  wrap.querySelectorAll(".o1oStar").forEach(btn =>
    btn.addEventListener("click", () => {
      const row = btn.closest(".o1oStars");
      const key = row.dataset.rkey;
      state.ratings[key] = parseInt(btn.dataset.val);
      row.querySelectorAll(".o1oStar").forEach(s =>
        s.classList.toggle("on", parseInt(s.dataset.val) <= state.ratings[key]));
      row.closest(".o1oRatingRow")?.classList.remove("missingField");
    }));
}

// ---------------- STEP 3 ----------------
function getWorkQuestionsForMember(member) {
  return getWorkQuestions(member?.department);
}

function renderQuestions() {
  $("o1o_personalQs").innerHTML = PERSONAL_QUESTIONS.map((q, i) => `
    <div class="o1oQItem">
      <label>${i + 1}. ${esc(q)}</label>
      <textarea data-qkey="personal" data-qi="${i}" rows="2" placeholder="Catatan singkat…">${esc(state.answers.personal[i] || "")}</textarea>
    </div>
  `).join("");
  const workQs = getWorkQuestionsForMember(state.member);
  $("o1o_workQs").innerHTML = workQs.map((q, i) => `
    <div class="o1oQItem">
      <label>${i + 1}. ${esc(q)}</label>
      <textarea data-qkey="work" data-qi="${i}" rows="2" placeholder="Catatan singkat…">${esc(state.answers.work[i] || "")}</textarea>
    </div>
  `).join("");
  document.querySelectorAll("[data-qkey]").forEach(ta =>
    ta.addEventListener("input", () => {
      state.answers[ta.dataset.qkey][ta.dataset.qi] = ta.value;
      if (ta.value.trim()) ta.closest(".o1oQItem")?.classList.remove("missingField");
    }));
}

// ---------------- AI KEY RESOLUTION ----------------
// Cached for the page session to avoid a Firestore read on every
// regenerate. Cleared by reload.
let _orgAiKeyCache = undefined;   // undefined = not fetched yet, null = fetched + empty
async function resolveAiKey() {
  if (_orgAiKeyCache === undefined) {
    try {
      const snap = await getDoc(doc("app_settings", "global"));
      _orgAiKeyCache = (snap && snap.exists && snap.exists() && snap.data().aiApiKey) || null;
    } catch (e) {
      _orgAiKeyCache = null;
    }
  }
  return _orgAiKeyCache || localStorage.getItem("flow.gemini.apiKey") || null;
}

// ---------------- STEP 4 — SUMMARY ----------------
async function generateSummary() {
  const m = state.member;
  if (!m) return;
  const scores = Object.values(state.ratings).filter(v => v > 0);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const todayStr = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  $("o1o_summaryMeta").innerHTML = `
    <div class="o1oMetaRow">
      <span class="o1oMetaPill">${esc(m.name || m.email)}</span>
      <span class="o1oMetaPill">${esc(m.department || "—")}</span>
      <span class="o1oMetaPill">${esc(todayStr)}</span>
      <span class="o1oMetaPill ${avg >= 4 ? "scoreHigh" : avg >= 3 ? "scoreOk" : avg >= 2 ? "scoreMid" : "scoreLow"}">Avg ${avg}/5</span>
    </div>
  `;

  const summaryBox = $("o1o_summaryBox");
  summaryBox.className = "o1oSummaryBox loading";
  summaryBox.textContent = "Generating summary…";

  // Key resolution order:
  //   1. Org-wide key from Firestore /app_settings/global.aiApiKey
  //      (set once by master via Master Console — preferred)
  //   2. Per-browser localStorage key (legacy fallback)
  //   3. None → template-only summary
  const apiKey = await resolveAiKey();
  const prompt = buildPrompt(m, todayStr);

  if (apiKey) {
    // 30s ceiling so a hung Gemini call doesn't leave the UI stuck
    // on "Generating summary…" forever — we fall through to the
    // template fallback instead.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1500 }
          }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "(empty response)";
      summaryBox.className = "o1oSummaryBox";
      summaryBox.textContent = text;
      state.lastSummary = text;
      return;
    } catch (e) {
      clearTimeout(timeoutId);
      const reason = e.name === "AbortError" ? "timed out after 30s" : e.message;
      console.warn("AI summary failed, falling back to template:", reason);
      toast("AI summary failed (" + reason + "), using template fallback", "error");
    }
  }

  // Fallback — structured template summary, no AI
  const fallback = buildFallbackSummary(m, todayStr);
  summaryBox.className = "o1oSummaryBox";
  summaryBox.textContent = fallback;
  state.lastSummary = fallback;
}

function buildPrompt(m, todayStr) {
  const ratingText = RATINGS.map(r => `- ${r.label}: ${state.ratings[r.key] || "tidak diisi"}/5`).join("\n");
  const scores = Object.values(state.ratings).filter(v => v > 0);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "tidak diisi";

  const personalQA = PERSONAL_QUESTIONS.map((q, i) => {
    const ans = state.answers.personal[i];
    return ans ? `Q: ${q}\nA: ${ans}` : null;
  }).filter(Boolean).join("\n\n");

  const workQs = getWorkQuestionsForMember(m);
  const workQA = workQs.map((q, i) => {
    const ans = state.answers.work[i];
    return ans ? `Q: ${q}\nA: ${ans}` : null;
  }).filter(Boolean).join("\n\n");

  return `Kamu adalah HR Business Partner yang berpengalaman. Buat ringkasan hasil sesi 1-on-1 yang komprehensif untuk keperluan review manajemen.

DATA KARYAWAN:
- Nama: ${m.name || m.email}
- Department: ${m.department || "—"}
- Tanggal Sesi: ${todayStr}

SKOR KEPUASAN (skala 1-5):
${ratingText}
- Rata-rata Skor: ${avg}/5

JAWABAN SESI PERSONAL:
${personalQA || "(tidak ada jawaban yang diisi)"}

JAWABAN SESI PEKERJAAN:
${workQA || "(tidak ada jawaban yang diisi)"}

Buat ringkasan dengan format berikut (Bahasa Indonesia, nada profesional):

**RINGKASAN EKSEKUTIF**
[2-3 kalimat gambaran umum kondisi karyawan]

**KONDISI PERSONAL & WELLBEING**
[Poin-poin penting dari aspek personal, work-life balance, motivasi]

**PERFORMA & TANTANGAN PEKERJAAN**
[Poin-poin kunci dari sisi pekerjaan, hambatan, dan peluang]

**TINGKAT KEPUASAN & BEBAN KERJA**
[Analisis singkat dari skor kepuasan, flag jika ada area kritis]

**REKOMENDASI & TINDAK LANJUT**
[3-5 action item konkret yang perlu diambil oleh manager atau HR]

**FLAG UNTUK MANAJEMEN**
[Highlight hal-hal kritis yang perlu perhatian segera, atau "Tidak ada flag kritis" jika kondisi baik]

Maksimum 600 kata. Actionable dan objektif.`;
}

function buildFallbackSummary(m, todayStr) {
  const ratingText = RATINGS.map(r => `- ${r.label}: ${state.ratings[r.key] || "—"}/5`).join("\n");
  const scores = Object.values(state.ratings).filter(v => v > 0);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const personalQA = PERSONAL_QUESTIONS.map((q, i) => {
    const ans = state.answers.personal[i];
    return ans ? `\n• ${q}\n  → ${ans}` : null;
  }).filter(Boolean).join("");
  const workQs = getWorkQuestionsForMember(m);
  const workQA = workQs.map((q, i) => {
    const ans = state.answers.work[i];
    return ans ? `\n• ${q}\n  → ${ans}` : null;
  }).filter(Boolean).join("");
  const lowScores = RATINGS.filter(r => (state.ratings[r.key] || 0) > 0 && state.ratings[r.key] <= 2);
  const flagText = lowScores.length
    ? `FLAG: ${lowScores.map(r => r.label + " (" + state.ratings[r.key] + "/5)").join(", ")}`
    : "Tidak ada flag kritis dari skor.";

  return `1-on-1 SESSION REPORT
======================
Member       : ${m.name || m.email}
Department   : ${m.department || "—"}
Date         : ${todayStr}
Conducted by : ${getCurrentProfile()?.name || getCurrentEmail() || "—"}

SATISFACTION SCORES
${ratingText}
Average: ${avg}/5

${flagText}

PERSONAL & WELLBEING${personalQA || "\n(tidak ada jawaban diisi)"}

WORK${workQA || "\n(tidak ada jawaban diisi)"}

──────────────────────
Note: This is a template-only summary. Ask the master to set the org-wide Gemini API key (Master Console → AI) to enable AI-generated executive summaries with recommendations and management flags.`;
}

// ---------------- ACTIONS ----------------
function copySummary() {
  const text = $("o1o_summaryBox").textContent;
  navigator.clipboard.writeText(text).then(
    () => toast("Copied to clipboard", "success"),
    () => toast("Copy failed", "error")
  );
}

async function saveSession() {
  if (!state.member || !state.lastSummary) {
    return toast("Generate a summary first", "error");
  }
  const scores = Object.values(state.ratings).filter(v => v > 0);
  const avg = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null;
  // Snapshot the question text alongside the answers. Without this,
  // editing a question in Master Data later orphans the answer indexes
  // in past sessions (you'd see answers but not know which question
  // each one was for). The snapshot keeps every saved session
  // self-contained and human-readable forever.
  const workQs = getWorkQuestionsForMember(state.member);
  const questionsSnapshot = {
    personal: [...PERSONAL_QUESTIONS],
    work: workQs
  };
  try {
    await addDocument(COL.ONE_ON_ONES, {
      memberEmail: state.member.email,
      memberName: state.member.name || state.member.email,
      memberDept: state.member.department || "",
      sessionAt: today(),
      sessionAtMs: Date.now(),
      ratings: state.ratings,
      answers: state.answers,
      questionsSnapshot,
      summary: state.lastSummary,
      avgScore: avg,
      conductedBy: getCurrentEmail()
    });
    toast(`Session saved for ${state.member.name}`, "success");
  } catch (e) {
    toast("Save failed: " + e.message, "error");
  }
}

function newSession() {
  state = { member: null, ratings: {}, answers: { personal: {}, work: {} }, lastSummary: null };
  _summarySig = null;
  $("o1o_next1").disabled = true;
  document.querySelectorAll(".o1oMemberBtn").forEach(b => b.classList.remove("selected"));
  goStep(1);
  toast("Ready for new session", "");
}

// API Key dialog removed in v3.10 — keys are now centrally managed
// by the master via Master Console → AI. See resolveAiKey() above.
