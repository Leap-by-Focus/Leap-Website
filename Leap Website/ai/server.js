// server.js — Leap AI Core (4 Modelle, kein RAG)
import express from "express";
import multer from "multer";
import fetch from "node-fetch";

const app = express();
const upload = multer();

const PORT = 8000;
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";

const MODELS = {
  general: "llama3.1:8b",        // Text & allgemeine Fragen
  coder: "qwen2.5-coder:7b",     // Programmierfragen
  vision: "qwen2-vl:7b",         // Bilderkennung
  embed: "nomic-embed-text"      // (nur falls du Embeddings brauchst)
};

const TIMEOUT = 120000;

// === Hilfsfunktion zum Modell-Pick ===
function pickModel(text, hasImage, queryModel) {
  if (queryModel && MODELS[queryModel]) return MODELS[queryModel];
  if (hasImage) return MODELS.vision;

  const t = (text || "").toLowerCase();
  const codeHints = ["```", "function", "class", "public", "import", "console.log", "error", "npm "];
  if (codeHints.some(k => t.includes(k))) return MODELS.coder;

  return MODELS.general;
}

// === Chat Endpoint ===
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const text = req.body?.text?.trim() || "";
    const file = req.file;
    const hasImage = !!(file && file.buffer && file.mimetype);

    const urlParams = new URL(req.url, "http://localhost");
    const queryModel = urlParams.searchParams.get("model");

    const modelName = pickModel(text, hasImage, queryModel);

    const userMsg = { role: "user", content: text };
    if (hasImage) {
      const b64 = file.buffer.toString("base64");
      userMsg.images = [`data:${file.mimetype};base64,${b64}`];
    }

    const payload = {
      model: modelName,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Du bist die Leap AI. Antworte klar, freundlich und auf Deutsch. " +
            "Wenn es um Code geht, gib Codebeispiele mit ``` an. " +
            "Antworte präzise und kurz."
        },
        userMsg
      ]
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    const r = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!r.ok) {
      const err = await r.text().catch(() => String(r.status));
      return res.status(502).json({ error: `Ollama error: ${err}` });
    }

    const data = await r.json();
    return res.json({
      model: modelName,
      answer: data?.message?.content || "(keine Antwort)"
    });
  } catch (err) {
    const msg = err.name === "AbortError" ? "Timeout" : String(err);
    console.error("Chat Error:", msg);
    res.status(500).json({ error: msg });
  }
});

// === Health Check ===
app.get("/health", (_, res) =>
  res.json({
    ok: true,
    models: MODELS,
    chatUrl: OLLAMA_CHAT_URL
  })
);

// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Leap AI Server läuft auf http://127.0.0.1:${PORT}`);
  console.log("Verfügbare Modelle:");
  console.table(MODELS);
});