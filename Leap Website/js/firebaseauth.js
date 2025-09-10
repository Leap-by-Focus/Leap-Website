// firebaseauth.js
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
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
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

/* =========================================
   Firebase Init
========================================= */
const firebaseConfig = {
  apiKey: "AIzaSyBGs1Xx3VH2XZHT-k12Xsf_1Nz0gJBNB-Y",
  authDomain: "leap-001.firebaseapp.com",
  projectId: "leap-001",
  storageBucket: "leap-001.firebasestorage.app",
  messagingSenderId: "177255891538",
  appId: "1:177255891538:web:9a7cc6d28f874aadc7d58b"
};

let app;
try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

/* =========================================
   Helpers
========================================= */
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

async function updateUserAvatar(uid, file) {
  const path = `users/${uid}/profile.jpg`; // überschreibt stets dieselbe Datei
  const ref  = sRef(storage, path);
  await uploadBytes(ref, file, { contentType: file.type });
  const url = await getDownloadURL(ref);
  await setDoc(doc(db, "users", uid), { photoURL: url }, { merge: true });
  return url;
}

/* =========================================
   Registrierung (setzt photoURL auf Default)
========================================= */
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
      photoURL: "/assets/images/newAccount.jpeg" // Standardbild (root-relativ)
    });

    showMessage("Account erstellt!", "signInMessage", "success");
    localStorage.setItem("loggedInUserId", cred.user.uid);
    window.location.href = "index.html";
  } catch (err) {
    showMessage(err.message, "signInMessage");
  }
});

/* =========================================
   Login per Username
========================================= */
document.getElementById("submitbuttonlogin")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const username = document.getElementById("logUsername").value.trim();
  const pw       = document.getElementById("logPassword").value;

  if (!username || !pw) {
    showMessage("Bitte Benutzername & Passwort eingeben.", "signInMessage");
    return;
  }

  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const snap = await getDocs(q);
    if (snap.empty) {
      showMessage("Benutzername existiert nicht.", "signInMessage");
      return;
    }
    const { email } = snap.docs[0].data();

    const cred = await signInWithEmailAndPassword(auth, email, pw);
    showMessage("Login erfolgreich!", "signInMessage", "success");
    localStorage.setItem("loggedInUserId", cred.user.uid);
    window.location.href = "index.html";
  } catch (err) {
    showMessage("Fehler beim Login: " + err.message, "signInMessage");
  }
});

/* =========================================
   UI / Session Handling (+ Avatar Upload via #picture)
========================================= */
window.addEventListener("DOMContentLoaded", async () => {
  const uid      = localStorage.getItem("loggedInUserId");
  const btnLogin = document.getElementById("loginButton");
  const btnReg   = document.getElementById("registerButton");
  const btnOut   = document.getElementById("submitlogout");
  const infoBox  = document.querySelector(".userinfo");
  const charBox  = document.querySelector(".CharacterName");
  const avatar   = document.getElementById("avatarLink"); // kleines rundes Bild (div.character#avatarLink)
  const picture  = document.getElementById("picture");    // großes Profilbild

  // unsichtbares File-Input für Bild-Upload (einmalig)
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

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

        // Username anzeigen
        if (charBox) charBox.textContent = username;
        document.querySelectorAll(".usernameDisplay").forEach(el => el.textContent = username);

        // kleines Avatar (oben)
        if (avatar) {
          setAvatar(avatar, photoURL, username);
          avatar.style.cursor = "pointer";
          avatar.onclick = () => (window.location.href = "../html/settings.html");
        }

        // großes Bild (einmalig, inkl. Hover + Upload)
        if (picture) {
          // Start-URLs
          let pictureNormal = photoURL;                         // wird nach Upload aktualisiert
          const pictureHover = "/assets/images/newAccount-hover.jpeg";

          // normales Bild setzen
          setPicture(picture, pictureNormal);

          // Hover-Events (verwenden die VARIABLE pictureNormal)
          picture.addEventListener("mouseenter", () => {
            picture.style.backgroundImage = `url("${pictureHover}")`;
          });
          picture.addEventListener("mouseleave", () => {
            picture.style.backgroundImage = `url("${pictureNormal}")`;
          });

          // Klick → Datei wählen
          picture.addEventListener("click", () => fileInput.click());

          // Upload-Flow (nur EIN Handler)
          fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            // simple Checks
            if (!file.type.startsWith("image/")) {
              showMessage("Bitte ein Bild auswählen.", "signInMessage");
              fileInput.value = "";
              return;
            }
            const MAX_MB = 8;
            if (file.size > MAX_MB * 1024 * 1024) {
              showMessage(`Bild zu groß (max. ${MAX_MB} MB).`, "signInMessage");
              fileInput.value = "";
              return;
            }

            try {
              // 1) Upload + URL speichern
              const newUrl = await updateUserAvatar(uid, file);

              // 2) UI updaten
              pictureNormal = newUrl;             // <<< WICHTIG: Hover nutzt jetzt neue URL
              setPicture(picture, pictureNormal); // setzt background + cache-busting
              if (avatar) setAvatar(avatar, newUrl, username);

              showMessage("Profilbild aktualisiert!", "signInMessage", "success");
            } catch (e) {
              console.error(e);
              showMessage("Upload fehlgeschlagen.", "signInMessage");
            } finally {
              fileInput.value = ""; // reset
            }
          };
        }

        // Member seit
        if (data.createdAt) {
          const d = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          const formatted = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
          const memberSinceEl = document.getElementById("memberSince");
          if (memberSinceEl) memberSinceEl.textContent = formatted;
        }
      }
    } catch (e) {
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

  // Logout
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

/* =========================================
   HINWEIS Storage-Rules (in Firebase Console):
-------------------------------------------
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/profile.jpg {
      allow read: if true; // oder nur für eingeloggte Nutzer
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
========================================= */