// /js/livechat.js
// Einbinden: <script type="module" src="../js/livechat.js" defer></script>

import { auth, db } from "./firebaseauth.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

/* ---------- DOM ---------- */
const elMessages = document.getElementById("chat-messages");
const elForm     = document.getElementById("chat-form");
const elInput    = document.getElementById("chat-input");
const elSend     = document.getElementById("chat-send");
const elHint     = document.getElementById("chat-hint");
const elTimer    = document.getElementById("chat-timer"); // <span id="chat-timer"></span> im Header

if (!elMessages || !elForm || !elInput) {
  console.warn("[livechat] Chat-Elemente nicht gefunden – Script beendet.");
}

/* ---------- Utils ---------- */
const toMillis = (v) =>
  v?.toMillis ? v.toMillis() : (typeof v === "number" ? v : new Date(v || Date.now()).getTime());

function formatTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

/* ---------- Nachricht-Rendering ---------- */
function renderMessage(docSnap, currentUid) {
  const data = docSnap.data();
  const me   = data.uid === currentUid;

  const wrap = document.createElement("div");
  wrap.className = "chat-msg" + (me ? " me" : "");

  const meta = document.createElement("span");
  meta.className = "meta";
  const name = data.username || data.displayName || data.email || "User";
  meta.textContent = `${name} • ${formatTime(data.createdAt)}`;

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = data.text || "";

  wrap.appendChild(meta);
  wrap.appendChild(text);
  return wrap;
}

function isNearBottom(container, threshold = 80) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}
function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

/* ---------- Auth-abhängige UI ---------- */
function setInputEnabled(enabled) {
  if (!elInput || !elSend || !elHint) return;
  elInput.disabled = !enabled;
  elSend.disabled  = !enabled;
  elHint.style.display = enabled ? "none" : "block";
}

/* ==========================================================
   GLOBALER RESET (persistiert)
   - Dokument: chatConfig/reset  { nextReset: <ms since epoch> }
   - Fensterlänge: RESET_INTERVAL Sekunden
   - UI-Timer zeigt Restzeit
   - Filter: Nur Messages mit createdAt >= (nextReset - RESET_INTERVAL*1000)
========================================================== */

const RESET_INTERVAL = 5 * 60;                // 5 Minuten in Sekunden
const configRef     = doc(db, "chatConfig", "reset");
const messagesRef   = collection(db, "messages");
const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(200));

let currentUid = null;
let unsubMsgs  = null;
let timerHandle = null;
let windowStartMs = 0; // Start des aktuellen sichtbaren Fensters
let nextResetMs   = 0; // Nächster globale Reset-Zeitpunkt (ms)

/* ----- Initialisiert/verlängert nextReset falls nötig ----- */
async function ensureResetTimestamp() {
  const snap = await getDoc(configRef);
  const now = Date.now();

  if (!snap.exists()) {
    // Erstinitialisierung
    nextResetMs = now + RESET_INTERVAL * 1000;
    await setDoc(configRef, { nextReset: nextResetMs }, { merge: true });
  } else {
    const data = snap.data();
    nextResetMs = toMillis(data.nextReset);
    if (!nextResetMs || nextResetMs <= now) {
      // Fenster ist abgelaufen -> neues Fenster setzen
      nextResetMs = now + RESET_INTERVAL * 1000;
      await setDoc(configRef, { nextReset: nextResetMs }, { merge: true });
    }
  }

  // Fensterstart ist (nextReset - Intervall)
  windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
  updateTimerLabel();
}

/* ----- Timer UI (ein einziges Intervall) ----- */
function updateTimerLabel() {
  if (!elTimer) return;
  const remaining = Math.max(0, nextResetMs - Date.now());
  const sec = Math.ceil(remaining / 1000);
  elTimer.textContent = `${sec}s`;
}
function startSingleTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(async () => {
    const now = Date.now();
    if (now >= nextResetMs) {
      // Neues Fenster beginnen
      nextResetMs = now + RESET_INTERVAL * 1000;
      windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
      // Mergen reicht; mehrere Clients sind idempotent
      await setDoc(configRef, { nextReset: nextResetMs }, { merge: true });
    }
    updateTimerLabel();
  }, 250);
}

/* ----- Nachrichten-Stream (mit Fensterfilter) ----- */
function attachMessagesStream() {
  if (unsubMsgs) { try { unsubMsgs(); } catch {} unsubMsgs = null; }
  unsubMsgs = onSnapshot(
    messagesQuery,
    (snap) => {
      if (!elMessages) return;
      const atBottom = isNearBottom(elMessages);
      elMessages.innerHTML = "";
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const createdMs = toMillis(data.createdAt);
        if (createdMs >= windowStartMs) {
          elMessages.appendChild(renderMessage(docSnap, currentUid));
        }
      });
      if (atBottom) scrollToBottom(elMessages);
    },
    (err) => console.error("[livechat] Snapshot-Fehler:", err)
  );
}

/* ----- Live verfolgen, wenn reset/nextReset sich ändert ----- */
onSnapshot(configRef, (snap) => {
  if (!snap.exists()) return;
  const data = snap.data();
  const newNext = toMillis(data.nextReset);
  if (!newNext) return;
  if (newNext !== nextResetMs) {
    nextResetMs = newNext;
    windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    updateTimerLabel();
    // Query ist gleich, aber Filter (windowStartMs) hat sich geändert -> neu rendern:
    attachMessagesStream();
  }
});

/* ---------- Auth ---------- */
onAuthStateChanged(auth, async (user) => {
  currentUid = user?.uid || null;
  setInputEnabled(!!user);
});

/* ---------- Start ---------- */
(async function init() {
  await ensureResetTimestamp();
  startSingleTimer();
  attachMessagesStream();
})();

/* ---------- Cooldown (3s) ---------- */
const COOLDOWN_MS = 3000;
let lastSentMs = 0;
let cooldownTimer = null;
const SEND_ICON = "➤";
const ORIGINAL_PH = elInput?.getAttribute("placeholder") || "Nachricht…";

function startCooldown() {
  const now = Date.now();
  lastSentMs = now;
  elInput.disabled = true;
  elSend.disabled  = true;
  elInput.classList.add("cooldown");

  const end = now + COOLDOWN_MS;
  const tick = () => {
    const remaining = Math.max(0, end - Date.now());
    const sec = Math.ceil(remaining / 1000);
    elInput.value = "";
    elInput.setAttribute("placeholder", `Bitte warten… ${sec}s`);
    elSend.textContent = sec > 0 ? String(sec) : SEND_ICON;

    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      elInput.disabled = false;
      elSend.disabled  = false;
      elInput.classList.remove("cooldown");
      elInput.setAttribute("placeholder", ORIGINAL_PH);
      elSend.textContent = SEND_ICON;
      elInput.focus();
    }
  };
  tick();
  cooldownTimer = setInterval(tick, 100);
}
function canSendNow() {
  return Date.now() - lastSentMs >= COOLDOWN_MS;
}

/* ---------- Senden ---------- */
elForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = (elInput.value || "").trim();
  if (!text) return;

  const user = auth.currentUser;
  if (!user) {
    setInputEnabled(false);
    return;
  }

  if (!canSendNow()) {
    elInput.classList.add("deny");
    setTimeout(() => elInput.classList.remove("deny"), 150);
    return;
  }

  const username =
    user.displayName || (user.email ? user.email.split("@")[0] : "User");

  try {
    await addDoc(messagesRef, {
      text,
      uid: user.uid,
      username,
      createdAt: serverTimestamp(),
    });
    elInput.value = "";
    scrollToBottom(elMessages);
    startCooldown();
  } catch (err) {
    console.error("[livechat] Senden fehlgeschlagen:", err);
  }
});

/* ---------- Enter/Shift+Enter ---------- */
elInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    elForm.requestSubmit();
  }
});

/* ---------- Fokus ---------- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && auth.currentUser && !elInput.disabled) {
    elInput?.focus();
  }
});