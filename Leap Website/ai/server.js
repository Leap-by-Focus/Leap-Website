// server.js — Leap AI lokal mit Ollama + RAG (ohne Relevante-Seiten-Spam)
import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fg from "fast-glob";
import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";

const app = express();
const upload = multer();

// === CONFIG ============================================================
const PORT = 8000;
const OLLAMA_CHAT_URL  = "http://127.0.0.1:11434/api/chat";
const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";

const MODEL_GENERAL = "llama3.1:8b";
const MODEL_CODER   = "qwen2.5-coder:7b";
const MODEL_VISION  = "qwen2-vl:7b";
const MODEL_EMBED   = "nomic-embed-text";

const SITE_ROOT = path.resolve(process.cwd(), "..");
const TOP_K = 5;
const TIMEOUT = 120000;
// =======================================================================

app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// === MODEL PICK ========================================================
function pickModel({ text, hasImage }) {
  const t = text.toLowerCase();
  if (hasImage) return { name: MODEL_VISION, multimodal: true };
  if (["function","class","let","const","public","private","main(","def ","if(","console.log"].some(x => t.includes(x)))
    return { name: MODEL_CODER, multimodal: false };
  return { name: MODEL_GENERAL, multimodal: false };
}

// === EMBEDDINGS ========================================================
async function embedOne(text) {
  const r = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL_EMBED, input: text.slice(0, 4000) })
  });
  if (!r.ok) throw new Error(await r.text());
  const d = await r.json();
  return d.embedding || d.embeddings?.[0];
}

function cosineSim(a, b) {
  let dot=0,na=0,nb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]**2;nb+=b[i]**2;}
  return dot/(Math.sqrt(na)*Math.sqrt(nb));
}

// === INDEX (CRAWLER) ===================================================
let index = [];

async function parseHtmlFile(absPath) {
  const raw = await fs.readFile(absPath, "utf8");
  const $ = cheerio.load(raw);
  $("script,style,noscript").remove();
  const title = $("title").text().trim() || path.basename(absPath);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, text };
}

function filePathToHref(abs) {
  const rel = path.relative(SITE_ROOT, abs).split(path.sep).join("/");
  return `../${rel}`;
}

async function buildIndex() {
  const files = await fg("**/*.html", {
    cwd: SITE_ROOT,
    ignore: ["**/node_modules/**","**/ai/**","**/assets/**"]
  });
  index = [];
  for (const f of files) {
    const abs = path.join(SITE_ROOT, f);
    try {
      const { title, text } = await parseHtmlFile(abs);
      if (!text || text.length < 50) continue;
      const vec = await embedOne(text);
      index.push({ url: filePathToHref(abs), title, text, vec });
    } catch {}
  }
  console.log(`✅ Index gebaut mit ${index.length} Seiten`);
}
await buildIndex();

// === LINK INTENT =======================================================
const LINK_WORDS = ["wo finde","wo ist","öffne","zeige","bring mich","link","seite","kapitel","dokumentation","doku","hilfe","handbuch"];

function isLinkQuestion(q) {
  const t = q.toLowerCase();
  return LINK_WORDS.some(x => t.includes(x));
}

function pickBestDoc(scored) {
  if (!scored.length) return null;
  scored.sort((a,b)=>b.score-a.score);
  const top = scored[0];
  return top.score>0.12 ? top.doc : null;
}

function cleanAnswer(ans) {
  if (!ans) return "";
  return ans
    .replace(/Relevante Seiten:[\s\S]*/i, "")
    .replace(/Leap\s*[-–]\s*.*?—\s*\.\.\/[^\s]+/g, "")
    .trim();
}

// === CHAT ==============================================================
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.json({ answer: "Bitte gib eine Frage ein." });

    const hasImage = !!req.file;
    const model = pickModel({ text, hasImage });

    let bestDoc = null;
    if (!hasImage && text && index.length) {
      const qVec = await embedOne(text);
      const scored = index.map(doc => ({ doc, score: cosineSim(qVec, doc.vec) }))
                          .sort((a,b)=>b.score-a.score).slice(0, TOP_K);
      bestDoc = pickBestDoc(scored);
    }

    if (!hasImage && isLinkQuestion(text)) {
      if (bestDoc) {
        return res.json({
          answer: `Ich habe den Link gefunden: [${bestDoc.title}](${bestDoc.url})`
        });
      } else {
        return res.json({ answer: "Ich konnte keine passende Seite finden." });
      }
    }

    const payload = {
      model: model.name,
      stream: false,
      messages: [
        {
          role: "system",
          content: "Du bist der Mini-Assistent von Leap. Antworte auf Deutsch, kurz und hilfreich. " +
                   "Füge KEINE 'Relevante Seiten' oder Listen an. Wenn du einen Link erwähnst, gib nur einen einzigen Markdown-Link aus."
        },
        { role: "user", content: text }
      ]
    };

    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), TIMEOUT);
    const r = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(()=>clearTimeout(timer));

    if (!r.ok) return res.status(502).json({ error: await r.text() });
    const data = await r.json();
    let answer = cleanAnswer(data?.message?.content || "");

    const match = answer.match(/\[([^\]]+)\]\([^)]+\)/);
    if (match) answer = `Ich habe den Link gefunden: ${match[0]}`;

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/reindex", async (_req, res) => {
  await buildIndex();
  res.json({ ok: true, pages: index.length });
});
app.get("/health", (_req, res) => res.json({ ok: true, pages: index.length }));

app.listen(PORT, () => console.log(`🚀 Leap AI läuft auf http://127.0.0.1:${PORT}`));