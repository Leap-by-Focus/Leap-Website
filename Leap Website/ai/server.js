// server.js (ESM) — Mini-Proxy für Ollama mit Auto-Routing (Text/Code/Vision)
import express from "express";
import multer from "multer";
import fetch from "node-fetch";

const app = express();
const upload = multer();

// ── Konfig (per ENV überschreibbar) ─────────────────────────
const PORT = Number(process.env.PORT || 8000);
const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL || "http://127.0.0.1:11434/api/chat";

// Standard-Modelle
const MODEL_GENERAL = process.env.MODEL_GENERAL || "llama3.1:8b";       // Allround Text
const MODEL_CODER   = process.env.MODEL_CODER   || "qwen2.5-coder:7b";  // Code
const MODEL_VISION  = process.env.MODEL_VISION  || "qwen2-vl:7b";       // Bilder

const OLLAMA_TIMEOUT = Number(process.env.OLLAMA_TIMEOUT || 120000);
// ────────────────────────────────────────────────────────────

// CORS für lokales Frontend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// Einfaches Intent-Routing
function pickModel({ text, hasImage }) {
  const t = (text || "").toLowerCase();
  if (hasImage) return { name: MODEL_VISION, multimodal: true };

  const codeHints = [
    "```"," function"," class"," error","exception","stack trace","build failed",
    "typescript","javascript","python","java","c#","c++","sql","regex","bash","shell","npm ","pip "
  ];
  if (codeHints.some(h => t.includes(h))) return { name: MODEL_CODER, multimodal: false };

  return { name: MODEL_GENERAL, multimodal: false };
}

const SYSTEM_PROMPT = `
Du bist der Mini-Assistent von Leap. Antworte auf Deutsch, kurz und hilfreich.
Bei Code: minimal lauffähige Snippets + kurze Erklärung. Bei Bildern: beschreibe präzise und leite Schritte ab.
Sage ehrlich, wenn Infos fehlen.
`.trim();

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const text = (req.body?.text || "").toString().trim();
    const file = req.file || null;
    const hasImage = !!(file && file.buffer && file.mimetype);

    const modelPick = pickModel({ text, hasImage });

    const userMsg = { role: "user", content: text || "" };
    if (modelPick.multimodal && hasImage) {
      const b64 = file.buffer.toString("base64");
      // Data-URL wird von Qwen2-VL/LLaVA akzeptiert
      userMsg.images = [`data:${file.mimetype};base64,${b64}`];
    }

    const payload = {
      model: modelPick.name,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        userMsg
      ]
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    const r = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!r.ok) {
      const errText = await r.text().catch(() => String(r.status));
      return res.status(502).json({ error: `Ollama-Error: ${errText}` });
    }

    const data = await r.json();
    res.json({
      model: modelPick.name,
      multimodal: modelPick.multimodal,
      answer: data?.message?.content || ""
    });
  } catch (e) {
    const msg = (e?.name === "AbortError") ? `Timeout nach ${OLLAMA_TIMEOUT}ms` : String(e);
    console.error("API /chat error:", msg);
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`AI Proxy läuft:  http://127.0.0.1:${PORT}`);
  console.log(`→ Ollama:       ${OLLAMA_CHAT_URL}`);
  console.log(`→ Modelle:      GENERAL=${MODEL_GENERAL} | CODER=${MODEL_CODER} | VISION=${MODEL_VISION}`);
});