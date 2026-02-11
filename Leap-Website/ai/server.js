/*  ┌───────────────────────────────────────────────────────────────────────────┐
 *  │  Leap AI – Express-Server mit Ollama + RAG + Logging + File-Watcher      │
 *  └───────────────────────────────────────────────────────────────────────────┘
 */

import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Eigene Module ──────────────────────────────────────────────────────────────
import logger from "./src/logger.js";
import { ollamaGuard, checkOllamaHealth } from "./src/health.js";
import * as rag from "./src/rag.js";
import * as prompt from "./src/prompt.js";
import { startFileWatcher } from "./src/file-watcher.js";

// ── Konfiguration ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8081;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DATASET_PATH = path.join(__dirname, "dataset.jsonl");

const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Express App ────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..", "html")));
app.use("/css", express.static(path.join(__dirname, "..", "css")));
app.use("/js", express.static(path.join(__dirname, "..", "js")));
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));


const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    cb(null, allowed.test(file.mimetype));
  }
});

// ── Chat-History (in-memory pro Session) ───────────────────────────────────────
let chatHistory = [];

function buildMessages(userMessage, imageBase64 = null) {
  const systemPrompt = prompt.generateSystemPrompt();
  const messages = [{ role: "system", content: systemPrompt }];

  for (const msg of chatHistory.slice(-10)) {
    messages.push(msg);
  }

  const userContent = imageBase64
    ? [{ type: "text", text: userMessage }, { type: "image_url", image_url: 
      { url: `data:image/png;base64,${imageBase64}` } }]: userMessage;

  messages.push({ role: "user", content: userContent });
  return messages;
}

// ── Health-Check Endpoint ──────────────────────────────────────────────────────
app.get("/health", async (_, res) => {
  const health = await checkOllamaHealth();
  res.status(health ? 200 : 503).json(health);
});

// ── Echo Endpoint (für Load-Tests ohne Ollama) ─────────────────────────────────
app.post("/api/echo", (req, res) => {
  const { message } = req.body;
  // Simuliere etwas Arbeit (RAG-Lookup, Prompt-Building)
  const context = rag.getIndexStats();
  const delay = Math.random() * 50 + 10; // 10-60ms simulierte Latenz
  
  setTimeout(() => {
    res.json({
      response: `Echo: ${message}`,
      ragStats: context,
      processingTime: Math.round(delay),
    });
  }, delay);
});

// ── Chat Endpoint (mit RAG + Ollama Guard) ─────────────────────────────────────
app.post("/api/chat", ollamaGuard, async (req, res) => {
  try {
    const { message, image } = req.body;
    if (!message) return res.status(400).json({ error: "Nachricht fehlt" });

    logger.info(`Chat-Anfrage: "${message.substring(0, 50)}..."`);
    const messages = buildMessages(message, image);

    // Ollama API Call
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:3b",
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Ollama Fehler: ${errText}`);
      return res.status(500).json({ error: "Ollama-Anfrage fehlgeschlagen" });
    }

    const data = await response.json();
    const assistantMessage = data.message?.content || "Keine Antwort erhalten";

    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: assistantMessage });

    logger.info(`Chat-Antwort generiert (${assistantMessage.length} Zeichen)`);
    res.json({ response: assistantMessage });

  } catch (err) {
    logger.error(`Chat-Fehler: ${err.message}`);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// ── Bild-Upload Endpoint ───────────────────────────────────────────────────────
app.post("/api/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Kein Bild hochgeladen" });
  
  const base64 = fs.readFileSync(req.file.path, { encoding: "base64" });
  fs.unlinkSync(req.file.path); // Cleanup
  
  logger.info(`Bild hochgeladen: ${req.file.originalname}`);
  res.json({ base64 });
});

// ── Feedback Endpoint ──────────────────────────────────────────────────────────
app.post("/api/feedback", (req, res) => {
  const { messageId, rating, userMessage, assistantResponse } = req.body;

  if (!messageId || !rating || !userMessage || !assistantResponse) {
    return res.status(400).json({ error: "Fehlende Felder" });
  }

  const feedbackEntry = {
    id: messageId,
    rating,
    userMessage,
    assistantResponse,
    timestamp: new Date().toISOString()
  };

  fs.appendFileSync(DATASET_PATH, JSON.stringify(feedbackEntry) + "\n");
  logger.info(`Feedback gespeichert: ${rating} für Message ${messageId}`);
  
  res.json({ success: true });
});

// ── Code ausführen (Leap Interpreter) ──────────────────────────────────────────
app.post("/api/run-code", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Kein Code übergeben" });

  const jarPath = path.join(__dirname, "leap-code", "leap-interpreter.jar");
  const tempFile = path.join(__dirname, "temp_code.lp");

  fs.writeFileSync(tempFile, code);

  const proc = spawn("java", ["-jar", jarPath, tempFile]);
  let stdout = "", stderr = "";

  proc.stdout.on("data", d => stdout += d.toString());
  proc.stderr.on("data", d => stderr += d.toString());

  proc.on("close", (exitCode) => {
    fs.unlinkSync(tempFile);
    res.json({ output: stdout, error: stderr, exitCode });
  });

  proc.on("error", (err) => {
    logger.error(`Interpreter-Fehler: ${err.message}`);
    res.status(500).json({ error: "Interpreter konnte nicht gestartet werden" });
  });
});

// ── Chat-History löschen ───────────────────────────────────────────────────────
app.post("/api/clear-history", (_, res) => {
  chatHistory = [];
  logger.info("Chat-History gelöscht");
  res.json({ success: true });
});

// ── RAG Index Stats ────────────────────────────────────────────────────────────
app.get("/api/rag-stats", (_, res) => {
  res.json(rag.getIndexStats());
});

// ── Statische Seite ────────────────────────────────────────────────────────────
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "..", "html", "ai.html"));
});

// ── Server starten ─────────────────────────────────────────────────────────────
async function startServer() {
  try {
    // RAG Index laden
    rag.loadLeapIndex();
    rag.loadInterpreterFeatures();
    console.log("✅ RAG Index geladen");

    // File-Watcher starten
    startFileWatcher(() => {
      rag.hotReloadRAG();
      console.log("🔄 RAG Index wurde neu geladen");
    });
    console.log("👁️  File Watcher aktiv");

    // Express Server starten
    app.listen(PORT, () => {
      console.log(`🚀 SERVER läuft auf Port ${PORT}`);
      console.log(`   → http://localhost:${PORT}`);
      logger.info(`Server gestartet auf Port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Server konnte nicht gestartet werden:", err.message);
    logger.error(`Server-Start fehlgeschlagen: ${err.message}`);
    process.exit(1);
  }
}

startServer();
