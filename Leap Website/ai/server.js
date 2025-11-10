// server.js — Leap AI Core (robuste Suggestions + Queue + Concurrency)
import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import os from "os";

const app = express();

// ---- Basis-Middleware -------------------------------------------------
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload für Bild (Vision)
const upload = multer({ storage: multer.memoryStorage() });

// ---- Ports / URLs -----------------------------------------------------
const PORT = 8000;
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";

// ---- Modelle ----------------------------------------------------------
const MODELS = {
  general: "llama3.1:8b",
  coder:   "qwen2.5-coder:7b",
  vision:  "llava:7b",
  embed:   "nomic-embed-text",
};

// ---- Ressourcen-Tuning (Threads / Kontext) ---------------------------

const CPU_COUNT = os.cpus()?.length || 4;

// ~80 % der Kerne verwenden, kann per ENV überschrieben werden
const NUM_THREADS = process.env.LEAP_NUM_THREADS
  ? Math.max(1, Number(process.env.LEAP_NUM_THREADS) || 1)
  : Math.max(1, Math.floor(CPU_COUNT * 0.8));

// Kontextgröße (RAM-Verbrauch), auch per ENV überschreibbar
const NUM_CTX = process.env.LEAP_NUM_CTX
  ? Math.max(512, Number(process.env.LEAP_NUM_CTX) || 4096)
  : 4096;

// Max. Wartezeit pro Ollama-Request
const TIMEOUT = process.env.LEAP_TIMEOUT_MS
  ? Number(process.env.LEAP_TIMEOUT_MS) || 120000
  : 120000;

// ---- Concurrency / Queue für ~20 User --------------------------------

// Wie viele Ollama-Calls dürfen *gleichzeitig* laufen?
// Auf M2 Pro mit 8B-Modell: 2–3 ist realistisch. Wir nehmen 2 als Default.
const MAX_PARALLEL = process.env.LEAP_MAX_PARALLEL
  ? Math.max(1, Number(process.env.LEAP_MAX_PARALLEL) || 2)
  : 2;

// Wie viele Requests dürfen in der Warteschlange warten?
// Bei 20 Usern z.B. 40 Wartende → reicht dicke für Chat-Gebrauch.
const MAX_QUEUE = process.env.LEAP_MAX_QUEUE
  ? Math.max(0, Number(process.env.LEAP_MAX_QUEUE) || 40)
  : 40;

let activeRequests = 0;
const queue = [];

// ---- System Prompt ----------------------------------------------------
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

// ===== In-Memory Session Store (aktuell nur vorbereitet) ==============
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

// Entfernt evtl. ```json fences und parst erstes JSON-Objekt
function safeParseJSON(raw = "") {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  return null;
}

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

// Hilfsfunktion für Ollama-Call (Retry-sicher)
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
    if (!r.ok) {
      throw new Error(text || `Ollama HTTP ${r.status}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return { message: { content: text } };
    }
  } finally {
    clearTimeout(timer);
  }
}

// ===== Kern-Handler für eine Chat-Anfrage (ohne Queue) ===============
async function handleChatRequest(req, res) {
  const rawText = (req.body?.text ?? "").toString();
  const text = rawText.trim();
  const file = req.file;
  const hasImage = !!file?.buffer && !!file?.mimetype;

  const urlObj = new URL(req.url, "http://localhost");
  const modelName = pickModel(text, hasImage, urlObj.searchParams.get("model"));

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
    options: {
      temperature: 0.2,
      num_thread: NUM_THREADS,
      num_ctx: NUM_CTX
      // OPTIONAL: num_predict begrenzen, um Antworten kürzer zu halten, z.B.:
      // num_predict: 256
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      userMsg
    ]
  };

  // 1. Versuch
  let data = await callOllama(payload);
  let raw = data?.message?.content || "";
  let parsed = safeParseJSON(raw);

  let answer = parsed?.answer || raw || "(keine Antwort)";
  let suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions.slice(0, 3)
    : [];

  // Retry-Logik bei „ich kann nicht…“ etc.
  let attempts = 1;
  while (attempts < 3 && (isRefusal(answer) || !answer || answer.trim() === "{}")) {
    console.log(`❌ Verweigerung erkannt – neuer Versuch (${attempts + 1}/3)...`);
    data = await callOllama(payload, TIMEOUT);
    raw = data?.message?.content || "";
    parsed = safeParseJSON(raw);
    answer = parsed?.answer || raw || "(keine Antwort)";
    suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.slice(0, 3)
      : [];
    attempts++;
  }

  if (!suggestions.length) {
    suggestions = synthesizeSuggestions(text, answer) || fallbackSuggestions(text);
  }

  if (!res.headersSent) {
    res.json({
      model: modelName,
      answer: answer || "(keine Antwort)",
      suggestions,
      meta: {
        num_thread: NUM_THREADS,
        num_ctx: NUM_CTX,
        max_parallel: MAX_PARALLEL,
        queue_size: queue.length
      }
    });
  }
}

// ===== Queue / Concurrency-Wrapper ====================================
function enqueueChat(req, res) {
  const run = async () => {
    try {
      await handleChatRequest(req, res);
    } catch (err) {
      console.error("Chat Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err?.message || err) });
      }
    } finally {
      activeRequests--;
      const next = queue.shift();
      if (next) {
        activeRequests++;
        next();
      }
    }
  };

  if (activeRequests < MAX_PARALLEL) {
    activeRequests++;
    run();
  } else if (queue.length >= MAX_QUEUE) {
    // Server ist „voll“ → direkt 503 zurück
    res.status(503).json({
      error: "Leap AI ist gerade ausgelastet, bitte kurz warten und erneut versuchen.",
      meta: {
        reason: "queue_full",
        max_parallel: MAX_PARALLEL,
        max_queue: MAX_QUEUE
      }
    });
  } else {
    queue.push(run);
  }
}

// ===== API Endpoint ====================================================
app.post("/api/chat", upload.single("image"), (req, res) => {
  enqueueChat(req, res);
});

// ===== Health Endpoint ===============================================
app.get("/health", (_, res) => {
  res.json({
    ok: true,
    models: MODELS,
    chatUrl: OLLAMA_CHAT_URL,
    cpu: {
      cores: CPU_COUNT,
      num_thread: NUM_THREADS
    },
    ctx: NUM_CTX,
    concurrency: {
      max_parallel: MAX_PARALLEL,
      max_queue: MAX_QUEUE,
      active: activeRequests,
      queued: queue.length
    }
  });
});

// ===== Start ==========================================================
app.listen(PORT, () => {
  console.log(`🚀 Leap AI Server läuft auf http://127.0.0.1:${PORT}`);
  console.table(MODELS);
  console.log(
    `⚙️ Threads: ${NUM_THREADS}/${CPU_COUNT} | Kontext: ${NUM_CTX} | Timeout: ${TIMEOUT} ms | Parallel: ${MAX_PARALLEL} | Queue: ${MAX_QUEUE}`
  );
});