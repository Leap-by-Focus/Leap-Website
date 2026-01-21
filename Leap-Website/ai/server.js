// server.js — Leap AI Core (Final Clean Version)
import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import os from "os";
import fs from "fs";
import path from "path";
import url from "url";
import { execSync } from "child_process";

const app = express();
const __filename = url.fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);

// ---- Basis-Middleware -------------------------------------------------
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 LÖSUNG: Wir servieren das ganze Projekt über Port 8081
const projectRoot = path.join(__dirnameLocal, '..'); 
app.use(express.static(projectRoot));

// Redirect Root to AI
app.get("/", (req, res) => {
    res.redirect("/html/ai.html");
});

// Upload für Bild (RAM Speicher)
const upload = multer({ storage: multer.memoryStorage() });

// ---- Ports / Config ---------------------------------------------------
const PORT = 8081;
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";

const MODELS = {
  general: "qwen2.5:3b",        
  vision: "llava:7b",           
  embed: "nomic-embed-text",
};

// ---- Leap Index Laden -------------------------------------------------
const LEAP_INDEX_FILE = path.join(__dirnameLocal, "leap_index.json");
let LEAP_INDEX = [];

function loadLeapIndex() {
  try {
    if (!fs.existsSync(LEAP_INDEX_FILE)) {
      console.warn("⚠️ leap_index.json nicht gefunden (RAG deaktiviert).");
      LEAP_INDEX = [];
      return;
    }
    const raw = fs.readFileSync(LEAP_INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw);
    LEAP_INDEX = parsed.items || [];
    console.log(`✅ Leap-Index geladen: ${LEAP_INDEX.length} Chunks`);
  } catch (err) {
    console.error("❌ Fehler beim Laden des Leap-Index:", err.message);
    LEAP_INDEX = [];
  }
}
loadLeapIndex();

// ---- RAG Helpers ------------------------------------------------------
async function embedText(text) {
  const body = { model: MODELS.embed, input: text };
  const res = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Embedding Error");
  const data = await res.json();
  return data.embedding || (Array.isArray(data.embeddings) ? data.embeddings[0] : null);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return (!na || !nb) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Hilfsfunktion: RAG Context holen
async function retrieveLeapContext(query) {
  if (!LEAP_INDEX.length || !query) return "";
  try {
    const qEmbedding = await embedText(query);
    const scored = LEAP_INDEX.map((item) => ({
      ...item,
      score: cosineSimilarity(qEmbedding, item.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    // Top 5 Chunks
    const hits = scored.slice(0, 5);
    return hits.map(h => `// ${h.file}\n${h.text}`).join("\n\n");
  } catch (e) { 
    console.error("RAG Error:", e.message); 
    return "";
  }
}

// ---- Session History --------------------------------------------------
const sessions = new Map();
const MAX_HISTORY = 8;

function getSession(cid = "default") {
  if (!sessions.has(cid)) sessions.set(cid, { history: [] });
  return sessions.get(cid);
}

// =======================================================================
// 🔥 API ROUTE: CHAT (MIT VISION FIX)
// =======================================================================
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const userMessage = req.body.text || "";
    const useContext = req.body.useLeapContext === "true";
    const sessionId = req.body.sessionId || "default";
    const file = req.file;
    const hasImage = !!file; // Check ob Bild dabei ist

    console.log(`\n📩 Neue Anfrage: "${userMessage.substring(0, 50)}..."`);
    if (hasImage) console.log("📷 Bild erkannt: Vision Mode aktiv");

    // 1. STANDARD SYSTEM PROMPT (Die "Leap Persönlichkeit")
    const LEAP_PERSONA = `
      Du bist 'Leap AI', ein Experte für die Lern-Programmiersprache 'Leap'.
      - Antworte kurz, präzise und hilfreich.
      - Leap ist eine imperative Sprache OHNE Klassen und OHNE Imports.
      - Syntax: 'x = 10;', 'ausgeben(x);', 'wiederhole 5 mal {}'.
      - Erfinde keine Funktionen, die es in Leap nicht gibt.
    `;

    // 2. VISION SYSTEM PROMPT (Der "neutrale Beobachter")
    const VISION_PERSONA = `
      Du bist ein visueller Assistent. 
      Analysiere das Bild präzise. 
      - Wenn es Code zeigt: Analysiere den Code und suche Fehler.
      - Wenn es ein Objekt/Szene ist: Beschreibe es neutral und sachlich.
      - Versuche NICHT, Objekte krampfhaft als Programmiersprache zu interpretieren.
    `;

    let finalSystemPrompt = LEAP_PERSONA;
    let contextData = "";
    let selectedModel = MODELS.general;

    // 🔥 DIE WEICHE (Fix für Halluzinationen)
    if (hasImage) {
      // A) BILD-MODUS: Leap-Kontext AUS, Vision-Modell AN
      finalSystemPrompt = VISION_PERSONA;
      selectedModel = MODELS.vision;
      console.log("🚫 Leap-Kontext deaktiviert für Bild-Analyse.");
    } else {
      // B) TEXT-MODUS: RAG AN, General-Modell AN
      if (useContext) {
        contextData = await retrieveLeapContext(userMessage);
        if (contextData) {
          console.log("📚 RAG Kontext geladen.");
          finalSystemPrompt += `\n\nKONTEXT AUS DER DOKUMENTATION:\n${contextData}`;
        }
      }
    }

    // Nachricht an Ollama zusammenbauen
    let messages = [];

    // System Prompt setzen
    messages.push({
      role: "system",
      content: finalSystemPrompt
    });

    // History holen & anhängen (nur bei Text sinnvoll, Vision verwirrt History oft)
    const session = getSession(sessionId);
    if (!hasImage && session.history.length > 0) {
        messages.push(...session.history);
    }

    // User Nachricht + Bild (falls vorhanden)
    const userContent = {
      role: "user",
      content: userMessage || (hasImage ? "Beschreibe dieses Bild." : "")
    };

    if (hasImage) {
      // WICHTIG: base64 nutzen, da memoryStorage keinen path hat!
      userContent.images = [file.buffer.toString("base64")];
    }

    messages.push(userContent);

    // OLLAMA AUFRUF
    const payload = {
        model: selectedModel,
        stream: false,
        options: { temperature: 0.3, num_ctx: 2048 },
        messages: messages
    };

    const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);
    const data = await response.json();
    const answer = data.message?.content || "(Keine Antwort)";

    // History speichern (nur Text)
    if (!hasImage) {
        session.history.push({ role: "user", content: userMessage });
        session.history.push({ role: "assistant", content: answer });
        // Max History begrenzen
        if (session.history.length > MAX_HISTORY) session.history = session.history.slice(-MAX_HISTORY);
    }

    // Antwort senden
    res.json({
        model: selectedModel,
        answer: answer,
        suggestions: ["Beispiel zeigen", "Erkläre das genauer"],
        meta: { session: sessionId }
    });

  } catch (err) {
      console.error("🔥 Server Error:", err.message);
      res.status(500).json({ error: "Interner Fehler: " + err.message });
  }
});

// ===== Start & Graceful Shutdown ======================================
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 LEAP SERVER (Optimized) läuft auf Port ${PORT}`);
  console.log(`🌐 DEINE URL: http://localhost:${PORT}/html/ai.html`);
});

// Funktion zum sauberen Beenden
function shutdown(signal) {
  console.log(`\n👋 ${signal} empfangen. Fahre Server herunter...`);
  server.close((err) => {
    if (err) console.error("❌ Fehler beim Schließen:", err);
    console.log("✅ Server geschlossen. Port " + PORT + " ist wieder frei.");
    process.exit(0);
  });
  
  // Timeout sicherheitshalber
  setTimeout(() => process.exit(1), 2000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));