// ============================================================================
// auth.js - Komplettes Auth-System in einer Datei
// Enthält: CSS, HTML-Template, Firebase Auth, UI-Logik
// ============================================================================

// ============================================================================
// 1. FIREBASE IMPORTS & CONFIG
// ============================================================================
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
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
// 2. CSS STYLES (injiziert als <style>)
// ============================================================================
const authCSS = `
/* ============================================
   AUTH SYSTEM - Login/Register/Reset/Userinfo
   ============================================ */

/* Container für Login/Register Buttons */
.loginDiv {
  position: fixed;
  top: 20px;
  right: 30px;
  background-color: transparent;
  color: white;
  padding: 10px 15px;
  border-radius: 6px;
  font-family: sans-serif;
  z-index: 100000;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
  width: 300px;
  height: 50px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Login & Register Buttons */
.loginButton,
.registerButton {
  background-color: #444;
  color: white;
  padding: 10px 15px;
  border-radius: 6px;
  font-family: sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.25s ease-in-out;
  height: 60%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  margin: 0 5px;
}

.loginButton:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  background-color: green;
}

.registerButton:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  background-color: white;
  color: black;
}

/* Login Formular */
.loginFormularDiv {
  position: fixed;
  top: 85px;
  right: 50px;
  background-color: transparent;
  color: white;
  padding: 10px 15px;
  border-radius: 20px;
  font-family: sans-serif;
  z-index: 100000;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
  width: 260px;
  height: 250px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-20px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: column;
  padding-top: 5px;
}

.loginFormularDiv.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  background-color: #444;
}

/* Login Form */
.loginForm {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.loginForm label,
.registerForm label {
  font-size: 14px;
  color: white;
  font-weight: bolder;
  text-align: center;
}

.loginForm input,
.registerForm input {
  padding: 8px;
  border-radius: 5px;
  border: 1px solid #333;
  font-size: 14px;
}

.submitButton {
  background-color: #444;
  color: white;
  padding: 10px 15px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.25s ease-in-out;
  border: none;
}

.submitButton:hover {
  background-color: green;
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* Register Formular */
.registerFormularDiv {
  position: fixed;
  top: 85px;
  right: 50px;
  background-color: transparent;
  color: white;
  padding: 10px 15px;
  border-radius: 20px;
  font-family: sans-serif;
  z-index: 100000;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
  width: 260px;
  height: 300px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-20px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: column;
  padding-top: 5px;
}

.registerFormularDiv.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  background-color: #444;
}

.registerForm {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* Reset Password Formular */
.resetFormularDiv {
  position: fixed;
  top: 85px;
  right: 50px;
  width: 260px;
  height: 190px;
  background-color: #444;
  color: white;
  border-radius: 20px;
  padding: 10px 15px;
  font-family: sans-serif;
  z-index: 100000;
  transition: all 0.25s ease-in-out;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-20px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding-top: 5px;
}

.resetFormularDiv.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  background-color: #444;
}

#resetEmail {
  width: 90%;
  margin-bottom: 20px;
}

.reset-password-link {
  width: 100%;
  margin-top: 8px;
  text-align: center;
}

.reset-password-link a {
  color: #9dd7ff;
  text-decoration: none;
  font-size: 14px;
}

.reset-password-link a:hover {
  text-decoration: underline;
}

.textButton {
  background: transparent;
  color: #9dd7ff;
  border: 1px solid #9dd7ff;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
  width: 100%;
}

.textButton:hover {
  background-color: #9dd7ff;
  color: #222;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.muted {
  color: #bbb;
  font-size: 0.9rem;
}

/* Userinfo Box (eingeloggt) */
.userinfo {
  position: fixed;
  top: 20px;
  right: 30px;
  background-color: #333;
  color: white;
  padding: 10px 15px;
  border-radius: 6px;
  font-family: sans-serif;
  z-index: 100000;
  cursor: pointer;
  width: 300px;
  height: 50px;
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.userinfo-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  overflow: hidden;
}

.welcomeNote {
  color: white;
  font-weight: bold;
  font-size: 12px;
  white-space: nowrap;
}

.CharacterName {
  color: white;
  font-weight: bolder;
  font-size: 18px;
  z-index: 1000000;
  text-align: center;
  font-family: monospace;
  letter-spacing: 3px;
  animation: colorRotate 2s linear 0s infinite;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 100%;
}

@keyframes colorRotate {
  0%   { color: #50e9ba; }
  50%  { color: #148fac; }
  100% { color: #50e9ba; }
}

/* Avatar */
.character {
  width: 50px;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  background-color: #777;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s ease, background-color 0.2s ease;
}

.character:hover {
  transform: scale(1.1);
  background-color: #555;
}

.character::after {
  content: "";
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.65);
  background-image: url("../assets/images/settings.png");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 32px 32px;
  opacity: 0;
  transform: scale(1.1);
  transition: opacity 0.35s ease, transform 0.35s ease;
  pointer-events: none;
  z-index: 1;
}

.character:hover::after {
  opacity: 1;
  transform: scale(1);
}

/* Logout Button */
.logoutButton {
  width: 70px;
  height: 40px;
  padding: 6px 10px;
  background-color: #e74c3c;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  z-index: 9999;
  font-weight: bold;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: background-color 0.3s ease;
  font-size: smaller;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.logoutButton:hover {
  background-color: #c0392b;
}

/* Alert Messages */
.alert {
  padding: 10px;
  border-radius: 5px;
  text-align: center;
  font-size: 14px;
  margin-top: 10px;
  display: none;
}

.alert-success {
  background-color: rgba(46, 204, 113, 0.3);
  color: #2ecc71;
}

.alert-error {
  background-color: rgba(231, 76, 60, 0.3);
  color: #e74c3c;
}

/* Initialen im Avatar */
.avatar-initials {
  font-size: 18px;
  font-weight: bold;
  color: white;
  text-transform: uppercase;
}
`;

// ============================================================================
// 3. HTML TEMPLATE
// ============================================================================
const authHTML = `
<!-- Login/Register Container -->
<div class="loginDiv">
  <div class="loginButton" id="loginButton">Login</div>
  <div class="registerButton" id="registerButton">Register</div>

  <!-- Login Formular -->
  <div class="loginFormularDiv" id="loginFormular">
    <form class="loginForm" id="loginForm">
      <label for="logUsername">Benutzername:</label>
      <input type="text" id="logUsername" required />
      <label for="logPassword">Passwort:</label>
      <input type="password" id="logPassword" required />
      <button type="submit" class="submitButton" id="submitbuttonlogin">
        Anmelden
      </button>
      <div id="signInMessage" class="alert"></div>
    </form>
    <div class="reset-password-link">
      <a href="#" id="forgotLink">Passwort vergessen?</a>
    </div>
  </div>

  <!-- Reset Password Formular -->
  <div class="resetFormularDiv" id="resetFormular">
    <form class="loginForm" id="resetForm">
      <div id="phase-request">
        <label for="resetEmail">E-Mail-Adresse:</label>
        <input
          type="email"
          id="resetEmail"
          name="resetEmail"
          placeholder="dein@mail.tld"
          required
        />
        <button type="button" class="submitButton" id="btnSendReset">
          Link senden
        </button>
      </div>

      <div id="phase-set" style="display: none">
        <p id="emailLine" class="muted"></p>
        <label for="pw1">Neues Passwort:</label>
        <input
          type="password"
          id="pw1"
          name="newPassword"
          minlength="6"
          autocomplete="new-password"
          required
        />
        <label for="pw2">Passwort wiederholen:</label>
        <input
          type="password"
          id="pw2"
          name="newPasswordRepeat"
          minlength="6"
          autocomplete="new-password"
          required
        />
        <button type="submit" class="submitButton" id="btnConfirmReset">
          Speichern
        </button>
      </div>

      <div id="resetMessage" class="alert"></div>
      <div class="reset-actions">
        <button type="button" class="textButton" id="backToLogin">
          ← Zurück
        </button>
      </div>
    </form>
  </div>

  <!-- Register Formular -->
  <div class="registerFormularDiv" id="registerFormularDiv">
    <form class="registerForm" id="registerForm">
      <label for="regUsername">Benutzername:</label>
      <input
        type="text"
        id="regUsername"
        name="username"
        placeholder="Benutzername"
        required
      />
      <label for="regEmail">Email:</label>
      <input
        type="email"
        id="regEmail"
        name="email"
        placeholder="Email"
        required
      />
      <label for="regPassword">Passwort:</label>
      <input
        type="password"
        id="regPassword"
        placeholder="Passwort"
        required
      />
      <button type="submit" class="submitButton" id="submitbuttonregister">
        Registrieren
      </button>
    </form>
  </div>
</div>

<!-- Userinfo (eingeloggt) -->
<div class="userinfo" id="userinfo">
  <div class="character" id="avatarLink"></div>
  <div class="userinfo-center">
    <div class="welcomeNote">Willkommen</div>
    <div class="CharacterName" id="CharacterName"></div>
  </div>
  <button id="submitlogout" class="logoutButton">⎋ Logout</button>
</div>
`;

// ============================================================================
// 4. INJECT CSS & HTML
// ============================================================================
function injectAuth() {
  // CSS injizieren
  const styleEl = document.createElement("style");
  styleEl.id = "auth-styles";
  styleEl.textContent = authCSS;
  document.head.appendChild(styleEl);

  // HTML injizieren
  const container = document.createElement("div");
  container.id = "auth-container";
  container.innerHTML = authHTML;
  document.body.prepend(container);
}

// ============================================================================
// 5. HELPER FUNCTIONS
// ============================================================================
function showMessage(msg, divId, type = "error") {
  const el = document.getElementById(divId);
  if (!el) return;
  el.className = "alert " + (type === "success" ? "alert-success" : "alert-error");
  el.textContent = msg;
  el.style.opacity = 1;
  el.style.display = "block";
  setTimeout(() => {
    el.style.opacity = 0;
    setTimeout(() => (el.style.display = "none"), 500);
  }, 4000);
}

function initialsFrom(name) {
  const parts = String(name || "").trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || "🙂";
}

function setAvatar(el, url, usernameForInitials = "") {
  if (!el) return;
  el.querySelector(".avatar-initials")?.remove();
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
  el.style.backgroundRepeat = "no-repeat";
  const src = url || "/assets/images/newAccount.jpeg";
  el.style.backgroundImage = `url("${src}")`;
  if (!url) {
    const span = document.createElement("span");
    span.className = "avatar-initials";
    span.textContent = initialsFrom(usernameForInitials);
    el.appendChild(span);
  }
}

function setPicture(el, url) {
  if (!el) return;
  const src = url ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}` : "/assets/images/newAccount.jpeg";
  el.style.backgroundImage = `url("${src}")`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
  el.style.backgroundRepeat = "no-repeat";
}

async function ensureUserDoc(uid, fallbackUsername, email) {
  if (!uid) return;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return;

  const usernameFromEmail =
    fallbackUsername && !fallbackUsername.includes("@")
      ? fallbackUsername
      : email
      ? email.split("@")[0]
      : "user";

  await setDoc(userRef, {
    email: email || null,
    username: usernameFromEmail,
    createdAt: serverTimestamp(),
    photoURL: "/assets/images/newAccount.jpeg"
  }, { merge: true });
}

// ============================================================================
// 6. PANEL TOGGLE LOGIC
// ============================================================================
function setupPanelToggle() {
  const loginBtn = document.getElementById("loginButton");
  const registerBtn = document.getElementById("registerButton");
  const forgotLink = document.getElementById("forgotLink");
  const backToLogin = document.getElementById("backToLogin");

  const loginPanel = document.getElementById("loginFormular");
  const registerPanel = document.getElementById("registerFormularDiv");
  const resetPanel = document.getElementById("resetFormular");

  function hideAll() {
    loginPanel?.classList.remove("open");
    registerPanel?.classList.remove("open");
    resetPanel?.classList.remove("open");
  }

  function show(panel) {
    hideAll();
    panel?.classList.add("open");
  }

  loginBtn?.addEventListener("click", () => {
    if (loginPanel?.classList.contains("open")) {
      hideAll();
    } else {
      show(loginPanel);
    }
  });

  registerBtn?.addEventListener("click", () => {
    if (registerPanel?.classList.contains("open")) {
      hideAll();
    } else {
      show(registerPanel);
    }
  });

  forgotLink?.addEventListener("click", (e) => {
    e.preventDefault();
    show(resetPanel);
    enablePhaseA();
  });

  backToLogin?.addEventListener("click", () => {
    show(loginPanel);
  });

  // ESC schließt alles
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideAll();
  });

  // Klick außerhalb schließt alles
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (
      !loginPanel?.contains(target) &&
      !registerPanel?.contains(target) &&
      !resetPanel?.contains(target) &&
      !loginBtn?.contains(target) &&
      !registerBtn?.contains(target) &&
      !forgotLink?.contains(target)
    ) {
      hideAll();
    }
  });
}

// ============================================================================
// 7. RESET PASSWORD LOGIC
// ============================================================================
let phaseRequest, phaseSet, emailInput, pw1, pw2, resetMsg, btnSendReset;

function enablePhaseA() {
  if (emailInput) {
    emailInput.disabled = false;
    emailInput.required = true;
    emailInput.removeAttribute("readonly");
    emailInput.value = "";
  }
  if (pw1) { pw1.disabled = true; pw1.required = false; pw1.value = ""; }
  if (pw2) { pw2.disabled = true; pw2.required = false; pw2.value = ""; }

  if (phaseRequest) phaseRequest.style.display = "";
  if (phaseSet) phaseSet.style.display = "none";
  if (btnSendReset) {
    btnSendReset.style.display = "";
    btnSendReset.disabled = false;
    btnSendReset.textContent = "Link senden";
  }
  if (resetMsg) {
    resetMsg.textContent = "";
    resetMsg.style.color = "";
  }
}

function enablePhaseB(email) {
  if (emailInput) {
    emailInput.value = email || "";
    emailInput.readOnly = true;
    emailInput.required = false;
    emailInput.disabled = true;
  }
  if (pw1) { pw1.disabled = false; pw1.required = true; }
  if (pw2) { pw2.disabled = false; pw2.required = true; }

  if (phaseRequest) phaseRequest.style.display = "none";
  if (phaseSet) phaseSet.style.display = "";
  
  const emailLine = document.getElementById("emailLine");
  if (emailLine) emailLine.textContent = email ? `Für Konto: ${email}` : "";
  
  if (resetMsg) {
    resetMsg.textContent = "";
    resetMsg.style.color = "";
  }
}

function setupResetPassword() {
  phaseRequest = document.getElementById("phase-request");
  phaseSet = document.getElementById("phase-set");
  emailInput = document.getElementById("resetEmail");
  pw1 = document.getElementById("pw1");
  pw2 = document.getElementById("pw2");
  resetMsg = document.getElementById("resetMessage");
  btnSendReset = document.getElementById("btnSendReset");

  const resetForm = document.getElementById("resetForm");
  const qs = new URLSearchParams(location.search);
  const mode = qs.get("mode");
  const oobCode = qs.get("oobCode");

  if (resetForm) resetForm.noValidate = true;

  const setMsg = (text, color) => {
    if (!resetMsg) return;
    resetMsg.textContent = text || "";
    resetMsg.style.color = color || "";
    resetMsg.style.display = text ? "block" : "none";
  };

  // Phase A: Link senden
  btnSendReset?.addEventListener("click", async () => {
    const email = (emailInput?.value || "").trim();
    if (!email) return setMsg("Bitte E-Mail eingeben.", "orange");

    try {
      if (btnSendReset) {
        btnSendReset.disabled = true;
        btnSendReset.textContent = "Sende…";
      }

      await sendPasswordResetEmail(auth, email);

      if (btnSendReset) btnSendReset.style.display = "none";
      if (emailInput) emailInput.readOnly = true;

      setMsg("✅ Link wurde gesendet – prüfe dein Postfach 📬", "lightgreen");
    } catch (err) {
      const map = {
        "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
        "auth/user-not-found": "Kein Benutzer mit dieser E-Mail.",
        "auth/network-request-failed": "Netzwerkfehler."
      };
      setMsg(map[err?.code] || ("Fehler: " + (err?.message || String(err))), "salmon");
      if (btnSendReset) {
        btnSendReset.disabled = false;
        btnSendReset.textContent = "Link senden";
      }
    }
  });

  // Phase B: Passwort setzen
  resetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inPhaseB = phaseSet && phaseSet.style.display !== "none";
    if (!(mode === "resetPassword" && oobCode && inPhaseB)) return;

    const a = (pw1?.value || "").trim();
    const b = (pw2?.value || "").trim();
    if (a.length < 6) return setMsg("Passwort mindestens 6 Zeichen.", "orange");
    if (a !== b) return setMsg("Passwörter stimmen nicht überein.", "orange");

    try {
      await confirmPasswordReset(auth, oobCode, a);
      setMsg("✅ Passwort gespeichert. Du kannst dich jetzt einloggen.", "lightgreen");

      setTimeout(() => {
        const clean = location.origin + location.pathname;
        history.replaceState(null, "", clean);
        document.getElementById("loginFormular")?.classList.add("open");
        document.getElementById("resetFormular")?.classList.remove("open");
      }, 1200);
    } catch (err) {
      const map = {
        "auth/expired-action-code": "Link abgelaufen. Bitte neu anfordern.",
        "auth/invalid-action-code": "Ungültiger Link.",
        "auth/weak-password": "Passwort zu schwach."
      };
      setMsg(map[err?.code] || ("Fehler: " + (err?.message || String(err))), "salmon");
    }
  });

  // Direktaufruf über E-Mail-Link
  (async function initFromLink() {
    if (mode === "resetPassword" && oobCode) {
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        document.getElementById("resetFormular")?.classList.add("open");
        enablePhaseB(email);
        pw1?.focus?.();
      } catch {
        document.getElementById("resetFormular")?.classList.add("open");
        enablePhaseA();
        setMsg("❌ Link ungültig oder abgelaufen.", "salmon");
      }
    }
  })();
}

// ============================================================================
// 8. REGISTRATION
// ============================================================================
function setupRegistration() {
  document.getElementById("submitbuttonregister")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("regEmail")?.value.trim();
    const pw = document.getElementById("regPassword")?.value;
    const username = document.getElementById("regUsername")?.value.trim();

    if (!email || !pw || !username) {
      showMessage("Bitte alle Felder ausfüllen.", "signInMessage");
      return;
    }
    if (pw.length < 6) {
      showMessage("Passwort mindestens 6 Zeichen.", "signInMessage");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      await setDoc(doc(db, "users", cred.user.uid), {
        email,
        username,
        createdAt: serverTimestamp(),
        photoURL: "/assets/images/newAccount.jpeg"
      });

      showMessage("Registrierung erfolgreich!", "signInMessage", "success");
      localStorage.setItem("loggedInUserId", cred.user.uid);
      document.querySelector(".loginDiv")?.classList.add("hidden");
      location.reload();
    } catch (err) {
      showMessage(err.message, "signInMessage");
    }
  });
}

// ============================================================================
// 9. LOGIN
// ============================================================================
function setupLogin() {
  document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const usernameOrEmail = document.getElementById("logUsername")?.value.trim();
    const pw = document.getElementById("logPassword")?.value;

    if (!usernameOrEmail || !pw) {
      showMessage("Bitte Benutzername/E-Mail & Passwort eingeben.", "signInMessage");
      return;
    }

    try {
      let emailToUse = usernameOrEmail;

      // Kein @ → als Benutzername behandeln
      if (!usernameOrEmail.includes("@")) {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", usernameOrEmail));
        const snap = await getDocs(q);
        if (snap.empty) {
          showMessage("Benutzername existiert nicht.", "signInMessage");
          return;
        }
        emailToUse = snap.docs[0].data()?.email;
        if (!emailToUse) {
          showMessage("Keine E-Mail für diesen Benutzer.", "signInMessage");
          return;
        }
      }

      const cred = await signInWithEmailAndPassword(auth, emailToUse, pw);
      await ensureUserDoc(cred.user.uid, usernameOrEmail, emailToUse);

      showMessage("Login erfolgreich!", "signInMessage", "success");
      localStorage.setItem("loggedInUserId", cred.user.uid);
      document.querySelector(".loginDiv")?.classList.add("hidden");
      location.reload();
    } catch (err) {
      const map = {
        "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
        "auth/wrong-password": "Passwort ist falsch.",
        "auth/user-not-found": "Kein Konto mit dieser E-Mail.",
        "auth/too-many-requests": "Zu viele Versuche. Später erneut.",
        "auth/network-request-failed": "Netzwerkfehler."
      };
      showMessage(map[err?.code] || ("Fehler: " + (err?.message || String(err))), "signInMessage");
      console.error("[login]", err);
    }
  });
}

// ============================================================================
// 10. SESSION / UI STATE
// ============================================================================
async function setupSession() {
  const uid = localStorage.getItem("loggedInUserId");
  const loginDiv = document.querySelector(".loginDiv");
  const userinfo = document.getElementById("userinfo");
  const charName = document.getElementById("CharacterName");
  const avatar = document.getElementById("avatarLink");
  const picture = document.getElementById("picture");
  const btnOut = document.getElementById("submitlogout");

  if (uid) {
    // Eingeloggt
    if (loginDiv) loginDiv.style.display = "none";
    if (userinfo) userinfo.style.display = "flex";

    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        const username = data.username || "Unbekannter Nutzer";
        const photoURL = data.photoURL || "/assets/images/newAccount.jpeg";

        if (charName) charName.textContent = username;
        document.querySelectorAll(".usernameDisplay").forEach((el) => {
          el.textContent = username;
        });

        if (avatar) {
          setAvatar(avatar, photoURL, username);
          avatar.style.cursor = "pointer";
          avatar.onclick = () => (window.location.href = "settings.html");
        }

        if (picture) {
          const normal = photoURL;
          const hover = "/assets/images/newAccount-hover.jpeg";
          setPicture(picture, normal);
          picture.addEventListener("mouseenter", () => {
            picture.style.backgroundImage = `url("${hover}")`;
          });
          picture.addEventListener("mouseleave", () => {
            picture.style.backgroundImage = `url("${normal}")`;
          });
        }

        if (data.createdAt) {
          const d = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          const formatted = d.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
          const memberSinceEl = document.getElementById("memberSince");
          if (memberSinceEl) memberSinceEl.textContent = formatted;
        }
      }
    } catch {
      if (charName) charName.textContent = "Fehler beim Laden";
      if (avatar) setAvatar(avatar, "/assets/images/newAccount.jpeg", "");
      if (picture) setPicture(picture, "/assets/images/newAccount.jpeg");
    }
  } else {
    // Ausgeloggt
    if (loginDiv) loginDiv.style.display = "flex";
    if (userinfo) userinfo.style.display = "none";

    if (avatar) {
      avatar.style.cursor = "default";
      avatar.onclick = null;
    }
    if (picture) picture.onclick = null;
  }

  // Logout
  btnOut?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("loggedInUserId");
      document.querySelector(".loginDiv")?.classList.remove("hidden");
      location.reload();
    } catch (err) {
      alert("Logout-Fehler: " + err.message);
    }
  });
}

// ============================================================================
// 11. INIT
// ============================================================================
function init() {
  injectAuth();
  setupPanelToggle();
  setupResetPassword();
  setupRegistration();
  setupLogin();
  setupSession();
}

// Starten wenn DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
