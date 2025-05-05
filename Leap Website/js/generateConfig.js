// generateConfig.js
import fs from "fs";
import { config } from "dotenv";

config(); // lädt .env

const out = `
// ACHTUNG: wird nicht ins Git eingecheckt
window.FIREBASE_CONFIG = {
  apiKey:            "${process.env.FIREBASE_API_KEY}",
  authDomain:        "${process.env.FIREBASE_AUTH_DOMAIN}",
  projectId:         "${process.env.FIREBASE_PROJECT_ID}",
  storageBucket:     "${process.env.FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
  appId:             "${process.env.FIREBASE_APP_ID}"
};
`;

fs.writeFileSync("public/firebaseConfig.js", out.trim());
console.log("✅ public/firebaseConfig.js erzeugt");