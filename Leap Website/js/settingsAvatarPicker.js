// settingsAvatarPicker.js
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* ---- Firebase-App sicher initialisieren (nur wenn noch nicht) ---- */
// Falls dein firebaseauth.js bereits initializeApp() macht UND ebenfalls als ES-Modul läuft,
// bleibt dieser Block wirkungslos, weil getApps().length > 0 ist.
if (getApps().length === 0) {
  // 👉 Falls du hier einen Fehler bekommst, füge deine Config ein ODER
  // exportiere die App aus firebaseauth.js (als ESM) und entferne diesen Block.
  const firebaseConfig = window.firebaseConfig || null;
  if (firebaseConfig) initializeApp(firebaseConfig);
}

/* ---- Avatar-Pfade robust relativ bauen ---- */
const AVATAR_BASE = new URL("../assets/avatars/", document.baseURI).href;
// Ergibt z. B. ".../html/../assets/avatars/" ⇒ korrekt relativ zur aktuellen Seite.

const AVAILABLE_AVATARS = (() => {
  const map = {};
  for (let i = 1; i <= 30; i++) {
    const key = `a${String(i).padStart(2, "0")}`; // a01..a30
    map[key] = `${AVATAR_BASE}${key}.jpg`;
  }
  return map;
})();

const FALLBACK_URL = new URL("../assets/images/newAccount.jpeg", document.baseURI).href;

/* ---- Minimalstyles für #picture, falls nicht vorhanden ---- */
(function ensurePictureStyle() {
  if (document.getElementById("avatarPictureInlineCSS")) return;
  const s = document.createElement("style");
  s.id = "avatarPictureInlineCSS";
  s.textContent = `
    #picture{
      width:120px; height:120px; border-radius:50%;
      background:#2a2d33 center/cover no-repeat;
      border:2px solid rgba(255,255,255,.15);
      cursor:pointer;
    }
  `;
  document.head.appendChild(s);
})();

/* ---- Modal-CSS + Builder (unverändert bis auf Pfade) ---- */
function injectStylesOnce() {
  if (document.getElementById("avatarPickerStyles")) return;
  const css = `
    .ap-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:999999}
    .ap-modal{width:min(920px,92vw);background:#1e1f23;color:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:16px 16px 10px;border:1px solid rgba(255,255,255,.08)}
    .ap-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .ap-title{font-weight:800;font-size:18px;letter-spacing:.2px}
    .ap-close{all:unset;cursor:pointer;font-size:20px;line-height:1;padding:4px 8px;border-radius:6px}
    .ap-close:hover{background:rgba(255,255,255,.08)}
    .ap-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:6px;max-height:60vh;overflow:auto}
    .ap-item{width:100%;aspect-ratio:1/1;border-radius:50%;background-size:cover;background-position:center;position:relative;cursor:pointer;outline:2px solid transparent;transition:transform .12s ease, outline-color .12s ease, box-shadow .12s ease;box-shadow:0 2px 10px rgba(0,0,0,.25)}
    .ap-item:hover{transform:scale(1.04)}
    .ap-item.selected{outline-color:#00d4aa;box-shadow:0 0 0 4px rgba(0,212,170,.2)}
    .ap-check{position:absolute;right:-4px;bottom:-4px;background:#00d4aa;color:#032b27;font-weight:900;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;border:2px solid #032b27;font-size:14px;transform:scale(0);transition:transform .12s ease}
    .ap-item.selected .ap-check{transform:scale(1)}
    .ap-footer{display:flex;justify-content:flex-end;gap:10px;padding:12px 6px 2px}
    .ap-btn{all:unset;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;letter-spacing:.2px}
    .ap-btn.cancel{background:#2a2d33;color:#ddd}
    .ap-btn.cancel:hover{background:#363a42}
    .ap-btn.save{background:#00d4aa;color:#06201b}
    .ap-btn.save:hover{background:#00e3b6}
    @media (max-width:820px){.ap-grid{grid-template-columns:repeat(4,1fr)}}
  `;
  const style = document.createElement("style");
  style.id = "avatarPickerStyles";
  style.textContent = css;
  document.head.appendChild(style);
}

function buildModal(currentKey) {
  injectStylesOnce();
  const overlay = document.createElement("div");
  overlay.className = "ap-overlay";
  overlay.tabIndex = -1;

  const modal = document.createElement("div");
  modal.className = "ap-modal";
  overlay.appendChild(modal);

  const header = document.createElement("div");
  header.className = "ap-header";
  const title = document.createElement("div");
  title.className = "ap-title";
  title.textContent = "Avatar auswählen";
  const closeBtn = document.createElement("button");
  closeBtn.className = "ap-close";
  closeBtn.innerHTML = "&#x2715;";
  header.appendChild(title);
  header.appendChild(closeBtn);

  const grid = document.createElement("div");
  grid.className = "ap-grid";

  let selectedKey = currentKey;
  for (const [key, url] of Object.entries(AVAILABLE_AVATARS)) {
    const item = document.createElement("div");
    item.className = "ap-item";
    item.style.backgroundImage = `url("${url}")`;
    item.dataset.key = key;

    if (key === currentKey) item.classList.add("selected");

    const check = document.createElement("div");
    check.className = "ap-check";
    check.textContent = "✓";
    item.appendChild(check);

    item.onclick = () => {
      [...grid.children].forEach(c => c.classList.remove("selected"));
      item.classList.add("selected");
      selectedKey = key;
    };

    grid.appendChild(item);
  }

  const footer = document.createElement("div");
  footer.className = "ap-footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "ap-btn cancel";
  cancelBtn.textContent = "Abbrechen";
  const saveBtn = document.createElement("button");
  saveBtn.className = "ap-btn save";
  saveBtn.textContent = "Speichern";
  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);

  modal.appendChild(header);
  modal.appendChild(grid);
  modal.appendChild(footer);

  const destroy = () => overlay.remove();
  closeBtn.onclick = destroy;
  cancelBtn.onclick = destroy;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) destroy(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { destroy(); document.removeEventListener("keydown", esc); }
  });

  const waitForSelection = new Promise((resolve) => {
    saveBtn.onclick = () => resolve(selectedKey);
  });

  document.body.appendChild(overlay);
  return waitForSelection;
}

function setBg(el, url) {
  if (!el) return;
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
  el.style.backgroundRepeat = "no-repeat";
}

/* ---- Hauptlogik ---- */
const auth = getAuth();
const fs = getFirestore();

onAuthStateChanged(auth, async (user) => {
  const picture = document.getElementById("picture");
  if (!picture) return;

  if (!user) {
    setBg(picture, FALLBACK_URL);
    picture.onclick = () => alert("Bitte zuerst einloggen, um einen Avatar zu wählen.");
    return;
  }

  let currentKey = null;
  let currentURL = FALLBACK_URL;

  try {
    const snap = await getDoc(doc(fs, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      if (data.photoKey && AVAILABLE_AVATARS[data.photoKey]) {
        currentKey = data.photoKey;
        currentURL = AVAILABLE_AVATARS[data.photoKey];
      } else if (data.photoURL) {
        currentURL = data.photoURL;
      }
    }
  } catch (e) {
    console.warn("Avatar laden fehlgeschlagen:", e);
  }

  setBg(picture, currentURL);

  picture.onclick = async () => {
    const startKey = currentKey && AVAILABLE_AVATARS[currentKey] ? currentKey : "a01";
    const selectedKey = await buildModal(startKey);
    if (!selectedKey || !AVAILABLE_AVATARS[selectedKey]) return;

    const selectedURL = AVAILABLE_AVATARS[selectedKey];

    try {
      await setDoc(
        doc(fs, "users", user.uid),
        { photoKey: selectedKey, photoURL: selectedURL },
        { merge: true }
      );
      currentKey = selectedKey;
      setBg(picture, selectedURL);

      const avatarBadge = document.getElementById("avatarLink");
      if (avatarBadge) setBg(avatarBadge, selectedURL);
    } catch (e) {
      console.error("Avatar speichern fehlgeschlagen:", e);
      alert("Konnte Avatar nicht speichern. Bitte später erneut versuchen.");
    }
  };
});