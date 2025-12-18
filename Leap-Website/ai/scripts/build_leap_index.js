// scripts/build_leap_index.js
// Baut einen Embedding-Index über den Leap-Code im Ordner ./leap-code

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

// --- Pfade sauber aus import.meta.url ableiten (Spaces, %20 etc. richtig) ---
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);

// ./leap-code relativ zu /ai
const LEAP_REPO_DIR = path.join(__dirnameLocal, "..", "leap-code");
// Index-Datei direkt im /ai-Ordner
const OUT_FILE = path.join(__dirnameLocal, "..", "leap_index.json");

const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";
const EMBED_MODEL = "nomic-embed-text";

// Welche Dateien sollen in den Index?
const ALLOWED_EXT = [
  ".leap",
  ".cs",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  // bewusste Entscheidung: KEIN .md, .txt
];

const IGNORE_DIRS = [
  "node_modules",
  ".git",
  ".vscode",
  ".idea",
  "bin",
  "obj",
  "docs",
  "doc",
  "playground",
  "examples",
  "example",
  "old",
  "backup",
];

// -------- Helper: Files recursiv einsammeln -----------------

function walkDir(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.includes(e.name)) continue;
      walkDir(full, files);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (ALLOWED_EXT.includes(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

// -------- Helper: Text in Chunks zerschneiden ----------------

function chunkText(text, chunkSize = 800, overlap = 200) {
  const chunks = [];
  let start = 0;
  const len = text.length;

  if (len <= chunkSize) {
    return [text];
  }

  while (start < len) {
    const end = Math.min(len, start + chunkSize);
    const slice = text.slice(start, end);
    chunks.push(slice);
    if (end === len) break;
    start = end - overlap;
  }
  return chunks;
}

// -------- Helper: Embedding via Ollama -----------------------

async function embedText(text) {
  const body = {
    model: EMBED_MODEL,
    input: text
  };

  const res = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Ollama embedding error: " + res.status + " " + errText);
  }

  const data = await res.json();

  // Ollama liefert normalerweise: { embedding: [ ... ] }
  // Fallback, falls irgendwann mal embeddings[] kommt:
  const embedding =
    data.embedding ||
    (Array.isArray(data.embeddings) ? data.embeddings[0] : null);

  if (!embedding) {
    console.error("⚠️ Unerwartete Embedding-Response von Ollama:", data);
    throw new Error("No embedding returned from Ollama");
  }

  return embedding;
}

// -------------------- MAIN LOGIK -----------------------------

async function main() {
  console.log("📂 __dirnameLocal:", __dirnameLocal);
  console.log("📂 LEAP_REPO_DIR:", LEAP_REPO_DIR);
  console.log("📄 OUT_FILE:", OUT_FILE);

  if (!fs.existsSync(LEAP_REPO_DIR)) {
    console.error("❌ leap-code Ordner nicht gefunden:", LEAP_REPO_DIR);
    process.exit(1);
  }

  console.log("📁 Scanne Repo:", LEAP_REPO_DIR);
  const files = walkDir(LEAP_REPO_DIR);
  console.log(`Gefundene Dateien (${files.length}):`);
  files.forEach((f) => console.log("  -", path.relative(LEAP_REPO_DIR, f)));

  const index = [];
  let counter = 0;
  let skippedChunks = 0;

  for (const filePath of files) {
    const relPath = path.relative(LEAP_REPO_DIR, filePath);
    console.log("\n📄 Indexiere Datei:", relPath);

    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      console.warn("  ⚠️ Konnte Datei nicht lesen:", e.message);
      continue;
    }

    const chunks = chunkText(content, 800, 200);
    console.log(`  -> ${chunks.length} Chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkTextValue = chunks[i].trim();
      if (!chunkTextValue) continue;

      const lower = chunkTextValue.toLowerCase();
      // kaputte alte Prompt- oder Chat-Fragmente rausfiltern
if (
  lower.includes("egin{code}") ||
  lower.includes("end{code}") ||
  lower.includes("in leap deklarieren sie variablen") ||
  lower.includes("dies kann auch für listen") ||
  lower.includes("die grammatik von leap definiert") ||
  lower.includes("sie können eine variable definieren") ||
  lower.includes("in diesem codeblock") ||
  lower.includes("leap-ki") ||
  lower.includes("antwortformat")
) {
  console.log("    ⏭️ Chunk übersprungen (vermutlich Chat-/Prompt-Rest)");
  continue;
}

      // 🚫 Chunks mit alter/unerwünschter "Leap-Syntax" überspringen:
      // - define text = ...
      // - let/const/var name = ...
      const bannedSyntax =
        /\b(let|const|var)\s+[a-zA-Z_]\w*\s*=/i;

      if (lower.includes("define text =") || bannedSyntax.test(chunkTextValue)) {
        console.log(
          `    ⏭️ Chunk ${i + 1}/${chunks.length} übersprungen (alte/falsche Syntax: let/const/var/define text)`
        );
        skippedChunks++;
        continue;
      }

      console.log(`    ✏️ Embedde Chunk ${i + 1}/${chunks.length} ...`);
      try {
        const embedding = await embedText(chunkTextValue);

        index.push({
          id: `${relPath}::${i}`,
          file: relPath,
          pos: i,
          text: chunkTextValue,
          embedding,
        });

        counter++;
      } catch (e) {
        console.error("    ❌ Embedding-Fehler:", e.message);
      }
    }
  }

  console.log(`\n💾 Speichere Index mit ${counter} Chunks nach ${OUT_FILE} ...`);
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        sourceRoot: LEAP_REPO_DIR,
        items: index,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("✅ Fertig!");
  console.log(`📊 Eingebettete Chunks: ${counter}`);
  console.log(`📊 Übersprungene Chunks (alte Syntax): ${skippedChunks}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});