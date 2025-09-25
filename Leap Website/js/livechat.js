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
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

/* ---------- DOM ---------- */
const elMessages = document.getElementById("chat-messages");
const elForm     = document.getElementById("chat-form");
const elInput    = document.getElementById("chat-input");
const elSend     = document.getElementById("chat-send");
const elHint     = document.getElementById("chat-hint");
const elTimer    = document.getElementById("chat-timer");

if (!elMessages || !elForm || !elInput) {
  console.warn("[livechat] Chat-Elemente nicht gefunden – Script beendet.");
}

/* ---------- Helpers ---------- */
const toMillis = (v) =>
  v?.toMillis ? v.toMillis() :
  (typeof v === "number" ? v : new Date(v || Date.now()).getTime());

function formatTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

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

function setInputEnabled(enabled) {
  if (!elInput || !elSend || !elHint) return;
  elInput.disabled = !enabled;
  elSend.disabled  = !enabled;
  elHint.style.display = enabled ? "none" : "block";
}

/* ---------- Firestore ---------- */
const messagesRef   = collection(db, "messages");
const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"), limit(500));
const configRef     = doc(db, "chatConfig", "reset");

/* ---------- Global Reset-Window ---------- */
const RESET_INTERVAL = 5 * 60; // Sekunden

let currentUid   = null;
let unsubMsgs    = null;
let timerHandle  = null;

let nextResetMs  = 0; // globaler Zielzeitpunkt (ms)
let windowStartMs = 0; // sichtbares Fenster = [windowStartMs, ∞)

function updateTimerUI() {
  if (!elTimer) return;
  const remaining = Math.max(0, nextResetMs - Date.now());
  const sec = Math.ceil(remaining / 1000);
  elTimer.textContent = `${sec}s`;
}

async function ensureResetTimestamp() {
  try {
    const snap = await getDoc(configRef);
    const now = Date.now();

    if (!snap.exists()) {
      // Falls möglich global initialisieren (nur wenn eingeloggt; Rules!)
      nextResetMs = now + RESET_INTERVAL * 1000;
      await trySetGlobal({ nextReset: nextResetMs });
    } else {
      const data = snap.data();
      const raw  = data?.nextReset;
      const ms   = toMillis(raw);

      if (!ms || ms <= now) {
        // abgelaufen → neues Fenster starten (global, falls erlaubt)
        nextResetMs = now + RESET_INTERVAL * 1000;
        await trySetGlobal({ nextReset: nextResetMs });
      } else {
        nextResetMs = ms;
      }
    }
    windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    updateTimerUI();
  } catch (err) {
    console.warn("[livechat] ensureResetTimestamp() warn:", err?.message || err);
    // Fallback: lokaler Takt (nur UI), bis ein eingeloggter Client global schreibt
    if (!nextResetMs) {
      nextResetMs  = Date.now() + RESET_INTERVAL * 1000;
      windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    }
  }
}

// versucht global zu schreiben; scheitert still, wenn nicht erlaubt (z.B. nicht eingeloggt)
async function trySetGlobal(payload) {
  try {
    await setDoc(configRef, payload, { merge: true });
  } catch (e) {
    // Kein Spam im Log – es reicht, lokal mitzulaufen
    // console.debug("[livechat] trySetGlobal skipped:", e?.code || e);
  }
}

function startTimerLoop() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(async () => {
    const now = Date.now();
    if (now >= nextResetMs) {
      // neues Fenster starten
      nextResetMs  = now + RESET_INTERVAL * 1000;
      windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
      await trySetGlobal({ nextReset: nextResetMs }); // global synchron halten
      // neu rendern (Filter hat sich geändert)
      renderFromCache();
    }
    updateTimerUI();
  }, 250);
}

/* ---------- Messages Stream (immer live) ---------- */
let lastSnapshotDocs = []; // Cache der letzten Docs zum schnellen Re-Render bei Fensterwechsel

function attachMessagesStream() {
  if (unsubMsgs) { try { unsubMsgs(); } catch {} unsubMsgs = null; }

  unsubMsgs = onSnapshot(
    messagesQuery,
    (snap) => {
      // cache aktualisieren
      lastSnapshotDocs = [];
      snap.forEach((d) => lastSnapshotDocs.push(d));
      renderFromCache();
    },
    (err) => console.error("[livechat] Snapshot-Fehler:", err)
  );
}

function renderFromCache() {
  if (!elMessages) return;
  const atBottom = isNearBottom(elMessages);

  elMessages.innerHTML = "";
  for (const docSnap of lastSnapshotDocs) {
    const data = docSnap.data();
    const createdMs = toMillis(data.createdAt);
    if (!createdMs || createdMs < windowStartMs) continue; // Filter: nur aktuelles Fenster
    elMessages.appendChild(renderMessage(docSnap, currentUid));
  }

  if (atBottom) scrollToBottom(elMessages);
}

/* ---------- Beobachte globale Reset-Änderungen ---------- */
onSnapshot(configRef, (snap) => {
  if (!snap.exists()) return;
  const ms = toMillis(snap.data()?.nextReset);
  if (!ms) return;
  if (ms !== nextResetMs) {
    nextResetMs = ms;
    windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    updateTimerUI();
    renderFromCache(); // Filter ändern → neu zeichnen
  }
});

/* ---------- Auth ---------- */
onAuthStateChanged(auth, (user) => {
  currentUid = user?.uid || null;
  setInputEnabled(!!user);
});

/* ---------- Init ---------- */
(async function init() {
  await ensureResetTimestamp();
  startTimerLoop();
  attachMessagesStream();
})();

/* ---------- Senden + 3s Cooldown ---------- */
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