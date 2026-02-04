#!/usr/bin/env node
// =======================================================================
// 🔥 LOAD_TEST.JS — Stress-Test für Leap AI Server
// =======================================================================
// Simuliert parallele User-Anfragen und misst Performance-Grenzen
// Usage: node scripts/load_test.js [--url=http://localhost:8081] [--levels=10,20,50]
// =======================================================================

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Konfiguration ──────────────────────────────────────────────────────────────
const DEFAULT_URL = "http://localhost:8081";
const DEFAULT_LEVELS = [10, 20, 50, 100];
const TIMEOUT_MS = 60000; // 60 Sekunden Timeout pro Request

// Test-Nachrichten (variiert um Caching zu vermeiden)
const TEST_MESSAGES = [
    "Was ist LEAP?",
    "Wie schreibe ich eine for-Schleife?",
    "Erkläre mir Arrays in LEAP",
    "Was bedeutet ausgabe()?",
    "Wie funktioniert eine while-Schleife?",
    "Was sind Variablen?",
    "Wie mache ich eine Bedingung?",
    "Erkläre mir falls/sonst",
    "Was ist der Unterschied zwischen zahl und text?",
    "Wie kann ich Benutzereingaben lesen?",
];

// ── CLI Argumente parsen ───────────────────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    let url = DEFAULT_URL;
    let levels = DEFAULT_LEVELS;
    
    for (const arg of args) {
        if (arg.startsWith("--url=")) {
            url = arg.split("=")[1];
        } else if (arg.startsWith("--levels=")) {
            levels = arg.split("=")[1].split(",").map(n => parseInt(n.trim()));
        } else if (arg === "--help" || arg === "-h") {
            console.log(`
🔥 Leap AI Load Tester

Usage: node scripts/load_test.js [options]

Options:
  --url=URL         Server URL (default: ${DEFAULT_URL})
  --levels=N,N,N    Concurrent request levels (default: ${DEFAULT_LEVELS.join(",")})
  --help, -h        Show this help

Examples:
  node scripts/load_test.js
  node scripts/load_test.js --levels=5,10,25
  node scripts/load_test.js --url=http://localhost:3000 --levels=10,20,50,100
`);
            process.exit(0);
        }
    }
    
    return { url, levels };
}

// ── Einzelne Anfrage senden ────────────────────────────────────────────────────
function sendRequest(baseUrl, message) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const url = new URL("/api/chat", baseUrl);
        const isHttps = url.protocol === "https:";
        const client = isHttps ? https : http;
        
        const postData = JSON.stringify({ message });
        
        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData),
            },
            timeout: TIMEOUT_MS,
        };
        
        const req = client.request(options, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                const duration = Date.now() - startTime;
                resolve({
                    success: res.statusCode >= 200 && res.statusCode < 300,
                    statusCode: res.statusCode,
                    duration,
                    responseSize: data.length,
                    error: null,
                });
            });
        });
        
        req.on("error", (err) => {
            const duration = Date.now() - startTime;
            resolve({
                success: false,
                statusCode: 0,
                duration,
                responseSize: 0,
                error: err.message,
            });
        });
        
        req.on("timeout", () => {
            req.destroy();
            const duration = Date.now() - startTime;
            resolve({
                success: false,
                statusCode: 0,
                duration,
                responseSize: 0,
                error: "TIMEOUT",
            });
        });
        
        req.write(postData);
        req.end();
    });
}

// ── Health-Check ───────────────────────────────────────────────────────────────
async function checkServerHealth(baseUrl) {
    return new Promise((resolve) => {
        const url = new URL("/health", baseUrl);
        const isHttps = url.protocol === "https:";
        const client = isHttps ? https : http;
        
        const req = client.get(url.toString(), { timeout: 5000 }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const health = JSON.parse(data);
                    // Server ist erreichbar, auch wenn Ollama down ist (503)
                    resolve({ ok: res.statusCode === 200 || res.statusCode === 503, data: health, ollamaDown: res.statusCode === 503 });
                } catch {
                    // Auch "true" als plain text akzeptieren
                    resolve({ ok: data === "true" || res.statusCode < 500, data: null, ollamaDown: res.statusCode === 503 });
                }
            });
        });
        
        req.on("error", () => resolve({ ok: false, data: null }));
        req.on("timeout", () => {
            req.destroy();
            resolve({ ok: false, data: null });
        });
    });
}

// ── Load-Test für ein Level ────────────────────────────────────────────────────
async function runLoadLevel(baseUrl, concurrency) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🚀 Starte ${concurrency} parallele Anfragen...`);
    console.log(`${"─".repeat(60)}`);
    
    const startTime = Date.now();
    
    // Parallele Anfragen erstellen
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
        const message = TEST_MESSAGES[i % TEST_MESSAGES.length] + ` (Request ${i + 1})`;
        promises.push(sendRequest(baseUrl, message));
    }
    
    // Progress-Anzeige
    let completed = 0;
    const progressInterval = setInterval(() => {
        process.stdout.write(`\r   ⏳ Fortschritt: ${completed}/${concurrency} abgeschlossen...`);
    }, 500);
    
    // Alle Anfragen parallel ausführen
    const results = await Promise.all(
        promises.map(p => p.then(r => { completed++; return r; }))
    );
    
    clearInterval(progressInterval);
    process.stdout.write(`\r   ✅ Alle ${concurrency} Anfragen abgeschlossen!          \n`);
    
    const totalTime = Date.now() - startTime;
    
    // Statistiken berechnen
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const durations = results.map(r => r.duration).sort((a, b) => a - b);
    
    const stats = {
        concurrency,
        totalRequests: concurrency,
        successful: successful.length,
        failed: failed.length,
        successRate: ((successful.length / concurrency) * 100).toFixed(1),
        errorRate: ((failed.length / concurrency) * 100).toFixed(1),
        totalTime,
        avgDuration: durations.length > 0 
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) 
            : 0,
        minDuration: durations[0] || 0,
        maxDuration: durations[durations.length - 1] || 0,
        p50: durations[Math.floor(durations.length * 0.5)] || 0,
        p90: durations[Math.floor(durations.length * 0.9)] || 0,
        p99: durations[Math.floor(durations.length * 0.99)] || 0,
        requestsPerSecond: ((concurrency / totalTime) * 1000).toFixed(2),
        errors: failed.map(r => r.error).filter((v, i, a) => a.indexOf(v) === i),
    };
    
    // Ergebnisse ausgeben
    console.log(`\n   📊 Ergebnisse für ${concurrency} parallele Requests:`);
    console.log(`   ├─ Erfolgreich:     ${stats.successful}/${stats.totalRequests} (${stats.successRate}%)`);
    console.log(`   ├─ Fehlgeschlagen:  ${stats.failed} (${stats.errorRate}%)`);
    console.log(`   ├─ Gesamtzeit:      ${(stats.totalTime / 1000).toFixed(2)}s`);
    console.log(`   ├─ Requests/Sek:    ${stats.requestsPerSecond}`);
    console.log(`   │`);
    console.log(`   ├─ Antwortzeiten:`);
    console.log(`   │  ├─ Min:         ${stats.minDuration}ms`);
    console.log(`   │  ├─ Avg:         ${stats.avgDuration}ms`);
    console.log(`   │  ├─ P50:         ${stats.p50}ms`);
    console.log(`   │  ├─ P90:         ${stats.p90}ms`);
    console.log(`   │  ├─ P99:         ${stats.p99}ms`);
    console.log(`   │  └─ Max:         ${stats.maxDuration}ms`);
    
    if (stats.errors.length > 0) {
        console.log(`   │`);
        console.log(`   └─ Fehlertypen:    ${stats.errors.join(", ")}`);
    }
    
    return stats;
}

// ── Empfehlungen generieren ────────────────────────────────────────────────────
function generateRecommendations(allStats) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🎯 EMPFEHLUNGEN`);
    console.log(`${"═".repeat(60)}\n`);
    
    // Finde den Kipppunkt (wo Fehlerrate > 10% oder P90 > 30s)
    let recommendedMaxQueue = 50; // Default
    let recommendedThreads = 4;   // Default
    let breakingPoint = null;
    
    for (const stats of allStats) {
        const errorRate = parseFloat(stats.errorRate);
        const p90 = stats.p90;
        
        if (errorRate > 10 || p90 > 30000) {
            breakingPoint = stats.concurrency;
            break;
        }
        
        // Wenn dieser Level noch OK war, nutze ihn als Basis
        if (errorRate <= 5 && p90 < 20000) {
            recommendedMaxQueue = Math.ceil(stats.concurrency * 1.5);
        }
    }
    
    // Thread-Empfehlung basierend auf CPU-Cores (angenommen: 8 Cores)
    const cpuCores = 8; // Typischer Wert, könnte dynamisch ermittelt werden
    
    if (breakingPoint) {
        console.log(`   ⚠️  BREAKING POINT erkannt bei ${breakingPoint} parallelen Anfragen!`);
        console.log(`       Der Server zeigt Überlastung (Fehlerrate >10% oder P90 >30s)\n`);
        recommendedMaxQueue = Math.floor(breakingPoint * 0.7);
        recommendedThreads = Math.min(Math.ceil(breakingPoint / 10), cpuCores);
    } else {
        console.log(`   ✅ Server hat alle Laststufen bestanden!\n`);
    }
    
    // Analyse der Antwortzeiten-Trends
    const avgTimes = allStats.map(s => s.avgDuration);
    const isLinearScaling = avgTimes.every((t, i) => 
        i === 0 || t < avgTimes[i-1] * 3
    );
    
    console.log(`   📋 Konfigurationsempfehlungen:\n`);
    console.log(`   ┌─────────────────────────────────────────────────────┐`);
    console.log(`   │  Parameter          │  Empfohlener Wert            │`);
    console.log(`   ├─────────────────────────────────────────────────────┤`);
    console.log(`   │  MAX_QUEUE          │  ${String(recommendedMaxQueue).padEnd(28)}│`);
    console.log(`   │  NUM_THREADS        │  ${String(recommendedThreads).padEnd(28)}│`);
    console.log(`   │  TIMEOUT_MS         │  ${String(Math.max(30000, allStats[allStats.length-1]?.p90 * 2 || 60000)).padEnd(28)}│`);
    console.log(`   └─────────────────────────────────────────────────────┘`);
    
    console.log(`\n   💡 Begründung:`);
    console.log(`      • MAX_QUEUE=${recommendedMaxQueue}: Basierend auf dem letzten stabilen Level`);
    console.log(`      • NUM_THREADS=${recommendedThreads}: Optimal für ${cpuCores} CPU-Cores`);
    
    if (!isLinearScaling) {
        console.log(`\n   ⚠️  Warnung: Antwortzeiten skalieren nicht linear!`);
        console.log(`      Dies deutet auf einen Engpass hin (CPU, Memory, oder Ollama).`);
    }
    
    // Code-Snippet für server.js
    console.log(`\n   📝 Füge folgende Konfiguration in server.js ein:\n`);
    console.log(`   ┌──────────────────────────────────────────────────────`);
    console.log(`   │  // Load-Test Empfehlungen (${new Date().toISOString().split('T')[0]})`);
    console.log(`   │  const MAX_QUEUE = ${recommendedMaxQueue};`);
    console.log(`   │  const NUM_THREADS = ${recommendedThreads};`);
    console.log(`   │  const REQUEST_TIMEOUT = ${Math.max(30000, allStats[allStats.length-1]?.p90 * 2 || 60000)};`);
    console.log(`   └──────────────────────────────────────────────────────\n`);
    
    return {
        maxQueue: recommendedMaxQueue,
        numThreads: recommendedThreads,
        breakingPoint,
    };
}

// ── Hauptprogramm ──────────────────────────────────────────────────────────────
async function main() {
    const { url, levels } = parseArgs();
    
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🔥 LEAP AI LOAD TESTER`);
    console.log(`${"═".repeat(60)}`);
    console.log(`   Server:     ${url}`);
    console.log(`   Test-Level: ${levels.join(", ")} parallele Anfragen`);
    console.log(`   Timeout:    ${TIMEOUT_MS / 1000}s pro Request`);
    console.log(`${"═".repeat(60)}`);
    
    // Server Health-Check
    console.log(`\n🏥 Prüfe Server-Verfügbarkeit...`);
    const health = await checkServerHealth(url);
    
    if (!health.ok) {
        console.error(`\n❌ Server nicht erreichbar unter ${url}`);
        console.error(`   Starte den Server mit: cd ai && node server.js`);
        process.exit(1);
    }
    
    console.log(`   ✅ Server ist bereit!`);
    if (health.ollamaDown) {
        console.log(`   ⚠️  Ollama ist NICHT erreichbar - Tests werden trotzdem ausgeführt`);
        console.log(`      (Erwarte 503 Fehler bei Chat-Anfragen)`);
    } else if (health.data?.ollama) {
        console.log(`   ✅ Ollama: ${health.data.ollama.status || "OK"}`);
    }
    
    // Warm-up Request
    console.log(`\n🔥 Warm-up Request...`);
    await sendRequest(url, "Warm-up Test");
    console.log(`   ✅ Warm-up abgeschlossen`);
    
    // Load-Tests durchführen
    const allStats = [];
    
    for (const level of levels) {
        const stats = await runLoadLevel(url, level);
        allStats.push(stats);
        
        // Kurze Pause zwischen Levels
        if (level !== levels[levels.length - 1]) {
            console.log(`\n   ⏸️  Pause 3 Sekunden vor nächstem Level...`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
    
    // Zusammenfassung und Empfehlungen
    console.log(`\n${"═".repeat(60)}`);
    console.log(`📈 ZUSAMMENFASSUNG`);
    console.log(`${"═".repeat(60)}\n`);
    
    console.log(`   Level    │ Success │ Avg Time │ P90 Time │ Req/s`);
    console.log(`   ─────────┼─────────┼──────────┼──────────┼───────`);
    
    for (const stats of allStats) {
        const level = String(stats.concurrency).padStart(4);
        const success = `${stats.successRate}%`.padStart(6);
        const avg = `${stats.avgDuration}ms`.padStart(7);
        const p90 = `${stats.p90}ms`.padStart(7);
        const rps = stats.requestsPerSecond.padStart(5);
        console.log(`   ${level}    │ ${success}  │ ${avg}  │ ${p90}  │ ${rps}`);
    }
    
    // Empfehlungen generieren
    const recommendations = generateRecommendations(allStats);
    
    // JSON-Report speichern
    const reportPath = `load_test_report_${Date.now()}.json`;
    const report = {
        timestamp: new Date().toISOString(),
        serverUrl: url,
        testLevels: levels,
        results: allStats,
        recommendations,
    };
    
    fs.writeFileSync(
        path.join(__dirname, "..", "logs", reportPath),
        JSON.stringify(report, null, 2)
    );
    
    console.log(`\n📄 Report gespeichert: logs/${reportPath}`);
    console.log(`\n${"═".repeat(60)}\n`);
}

// ── Start ──────────────────────────────────────────────────────────────────────
main().catch(err => {
    console.error(`\n❌ Fehler: ${err.message}`);
    process.exit(1);
});
