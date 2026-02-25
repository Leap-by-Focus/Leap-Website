// ============================================================================
// leap-auth.js - Komplettes Auth-System (Performance & Stability Update)
// ============================================================================

import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// ============================================================================
// 1. FIREBASE CONFIG
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBGs1Xx3VH2XZHT-k12Xsf_1Nz0gJBNB-Y",
  authDomain: "leap-001.firebaseapp.com",
  projectId: "leap-001",
  storageBucket: "leap-001.appspot.com",
  messagingSenderId: "177255891538",
  appId: "1:177255891538:web:9a7cc6d28f874aadc7d58b"
};

let app;
try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }

export const auth = getAuth(app);
export const db = getFirestore(app);
auth.languageCode = "de";

// ============================================================================
// 2. INJECT CSS & HTML
// ============================================================================

const pathName = window.location.pathname.toLowerCase();
const isIndex = pathName.endsWith("index.html") || pathName.endsWith("/") || pathName === "";

const topPos = isIndex ? "90px" : "20px";   
const formsPos = isIndex ? "155px" : "85px"; 

const authCSS = `
  #global-auth-container { font-family: sans-serif; }
  
  .loginDiv, .userinfo {
    position: fixed !important; 
    top: ${topPos} !important; 
    right: 30px !important; 
    z-index: 2000000 !important;
    display: none; 
  }

.loginDiv {
    background-color: transparent !important;
    padding: 10px 15px; 
    border-radius: 6px; 
    width: 300px; 
    height: 50px; 
    display: flex; 
    justify-content: center !important; /* Geändert von space-between auf center */
    align-items: center;
    gap: 10px; /* Fügt einen sauberen Abstand zwischen den Buttons hinzu */
    pointer-events: auto !important; 
  }

  .userinfo {
    background-color: #333 !important; color: white !important;
    padding: 10px 15px; border-radius: 6px; min-width: 320px !important; 
    height: 60px !important; display: flex !important; align-items: center !important; 
    justify-content: space-between !important; gap: 15px !important;
    pointer-events: auto !important; box-sizing: border-box;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  }

  .loginButton, .registerButton {
    background-color: #444; color: white; padding: 10px 15px; border-radius: 6px;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); transition: all 0.25s ease-in-out;
    height: 60%; display: flex; align-items: center; justify-content: center; flex: 1; margin: 0 5px;
  }
  .loginButton:hover { transform: scale(1.05); background-color: green; }
  .registerButton:hover { transform: scale(1.05); background-color: white; color: black; }
  
  .loginFormularDiv, .registerFormularDiv, .resetFormularDiv {
    position: fixed !important; 
    top: ${formsPos} !important; 
    right: 50px !important; 
    background-color: #444 !important; color: white !important;
    padding: 15px; border-radius: 20px; z-index: 2000001 !important; 
    transition: all 0.25s ease-in-out; width: 260px; 
    opacity: 0; visibility: hidden; transform: translateY(-20px);
    display: flex; flex-direction: column; justify-content: space-between; align-items: center;
    pointer-events: auto !important; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }

  /* Zentriert die Inhalte innerhalb der Formulare */
  .loginForm, .registerForm { 
    display: flex !important; 
    flex-direction: column !important; 
    gap: 15px !important; 
    width: 100% !important; 
    align-items: center !important; /* ZENTRIERT Labels, Inputs und Buttons horizontal */
  }

  /* Labels zentrieren */
  label { 
    font-size: 14px; 
    color: white; 
    font-weight: bolder; 
    text-align: center; 
    width: 100%; 
  }

  #global-auth-container label { 
  font-size: 14px; color: white; font-weight: bolder; text-align: center; width: 100%; 
}
#global-auth-container input { 
  padding: 8px; border-radius: 5px; border: 1px solid #333; font-size: 14px; width: 90%; 
}

  .character {
    width: 45px !important; 
    height: 45px !important; 
    border-radius: 50% !important; 
    background-color: #555 !important; 
    background-size: cover !important; 
    background-position: center !important;
    border: 2px solid #50e9ba !important; 
    cursor: pointer !important; /* Zeigt die Hand beim Drüberfahren */
    flex-shrink: 0 !important;
    display: block !important;
    transition: transform 0.2s ease, box-shadow 0.2s ease !important;
  }

  .character:hover {
    transform: scale(1.1) !important;
    box-shadow: 0 0 10px #50e9ba !important;
  }

  .logoutButton {
    width: 100px !important; 
    height: 36px !important; 
    background: linear-gradient(135deg, #ff4b2b, #ff416c) !important; /* Moderner Farbverlauf */
    color: white !important; 
    border-radius: 20px !important; /* Rundere Ecken für einen Pill-Look */
    border: none !important;
    cursor: pointer !important; 
    font-weight: 600 !important; 
    font-size: 13px !important;
    display: flex !important; 
    align-items: center; 
    justify-content: center;
    gap: 8px; /* Platz zwischen Icon und Text */
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    box-shadow: 0 4px 10px rgba(255, 75, 43, 0.3) !important;
    pointer-events: auto !important; 
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .logoutButton:hover { 
    transform: translateY(-2px) scale(1.05) !important; 
    box-shadow: 0 6px 15px rgba(255, 75, 43, 0.5) !important;
    filter: brightness(1.1);
  }

  .logoutButton:active {
    transform: translateY(0) scale(0.98) !important;
  }
  

  .open { opacity: 1 !important; visibility: visible !important; transform: translateY(0) !important; }
  input { padding: 8px; border-radius: 5px; border: 1px solid #333; font-size: 14px; width: 90%; align-self: center; color: black !important; background: white !important; }
  .submitButton { background-color: #333; color: white; padding: 10px 15px; border-radius: 6px; border: none; cursor: pointer; font-size: 16px; width: 90%; align-self: center; }
  .submitButton:hover { background-color: green; transform: scale(1.05); }
  .CharacterName { color: white; font-weight: bolder; font-size: 18px; text-align: center; font-family: monospace; letter-spacing: 2px; animation: colorRotate 2s linear infinite; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  @keyframes colorRotate { 0% { color: #50e9ba; } 50% { color: #148fac; } 100% { color: #50e9ba; } }
  .logoutButton { width: 90px !important; height: 35px !important; background-color: #e74c3c !important; color: white !important; border-radius: 8px !important; cursor: pointer !important; font-weight: bold !important; display: flex !important; align-items: center; justify-content: center; }
  .alert { padding: 10px; border-radius: 5px; text-align: center; font-size: 14px; margin-top: 10px; display: none; }
`;

const authHTML = `
<div id="global-auth-container">
  <div class="loginDiv" id="authButtonsDiv" style="display:none;">
      <div class="loginButton" id="loginButton">Login</div>
      <div class="registerButton" id="registerButton">Register</div>
  </div>
  <div class="loginFormularDiv" id="loginFormular">
      <form class="loginForm" id="loginForm">
          <label>Benutzername oder E-Mail:</label>
          <input type="text" id="logUsername" placeholder="Name oder E-Mail" required>
          <label>Passwort:</label>
          <input type="password" id="logPassword" required>
          <button type="submit" class="submitButton">Anmelden</button>
          <div id="signInMessage" class="alert"></div>
      </form>
      <div style="margin-top:8px; text-align:center;"><a href="#" id="forgotLink" style="color:#9dd7ff; text-decoration:none; font-size:14px;">Passwort vergessen?</a></div>
  </div>
  <div class="registerFormularDiv" id="registerFormularDiv">
      <form class="registerForm" id="registerForm">
          <label>Benutzername:</label>
          <input type="text" id="regUsername" placeholder="Benutzername" required>
          <label>Email:</label>
          <input type="email" id="regEmail" placeholder="Email" required>
          <label>Passwort:</label>
          <input type="password" id="regPassword" placeholder="Passwort" required />
          <button type="submit" class="submitButton">Registrieren</button>
      </form>
  </div>
  <div class="userinfo" id="userinfoDiv" style="display:none;">
      <div class="character" id="avatarLink"></div>
      <div class="userinfo-center" style="display:flex; flex-direction:column; align-items:center; flex:1; overflow:hidden;">
          <div style="font-size:11px; font-weight:bold; text-transform:uppercase;">Willkommen</div>
          <div class="CharacterName" id="CharacterName">Laden...</div>
      </div>
      <button id="submitlogout" class="logoutButton">⎋ Logout</button>
  </div>
</div>
`;

function injectAuthUI() {
  if (document.getElementById("global-auth-container")) return; 
  const styleEl = document.createElement("style");
  styleEl.textContent = authCSS;
  document.head.appendChild(styleEl);
  const container = document.createElement("div");
  container.innerHTML = authHTML;
  document.body.prepend(container);
}

function showMessage(msg, divId, type = "error") {
  const el = document.getElementById(divId);
  if (!el) return;
  el.className = "alert " + (type === "success" ? "alert-success" : "alert-error");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { if(el) el.style.display = "none"; }, 4000);
}

function fitCharacterName() {
  const box = document.getElementById('CharacterName');
  if (!box || !box.textContent) return;
  let fontSize = 18; 
  box.style.fontSize = fontSize + 'px';
  while (box.scrollWidth > box.clientWidth && fontSize > 8) {
    fontSize -= 1;
    box.style.fontSize = fontSize + 'px';
  }
}

function setupPanelToggles() {
  const hideAll = () => ['loginFormular', 'registerFormularDiv'].forEach(id => document.getElementById(id)?.classList.remove('open'));
  document.getElementById('loginButton')?.addEventListener('click', (e) => { e.stopPropagation(); hideAll(); document.getElementById('loginFormular')?.classList.add('open'); });
  document.getElementById('registerButton')?.addEventListener('click', (e) => { e.stopPropagation(); hideAll(); document.getElementById('registerFormularDiv')?.classList.add('open'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#global-auth-container')) hideAll(); });
}

function setupAuthForms() {
  // --- LOGIN ---
  document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("logUsername").value.trim();
    const pw = document.getElementById("logPassword").value;
    try {
      let email = identifier;
      if (!identifier.includes("@")) { 
        const q = query(collection(db, "users"), where("username", "==", identifier));
        const snap = await getDocs(q);
        if (snap.empty) throw new Error();
        email = snap.docs[0].data().email;
      }
      await signInWithEmailAndPassword(auth, email, pw);
      // Panel schließen statt harter Reload
      document.getElementById('loginFormular')?.classList.remove('open');
    } catch { showMessage("Login fehlgeschlagen.", "signInMessage"); }
  });

  // --- LOGOUT (SPEED FIX) ---
  document.getElementById("submitlogout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await signOut(auth);
      localStorage.clear();
      // Wir verzichten auf location.reload(). onAuthStateChanged übernimmt die UI.
    } catch (err) {
      console.error("Logout Fehler:", err);
      location.reload(); 
    }
  });
}

function setupSessionState() {
  const btnDiv = document.getElementById("authButtonsDiv");
  const userDiv = document.getElementById("userinfoDiv");
  const nameLabel = document.getElementById("CharacterName");
  const avatarLink = document.getElementById("avatarLink");

  onAuthStateChanged(auth, async (user) => {
    requestAnimationFrame(async () => {
      
      if (user) {
        // --- FALL: EINGELOGGT ---
       
        if (btnDiv) btnDiv.style.setProperty("display", "none", "important");
        
        if (userDiv) {
          userDiv.style.setProperty("top", topPos, "important"); 
          userDiv.style.setProperty("display", "flex", "important");
          userDiv.style.setProperty("visibility", "visible", "important");
          userDiv.style.setProperty("opacity", "1", "important");
        }
        
        try {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            
            // Namen setzen
            if (nameLabel) nameLabel.textContent = data.username || "User";
            
            // Profilbild setzen
            if (avatarLink) {
              if (data.photoURL) {
                // Bildpfad mit Anführungszeichen setzen
                avatarLink.style.backgroundImage = `url("${data.photoURL}")`;
              } else {
                // Fallback falls kein Bild in DB
                avatarLink.style.backgroundImage = "none";
                avatarLink.style.backgroundColor = "#777";
              }
            }
            
            fitCharacterName();
          }
        } catch (err) {
          console.error("Datenfehler:", err);
        }
         setupUserProfileInteractions(user);
      } else {
        // --- FALL: AUSGELOGGT ---
        if (userDiv) {
          userDiv.style.setProperty("display", "none", "important");
          userDiv.style.setProperty("visibility", "hidden", "important");
          userDiv.style.setProperty("opacity", "0", "important");
        }

        if (btnDiv) {
          btnDiv.style.setProperty("top", topPos, "important"); 
          btnDiv.style.setProperty("display", "flex", "important");
        }
        
        if (nameLabel) nameLabel.textContent = ""; 
        if (avatarLink) avatarLink.style.backgroundImage = "none";
        
        localStorage.clear();
      }
    });
  });
}


/**
 * Kümmert sich um Live-Updates des Namens/Bildes und den Klick zum Profil.
 */
function setupUserProfileInteractions(user) {
  if (!user) return;

  const nameLabel = document.getElementById("CharacterName");
  const avatarLink = document.getElementById("avatarLink");

  if (avatarLink) {
    avatarLink.onclick = () => {
      // PRÄZISER PFAD-CHECK:
      // Wenn wir auf der index.html sind, müssen wir in den html/ Ordner.
      // Wenn wir schon in einem Unterordner sind, liegt settings.html im gleichen Verzeichnis.
      let target;
      if (isIndex) {
        target = "settings.html";
      } else {
        target = "settings.html";
      }
      
      console.log("Navigiere zu:", target);
      window.location.href = target;
    };
  }

  // Live-Listener bleibt gleich
  const userRef = doc(db, "users", user.uid);
  onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (nameLabel) {
        nameLabel.textContent = data.username || "User";
        fitCharacterName();
      }
      if (avatarLink && data.photoURL) {
        avatarLink.style.backgroundImage = `url("${data.photoURL}")`;
      }
    }
  });
}
function init() {
  injectAuthUI();
  setupPanelToggles();
  setupAuthForms();
  setupSessionState();
  window.addEventListener('resize', fitCharacterName);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();