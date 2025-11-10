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
const functions   = getFunctions(undefined, "europe-west3");
const adminSlash  = httpsCallable(functions, "adminSlash");

/* ---------- Helpers ---------- */
const toMillis = (v) =>
  v?.toMillis ? v.toMillis() :
  (typeof v === "number" ? v : new Date(v || Date.now()).getTime());

function formatTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ---------- Mute-Cache pro User ---------- */
let lastMuteCheckUid   = null;
let cachedMuteData     = null;
let muteAlertShownOnce = false; // damit nicht bei jedem Send-Versuch 100 Alerts kommen

function showMuteAlert(data) {
  const durationText = data.perma
    ? "permanent"
    : "bis " + new Date(data.until).toLocaleString("de-DE");

  alert(
    `Du wurdest gemutet von ${data.by}.\n` +
    `Grund: ${data.reason}\n` +
    `Dauer: ${durationText}`
  );
}

async function isMutedAndShowReason() {
  const user = auth.currentUser;
  if (!user) {
    alert("Bitte zuerst einloggen.");
    return true;
  }

  // Wenn wir für diesen User schon geprüft haben → Cache verwenden
  if (lastMuteCheckUid === user.uid && cachedMuteData) {
    if (cachedMuteData.muted) {
      if (!muteAlertShownOnce) {
        showMuteAlert(cachedMuteData);
        muteAlertShownOnce = true;
      }
      return true;
    }
    return false;
  }

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    lastMuteCheckUid = user.uid;
    cachedMuteData = { muted: false };
    return false;
  }

  const data = snap.data() || {};
  const now = Date.now();

  const perma = !!data.mutedPermanent;
  const until =
    typeof data.mutedUntil === "number" ? data.mutedUntil : null;

  let muted = false;
  if (perma || (until && now < until)) {
    muted = true;
  }

  cachedMuteData = {
    muted,
    by: data.mutedByName || data.mutedBy || "Moderation",
    reason: data.muteReason || "Kein Grund angegeben",
    perma,
    until,
  };
  lastMuteCheckUid = user.uid;

  if (muted) {
    if (!muteAlertShownOnce) {
      showMuteAlert(cachedMuteData);
      muteAlertShownOnce = true;
    }
    return true;
  }
  return false;
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

  const time = formatTime(data.timestamp || data.createdAt);
  meta.textContent = `${fallbackName} • ${time}`;

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = data.text || "";

  wrap.appendChild(meta);
  wrap.appendChild(text);

  // asynchron Firestore-Username nachladen (falls fehlt)
  if (data.uid && !data.username) {
    fetchUsername(data.uid).then((realName) => {
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
  } catch {
    // ignore
  }
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
  if (unsubMsgs) {
    try { unsubMsgs(); } catch {}
    unsubMsgs = null;
  }

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

    // vom Backend gelöschte/spam-Nachrichten überspringen
    if (data.removed) continue;

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

  // Mute-Cache beim Benutzerwechsel zurücksetzen
  cachedMuteData     = null;
  lastMuteCheckUid   = null;
  muteAlertShownOnce = false;

  setInputEnabled(!!user);

  if (user?.uid) {
    const fsName = await fetchUsername(user.uid);
    currentName = fsName
      || user.displayName
      || (user.email ? user.email.split("@")[0] : "User");

    // direkt beim Login prüfen, ob der User gemutet ist
    if (await isMutedAndShowReason()) {
      elInput.disabled = true;
      elSend.disabled  = true;
    } else {
      elInput.disabled = false;
      elSend.disabled  = false;
    }
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

      // etwas freundlichere Ausgabe im Chat
      const wrap = document.createElement("div");
      wrap.className = "chat-msg system";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = "System";

      const body = document.createElement("div");
      body.className = "text";

      if (err.code === "functions/permission-denied") {
        body.textContent = "🚫 Keine Berechtigung für diesen Befehl.";
      } else if (err.code === "functions/unauthenticated") {
        body.textContent = "🔑 Bitte einloggen, um Admin-Befehle zu nutzen.";
      } else {
        body.textContent =
          "Admin-Command fehlgeschlagen: " + (err.message || String(err));
      }

      wrap.appendChild(meta);
      wrap.appendChild(body);
      elMessages.appendChild(wrap);
      scrollToBottom(elMessages);
    } finally {
      elInput.value = "";
    }
    // kein Frontend-Cooldown für Admin-Commands
    return;
  }

  // 👉 2. Normale Nachricht (Mute-Check)
  if (await isMutedAndShowReason()) {
    elInput.value = "";
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
    // 🔥 kein startCooldown() mehr → keine 3s Sperre
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