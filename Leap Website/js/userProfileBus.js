// userProfileBus.js
// Kleine Utilities, um Profil-Änderungen überall sichtbar zu machen (auch über Tabs hinweg)

let _db = null; let _auth = null;
export function initUserBus({ db, auth }) { _db = db; _auth = auth; }

// ---------- Broadcast (lokal + über Tabs) ----------
const LS_KEY = "LEAP_USER_PROFILE_BROADCAST";
export function broadcastProfileUpdate(payload) {
  try {
    // Lokales CustomEvent
    window.dispatchEvent(new CustomEvent("leap:userProfile", { detail: payload }));
    // Cross-Tab via localStorage
    localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), ...payload }));
  } catch {}
}

// ---------- DOM-Binder: schreibt displayName in alle .usernameDisplay ----------
export function bindUsernameToDOM(selector = ".usernameDisplay") {
  const apply = (name) => {
    document.querySelectorAll(selector).forEach(el => el.textContent = name || "User");
  };

  // Sofort mit lokalem Cache befüllen (falls da)
  const cached = localStorage.getItem("displayName");
  if (cached) apply(cached);

  // Lokale Events
  window.addEventListener("leap:userProfile", (e) => {
    const name = e?.detail?.displayName;
    if (name) apply(name);
  });

  // Cross-Tab Events
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const { displayName } = JSON.parse(e.newValue);
      if (displayName) apply(displayName);
    } catch {}
  });
}

// ---------- Firestore-Live-Listener für den eingeloggten User ----------
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

let _unsubscribeProfile = null;

export function startLiveUserProfile() {
  if (!_db || !_auth) return;
  if (_unsubscribeProfile) { try { _unsubscribeProfile(); } catch {} _unsubscribeProfile = null; }

  onAuthStateChanged(_auth, (u) => {
    // alten Listener wegräumen
    if (_unsubscribeProfile) { try { _unsubscribeProfile(); } catch {} _unsubscribeProfile = null; }
    if (!u) return;

    const ref = doc(_db, "users", u.uid);
    _unsubscribeProfile = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const name = data.displayName || u.displayName || localStorage.getItem("displayName") || "User";
      // kleinen lokalen Cache führen (hilft initial beim Laden)
      localStorage.setItem("displayName", name);
      broadcastProfileUpdate({ uid: u.uid, displayName: name });
    });
  });
}