// === adminCommands.js ======================================================
// Verarbeitet Slash-Commands im Livechat und ruft Cloud Function "adminSlash" auf

import { db } from "./firebaseauth.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const functions = getFunctions();
const auth = getAuth();

/**
 * Wird im Chat-Formular aufgerufen, wenn der User etwas abschickt
 */
export async function handleChatSubmit(rawMessage) {
  const user = auth.currentUser;
  if (!user) {
    addSystemMessage("⚠️ Bitte zuerst einloggen.");
    return;
  }

  const trimmed = String(rawMessage || "").trim();
  if (!trimmed) return;

  // --- Prüfe, ob es ein Slash-Command ist
  if (trimmed.startsWith("/")) {
    await handleAdminCommand(trimmed);
    return;
  }

  // --- Wenn kein Command → normale Nachricht senden
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const username = userData.username || user.displayName || "Unbekannt";

  // Falls User gemutet ist → blockieren
  const mutedUntil = userData.mutedUntil?.toMillis?.() || 0;
  if (mutedUntil > Date.now()) {
    const untilDate = new Date(mutedUntil).toLocaleString();
    addSystemMessage(`🔇 Du bist bis ${untilDate} stumm geschaltet.`);
    return;
  }

  await addDoc(collection(db, "chatMessages"), {
    author: username,
    uid: user.uid,
    text: trimmed,
    timestamp: serverTimestamp(),
  });
}

/**
 * Handhabt Slash-Commands (nur Admins dürfen, aber Cloud Function prüft das selbst)
 */
async function handleAdminCommand(command) {
  try {
    const call = httpsCallable(functions, "adminSlash");
    const res = await call({ command });
    const msg = res.data?.message || "✅ Befehl ausgeführt.";
    addSystemMessage(msg);
  } catch (err) {
    console.error(err);
    addSystemMessage(`❌ Fehler: ${err.message}`);
  }
}

/**
 * Fügt eine Systemnachricht im Chat hinzu (grau oder italic)
 */
export function addSystemMessage(text) {
  const feed = document.querySelector(".chat-feed");
  if (!feed) {
    console.warn("chat-feed Element fehlt");
    return;
  }

  const msg = document.createElement("div");
  msg.classList.add("chat-message", "system-message");
  msg.innerHTML = `<em>${escapeHtml(text)}</em>`;
  feed.appendChild(msg);
  feed.scrollTop = feed.scrollHeight;
}

/**
 * HTML Escaping für Sicherheit
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}