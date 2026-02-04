// =======================================================================
// 🤖 LLM.JS — Ollama API Aufrufe (Chat, Vision, Embeddings)
// =======================================================================
import fetch from "node-fetch";
import { OLLAMA_CHAT_URL, OLLAMA_EMBED_URL, MODELS } from "./config.js";

/**
 * Generiere einen Embedding-Vektor für einen Text
 * @param {string} text - Der zu embeddierende Text
 * @returns {number[]|null} - Der Embedding-Vektor oder null bei Fehler
 */
export async function embedText(text) {
    try {
        const res = await fetch(OLLAMA_EMBED_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: MODELS.embed, input: text })
        });
        const data = await res.json();
        return data.embedding || (Array.isArray(data.embeddings) ? data.embeddings[0] : null);
    } catch (e) {
        console.error("Embedding Error:", e.message);
        return null;
    }
}

/**
 * Sende eine Chat-Anfrage an Ollama
 * @param {Object[]} messages - Die Chat-Nachrichten
 * @param {Object} options - Optionen (model, temperature, etc.)
 * @returns {string} - Die Antwort des Modells
 */
export async function chat(messages, options = {}) {
    const {
        model = MODELS.general,
        temperature = 0.1,
        stream = false
    } = options;

    try {
        const response = await fetch(OLLAMA_CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                stream,
                messages,
                options: { temperature }
            })
        });

        const data = await response.json();
        return data.message?.content || "Fehler: Keine Antwort vom Modell.";
    } catch (e) {
        console.error("Chat Error:", e.message);
        throw e;
    }
}

/**
 * Extrahiere Text aus einem Bild (OCR via Vision Model)
 * @param {Buffer} imageBuffer - Das Bild als Buffer
 * @returns {string} - Der extrahierte Text
 */
export async function scanImageForText(imageBuffer) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(OLLAMA_CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODELS.vision,
                stream: false,
                messages: [{
                    role: "user",
                    content: "OCR: Extract code only.",
                    images: [imageBuffer.toString("base64")]
                }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await response.json();
        const txt = data.message?.content || "";
        return txt.replace(/```/g, "").trim().substring(0, 500);
    } catch (e) {
        console.error("Vision Error:", e.message);
        return "";
    }
}

export { MODELS };
