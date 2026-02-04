// =======================================================================
// 🏃 INTERPRETER.JS — LEAP Code Ausführung & Post-Processing
// =======================================================================
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { LEAP_JAR_PATH } from "./config.js";

/**
 * Dekodiere HTML-Entities in Text
 * @param {string} text - Der zu dekodierende Text
 * @returns {string} - Der dekodierte Text
 */
export function decodeHtmlEntities(text) {
    if (!text) return text;
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

/**
 * Post-Processing: Korrigiert AI-generierten Code zu korrektem LEAP
 * @param {string} text - Der Text mit Code-Blöcken
 * @returns {string} - Der korrigierte Text
 */
export function postProcessLeapCode(text) {
    const warnings = [];

    // Finde alle Code-Blöcke und korrigiere sie
    let result = text.replace(/```(\w*)\s*([\s\S]*?)```/g, (match, lang, code) => {
        let fixed = code;

        // Falsche Keywords korrigieren (der Interpreter kennt nur bestimmte!)
        // "solange" → "while" (solange ist NICHT im Interpreter!)
        fixed = fixed.replace(/\bsolange\s*\(/gi, 'while(');

        // Typen entfernen (int x = 10 → x = 10)
        fixed = fixed.replace(/\b(int|var|const|string|float|double|boolean)\s+([a-zA-Z_]\w*)\s*=/g, '$2 =');

        // i++ → i = i + 1 (mit Leerzeichen für bessere Lesbarkeit)
        fixed = fixed.replace(/\b([a-zA-Z_]\w*)\+\+/g, '$1 = $1 + 1');
        fixed = fixed.replace(/\b([a-zA-Z_]\w*)--/g, '$1 = $1 - 1');

        // i += 1 → i = i + 1
        fixed = fixed.replace(/\b([a-zA-Z_]\w*)\s*\+=\s*(\d+)/g, '$1 = $1 + $2');
        fixed = fixed.replace(/\b([a-zA-Z_]\w*)\s*-=\s*(\d+)/g, '$1 = $1 - $2');

        return '```' + (lang || 'leap') + '\n' + fixed + '```';
    });

    // Füge Warnungen am Anfang hinzu wenn nötig
    if (warnings.length > 0) {
        result = warnings.join('\n') + '\n\n' + result;
    }

    return result;
}

/**
 * Führe LEAP-Code mit dem Java-Interpreter aus
 * @param {string} code - Der LEAP-Code
 * @returns {Promise<{output: string, error?: string}>} - Das Ausführungsergebnis
 */
export function runLeapCode(code) {
    return new Promise((resolve) => {
        // HTML-Entities dekodieren
        code = decodeHtmlEntities(code);

        console.log("📥 RECEIVED CODE:");
        console.log("-------------------");
        console.log(code);
        console.log("-------------------");

        if (!code) {
            return resolve({ output: "⚠️ Kein Code vorhanden." });
        }

        if (!fs.existsSync(LEAP_JAR_PATH)) {
            console.error(`❌ Java-Interpreter nicht gefunden unter: ${LEAP_JAR_PATH}`);
            return resolve({
                output: `System-Fehler: 'leap-interpreter.jar' nicht gefunden!\nPfad: ${LEAP_JAR_PATH}`
            });
        }

        // Speichere Temp-Datei im System-Temp-Ordner
        const tempFile = path.join(os.tmpdir(), `leap_temp_${Date.now()}.lp`);

        try {
            fs.writeFileSync(tempFile, code);

            console.log(`🏃‍♂️ Führe aus: java -jar leap-interpreter.jar ${path.basename(tempFile)}`);

            // Java-Interpreter ausführen mit 10s Timeout
            exec(`java -jar "${LEAP_JAR_PATH}" "${tempFile}"`, { timeout: 10000 }, (error, stdout, stderr) => {
                // Aufräumen (Datei löschen)
                try { fs.unlinkSync(tempFile); } catch (_e) { /* ignore cleanup errors */ }

                if (error) {
                    if (error.killed) {
                        return resolve({ output: "⏱️ Timeout: Code lief länger als 10 Sekunden." });
                    }
                    // Stderr enthält oft die Fehlermeldung vom Java-Interpreter
                    const errorMsg = stderr || stdout || error.message;
                    return resolve({ output: `Fehler:\n${errorMsg}` });
                }

                resolve({ output: stdout || "✅ (Code lief ohne Ausgabe)" });
            });
        } catch (e) {
            resolve({ output: "Serverfehler: " + e.message, error: e.message });
        }
    });
}
