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
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";

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

// Cloud Functions (Region europe-west3 wie in functions.js)
const functions = getFunctions(undefined, "europe-west3");
const adminSlash = httpsCallable(functions, "adminSlash");

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

async function isMutedAndShowReason() {
  const user = auth.currentUser;
  if (!user) {
    alert("Bitte zuerst einloggen.");
    return true;
  }

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return false;

  const data = snap.data() || {};
  const now = Date.now();

  const perma = !!data.mutedPermanent;
  const until =
    typeof data.mutedUntil === "number" ? data.mutedUntil : null;

  // Nicht gemutet / Mute abgelaufen
  if (!perma && (!until || now >= until)) {
    return false;
  }

  const by = data.mutedByName || data.mutedBy || "Moderation";
  const reason = data.muteReason || "Kein Grund angegeben";
  const durationText = perma
    ? "permanent"
    : "bis " + new Date(until).toLocaleString("de-DE");

  alert(
    `Du wurdest gemutet von ${by}.\n` +
      `Grund: ${reason}\n` +
      `Dauer: ${durationText}`
  );
  return true;
}

/* ---------- Username-Handling ---------- */
let currentUid   = null;
let currentName  = null;
const usernameCache = new Map();

async function fetchUsername(uid) {
  if (!uid) return null;
  if (usernameCache.has(uid)) return usernameCache.get(uid);

  try {
    const snap = await getDoc(doc(db, "users", uid));
    const name = snap.exists() ? (snap.data().username || null) : null;
    if (name) usernameCache.set(uid, name);
    return name;
  } catch {
    return null;
  }
}

/* ---------- Render Messages ---------- */
function renderMessage(docSnap, myUid) {
  const data = docSnap.data();
  const me   = data.uid === myUid;

  const wrap = document.createElement("div");
  wrap.className = "chat-msg" + (me ? " me" : "");

  const meta = document.createElement("div");
  meta.className = "meta";

  const fallbackName = data.username
    || data.displayName
    || (data.email ? data.email.split("@")[0] : "User");

  const time = formatTime(data.createdAt);
  meta.textContent = `${fallbackName} • ${time}`;

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = data.text || "";

  wrap.appendChild(meta);
  wrap.appendChild(text);

  // asynchron Firestore-Username nachladen (falls fehlt)
  if (data.uid && !data.username) {
    fetchUsername(data.uid).then(realName => {
      if (realName && realName !== fallbackName) {
        meta.textContent = `${realName} • ${time}`;
      }
    });
  }

  return wrap;
}

// kleine Helper zum Scrollen
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
/**
 * WICHTIG:
 * Backend-Funktion clearChat() arbeitet mit Collection "chatMessages".
 * Deshalb nutzt der Livechat hier jetzt auch "chatMessages".
 */
const messagesRef   = collection(db, "chatMessages");
const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"), limit(500));
const configRef     = doc(db, "chatConfig", "reset");

/* ---------- Global Reset-Window ---------- */
const RESET_INTERVAL = 5 * 60; // Sekunden

let unsubMsgs     = null;
let timerHandle   = null;
let nextResetMs   = 0;
let windowStartMs = 0;

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
      nextResetMs = now + RESET_INTERVAL * 1000;
      await trySetGlobal({ nextReset: nextResetMs });
    } else {
      const data = snap.data();
      const raw  = data?.nextReset;
      const ms   = toMillis(raw);

      if (!ms || ms <= now) {
        nextResetMs = now + RESET_INTERVAL * 1000;
        await trySetGlobal({ nextReset: nextResetMs });
      } else {
        nextResetMs = ms;
      }
    }
    windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    updateTimerUI();
  } catch {
    if (!nextResetMs) {
      nextResetMs   = Date.now() + RESET_INTERVAL * 1000;
      windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    }
  }
}

async function trySetGlobal(payload) {
  try {
    await setDoc(configRef, payload, { merge: true });
  } catch {}
}

function startTimerLoop() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(async () => {
    const now = Date.now();
    if (now >= nextResetMs) {
      nextResetMs   = now + RESET_INTERVAL * 1000;
      windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
      await trySetGlobal({ nextReset: nextResetMs });
      renderFromCache();
    }
    updateTimerUI();
  }, 250);
}

/* ---------- Messages Stream ---------- */
let lastSnapshotDocs = [];

function attachMessagesStream() {
  if (unsubMsgs) { try { unsubMsgs(); } catch {} unsubMsgs = null; }

  unsubMsgs = onSnapshot(
    messagesQuery,
    (snap) => {
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
    const createdMs = toMillis(data.timestamp);
    if (!createdMs || createdMs < windowStartMs) continue;
    elMessages.appendChild(renderMessage(docSnap, currentUid));
  }

  if (atBottom) scrollToBottom(elMessages);
}

/* ---------- Beobachte Reset ---------- */
onSnapshot(configRef, (snap) => {
  if (!snap.exists()) return;
  const ms = toMillis(snap.data()?.nextReset);
  if (!ms) return;
  if (ms !== nextResetMs) {
    nextResetMs   = ms;
    windowStartMs = nextResetMs - RESET_INTERVAL * 1000;
    updateTimerUI();
    renderFromCache();
  }
});

/* ---------- Auth ---------- */
onAuthStateChanged(auth, async (user) => {
  currentUid = user?.uid || null;
  setInputEnabled(!!user);

  if (user?.uid) {
    const fsName = await fetchUsername(user.uid);
    currentName = fsName
      || user.displayName
      || (user.email ? user.email.split("@")[0] : "User");
  } else {
    currentName = null;
  }
});

/* ---------- Init ---------- */
(async function init() {
  await ensureResetTimestamp();
  startTimerLoop();
  attachMessagesStream();
})();

/* ---------- Senden + Cooldown ---------- */
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

/* ---------- Submit: Normaler Chat + Slash-Commands ---------- */
elForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = (elInput.value || "").trim();
  if (!text) return;

  const user = auth.currentUser;
  if (!user) {
    setInputEnabled(false);
    return;
  }

  // 👉 1. Admin-Slash-Commands
  if (text.startsWith("/")) {
    try {
      const result = await adminSlash({ command: text });
      const msg = result.data?.message || "OK";

      // Systemnachricht im Chat anzeigen
      const wrap = document.createElement("div");
      wrap.className = "chat-msg system";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = "System";

      const body = document.createElement("div");
      body.className = "text";
      body.textContent = msg;

      wrap.appendChild(meta);
      wrap.appendChild(body);
      elMessages.appendChild(wrap);
      scrollToBottom(elMessages);
    } catch (err) {
      console.error("[livechat] Admin-Command fehlgeschlagen:", err);
      alert("Admin-Command fehlgeschlagen: " + (err.message || err));
    } finally {
      elInput.value = "";
    }
    // kein Cooldown für Admin-Commands
    return;
  }

  // 👉 2. Normale Nachricht (Mute-Check + Cooldown)
  if (await isMutedAndShowReason()) {
    elInput.value = "";
    return;
  }

  if (!canSendNow()) {
    elInput.classList.add("deny");
    setTimeout(() => elInput.classList.remove("deny"), 150);
    return;
  }

  const safeName = currentName || (await fetchUsername(user.uid))
                 || user.displayName
                 || (user.email ? user.email.split("@")[0] : "User");

  try {
    await addDoc(messagesRef, {
      text,
      uid: user.uid,
      username: safeName,
      timestamp: serverTimestamp(), // ⚠️ hier "timestamp", weil clearChat/getLastMessages das erwarten
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