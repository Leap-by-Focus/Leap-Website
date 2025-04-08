// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyBGs1Xx3VH2XZHT-k12Xsf_1Nz0gJBNB-Y",
  authDomain: "leap-001.firebaseapp.com",
  projectId: "leap-001",
  storageBucket: "leap-001.firebasestorage.app",
  messagingSenderId: "177255891538",
  appId: "1:177255891538:web:9a7cc6d28f874aadc7d58b"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Nachricht anzeigen
function showMessage(message, divId, type = "error") {
  const messageDiv = document.getElementById(divId);
  if (!messageDiv) {
    console.warn(`Fehlendes Message-Element mit ID: ${divId}`);
    return;
  }

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

// REGISTRIERUNG
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

    const userData = { email, username };
    await setDoc(doc(db, "users", user.uid), userData);

    showMessage("Account erfolgreich erstellt!", "signUpMessage", "success");
    localStorage.setItem("loggedInUserId", user.uid);
    window.location.href = "index.html";
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      showMessage("Diese E-Mail-Adresse wird bereits verwendet.", "signUpMessage");
    } else {
      showMessage("Fehler bei der Registrierung: " + error.message, "signUpMessage");
    }
  }
});

// LOGIN (per Benutzername statt E-Mail!)
document.getElementById("submitbuttonlogin").addEventListener("click", async (event) => {
  event.preventDefault();
  const username = document.getElementById("logUsername").value.trim();
  const password = document.getElementById("logPassword").value;

  if (!username || !password) {
    showMessage("Bitte Benutzername und Passwort eingeben.", "signInMessage");
    return;
  }

  try {
    // Suche E-Mail zur Benutzernamen
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      showMessage("Benutzername existiert nicht.", "signInMessage");

      // Direktes Anpassen der Styles
      const messageDiv = document.getElementById("signInMessage");
      messageDiv.style.padding = "-10px";
      messageDiv.style.margin = "-10px";
      return;
    }

    const userData = querySnapshot.docs[0].data();
    const email = userData.email;

    // Login mit E-Mail und Passwort
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    localStorage.setItem("loggedInUserId", user.uid);
    showMessage("Login erfolgreich!", "signInMessage", "success");
    window.location.href = "index.html";
  } catch (error) {
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      showMessage("Falscher Benutzername oder Passwort.", "signInMessage");
    } else {
      showMessage("Fehler beim Login: " + error.message, "signInMessage");
    }
  }
});

// Prüfen, ob der Benutzer eingeloggt ist und den Logout-Button anzeigen
window.addEventListener("DOMContentLoaded", () => {
  const userId = localStorage.getItem("loggedInUserId");
  const logoutButton = document.querySelector('.userinfo');
  const loginButton = document.querySelector('#loginButton');
  const registerButton = document.querySelector('#registerButton');

  // Wenn der Benutzer eingeloggt ist
  if (userId) {
    logoutButton.style.display = "block";
    loginButton.style.display = "none";
    registerButton.style.display = "none";
  } else {
    logoutButton.style.display = "none";
    loginButton.style.display = "block";
    registerButton.style.display = "block";
  }
});

// LOGOUT
document.querySelector('.userinfo button').addEventListener("click", async () => {
  try {
    // Firebase logout
    await signOut(auth);

    // Entferne den Benutzer aus dem lokalen Speicher und setze den Button zurück
    localStorage.removeItem("loggedInUserId");

    // Setze die Anzeige zurück
    document.querySelector('.userinfo').style.display = 'none'; // Verstecke den Logout-Button
    document.querySelector('#loginButton').style.display = 'block';
    document.querySelector('#registerButton').style.display = 'block';
    
    // Weiterleitung zur Login-Seite oder Refresh
    window.location.href = "index.html"; // Zum Beispiel zur Login-Seite
  } catch (error) {
    showMessage("Fehler beim Logout: " + error.message, "signInMessage");
  }
});