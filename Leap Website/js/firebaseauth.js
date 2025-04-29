// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Firebase Konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyBGs1Xx3VH2XZHT-k12Xsf_1Nz0gJBNB-Y",
  authDomain: "leap-001.firebaseapp.com",
  projectId: "leap-001",
  storageBucket: "leap-001.firebasestorage.app",
  messagingSenderId: "177255891538",
  appId: "1:177255891538:web:9a7cc6d28f874aadc7d58b"
};

// Initialisierung
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Nachricht anzeigen
function showMessage(message, divId, type = "error") {
  const messageDiv = document.getElementById(divId);
  if (!messageDiv) return console.warn(`Fehlendes Message-Element mit ID: ${divId}`);

  messageDiv.className = "alert";
  messageDiv.classList.add(type === "success" ? "alert-success" : "alert-error");
  messageDiv.innerHTML = message;
  messageDiv.style.display = "block";
  messageDiv.style.opacity = 1;

  setTimeout(() => {
    messageDiv.style.opacity = 0;
    setTimeout(() => {
      messageDiv.style.display = "none";
    }, 500);
  }, 5000);
}

// Registrierung mit E-Mail und Passwort
document.getElementById("submitbuttonregister").addEventListener("click", async (event) => {
  event.preventDefault();

  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const username = document.getElementById("regUsername").value.trim();

  if (!email || !password || !username) {
    showMessage("Bitte alle Felder ausfüllen.", "signUpMessage");
    return;
  }

  if (password.length < 6) {
    showMessage("Das Passwort muss mindestens 6 Zeichen lang sein.", "signUpMessage");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      email,
      username
    });

    showMessage("Registrierung erfolgreich!", "signUpMessage", "success");
    localStorage.setItem("loggedInUserId", user.uid);
    window.location.href = "index.html";
  } catch (error) {
    showMessage("Fehler bei der Registrierung: " + error.message, "signUpMessage");
  }
});

// LOGIN mit E-Mail und Passwort
document.getElementById("submitbuttonlogin").addEventListener("click", async (event) => {
  event.preventDefault();
  const email = document.getElementById("logEmail").value.trim();
  const password = document.getElementById("logPassword").value;

  if (!email || !password) {
    showMessage("Bitte E-Mail und Passwort eingeben.", "signInMessage");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    localStorage.setItem("loggedInUserId", user.uid);
    showMessage("Login erfolgreich!", "signInMessage", "success");
    window.location.href = "index.html";
  } catch (error) {
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      showMessage("Falsche E-Mail oder Passwort.", "signInMessage");
    } else {
      showMessage("Fehler beim Login: " + error.message, "signInMessage");
    }
  }
});

// ENTER-Taste: Login/Registrierung
["regPassword", "logPassword"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById(id === "regPassword" ? "submitbuttonregister" : "submitbuttonlogin").click();
    }
  });
});

// UI beim Start
window.addEventListener("DOMContentLoaded", async () => {
  const userId = localStorage.getItem("loggedInUserId");
  const loginButton = document.getElementById("loginButton");
  const registerButton = document.getElementById("registerButton");
  const logoutButton = document.getElementById("submitlogout");
  const userinfoBox = document.querySelector(".userinfo");
  const characterNameBox = document.querySelector(".CharacterName");

  // Benutzerinfo und Buttons anzeigen, wenn der Benutzer eingeloggt ist
  if (userId) {
    loginButton.style.display = "none";
    registerButton.style.display = "none";
    logoutButton.style.display = "block";  // Zeige den Logout-Button an
    if (userinfoBox) userinfoBox.style.display = "flex";  // Benutzerinfo anzeigen

    try {
      const userDocSnap = await getDoc(doc(db, "users", userId));
      if (userDocSnap.exists()) {
        characterNameBox.textContent = userDocSnap.data().username;
      } else {
        characterNameBox.textContent = "Unbekannter Nutzer";
      }
    } catch (error) {
      characterNameBox.textContent = "Fehler beim Laden des Benutzernamens";
    }
  } else {
    loginButton.style.display = "block";
    registerButton.style.display = "block";
    logoutButton.style.display = "none";  // Verstecke den Logout-Button
    if (userinfoBox) userinfoBox.style.display = "none";  // Verstecke die Benutzerinfo
    characterNameBox.textContent = "";
  }

  // LOGOUT – Logout-Button Event Listener hinzufügen
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        // Firebase Logout
        await signOut(auth);

        // Entferne Benutzer-ID aus dem localStorage
        localStorage.removeItem("loggedInUserId");

        // UI anpassen: Logout-Button und Benutzerinfo verstecken
        loginButton.style.display = "block";  // Zeige den Login-Button
        registerButton.style.display = "block";  // Zeige den Register-Button
        logoutButton.style.display = "none";  // Verstecke den Logout-Button
        if (userinfoBox) userinfoBox.style.display = "none";  // Verstecke die Benutzerinfo

        // Weiterleitung zur Login-Seite oder Startseite
        window.location.href = "index.html";  // Leite den Benutzer zurück zur Startseite
      } catch (error) {
        alert("Fehler beim Logout: " + error.message);  // Fehler anzeigen
      }
    });
  }
});