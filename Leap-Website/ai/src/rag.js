// =======================================================================
// 📚 RAG.JS — Retrieval Augmented Generation (Wissensdatenbank)
// =======================================================================
import fs from "fs";
import { LEAP_INDEX_FILE, INTERPRETER_FEATURES_FILE } from "./config.js";
import { embedText } from "./llm.js";

// In-Memory Speicher
let LEAP_INDEX = [];
let INTERPRETER_FEATURES = null;

/**
 * Berechne die Kosinus-Ähnlichkeit zwischen zwei Vektoren
 */
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

/**
 * Lade den LEAP RAG Index aus der JSON-Datei
 */
export function loadLeapIndex() {
    try {
        if (fs.existsSync(LEAP_INDEX_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(LEAP_INDEX_FILE, "utf8"));
            LEAP_INDEX = parsed.items || [];
            console.log(`✅ RAG Index geladen: ${LEAP_INDEX.length} Einträge`);
            return true;
        }
    } catch (err) {
        console.error("Index Error:", err.message);
    }
    return false;
}

/**
 * Lade die Interpreter-Features aus der JSON-Datei
 */
export function loadInterpreterFeatures() {
    try {
        if (fs.existsSync(INTERPRETER_FEATURES_FILE)) {
            INTERPRETER_FEATURES = JSON.parse(fs.readFileSync(INTERPRETER_FEATURES_FILE, "utf8"));
            console.log(`✅ Interpreter Features geladen aus Main.java`);
            console.log(`   📦 Loops: ${INTERPRETER_FEATURES.loops?.length || 0}`);
            console.log(`   📦 Conditionals: ${INTERPRETER_FEATURES.conditionals?.length || 0}`);
            console.log(`   📦 Not Supported: ${INTERPRETER_FEATURES.notSupported?.length || 0}`);
            return true;
        } else {
            console.log(`⚠️ Keine interpreter_features.json gefunden. Führe 'node scripts/build_interpreter_docs.js' aus!`);
        }
    } catch (err) {
        console.error("Interpreter Features Error:", err.message);
    }
    return false;
}

/**
 * Hole die Interpreter-Features
 */
export function getInterpreterFeatures() {
    return INTERPRETER_FEATURES;
}

/**
 * Suche relevanten Kontext aus dem RAG-Index
 * @param {string} query - Die Suchanfrage
 * @returns {string} - Der relevante Kontext
 */
export async function retrieveLeapContext(query) {
    if (!LEAP_INDEX.length || !query) return "";

    const qEmbedding = await embedText(query);
    if (!qEmbedding) return "";

    const scored = LEAP_INDEX.map(item => ({
        ...item,
        score: cosineSimilarity(qEmbedding, item.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored
        .slice(0, 3)
        .map(h => `// REGEL: ${h.file}\n${h.text}`)
        .join("\n\n");
}

/**
 * Initialisiere das RAG-System
 */
export function initRAG() {
    loadLeapIndex();
    loadInterpreterFeatures();
}

/**
 * Hot-Reload: Lade den Index neu ohne Server-Restart
 * Wird vom File-Watcher aufgerufen wenn Dateien geändert werden
 */
export function hotReloadRAG() {
    console.log("🔥 HOT-RELOAD: Lade RAG Index neu...");
    const indexLoaded = loadLeapIndex();
    const featuresLoaded = loadInterpreterFeatures();
    
    if (indexLoaded && featuresLoaded) {
        console.log("🔥 HOT-RELOAD: Erfolgreich!");
        return true;
    }
    return false;
}
