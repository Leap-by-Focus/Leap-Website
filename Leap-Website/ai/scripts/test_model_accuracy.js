#!/usr/bin/env node
// =======================================================================
// 🧪 TEST_MODEL_ACCURACY.JS — Nightly AI Code Quality Check
// =======================================================================
// Testet ob die AI validen Leap-Code generiert, indem der Output
// durch den echten leap-interpreter.jar geprüft wird.
//
// Usage: node scripts/test_model_accuracy.js [--verbose] [--count=50]
// =======================================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =======================================================================
// ⚙️ KONFIGURATION
// =======================================================================
const CONFIG = {
    API_URL: "http://localhost:8081/api/chat",
    INTERPRETER_JAR: path.join(__dirname, "..", "leap-code", "leap-interpreter.jar"),
    TEMP_FILE: path.join(__dirname, "..", "leap-code", "_test_temp.lp"),
    REPORT_DIR: path.join(__dirname, "..", "logs"),
    DEFAULT_COUNT: 50,
    TIMEOUT_MS: 60000, // 60 Sekunden pro Anfrage
};

// =======================================================================
// 📝 TEST PROMPTS — Standard-Aufgaben für Leap
// =======================================================================
const TEST_PROMPTS = [
    // Variablen (10)
    "Erstelle eine Variable mit dem Namen 'zahl' und dem Wert 42",
    "Erstelle eine Variable 'name' mit dem Text 'Leap'",
    "Erstelle eine Variable 'ergebnis' und weise ihr 10 + 5 zu",
    "Deklariere eine Variable 'aktiv' mit dem Wert wahr",
    "Erstelle zwei Variablen 'a' und 'b' mit den Werten 3 und 7",
    "Erstelle eine Variable 'liste' als leere Liste",
    "Erstelle eine Variable 'pi' mit dem Wert 3.14",
    "Erstelle eine Variable 'counter' mit 0 und erhöhe sie um 1",
    "Erstelle eine Variable 'text' und füge zwei Strings zusammen",
    "Erstelle eine Variable mit einer Berechnung: (5 + 3) * 2",
    
    // Ausgabe (10)
    "Schreibe ein Programm das 'Hallo Welt' ausgibt",
    "Gib die Zahlen 1, 2, 3 nacheinander aus",
    "Erstelle eine Variable und gib ihren Wert aus",
    "Gib das Ergebnis von 10 * 10 aus",
    "Schreibe 'Willkommen bei Leap!' auf die Konsole",
    "Gib deinen Namen aus",
    "Erstelle eine Begrüßung und zeige sie an",
    "Gib 'Test bestanden!' aus",
    "Schreibe eine Nachricht mit einer Zahl: 'Ergebnis: 42'",
    "Gib 'Start' aus, dann 'Ende'",
    
    // Schleifen (10)
    "Erstelle eine Schleife die von 1 bis 5 zählt",
    "Schreibe eine Schleife die 10 mal 'Hallo' ausgibt",
    "Erstelle eine solange-Schleife die bis 3 zählt",
    "Zähle rückwärts von 5 bis 1 mit einer Schleife",
    "Erstelle eine Schleife die alle geraden Zahlen von 2 bis 10 ausgibt",
    "Schreibe eine Schleife mit einer Zählvariable i",
    "Erstelle eine wiederhole-Schleife die 5 mal läuft",
    "Summiere die Zahlen 1 bis 10 mit einer Schleife",
    "Erstelle eine Schleife die bei 0 startet und bei 4 endet",
    "Schreibe eine verschachtelte Ausgabe in einer Schleife",
    
    // Bedingungen (10)
    "Prüfe ob eine Zahl größer als 10 ist",
    "Erstelle eine wenn-dann Bedingung",
    "Prüfe ob eine Variable wahr oder falsch ist",
    "Erstelle eine wenn-sonst Bedingung",
    "Prüfe ob zwei Zahlen gleich sind",
    "Erstelle eine Bedingung die prüft ob x kleiner als 5 ist",
    "Schreibe eine Bedingung mit und-Verknüpfung",
    "Prüfe ob eine Zahl zwischen 1 und 10 liegt",
    "Erstelle eine Bedingung die 'Ja' oder 'Nein' ausgibt",
    "Prüfe ob eine Zahl positiv ist",
    
    // Kombiniert (10)
    "Zähle von 1 bis 10 und gib nur gerade Zahlen aus",
    "Erstelle eine Variable, erhöhe sie in einer Schleife und gib sie aus",
    "Berechne die Summe der Zahlen 1 bis 5",
    "Erstelle ein FizzBuzz für Zahlen 1 bis 15",
    "Finde die größte Zahl in einer Schleife",
    "Zähle wie oft eine Bedingung wahr ist",
    "Erstelle einen Countdown von 10 bis 0",
    "Berechne das Produkt der Zahlen 1 bis 5 (Fakultät)",
    "Gib alle ungeraden Zahlen von 1 bis 20 aus",
    "Erstelle eine Schleife die abbricht wenn x > 5",
];

// =======================================================================
// 🎨 CONSOLE COLORS
// =======================================================================
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
};

function log(msg, color = "") {
    console.log(`${color}${msg}${colors.reset}`);
}

// =======================================================================
// 🔧 HELPER FUNKTIONEN
// =======================================================================

/**
 * Extrahiert Leap-Code aus der AI-Antwort
 */
function extractLeapCode(response) {
    // Suche nach Code-Blöcken mit ```leap oder ```
    const codeBlockRegex = /```(?:leap|lp)?\s*([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
        return matches.map(m => m[1].trim()).join("\n\n");
    }
    
    // Fallback: Suche nach Zeilen die wie Leap-Code aussehen
    const lines = response.split("\n");
    const codeLines = lines.filter(line => {
        const trimmed = line.trim();
        return (
            trimmed.startsWith("setze ") ||
            trimmed.startsWith("ausgabe ") ||
            trimmed.startsWith("wenn ") ||
            trimmed.startsWith("solange ") ||
            trimmed.startsWith("wiederhole ") ||
            trimmed.startsWith("für ") ||
            trimmed.startsWith("//") ||
            /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(trimmed)
        );
    });
    
    return codeLines.join("\n");
}

/**
 * Sendet eine Anfrage an die AI
 */
async function askAI(prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
    
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: prompt,
                useLeapContext: "true"
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.answer || "";
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Führt Leap-Code durch den Interpreter aus
 */
function runInterpreter(code) {
    // Code in temporäre Datei schreiben
    fs.writeFileSync(CONFIG.TEMP_FILE, code, "utf8");
    
    try {
        const result = execSync(
            `java -jar "${CONFIG.INTERPRETER_JAR}" "${CONFIG.TEMP_FILE}"`,
            { 
                encoding: "utf8",
                timeout: 10000,
                cwd: path.dirname(CONFIG.INTERPRETER_JAR)
            }
        );
        return { success: true, output: result.trim() };
    } catch (error) {
        return { 
            success: false, 
            output: error.stderr || error.stdout || error.message 
        };
    } finally {
        // Temporäre Datei löschen
        try { fs.unlinkSync(CONFIG.TEMP_FILE); } catch {}
    }
}

/**
 * Führt einen einzelnen Test aus
 */
async function runTest(prompt, index, total, verbose) {
    const testNum = `[${String(index + 1).padStart(2, "0")}/${total}]`;
    
    if (verbose) {
        log(`\n${testNum} Prompt: "${prompt.substring(0, 50)}..."`, colors.blue);
    }
    
    try {
        // 1. AI fragen
        const aiResponse = await askAI(prompt);
        
        // 2. Code extrahieren
        const code = extractLeapCode(aiResponse);
        
        if (!code || code.trim().length === 0) {
            if (verbose) {
                log(`   ⚠️  Kein Code in Antwort gefunden`, colors.yellow);
            }
            return { 
                prompt, 
                status: "no_code", 
                code: "", 
                error: "Kein Leap-Code in AI-Antwort gefunden" 
            };
        }
        
        if (verbose) {
            log(`   Code: ${code.split("\n")[0]}...`, colors.gray);
        }
        
        // 3. Interpreter ausführen
        const result = runInterpreter(code);
        
        if (result.success) {
            if (verbose) {
                log(`   ✅ Valide! Output: ${result.output.substring(0, 50)}`, colors.green);
            }
            return { prompt, status: "valid", code, output: result.output };
        } else {
            if (verbose) {
                log(`   ❌ Fehler: ${result.output.substring(0, 80)}`, colors.red);
            }
            return { prompt, status: "invalid", code, error: result.output };
        }
        
    } catch (error) {
        if (verbose) {
            log(`   ❌ API Fehler: ${error.message}`, colors.red);
        }
        return { prompt, status: "api_error", error: error.message };
    }
}

// =======================================================================
// 📊 REPORT GENERIERUNG
// =======================================================================

function generateReport(results, duration) {
    const valid = results.filter(r => r.status === "valid").length;
    const invalid = results.filter(r => r.status === "invalid").length;
    const noCode = results.filter(r => r.status === "no_code").length;
    const apiError = results.filter(r => r.status === "api_error").length;
    const total = results.length;
    const accuracy = ((valid / total) * 100).toFixed(1);
    
    const timestamp = new Date().toISOString();
    const date = timestamp.split("T")[0];
    
    // Console Report
    log("\n" + "=".repeat(60), colors.bold);
    log("📊 MODEL ACCURACY REPORT", colors.bold);
    log("=".repeat(60));
    log(`Datum:     ${timestamp}`);
    log(`Dauer:     ${(duration / 1000).toFixed(1)}s`);
    log(`Tests:     ${total}`);
    log("");
    log(`✅ Valide:     ${valid}/${total} (${accuracy}%)`, valid > 0 ? colors.green : "");
    log(`❌ Invalide:   ${invalid}/${total}`, invalid > 0 ? colors.red : "");
    log(`⚠️  Kein Code:  ${noCode}/${total}`, noCode > 0 ? colors.yellow : "");
    log(`🔴 API Error:  ${apiError}/${total}`, apiError > 0 ? colors.red : "");
    log("=".repeat(60));
    
    // Ergebnis-Zeile für CI
    if (parseFloat(accuracy) >= 80) {
        log(`\n🎉 BESTANDEN: ${valid}/${total} Code-Snippets waren valide!`, colors.green + colors.bold);
    } else {
        log(`\n⚠️  WARNUNG: Nur ${accuracy}% Genauigkeit!`, colors.yellow + colors.bold);
    }
    
    // JSON Report speichern
    const report = {
        timestamp,
        duration_ms: duration,
        summary: { total, valid, invalid, noCode, apiError, accuracy: parseFloat(accuracy) },
        results: results.map(r => ({
            prompt: r.prompt,
            status: r.status,
            code: r.code?.substring(0, 200),
            output: r.output?.substring(0, 200),
            error: r.error?.substring(0, 200)
        }))
    };
    
    const reportFile = path.join(CONFIG.REPORT_DIR, `accuracy-${date}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    log(`\n📁 Report gespeichert: ${reportFile}`, colors.gray);
    
    return { valid, total, accuracy: parseFloat(accuracy) };
}

// =======================================================================
// 🚀 MAIN
// =======================================================================

async function main() {
    const args = process.argv.slice(2);
    const verbose = args.includes("--verbose") || args.includes("-v");
    const countArg = args.find(a => a.startsWith("--count="));
    const count = countArg ? parseInt(countArg.split("=")[1]) : CONFIG.DEFAULT_COUNT;
    
    log("\n🧪 LEAP AI MODEL ACCURACY TEST", colors.bold + colors.blue);
    log("=".repeat(40));
    log(`Tests: ${count} | Verbose: ${verbose}`);
    
    // Prüfe ob Server läuft
    try {
        const health = await fetch("http://localhost:8081/api/health");
        if (!health.ok) throw new Error("Server nicht healthy");
    } catch {
        log("\n❌ Server nicht erreichbar! Starte erst: node server.js", colors.red);
        process.exit(1);
    }
    
    // Prüfe ob Interpreter existiert
    if (!fs.existsSync(CONFIG.INTERPRETER_JAR)) {
        log(`\n❌ Interpreter nicht gefunden: ${CONFIG.INTERPRETER_JAR}`, colors.red);
        process.exit(1);
    }
    
    // Tests auswählen (zufällig wenn mehr als verfügbar)
    let prompts = [...TEST_PROMPTS];
    if (count < prompts.length) {
        // Zufällige Auswahl
        prompts = prompts.sort(() => Math.random() - 0.5).slice(0, count);
    } else if (count > prompts.length) {
        // Prompts wiederholen
        while (prompts.length < count) {
            prompts.push(...TEST_PROMPTS);
        }
        prompts = prompts.slice(0, count);
    }
    
    log(`\n🚀 Starte ${prompts.length} Tests...\n`);
    
    const startTime = Date.now();
    const results = [];
    
    for (let i = 0; i < prompts.length; i++) {
        const result = await runTest(prompts[i], i, prompts.length, verbose);
        results.push(result);
        
        // Fortschritt anzeigen (wenn nicht verbose)
        if (!verbose) {
            const symbol = result.status === "valid" ? "✅" : 
                          result.status === "invalid" ? "❌" : 
                          result.status === "no_code" ? "⚠️" : "🔴";
            process.stdout.write(symbol);
            if ((i + 1) % 10 === 0) process.stdout.write(` ${i + 1}/${prompts.length}\n`);
        }
        
        // Kleine Pause zwischen Requests
        await new Promise(r => setTimeout(r, 500));
    }
    
    const duration = Date.now() - startTime;
    const { accuracy } = generateReport(results, duration);
    
    // Exit Code für CI
    process.exit(accuracy >= 70 ? 0 : 1);
}

main().catch(err => {
    log(`\n❌ Fehler: ${err.message}`, colors.red);
    process.exit(1);
});
