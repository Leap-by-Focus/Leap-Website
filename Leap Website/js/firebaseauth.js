// firebaseauth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Deine Firebase-Config
const firebaseConfig = {
  apiKey: "AIzaSyBGs1Xx3VH2XZHT-k12Xsf_1Nz0gJBNB-Y",
  authDomain: "leap-001.firebaseapp.com",
  projectId: "leap-001",
  storageBucket: "leap-001.firebasestorage.app",
  messagingSenderId: "177255891538",
  appId: "1:177255891538:web:9a7cc6d28f874aadc7d58b"
};

// init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Feedback-Helper
function showMessage(msg, divId, type = "error") {
  const el = document.getElementById(divId);
  if (!el) return;
  el.className = "alert " + (type === "success" ? "alert-success" : "alert-error");
  el.textContent = msg;
  el.style.opacity = 1;
  el.style.display = "block";
  setTimeout(() => {
    el.style.opacity = 0;
    setTimeout(() => el.style.display = "none", 500);
  }, 4000);
}

// REGISTRIERUNG
document
  .getElementById("submitbuttonregister")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    const email = document.getElementById("regEmail").value.trim();
    const pw = document.getElementById("regPassword").value;
    const username = document.getElementById("regUsername").value.trim();

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
      await setDoc(doc(db, "users", cred.user.uid), { email, username });
      showMessage("Account erstellt!", "signInMessage", "success");
      localStorage.setItem("loggedInUserId", cred.user.uid);
      window.location.href = "index.html";
    } catch (err) {
      showMessage(err.message, "signInMessage");
    }
  });

// LOGIN per BENUTZERNAME
document
  .getElementById("submitbuttonlogin")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    const username = document.getElementById("logUsername").value.trim();
    const pw = document.getElementById("logPassword").value;
    if (!username || !pw) {
      showMessage("Bitte Benutzername & Passwort eingeben.", "signInMessage");
      return;
    }

    try {
      // erst E-Mail via Username in Firestore holen:
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("username", "==", username));
      const snap = await getDocs(q);
      if (snap.empty) {
        showMessage("Benutzername existiert nicht.", "signInMessage");
        return;
      }
      const { email } = snap.docs[0].data();

      // dann mit E-Mail einloggen:
      const cred = await signInWithEmailAndPassword(auth, email, pw);
      showMessage("Login erfolgreich!", "signInMessage", "success");
      localStorage.setItem("loggedInUserId", cred.user.uid);
      window.location.href = "index.html";
    } catch (err) {
      showMessage("Fehler beim Login: " + err.message, "signInMessage");
    }
  });

// UI bei Laden
window.addEventListener("DOMContentLoaded", async () => {
  const uid = localStorage.getItem("loggedInUserId");
  const btnLogin = document.getElementById("loginButton");
  const btnReg   = document.getElementById("registerButton");
  const btnOut   = document.getElementById("submitlogout");
  const infoBox  = document.querySelector(".userinfo");
  const charBox  = document.querySelector(".CharacterName");

  if (uid) {
    btnLogin.style.display = "none";
    btnReg.style.display   = "none";
    btnOut.style.display   = "block";
    infoBox.style.display  = "flex";
    try {
      const snap = await getDoc(doc(db, "users", uid));
      charBox.textContent = snap.exists() ? snap.data().username : "Unbekannter Nutzer";
    } catch {
      charBox.textContent = "Fehler beim Laden";
    }
  } else {
    btnLogin.style.display = "block";
    btnReg.style.display   = "block";
    btnOut.style.display   = "none";
    infoBox.style.display  = "none";
  }

  // LOGOUT
  btnOut?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("loggedInUserId");
      window.location.href = "index.html";
    } catch (err) {
      alert("Logout-Fehler: " + err.message);
    }
  });
});