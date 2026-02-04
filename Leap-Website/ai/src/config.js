// =======================================================================
// ⚙️ CONFIG.JS — Zentrale Konfiguration
// =======================================================================
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Basis-Pfade
export const AI_DIR = path.join(__dirname, '..');
export const ROOT_DIR = path.join(AI_DIR, '..');

// Server
export const PORT = 8081;

// Ollama API URLs
export const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
export const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";

// AI Modelle
export const MODELS = {
    general: "qwen2.5:3b",
    vision: "llava:7b",
    embed: "nomic-embed-text",
};

// LEAP Interpreter
export const LEAP_JAR_PATH = path.join(AI_DIR, 'leap-code', 'leap-interpreter.jar');

// RAG Index Dateien
export const LEAP_INDEX_FILE = path.join(AI_DIR, "leap_index.json");
export const INTERPRETER_FEATURES_FILE = path.join(AI_DIR, "interpreter_features.json");
