// js/firebaseauth.js
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  fetchSignInMethodsForEmail
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

// ⚠️ üblich: "<projectId>.appspot.com"
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
export const db   = getFirestore(app);
auth.languageCode = "de";

/* Helpers */
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
  const init = (a + b).toUpperCase();
  return init || "🙂";
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

/* Registrierung */
document.getElementById("submitbuttonregister")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const email    = document.getElementById("regEmail").value.trim();
  const pw       = document.getElementById("regPassword").value;
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
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      username,
      createdAt: serverTimestamp(),
      photoURL: "/assets/images/newAccount.jpeg"
    });

// NACH erfolgreichem Login:
showMessage("Login erfolgreich!", "signInMessage", "success");
localStorage.setItem("loggedInUserId", cred.user.uid);
document.querySelector('.loginDiv')?.classList.add('hidden'); // UI weg
location.reload(); // <— statt window.location.href = "index.html";
  } catch (err) {
    showMessage(err.message, "signInMessage");
  }
});

/* Login per Benutzername ODER E-Mail (Form-Submit) */
document.querySelector(".loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const usernameOrEmail = document.getElementById("logUsername").value.trim();
  const pw              = document.getElementById("logPassword").value;

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
        showMessage("Zu diesem Benutzer ist keine E-Mail gespeichert.", "signInMessage");
        return;
      }
    }

    // Optionaler Check – zur Klarheit kann man ihn auch entfernen:
    // const methods = await fetchSignInMethodsForEmail(auth, emailToUse);
    // if (!methods.includes("password")) {
    //   showMessage("Für diese E-Mail ist keine Passwort-Anmeldung aktiv.", "signInMessage");
    //   return;
    // }

    const cred = await signInWithEmailAndPassword(auth, emailToUse, pw);
// NACH erfolgreichem Login:
showMessage("Login erfolgreich!", "signInMessage", "success");
localStorage.setItem("loggedInUserId", cred.user.uid);
document.querySelector('.loginDiv')?.classList.add('hidden'); // UI weg
location.reload(); // <— statt window.location.href = "index.html";
  } catch (err) {
    const map = {
      "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
      "auth/wrong-password":     "Passwort ist falsch.",
      "auth/user-not-found":     "Kein Konto mit dieser E-Mail.",
      "auth/too-many-requests":  "Zu viele Versuche. Bitte später erneut.",
      "auth/network-request-failed": "Netzwerkfehler. Prüfe deine Verbindung."
    };
    showMessage(map[err?.code] || ("Fehler beim Login: " + (err?.message || String(err))), "signInMessage");
    console.error("[login]", err);
  }
});

/* UI / Session */
window.addEventListener("DOMContentLoaded", async () => {
  const uid      = localStorage.getItem("loggedInUserId");
  const btnLogin = document.getElementById("loginButton");
  const btnReg   = document.getElementById("registerButton");
  const btnOut   = document.getElementById("submitlogout");
  const infoBox  = document.querySelector(".userinfo");
  const charBox  = document.querySelector(".CharacterName");
  const avatar   = document.getElementById("avatarLink");
  const picture  = document.getElementById("picture");

  if (uid) {
    btnLogin && (btnLogin.style.display = "none");
    btnReg   && (btnReg.style.display   = "none");
    btnOut   && (btnOut.style.display   = "block");
    infoBox  && (infoBox.style.display  = "flex");

    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        const username = data.username || "Unbekannter Nutzer";
        const photoURL = data.photoURL || "/assets/images/newAccount.jpeg";

        if (charBox) charBox.textContent = username;
        document.querySelectorAll(".usernameDisplay").forEach(el => { el.textContent = username; });

        if (avatar) {
          setAvatar(avatar, photoURL, username);
          avatar.style.cursor = "pointer";
          avatar.onclick = () => (window.location.href = "../html/settings.html");
        }

        if (picture) {
          const normal = photoURL;
          const hover  = "/assets/images/newAccount-hover.jpeg";
          setPicture(picture, normal);
          picture.addEventListener("mouseenter", () => { picture.style.backgroundImage = `url("${hover}")`; });
          picture.addEventListener("mouseleave", () => { picture.style.backgroundImage = `url("${normal}")`; });
        }

        if (data.createdAt) {
          const d = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          const formatted = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
          const memberSinceEl = document.getElementById("memberSince");
          if (memberSinceEl) memberSinceEl.textContent = formatted;
        }
      }
    } catch {
      if (charBox) charBox.textContent = "Fehler beim Laden";
      if (avatar) setAvatar(avatar, "/assets/images/newAccount.jpeg", "");
      if (picture) setPicture(picture, "/assets/images/newAccount.jpeg");
    }
  } else {
    btnLogin && (btnLogin.style.display = "block");
    btnReg   && (btnReg.style.display   = "block");
    btnOut   && (btnOut.style.display   = "none");
    infoBox  && (infoBox.style.display  = "none");

    if (avatar) { avatar.style.cursor = "default"; avatar.onclick = null; }
    if (picture) { picture.onclick = null; }
  }

  btnOut?.addEventListener("click", async () => {
    try {
await signOut(auth);
localStorage.removeItem("loggedInUserId");
document.querySelector('.loginDiv')?.classList.remove('hidden');
location.reload(); // <— statt window.location.href = "index.html";
    } catch (err) {
      alert("Logout-Fehler: " + err.message);
    }
  });
});