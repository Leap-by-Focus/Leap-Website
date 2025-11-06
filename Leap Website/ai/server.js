// server.js — Leap AI Core (robuste Suggestions)
import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";

const app = express();
app.use(cors({ origin: true }));

const upload = multer({ storage: multer.memoryStorage() });

const PORT = 8000;
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";

const MODELS = {
  general: "llama3.1:8b",
  coder:   "qwen2.5-coder:7b",
  vision:  "llava:7b",
  embed:   "nomic-embed-text",
};


// ===== System Prompt (global, nicht im Handler!) =====================
const SYSTEM_PROMPT = String.raw`
Du bist **Leap AI** – ein hilfsbereiter, sachlicher Assistent für Programmieren, Lernen und die Leap-Community.
Sprache: Deutsch. Ton: freundlich, präzise, respektvoll.

== Ausgabeformat (immer exakt so, gültiges JSON) ==
{
  "answer": "<Antwort in Markdown>",
  "suggestions": ["Weiterfrage 1","Weiterfrage 2","Weiterfrage 3"]
}

== Regeln ==
- Antworte nur mit JSON genau in diesem Schema (keine Zusatztexte).
- \`answer\` darf Markdown enthalten (Überschriften, Listen, Links).
- Code immer in fenced code blocks mit drei Backticks ausgeben: \`\`\`<sprache>\n...code...\n\`\`\`
- \`suggestions\`: genau 3 kurze Follow-ups (3–7 Wörter), **kein Punkt** am Ende.
- Wenn ein Bild vorhanden ist (Vision-Modelle): gib zusätzlich im Markdown-Teil kurz & strukturiert aus:
  - **Beschreibung** (Stichpunkte)
  - **Erkannter Text (OCR)** – falls vorhanden
  - **Relevante Details / Unsicherheiten**
- Wenn die Nutzerfrage unklar ist, stelle am Ende von \`answer\` maximal **eine** gezielte Rückfrage.
- Keine sensiblen oder persönlichen Daten halluzinieren; bei Unsicherheit transparent sein.
- Kein beleidigender, hasserfüllter, diskriminierender oder illegaler Inhalt.

== Beispiele ==
- Code: \`\`\`js
console.log("Hallo Leap!");
\`\`\`

- Bildantwort (im Markdown von \`answer\`):
**Beschreibung**
- Laptop auf Holzschreibtisch …
**Erkannter Text (OCR)**
- "Build succeeded"
**Details**
- Winkel/Beleuchtung erschweren Text; vermute …

Halte dich strikt an dieses Format.
`;
// ===== In-Memory Session Store =======================================
const sessions = new Map();
const MAX_HISTORY = 8;

function getSession(cid = "default") {
  if (!sessions.has(cid)) sessions.set(cid, { history: [], lastImage: null });
  return sessions.get(cid);
}

function pushHistoryMessage(sess, msg) {
  sess.history.push(msg);
  if (sess.history.length > MAX_HISTORY) {
    sess.history = sess.history.slice(-MAX_HISTORY);
  }
}

const TIMEOUT = 120000;

// ===== Helpers ========================================================
function pickModel(text, hasImage, queryModel) {
  if (queryModel && MODELS[queryModel]) return MODELS[queryModel];
  if (hasImage) return MODELS.vision;
  const t = (text || "").toLowerCase();
  const hints = ["```", "function", "class", "public", "import", "console.log", "error", "npm "];
  if (hints.some(k => t.includes(k))) return MODELS.coder;
  return MODELS.general;
}

function fallbackSuggestions(text = "") {
  const t = (text || "").toLowerCase();
  if (/^was ist\b|^what is\b|^erkl(ä|ae)re\b/.test(t)) {
    return ["Was ist OOP", "Erste Schritte", "Java vs C# Vergleich"];
  }
  if (/^wie\b|^how\b|^schritt/.test(t)) {
    return ["Alternativer Ansatz", "Häufige Fehler", "Best Practices"];
  }
  if (/(java|python|leap|oop|klasse|objekt|array|funktion)\b/.test(t)) {
    return ["Einfaches Codebeispiel", "Typische Use Cases", "Weiterführende Ressourcen"];
  }
  return ["Beispiel zeigen", "Vergleich erläutern", "Nächste Schritte"];
}

// Robust: entfernt Fences, extrahiert erstes JSON-Objekt und parst
function safeParseJSON(raw = "") {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}

// Synthese: erzeugt 3 Follow-ups aus Antwort+Frage (falls Modell nix liefert)
function synthesizeSuggestions(text = "", answer = "") {
  const s = new Set();
  const add = x => { if (x && s.size < 3) s.add(x); };
  const U = (text + answer).toLowerCase();

  if (U.includes("oop")) { add("Was ist OOP"); add("Kurzes OOP Beispiel"); add("Klasse vs Objekt"); }
  if (U.includes("java")) { add("Erste Schritte mit Java"); add("Java vs C# Vergleich"); add("Java Entwicklungsumgebung"); }
  if (U.includes("funktion")) { add("Einfaches Codebeispiel"); add("Häufige Fehler vermeiden"); add("Best Practices"); }
  if (U.includes("bild")) { add("Bildanalyse Tipps"); add("Unterstützte Formate"); add("Genauigkeit verbessern"); }

  ["Beispiel zeigen", "Nächste Schritte", "Weiterführende Ressourcen"].forEach(add);
  return [...s].slice(0, 3);
}

// Verweigerungs-/Blocklisten-Check (verhindert "ich kann nicht..."-Antworten)
function isRefusal(answer = "") {
  const blocklist = [
    "ich kann nicht",
    "ich darf nicht",
    "nicht erlaubt",
    "entschuldigung",
    "sorry",
    "ich bin ein ki",
    "als künstliche intelligenz",
    "ich habe keinen zugriff",
    "ich bin nicht in der lage"
  ];
  const a = (answer || "").toLowerCase();
  return blocklist.some(bad => a.includes(bad));
}

// Hilfsfunktion für Ollama-Call (damit wir bei Retry nicht duplizieren)
async function callOllama(payload, timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = r.ok ? await r.text() : await r.text().catch(() => "");
    if (!r.ok) throw new Error(text || `Ollama HTTP ${r.status}`);
    // Manche Backends liefern text/plain; hier erneut parsen
    try { return JSON.parse(text); } catch { return { message: { content: text } }; }
  } finally {
    clearTimeout(timer);
  }
}

// ===== API Endpoint ====================================================
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const text = req.body?.text?.trim() || "";
    const file = req.file;
    const hasImage = !!file?.buffer && !!file?.mimetype;

    const modelName = pickModel(text, hasImage, new URL(req.url, "http://localhost").searchParams.get("model"));

    const userMsg = {
      role: "user",
      content: text || (hasImage ? "Beschreibe bitte dieses Bild präzise." : "")
    };

    if (hasImage) {
      userMsg.images = [file.buffer.toString("base64")];
    }

    const payload = {
      model: modelName,
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        userMsg,
      ]
    };

    // === 1. Versuch
    let data = await callOllama(payload);
    let raw = data?.message?.content || "";
    let parsed = safeParseJSON(raw);

    let answer = parsed?.answer || raw || "(keine Antwort)";
    let suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0, 3) : [];

    // === Retry-Logik: bis zu 2 weitere Versuche, falls Verweigerung/Blocklist
    let attempts = 1;
    while (attempts < 3 && (isRefusal(answer) || !answer || answer.trim() === "{}")) {
      console.log(`❌ Verweigerung erkannt – neuer Versuch (${attempts + 1}/3)...`);
      data = await callOllama(payload, TIMEOUT);
      raw = data?.message?.content || "";
      parsed = safeParseJSON(raw);
      answer = parsed?.answer || raw || "(keine Antwort)";
      suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0, 3) : [];
      attempts++;
    }

    if (!suggestions.length) {
      suggestions = synthesizeSuggestions(text, answer) || fallbackSuggestions(text);
    }

    res.json({ model: modelName, answer: answer || "(keine Antwort)", suggestions });

  } catch (err) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ===== Health Endpoint ===============================================
app.get("/health", (_, res) => {
  res.json({ ok: true, models: MODELS, chatUrl: OLLAMA_CHAT_URL });
});

// ===== Start ==========================================================
app.listen(PORT, () => {
  console.log(`🚀 Leap AI Server läuft auf http://127.0.0.1:${PORT}`);
  console.table(MODELS);
});