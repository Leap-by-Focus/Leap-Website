// server.js — Leap AI Core (Hardcore-Developer Mode + RAG + Queue + Sessions + Git-Auto-Update)
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

// ---- Basis-Middleware -------------------------------------------------
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload für Bild (Vision)
const upload = multer({ storage: multer.memoryStorage() });

// ---- Ports / URLs -----------------------------------------------------
const PORT = 8000;
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";

// ---- Modelle ----------------------------------------------------------
const MODELS = {
  general: "llama3.1:8b",
  coder: "qwen2.5-coder:7b",
  vision: "llava:7b",
  embed: "nomic-embed-text",
};

// ---- Pfade / Leap-Index / Git-Config ---------------------------------
const __filename = url.fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);

// Standard: Git-Root = eine Ebene über /ai
const REPO_ROOT = process.env.LEAP_GIT_ROOT
  ? path.resolve(process.env.LEAP_GIT_ROOT)
  : path.resolve(__dirnameLocal, "..");

// Standard: Index-Script = scripts/build_leap_index.js im ai-Ordner
const INDEX_SCRIPT = process.env.LEAP_INDEX_SCRIPT
  ? path.resolve(process.env.LEAP_INDEX_SCRIPT)
  : path.join(__dirnameLocal, "scripts", "build_leap_index.js");

const LEAP_INDEX_FILE = path.join(__dirnameLocal, "leap_index.json");
let LEAP_INDEX = [];

// ---- Leap-Index laden -------------------------------------------------
function loadLeapIndex() {
  try {
    if (!fs.existsSync(LEAP_INDEX_FILE)) {
      console.warn("⚠️ leap_index.json nicht gefunden:", LEAP_INDEX_FILE);
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

// ---- Git + Index Auto-Update -----------------------------------------
function tryExec(cmd, options = {}) {
  try {
    console.log(`$ ${cmd}`);
    const out = execSync(cmd, {
      stdio: "pipe",
      encoding: "utf8",
      ...options,
    });
    if (out && out.trim()) {
      console.log(out.trim());
    }
    return out;
  } catch (err) {
    console.error(`⚠️ Fehler bei Befehl: ${cmd}`);
    console.error(String(err.message || err));
    return null;
  }
}

function syncRepoAndRebuildIndex() {
  console.log("🔄 Starte Git-/Index-Check ...");
  console.log(`📁 REPO_ROOT      = ${REPO_ROOT}`);
  console.log(`📄 INDEX_SCRIPT   = ${INDEX_SCRIPT}`);

  // Prüfen ob Git-Root existiert
  if (!fs.existsSync(REPO_ROOT)) {
    console.warn("⚠️ REPO_ROOT existiert nicht, überspringe Git-Update.");
    loadLeapIndex();
    return;
  }

  // HEAD vor dem Pull
  let headBefore = "";
  try {
    headBefore = tryExec(`git -C "${REPO_ROOT}" rev-parse HEAD`)?.trim() || "";
  } catch {
    headBefore = "";
  }

  // fetch + pull
  tryExec(`git -C "${REPO_ROOT}" fetch --all --prune`);
  tryExec(`git -C "${REPO_ROOT}" pull --ff-only`);

  // HEAD nach dem Pull
  let headAfter = headBefore;
  try {
    headAfter = tryExec(`git -C "${REPO_ROOT}" rev-parse HEAD`)?.trim() || headBefore;
  } catch {
    headAfter = headBefore;
  }

  const changed = headBefore && headAfter && headBefore !== headAfter;

  if (changed) {
    console.log(`📥 Neue Commits gefunden (HEAD: ${headBefore} → ${headAfter})`);

    // ---- 1) Leap Index neu bauen ----
    if (fs.existsSync(INDEX_SCRIPT)) {
      console.log("🧱 Baue leap_index.json neu via Index-Script ...");
      tryExec(`node "${INDEX_SCRIPT}"`, { cwd: __dirnameLocal });
    } else {
      console.warn("⚠️ INDEX_SCRIPT nicht gefunden, kann Index nicht neu bauen.");
    }

    // ---- 2) Leap Interpreter automatisch neu bauen ----
    const INTERPRETER_SCRIPT = path.join(__dirnameLocal, "scripts/build_leap_interpreter.js");

    if (fs.existsSync(INTERPRETER_SCRIPT)) {
      console.log("🧱 Baue Leap Interpreter neu ...");
      tryExec(`node "${INTERPRETER_SCRIPT}"`);
    } else {
      console.warn("⚠️ Interpreter Build Script nicht gefunden:", INTERPRETER_SCRIPT);
    }

  } else {
    console.log("✅ Repo ist aktuell, benutze vorhandenen Leap-Index + Interpreter.");
  }

  // Egal ob neues Repo oder alt → Index laden
  loadLeapIndex();
}

// ---- Ressourcen-Tuning (Threads / Kontext) ---------------------------
const CPU_COUNT = os.cpus()?.length || 4;

const NUM_THREADS = process.env.LEAP_NUM_THREADS
  ? Math.max(1, Number(process.env.LEAP_NUM_THREADS) || 1)
  : Math.max(1, Math.floor(CPU_COUNT * 0.8));

const NUM_CTX = process.env.LEAP_NUM_CTX
  ? Math.max(512, Number(process.env.LEAP_NUM_CTX) || 4096)
  : 4096;

const TIMEOUT = process.env.LEAP_TIMEOUT_MS
  ? Number(process.env.LEAP_TIMEOUT_MS) || 180000
  : 180000;

// ---- Concurrency / Queue für ~20 User --------------------------------
const MAX_PARALLEL = process.env.LEAP_MAX_PARALLEL
  ? Math.max(1, Number(process.env.LEAP_MAX_PARALLEL) || 2)
  : 2;

const MAX_QUEUE = process.env.LEAP_MAX_QUEUE
  ? Math.max(0, Number(process.env.LEAP_MAX_QUEUE) || 40)
  : 40;

let activeRequests = 0;
const queue = [];

// ---- Hardcore-Dev System Prompt --------------------------------------
const SYSTEM_PROMPT = `
Du bist "Leap AI" – ein hilfsbereiter Assistent für Programmieren, Lernen und die Leap-Community.

Sprache: Deutsch.
Zielgruppe: Anfängerinnen und Anfänger (HTL 1./2. Klasse).
Ton: freundlich, ruhig, einfach, aber technisch korrekt.
Sprich den Nutzer immer in der Du-Form an (nicht "Sie").

Du kennst:
- Allgemeine Programmierung (z.B. Java, C#, TypeScript, Web, Datenbanken, Algorithmen).
- Speziell die Programmiersprache "Leap" und das Leap-Ökosystem (VSCode-Extension, Parser, Lexer, Grammatik).
- Konzepte aus HTL-Fächern (z.B. Softwareentwicklung, Datenbanken, Netzwerke, IT-Security), soweit im Modell vorhanden.

WICHTIG: Du bist eine reine Text-AI. Du hast KEINEN direkten Zugriff auf Dateien, Git oder den Index; der Kontext, den du bekommst, ist bereits vorverarbeitet. Du darfst im Antworttext NIEMALS über "RAG", "Index", "Dateien", "Kontext", "Repository" oder ähnliches sprechen.

================================================================
LEAP-SPEZIFISCHES VERHALTEN
================================================================

1) Wenn es um Leap geht (z.B. Variablen, Strings, Listen, Zahlen, Bedingungen, Schleifen, Funktionen, Klassen, Fehlermeldungen, VSCode-Farben, SimpleLexer/SimpleParser, leap.tmLanguage):

- Nutze immer zuerst den vorhandenen Leap-Kontext (Grammatik, Parser, Lexer, Kommentare), aber sprich NICHT darüber.
- Erfinde keine neuen Schlüsselwörter, wenn sie im Leap-Kontext nicht vorkommen.
- Benutze KEINE Schlüsselwörter wie "let", "const", "var", "define" in Leap-Code.
- Wenn Zuweisungen vorkommen, nutze das Muster:
  Name, dann Gleichheitszeichen, dann Wert.
  Beispiel-Idee: name = 5, text = "Hallo".

- Wenn du dir bei einem Detail nicht sicher bist:
  - Spekuliere nicht.
  - Erkläre die allgemeinste, sichere Variante.
  - Formuliere vorsichtig, z.B.: "So sieht eine typische Zuweisung in Leap aus: Name = Wert."

2) STRIKTE LEAP-CODEBLOCK-REGEL

Wenn die Frage erkennbar zu Leap gehört (z.B. weil im Verlauf Leap erwähnt wurde oder es um Syntax, Variablen, Strings, Listen, Zahlen, if, Schleifen, Funktionen geht):

- Du gibst IMMER einen Leap-Codeblock in der Antwort zurück.
- Dieser Codeblock muss:
  - Die Sprache "leap" verwenden.
  - Aus 2 bis 6 sinnvollen Beispielzeilen bestehen.
  - Nur gültige Leap-Syntax enthalten (basierend auf dem dir bekannten Kontext).
- Deklaration von Variablen erfolgt immer im Muster:
  Name = Wert
  ohne zusätzliche Schlüsselwörter.

Beispiele (nur Beschreibung, NICHT im Prompt als echter Codeblock mit Backticks):
- Variable mit Zahl: x = 5
- Variable mit Text: name = "Luka"
- Liste: zahlen = [1, 2, 3]
- Wahrheitswert: aktiv = true

Du musst in der Antwort IMMER mindestens einen solchen Leap-Codeblock liefern, wenn es um Leap-Syntax geht.

3) VERBOTENE FORMULIERUNGEN

Folgende Formulierungen dürfen im Antworttext niemals vorkommen:

- "Im Code sehe ich ..."
- "Im Kontext sehe ich ..."
- "Im RAG sehe ich ..."
- "Im Index steht ..."
- "In der Datei ..."
- "Der Kontext zeigt ..."
- "Die Grammatik sagt ..."
- "Ich vermute ..."
- "Wahrscheinlich ist ..."
- "Ich denke, dass ..." (wenn es sich auf Raten bezieht)

Stattdessen:
- Sprich direkt in der Fachsprache: "In Leap schreibst du das so: ..." und gib ein Beispiel.
- Wenn du etwas nicht sicher weißt, formuliere neutral:
  "Dazu habe ich gerade keine gesicherten Informationen. Ich kann nur die allgemeine Idee erklären."

================================================================
STIL UND ERKLÄRWEISE
================================================================

- Sprich wie ein geduldiger HTL-Nachhilfelehrer.
- Erkläre Schritt für Schritt:
  1. Kurz in einfachen Worten, was Sache ist.
  2. Dann ein konkretes Beispiel (bei Leap immer mit Leap-Codeblock).
  3. Optional eine kurze Vertiefung, wenn es sinnvoll ist.

- Nutze einfache Begriffe:
  - statt "Identifier": "Name"
  - statt "Expression": "Wert" oder "Rechnung" oder "Ausdruck"
  - statt "Boolean": "wahr/falsch"
  - statt "Nonterminal/Production Rule": solche Begriffe im normalen Text vermeiden.

- Du darfst Markdown-Elemente verwenden:
  - Überschriften
  - Listen
  - Tabellen
  - Erklärende Textabschnitte

================================================================
VISION / BILDER
================================================================

Wenn dir ein Bild zur Verfügung steht:

- Du fügst im answer-Text (Markdown) zusätzlich diese Struktur ein:

  **Beschreibung**
  - Kurze Beschreibung, was auf dem Bild zu sehen ist.

  **Erkannter Text (falls vorhanden)**
  - Liste oder kurzer Absatz mit dem Text, der auf dem Bild steht.

  **Relevante Details / Unsicherheiten**
  - Wichtige Beobachtungen.
  - Dinge, bei denen du dir nicht sicher bist (z.B. "Die Auflösung ist niedrig, daher ist der Text schwer zu lesen").

================================================================
NUTZUNG VON KONTEXT (RAG) – INTERN, NICHT ERWÄHNEN
================================================================

- Du bekommst eventuell speziellen Leap-Kontext (z.B. Ausschnitte aus Parser, Lexer, VSCode-Extension).
- Du DARFST diesen Kontext intern nutzen, um korrekte Antworten zu geben.
- Du DARFST im Antworttext NICHT erwähnen, dass du diesen Kontext genutzt hast.
  Keine Erwähnung von Dateien, Pfaden, RAG, Index, Embeddings oder Repositories.

Wenn etwas im Kontext nicht definiert ist:
- Erfinde nichts Konkretes.
- Erkläre die allgemeine Idee (z.B. wie Variablen in vielen Sprachen funktionieren).
- Sag kurz, dass du zu genau diesem Detail gerade keine sichere Info hast, ohne auf "Kontext" oder "RAG" zu verweisen.

================================================================
AUSGABEFORMAT (IMMER JSON)
================================================================

Jede Antwort muss IMMER genau dieses Schema haben:

{
  "answer": "<Antwort in Markdown>",
  "suggestions": ["Weiterfrage 1", "Weiterfrage 2", "Weiterfrage 3"]
}

Regeln:

- KEIN Text vor oder nach diesem JSON.
- answer:
  - Darf Markdown enthalten (Überschriften, Listen, Tabellen, Codeblöcke).
  - Wenn es um Leap-Syntax geht: mindestens ein Leap-Codeblock wie oben beschrieben.
- suggestions:
  - Genau 3 Einträge.
  - Jeder Eintrag 3 bis 7 Wörter.
  - Kein Punkt am Ende.
  - Inhalt: sinnvolle Weiterfragen (z.B. Vertiefung, nächster Schritt, verwandtes Thema).

================================================================
SICHERHEIT
================================================================

- Kein beleidigender, hasserfüllter, diskriminierender oder illegaler Inhalt.
- Keine Anleitung zu Selbstverletzung, Gewalt, Straftaten oder gefährlichen Aktionen.
- Keine sensiblen persönlichen Daten erfinden oder nachfragen.
- Bei heiklen Themen (Gesundheit, Recht, Finanzen) vorsichtig formulieren und darauf hinweisen, dass man Fachleute fragen sollte.

================================================================
IM ZWEIFEL
================================================================

Wenn du zwischen "oberflächlich" und "tief, aber verständlich" wählen musst:
- Nimm tief, aber kindgerecht erklärt.
- Nutze Beispiele, Vergleiche und kleine Schritte.
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

// ===== Embeddings / RAG für Leap =====================================
async function embedText(text) {
  const body = {
    model: MODELS.embed,
    input: text,
  };

  const res = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error("Ollama embedding error: " + (errText || res.status));
  }

  const data = await res.json();

  const embedding =
    data.embedding ||
    (Array.isArray(data.embeddings) ? data.embeddings[0] : null);

  if (!embedding) {
    console.error("⚠️ Unerwartete Embedding-Response von Ollama:", data);
    throw new Error("No embedding returned from Ollama");
  }
  return embedding;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function findRelevantLeapChunks(queryEmbedding, topK = 10) {
  if (!LEAP_INDEX.length) return [];

  const scored = LEAP_INDEX.map((item) => ({
    ...item,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ===== Helpers ========================================================
function pickModel(text, hasImage, queryModel) {
  if (queryModel && MODELS[queryModel]) return MODELS[queryModel];
  if (hasImage) return MODELS.vision;
  const t = (text || "").toLowerCase();
  const hints = [
    "```",
    "function",
    "class",
    "public",
    "import",
    "console.log",
    "error",
    "npm ",
    "parser",
    "lexer",
    "tmLanguage",
    "vscode",
    "tsconfig",
  ];
  if (hints.some((k) => t.includes(k))) return MODELS.coder;
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
  if (/(java|python|leap|oop|klasse|objekt|array|funktion|parser|lexer)\b/.test(t)) {
    return ["Einfaches Codebeispiel", "Typische Use Cases", "Weiterführende Ressourcen"];
  }
  return ["Beispiel zeigen", "Vergleich erläutern", "Nächste Schritte"];
}

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
  const add = (x) => {
    if (x && s.size < 3) s.add(x);
  };
  const U = (text + answer).toLowerCase();

  if (U.includes("oop")) {
    add("Was ist OOP");
    add("Kurzes OOP Beispiel");
    add("Klasse vs Objekt");
  }
  if (U.includes("java")) {
    add("Erste Schritte mit Java");
    add("Java vs C# Vergleich");
    add("Java Entwicklungsumgebung");
  }
  if (U.includes("leap")) {
    add("Leap Syntax Überblick");
    add("Variablen in Leap");
    add("Leap SimpleParser erklären");
  }
  if (U.includes("parser") || U.includes("lexer")) {
    add("Parser Aufbau erklären");
    add("Token Arten in Leap");
    add("Fehlerbehandlung im Parser");
  }
  if (U.includes("funktion")) {
    add("Einfaches Codebeispiel");
    add("Häufige Fehler vermeiden");
    add("Best Practices");
  }
  if (U.includes("bild") || U.includes("image")) {
    add("Bildanalyse Tipps");
    add("Unterstützte Formate");
    add("Genauigkeit verbessern");
  }

  ["Beispiel zeigen", "Nächste Schritte", "Weiterführende Ressourcen"].forEach(add);
  return [...s].slice(0, 3);
}

function sanitizeAnswer(text = "") {
  let s = String(text);

  // komische Steuerzeichen raus
  s = s.replace(/[\u0000-\u001F]/g, "");

  // alte LaTeX-/Fake-Code-Umgebungen auf echte Markdown-Codeblöcke mappen
  s = s.replace(/begin{code}\s*leap/gi, "```leap");
  s = s.replace(/begin{code}/gi, "```");
  s = s.replace(/end{code}/gi, "```");

  // Falls er irgendwo Name = Wert als „Formel“ mit begin{code} geschrieben hat, ist es danach normaler Text/Code
  return s;
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
    "ich bin nicht in der lage",
  ];
  const a = (answer || "").toLowerCase();
  return blocklist.some((bad) => a.includes(bad));
}

async function callOllama(payload, timeoutMs = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
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

  const cidRaw =
    req.body?.sessionId ??
    req.headers["x-leap-session"] ??
    "default";
  const cid = cidRaw.toString();
  const sess = getSession(cid);

  const useLeapContext =
    req.body?.useLeapContext === true ||
    req.body?.useLeapContext === "true" ||
    /leap|vscode|parser|lexer|tmLanguage|simpleparser|simplelexer/i.test(text);

  const topK =
    typeof req.body?.ragTopK !== "undefined"
      ? Math.max(1, Number(req.body.ragTopK) || 10)
      : 12;

  const urlObj = new URL(req.url, "http://localhost");
  const modelName = pickModel(text, hasImage, urlObj.searchParams.get("model"));

  const userMsg = {
    role: "user",
    content: text || (hasImage ? "Beschreibe bitte dieses Bild präzise." : ""),
  };

  if (hasImage) {
    userMsg.images = [file.buffer.toString("base64")];
  }

  // === Leap-Kontext vorbereiten (RAG) ===
  let leapContextText = "";
  let ragHitsMeta = [];

  if (useLeapContext && LEAP_INDEX.length && text) {
    try {
      const qEmbedding = await embedText(text);
      const hits = findRelevantLeapChunks(qEmbedding, topK);

      ragHitsMeta = hits.map((h) => ({
        file: h.file,
        pos: h.pos,
        score: h.score,
      }));

      leapContextText = hits
        .map(
          (h) =>
            `// Datei: ${h.file} (Chunk: ${h.pos}, Score: ${h.score.toFixed(
              3
            )})\n${h.text}`
        )
        .join("\n\n-----------------------------\n\n");

      console.log(
        `🔎 Leap-RAG aktiv [session=${cid}] – ${hits.length} Chunks als Kontext angehängt.`
      );
    } catch (err) {
      console.error("⚠️ Leap-RAG Fehler:", err.message);
      leapContextText = "";
      ragHitsMeta = [];
    }
  } else if (!LEAP_INDEX.length && useLeapContext) {
    console.warn(
      "⚠️ useLeapContext=true, aber Leap-Index ist leer. build_leap_index.js ausführen?"
    );
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  if (sess.history.length) {
    messages.push(...sess.history);
  }

  if (leapContextText) {
    messages.push({
      role: "system",
      content:
        "Hier ist relevanter Quelltext-Kontext aus dem Leap-Ökosystem (z.B. VSCode-Extension, Parser, Lexer, Syntax):\n\n" +
        leapContextText,
    });
  }

  messages.push(userMsg);

  const payload = {
    model: modelName,
    stream: false,
    format: "json",
    options: {
      temperature: 0.2,
      num_thread: NUM_THREADS,
      num_ctx: NUM_CTX,
    },
    messages,
  };

  let data = await callOllama(payload);
  let raw = data?.message?.content || "";
  let parsed = safeParseJSON(raw);

let answer = parsed?.answer || raw || "(keine Antwort)";
answer = sanitizeAnswer(answer);
  let suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions.slice(0, 3)
    : [];

  let attempts = 1;
  while (
    attempts < 3 &&
    (isRefusal(answer) || !answer || answer.trim() === "{}")
  ) {
    console.log(
      `❌ Verweigerung erkannt – neuer Versuch (${attempts + 1}/3)...`
    );
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

  pushHistoryMessage(sess, { role: "user", content: text });
  pushHistoryMessage(sess, {
    role: "assistant",
    content: answer || "(keine Antwort)",
  });

  if (!res.headersSent) {
    res.json({
      model: modelName,
      answer: answer || "(keine Antwort)",
      suggestions,
      meta: {
        num_thread: NUM_THREADS,
        num_ctx: NUM_CTX,
        max_parallel: MAX_PARALLEL,
        queue_size: queue.length,
        session: cid,
        leap_rag: {
          enabled: Boolean(useLeapContext),
          index_chunks: LEAP_INDEX.length,
          used_context: Boolean(leapContextText),
          topK,
          hits: ragHitsMeta,
        },
      },
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
    res.status(503).json({
      error:
        "Leap AI ist gerade ausgelastet, bitte kurz warten und erneut versuchen.",
      meta: {
        reason: "queue_full",
        max_parallel: MAX_PARALLEL,
        max_queue: MAX_QUEUE,
      },
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
      num_thread: NUM_THREADS,
    },
    ctx: NUM_CTX,
    concurrency: {
      max_parallel: MAX_PARALLEL,
      max_queue: MAX_QUEUE,
      active: activeRequests,
      queued: queue.length,
    },
    leapIndex: {
      file: LEAP_INDEX_FILE,
      chunks: LEAP_INDEX.length,
    },
    git: {
      repoRoot: REPO_ROOT,
      indexScript: INDEX_SCRIPT,
    },
  });
});

// ==== Leap Interpreter API =============================================
app.post("/api/runLeap", async (req, res) => {
  const code = req.body?.code || "";

  if (!code.trim()) {
    return res.status(400).json({ error: "Code fehlt" });
  }

  const tempPath = path.join(__dirnameLocal, "temp.lp");

  // 🔥 EXAKTER Pfad zum Leap Interpreter JAR
  const jarPath = "/Users/veselinovicluka/Desktop/Github/Leap/Leap-VSCPlugin/leap-interpreter.jar";

  // Code temporär speichern
  fs.writeFileSync(tempPath, code);

  try {
    // Java Interpreter ausführen
    const out = execSync(`java -jar "${jarPath}" "${tempPath}"`, {
      encoding: "utf8",
      timeout: 5000
    });

    return res.json({ output: out });
  } catch (err) {
    return res.json({
      output: "",
      error: String(err.stderr || err.message)
    });
  }
});