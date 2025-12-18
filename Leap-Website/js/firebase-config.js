import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, child } from "firebase/database";

// Deine Firebase-Konfigurationsdaten
const firebaseConfig = {
    apiKey: "DEINE_API_KEY", // API-Schlüssel
    authDomain: "DEIN_AUTH_DOMAIN",
    databaseURL: "DEIN_DATABASE_URL",
    projectId: "DEIN_PROJECT_ID",
    storageBucket: "DEIN_STORAGE_BUCKET",
    messagingSenderId: "DEIN_MESSAGING_SENDER_ID",
    appId: "DEIN_APP_ID",
    measurementId: "DEIN_MEASUREMENT_ID"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, child };