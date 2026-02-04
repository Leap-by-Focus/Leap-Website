#!/usr/bin/env node
// =======================================================================
// 🚀 LOAD_TEST_PRO.JS — Enterprise-Grade Stress-Test für Leap AI
// =======================================================================
// Features:
// - Ramping Load (langsam hochfahren)
// - Sustained Load (Dauerlast)
// - Spike Test (plötzliche Last)
// - Soak Test (Langzeit)
// - Detaillierte Metriken (Histogramm, Perzentile)
// - Live-Dashboard
// - HTML Report
// =======================================================================

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ══════════════════════════════════════════════════════════════════════════════
// 🎨 TERMINAL FARBEN & STYLING
// ══════════════════════════════════════════════════════════════════════════════

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;
const bold = (text) => `${colors.bright}${text}${colors.reset}`;

// ══════════════════════════════════════════════════════════════════════════════
// ⚙️ KONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
    url: "http://localhost:8081",
    endpoint: "/api/chat",
    echoMode: false,     // true = /api/echo (ohne Ollama), false = /api/chat
    timeout: 60000,
    testType: "ramp",  // ramp, spike, soak, stress
    
    // Ramp-Up Settings
    rampStartUsers: 1,
    rampEndUsers: 50,
    rampSteps: 10,
    rampStepDuration: 5000, // ms pro Step
    
    // Spike Settings
    spikeBaseUsers: 5,
    spikePeakUsers: 100,
    spikeDuration: 3000,
    
    // Soak Settings
    soakUsers: 20,
    soakDuration: 60000, // 1 Minute
    
    // Stress Settings
    stressStartUsers: 10,
    stressIncrement: 10,
    stressMaxUsers: 200,
    stressThreshold: 0.1, // 10% Fehlerrate = Stop
};

const TEST_PAYLOADS = [
    { message: "Was ist LEAP?" },
    { message: "Erkläre mir for-Schleifen in LEAP" },
    { message: "Wie deklariere ich Arrays?" },
    { message: "Was bedeutet ausgabe()?" },
    { message: "Schreibe ein Hello World Programm" },
    { message: "Wie funktioniert wiederhole?" },
    { message: "Was sind Bedingungen in LEAP?" },
    { message: "Erkläre falls und sonst" },
    { message: "Wie lese ich Benutzereingaben?" },
    { message: "Was ist der Unterschied zwischen zahl und text?" },
];

// ══════════════════════════════════════════════════════════════════════════════
// 📊 METRICS COLLECTOR
// ══════════════════════════════════════════════════════════════════════════════

class MetricsCollector {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.requests = [];
        this.startTime = Date.now();
        this.errors = new Map();
        this.statusCodes = new Map();
        this.activeRequests = 0;
        this.peakActiveRequests = 0;
        this.bytesReceived = 0;
        this.timeline = []; // Für Graphen
    }
    
    recordRequest(result) {
        this.requests.push(result);
        
        // Status Codes zählen
        const code = result.statusCode || "ERROR";
        this.statusCodes.set(code, (this.statusCodes.get(code) || 0) + 1);
        
        // Fehler zählen
        if (!result.success && result.error) {
            this.errors.set(result.error, (this.errors.get(result.error) || 0) + 1);
        }
        
        // Bytes
        this.bytesReceived += result.responseSize || 0;
        
        // Timeline (pro Sekunde aggregiert)
        const second = Math.floor((Date.now() - this.startTime) / 1000);
        if (!this.timeline[second]) {
            this.timeline[second] = { requests: 0, errors: 0, totalLatency: 0 };
        }
        this.timeline[second].requests++;
        if (!result.success) this.timeline[second].errors++;
        this.timeline[second].totalLatency += result.duration;
    }
    
    startRequest() {
        this.activeRequests++;
        this.peakActiveRequests = Math.max(this.peakActiveRequests, this.activeRequests);
    }
    
    endRequest() {
        this.activeRequests--;
    }
    
    getStats() {
        const durations = this.requests.map(r => r.duration).sort((a, b) => a - b);
        const successful = this.requests.filter(r => r.success);
        const failed = this.requests.filter(r => !r.success);
        const totalDuration = Date.now() - this.startTime;
        
        const percentile = (arr, p) => {
            if (arr.length === 0) return 0;
            const idx = Math.ceil(arr.length * p) - 1;
            return arr[Math.max(0, idx)];
        };
        
        return {
            totalRequests: this.requests.length,
            successful: successful.length,
            failed: failed.length,
            successRate: this.requests.length > 0 
                ? ((successful.length / this.requests.length) * 100).toFixed(2)
                : "0.00",
            errorRate: this.requests.length > 0
                ? ((failed.length / this.requests.length) * 100).toFixed(2)
                : "0.00",
            
            // Latenz-Statistiken
            latency: {
                min: durations[0] || 0,
                max: durations[durations.length - 1] || 0,
                avg: durations.length > 0 
                    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
                    : 0,
                median: percentile(durations, 0.5),
                p90: percentile(durations, 0.90),
                p95: percentile(durations, 0.95),
                p99: percentile(durations, 0.99),
            },
            
            // Throughput
            throughput: {
                requestsPerSecond: totalDuration > 0 
                    ? ((this.requests.length / totalDuration) * 1000).toFixed(2)
                    : "0.00",
                bytesPerSecond: totalDuration > 0
                    ? Math.round((this.bytesReceived / totalDuration) * 1000)
                    : 0,
                totalBytes: this.bytesReceived,
            },
            
            // Concurrency
            concurrency: {
                peak: this.peakActiveRequests,
                current: this.activeRequests,
            },
            
            // Errors
            errors: Object.fromEntries(this.errors),
            statusCodes: Object.fromEntries(this.statusCodes),
            
            // Duration
            testDuration: totalDuration,
            timeline: this.timeline,
        };
    }
    
    getHistogram(buckets = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000]) {
        const histogram = {};
        buckets.forEach(b => histogram[`<${b}ms`] = 0);
        histogram[`>${buckets[buckets.length-1]}ms`] = 0;
        
        for (const r of this.requests) {
            let placed = false;
            for (const bucket of buckets) {
                if (r.duration < bucket) {
                    histogram[`<${bucket}ms`]++;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                histogram[`>${buckets[buckets.length-1]}ms`]++;
            }
        }
        
        return histogram;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 🌐 HTTP CLIENT
// ══════════════════════════════════════════════════════════════════════════════

class LoadTester {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // Echo-Mode: /api/echo statt /api/chat (ohne Ollama)
        if (this.config.echoMode) {
            this.config.endpoint = "/api/echo";
        }
        this.metrics = new MetricsCollector();
        this.isRunning = false;
        this.shouldStop = false;
    }
    
    async sendRequest(payload = null) {
        const startTime = Date.now();
        const url = new URL(this.config.endpoint, this.config.url);
        const isHttps = url.protocol === "https:";
        const client = isHttps ? https : http;
        
        const body = payload || TEST_PAYLOADS[Math.floor(Math.random() * TEST_PAYLOADS.length)];
        const postData = JSON.stringify(body);
        
        this.metrics.startRequest();
        
        return new Promise((resolve) => {
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(postData),
                },
                timeout: this.config.timeout,
            };
            
            const req = client.request(options, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    this.metrics.endRequest();
                    const result = {
                        success: res.statusCode >= 200 && res.statusCode < 400,
                        statusCode: res.statusCode,
                        duration: Date.now() - startTime,
                        responseSize: data.length,
                        error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
                    };
                    this.metrics.recordRequest(result);
                    resolve(result);
                });
            });
            
            req.on("error", (err) => {
                this.metrics.endRequest();
                const result = {
                    success: false,
                    statusCode: 0,
                    duration: Date.now() - startTime,
                    responseSize: 0,
                    error: err.code || err.message,
                };
                this.metrics.recordRequest(result);
                resolve(result);
            });
            
            req.on("timeout", () => {
                req.destroy();
                this.metrics.endRequest();
                const result = {
                    success: false,
                    statusCode: 0,
                    duration: Date.now() - startTime,
                    responseSize: 0,
                    error: "TIMEOUT",
                };
                this.metrics.recordRequest(result);
                resolve(result);
            });
            
            req.write(postData);
            req.end();
        });
    }
    
    async sendBatch(count) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(this.sendRequest());
        }
        return Promise.all(promises);
    }
    
    // ── Ramp-Up Test ───────────────────────────────────────────────────────────
    async runRampTest() {
        console.log(c("cyan", "\n🚀 RAMP-UP TEST"));
        console.log(c("dim", `   Von ${this.config.rampStartUsers} auf ${this.config.rampEndUsers} User in ${this.config.rampSteps} Schritten\n`));
        
        const step = (this.config.rampEndUsers - this.config.rampStartUsers) / (this.config.rampSteps - 1);
        const results = [];
        
        for (let i = 0; i < this.config.rampSteps && !this.shouldStop; i++) {
            const users = Math.round(this.config.rampStartUsers + (step * i));
            
            process.stdout.write(`   ${c("yellow", "▶")} Step ${i + 1}/${this.config.rampSteps}: ${bold(users)} concurrent users... `);
            
            const stepMetrics = new MetricsCollector();
            const stepStart = Date.now();
            
            // Für die Dauer des Steps kontinuierlich Anfragen senden
            while (Date.now() - stepStart < this.config.rampStepDuration && !this.shouldStop) {
                const batchStart = Date.now();
                const batch = await this.sendBatch(users);
                batch.forEach(r => stepMetrics.recordRequest(r));
                
                // Kleine Pause zwischen Batches
                const elapsed = Date.now() - batchStart;
                if (elapsed < 100) await this.sleep(100 - elapsed);
            }
            
            const stats = stepMetrics.getStats();
            results.push({ users, stats });
            
            // Ergebnis anzeigen
            const successColor = parseFloat(stats.successRate) >= 95 ? "green" : 
                                parseFloat(stats.successRate) >= 80 ? "yellow" : "red";
            console.log(
                `${c(successColor, stats.successRate + "%")} success, ` +
                `${c("cyan", stats.latency.avg + "ms")} avg, ` +
                `${c("magenta", stats.latency.p99 + "ms")} p99`
            );
        }
        
        return results;
    }
    
    // ── Spike Test ─────────────────────────────────────────────────────────────
    async runSpikeTest() {
        console.log(c("cyan", "\n⚡ SPIKE TEST"));
        console.log(c("dim", `   Base: ${this.config.spikeBaseUsers} → Peak: ${this.config.spikePeakUsers} → Base\n`));
        
        const phases = [
            { name: "Baseline", users: this.config.spikeBaseUsers, duration: 5000 },
            { name: "SPIKE!", users: this.config.spikePeakUsers, duration: this.config.spikeDuration },
            { name: "Recovery", users: this.config.spikeBaseUsers, duration: 5000 },
        ];
        
        const results = [];
        
        for (const phase of phases) {
            if (this.shouldStop) break;
            
            const icon = phase.name === "SPIKE!" ? c("red", "🔥") : c("blue", "📊");
            process.stdout.write(`   ${icon} ${phase.name.padEnd(10)} (${phase.users} users)... `);
            
            const phaseMetrics = new MetricsCollector();
            const phaseStart = Date.now();
            
            while (Date.now() - phaseStart < phase.duration && !this.shouldStop) {
                const batch = await this.sendBatch(phase.users);
                batch.forEach(r => phaseMetrics.recordRequest(r));
                await this.sleep(50);
            }
            
            const stats = phaseMetrics.getStats();
            results.push({ phase: phase.name, users: phase.users, stats });
            
            console.log(
                `${c("green", stats.totalRequests)} reqs, ` +
                `${c("yellow", stats.successRate + "%")} ok, ` +
                `${c("cyan", stats.latency.p99 + "ms")} p99`
            );
        }
        
        return results;
    }
    
    // ── Stress Test (find breaking point) ──────────────────────────────────────
    async runStressTest() {
        console.log(c("cyan", "\n💪 STRESS TEST"));
        console.log(c("dim", `   Finding breaking point (>${this.config.stressThreshold * 100}% errors)\n`));
        
        let users = this.config.stressStartUsers;
        let breakingPoint = null;
        const results = [];
        
        while (users <= this.config.stressMaxUsers && !this.shouldStop) {
            process.stdout.write(`   ${c("yellow", "▶")} Testing ${bold(users)} concurrent users... `);
            
            const testMetrics = new MetricsCollector();
            const testStart = Date.now();
            
            // 5 Sekunden pro Level
            while (Date.now() - testStart < 5000 && !this.shouldStop) {
                const batch = await this.sendBatch(users);
                batch.forEach(r => testMetrics.recordRequest(r));
                await this.sleep(50);
            }
            
            const stats = testMetrics.getStats();
            const errorRate = parseFloat(stats.errorRate) / 100;
            results.push({ users, stats, errorRate });
            
            const statusIcon = errorRate <= this.config.stressThreshold ? c("green", "✓") : c("red", "✗");
            console.log(
                `${statusIcon} ${c("yellow", stats.successRate + "%")} ok, ` +
                `${c("cyan", stats.latency.avg + "ms")} avg, ` +
                `${c("magenta", stats.throughput.requestsPerSecond)} req/s`
            );
            
            if (errorRate > this.config.stressThreshold && !breakingPoint) {
                breakingPoint = users;
                console.log(c("red", `\n   🔥 BREAKING POINT FOUND: ${users} concurrent users!\n`));
            }
            
            if (breakingPoint && users >= breakingPoint + this.config.stressIncrement * 2) {
                break; // Stoppe nach 2 weiteren Levels über dem Breaking Point
            }
            
            users += this.config.stressIncrement;
        }
        
        return { results, breakingPoint };
    }
    
    // ── Soak Test (Langzeit) ───────────────────────────────────────────────────
    async runSoakTest() {
        console.log(c("cyan", "\n🌊 SOAK TEST"));
        console.log(c("dim", `   ${this.config.soakUsers} users für ${this.config.soakDuration / 1000}s\n`));
        
        const startTime = Date.now();
        const intervalStats = [];
        let lastReport = startTime;
        const reportInterval = 10000; // Alle 10 Sekunden
        
        let intervalMetrics = new MetricsCollector();
        
        console.log(`   ${c("dim", "Zeit".padEnd(8))} │ Reqs  │ Success │ Avg    │ P99    │ Errors`);
        console.log(`   ${c("dim", "─".repeat(60))}`);
        
        while (Date.now() - startTime < this.config.soakDuration && !this.shouldStop) {
            const batch = await this.sendBatch(this.config.soakUsers);
            batch.forEach(r => {
                this.metrics.recordRequest(r);
                intervalMetrics.recordRequest(r);
            });
            
            // Interval Report
            if (Date.now() - lastReport >= reportInterval) {
                const stats = intervalMetrics.getStats();
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                
                intervalStats.push({ elapsed, stats });
                
                const successColor = parseFloat(stats.successRate) >= 95 ? "green" : 
                                    parseFloat(stats.successRate) >= 80 ? "yellow" : "red";
                
                console.log(
                    `   ${c("cyan", (elapsed + "s").padEnd(8))} │ ` +
                    `${String(stats.totalRequests).padStart(5)} │ ` +
                    `${c(successColor, (stats.successRate + "%").padStart(7))} │ ` +
                    `${String(stats.latency.avg + "ms").padStart(6)} │ ` +
                    `${String(stats.latency.p99 + "ms").padStart(6)} │ ` +
                    `${stats.failed > 0 ? c("red", stats.failed) : c("green", "0")}`
                );
                
                intervalMetrics = new MetricsCollector();
                lastReport = Date.now();
            }
            
            await this.sleep(50);
        }
        
        return intervalStats;
    }
    
    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
    
    stop() {
        this.shouldStop = true;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// 📋 REPORT GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

function generateReport(tester, testType, testResults) {
    const stats = tester.metrics.getStats();
    const histogram = tester.metrics.getHistogram();
    const sysInfo = {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + " GB",
        freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + " GB",
        nodeVersion: process.version,
    };
    
    return {
        timestamp: new Date().toISOString(),
        testType,
        config: tester.config,
        system: sysInfo,
        summary: stats,
        histogram,
        testResults,
        recommendations: generateRecommendations(stats, testResults, testType),
    };
}

function generateRecommendations(stats, testResults, testType) {
    const recommendations = [];
    
    // Basierend auf Fehlerrate
    const errorRate = parseFloat(stats.errorRate);
    if (errorRate > 20) {
        recommendations.push({
            severity: "critical",
            message: "Sehr hohe Fehlerrate (>20%). Server ist überlastet.",
            action: "MAX_QUEUE und NUM_THREADS reduzieren, Ollama-Ressourcen prüfen.",
        });
    } else if (errorRate > 5) {
        recommendations.push({
            severity: "warning",
            message: "Erhöhte Fehlerrate (>5%). System erreicht Kapazitätsgrenze.",
            action: "Monitoring aktivieren, Load-Balancing in Betracht ziehen.",
        });
    }
    
    // Basierend auf Latenz
    if (stats.latency.p99 > 30000) {
        recommendations.push({
            severity: "warning",
            message: "P99 Latenz über 30s. Timeouts wahrscheinlich.",
            action: "REQUEST_TIMEOUT erhöhen oder Anfrage-Komplexität reduzieren.",
        });
    }
    
    // Basierend auf Stress-Test Ergebnissen
    if (testType === "stress" && testResults.breakingPoint) {
        const safeLimit = Math.floor(testResults.breakingPoint * 0.7);
        recommendations.push({
            severity: "info",
            message: `Breaking Point bei ${testResults.breakingPoint} Usern gefunden.`,
            action: `MAX_QUEUE auf ${safeLimit} setzen (70% Safety Margin).`,
        });
    }
    
    // Konfigurationsempfehlung
    let maxQueue = 50;
    let numThreads = Math.min(os.cpus().length, 8);
    
    if (testType === "stress" && testResults.breakingPoint) {
        maxQueue = Math.floor(testResults.breakingPoint * 0.7);
    } else if (errorRate < 5 && stats.latency.p99 < 10000) {
        maxQueue = 100; // System performt gut
    } else if (errorRate > 10) {
        maxQueue = 20; // Konservativ
    }
    
    recommendations.push({
        severity: "config",
        message: "Empfohlene Konfiguration basierend auf Test-Ergebnissen:",
        config: {
            MAX_QUEUE: maxQueue,
            NUM_THREADS: numThreads,
            REQUEST_TIMEOUT: Math.max(30000, stats.latency.p99 * 2),
        },
    });
    
    return recommendations;
}

function generateHTMLReport(report) {
    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
    
    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Leap AI Load Test Report - ${report.timestamp}</title>
    <style>
        :root {
            --bg: #0d1117;
            --card-bg: #161b22;
            --border: #30363d;
            --text: #c9d1d9;
            --text-dim: #8b949e;
            --accent: #58a6ff;
            --success: #3fb950;
            --warning: #d29922;
            --error: #f85149;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 2rem;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: var(--accent); margin-bottom: 0.5rem; }
        h2 { color: var(--text); margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
        .timestamp { color: var(--text-dim); margin-bottom: 2rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1.5rem;
        }
        .card-title { color: var(--text-dim); font-size: 0.875rem; text-transform: uppercase; margin-bottom: 0.5rem; }
        .card-value { font-size: 2rem; font-weight: bold; }
        .card-value.success { color: var(--success); }
        .card-value.warning { color: var(--warning); }
        .card-value.error { color: var(--error); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
        th { color: var(--text-dim); font-weight: 500; }
        .histogram { display: flex; align-items: flex-end; gap: 4px; height: 150px; margin: 1rem 0; }
        .histogram-bar {
            flex: 1;
            background: var(--accent);
            min-width: 30px;
            border-radius: 4px 4px 0 0;
            position: relative;
        }
        .histogram-bar span {
            position: absolute;
            bottom: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.7rem;
            color: var(--text-dim);
            white-space: nowrap;
        }
        .recommendation {
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
        }
        .recommendation.critical { background: rgba(248, 81, 73, 0.2); border-left: 4px solid var(--error); }
        .recommendation.warning { background: rgba(210, 153, 34, 0.2); border-left: 4px solid var(--warning); }
        .recommendation.info { background: rgba(88, 166, 255, 0.2); border-left: 4px solid var(--accent); }
        .recommendation.config { background: rgba(63, 185, 80, 0.2); border-left: 4px solid var(--success); }
        code { background: var(--border); padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; }
        pre { background: var(--card-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Leap AI Load Test Report</h1>
        <p class="timestamp">Test: ${escapeHtml(report.testType.toUpperCase())} | ${report.timestamp}</p>
        
        <h2>📊 Zusammenfassung</h2>
        <div class="grid">
            <div class="card">
                <div class="card-title">Gesamt Requests</div>
                <div class="card-value">${report.summary.totalRequests.toLocaleString()}</div>
            </div>
            <div class="card">
                <div class="card-title">Erfolgsrate</div>
                <div class="card-value ${parseFloat(report.summary.successRate) >= 95 ? 'success' : parseFloat(report.summary.successRate) >= 80 ? 'warning' : 'error'}">${report.summary.successRate}%</div>
            </div>
            <div class="card">
                <div class="card-title">Durchschnittliche Latenz</div>
                <div class="card-value">${report.summary.latency.avg.toLocaleString()}ms</div>
            </div>
            <div class="card">
                <div class="card-title">P99 Latenz</div>
                <div class="card-value">${report.summary.latency.p99.toLocaleString()}ms</div>
            </div>
            <div class="card">
                <div class="card-title">Requests/Sekunde</div>
                <div class="card-value">${report.summary.throughput.requestsPerSecond}</div>
            </div>
            <div class="card">
                <div class="card-title">Peak Concurrency</div>
                <div class="card-value">${report.summary.concurrency.peak}</div>
            </div>
        </div>
        
        <h2>⏱️ Latenz-Verteilung</h2>
        <div class="card">
            <table>
                <tr><th>Metrik</th><th>Wert</th></tr>
                <tr><td>Minimum</td><td>${report.summary.latency.min}ms</td></tr>
                <tr><td>Durchschnitt</td><td>${report.summary.latency.avg}ms</td></tr>
                <tr><td>Median (P50)</td><td>${report.summary.latency.median}ms</td></tr>
                <tr><td>P90</td><td>${report.summary.latency.p90}ms</td></tr>
                <tr><td>P95</td><td>${report.summary.latency.p95}ms</td></tr>
                <tr><td>P99</td><td>${report.summary.latency.p99}ms</td></tr>
                <tr><td>Maximum</td><td>${report.summary.latency.max}ms</td></tr>
            </table>
        </div>
        
        <h2>📈 Histogramm</h2>
        <div class="card">
            <div class="histogram">
                ${Object.entries(report.histogram).map(([bucket, count]) => {
                    const maxCount = Math.max(...Object.values(report.histogram));
                    const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return `<div class="histogram-bar" style="height: ${height}%"><span>${bucket}</span></div>`;
                }).join('')}
            </div>
        </div>
        
        <h2>🎯 Empfehlungen</h2>
        ${report.recommendations.map(rec => `
            <div class="recommendation ${rec.severity}">
                <strong>${rec.message}</strong>
                ${rec.action ? `<p>${rec.action}</p>` : ''}
                ${rec.config ? `<pre><code>const MAX_QUEUE = ${rec.config.MAX_QUEUE};
const NUM_THREADS = ${rec.config.NUM_THREADS};
const REQUEST_TIMEOUT = ${rec.config.REQUEST_TIMEOUT};</code></pre>` : ''}
            </div>
        `).join('')}
        
        <h2>💻 System-Info</h2>
        <div class="card">
            <table>
                <tr><td>Platform</td><td>${report.system.platform} (${report.system.arch})</td></tr>
                <tr><td>CPUs</td><td>${report.system.cpus}</td></tr>
                <tr><td>Memory</td><td>${report.system.freeMemory} frei / ${report.system.totalMemory} gesamt</td></tr>
                <tr><td>Node.js</td><td>${report.system.nodeVersion}</td></tr>
            </table>
        </div>
        
        <h2>⚙️ Test-Konfiguration</h2>
        <div class="card">
            <pre><code>${JSON.stringify(report.config, null, 2)}</code></pre>
        </div>
    </div>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 🎮 CLI
// ══════════════════════════════════════════════════════════════════════════════

function parseArgs() {
    const args = process.argv.slice(2);
    const config = {};
    
    for (const arg of args) {
        if (arg === "--help" || arg === "-h") {
            showHelp();
            process.exit(0);
        }
        
        const [key, value] = arg.replace(/^--/, "").split("=");
        if (key && value) {
            // Numerische Werte konvertieren
            config[key] = /^\d+$/.test(value) ? parseInt(value) : value;
        }
    }
    
    return config;
}

function showHelp() {
    console.log(`
${bold("🚀 LEAP AI LOAD TESTER PRO")}

${c("cyan", "Usage:")} node scripts/load_test_pro.js [options]

${c("cyan", "Test Types:")}
  --testType=ramp     Langsam hochfahren (default)
  --testType=spike    Plötzliche Last-Spitze
  --testType=soak     Langzeit-Test
  --testType=stress   Breaking Point finden

${c("cyan", "General Options:")}
  --url=URL           Server URL (default: http://localhost:8081)
  --timeout=MS        Request Timeout in ms (default: 60000)

${c("cyan", "Ramp Test Options:")}
  --rampStartUsers=N  Start-User (default: 1)
  --rampEndUsers=N    End-User (default: 50)
  --rampSteps=N       Anzahl Schritte (default: 10)

${c("cyan", "Spike Test Options:")}
  --spikeBaseUsers=N  Basis-Last (default: 5)
  --spikePeakUsers=N  Spitzen-Last (default: 100)

${c("cyan", "Stress Test Options:")}
  --stressStartUsers=N   Start-User (default: 10)
  --stressIncrement=N    Schrittweite (default: 10)
  --stressMaxUsers=N     Maximum (default: 200)

${c("cyan", "Soak Test Options:")}
  --soakUsers=N       Konstante Last (default: 20)
  --soakDuration=MS   Dauer in ms (default: 60000)

${c("cyan", "Examples:")}
  node scripts/load_test_pro.js --testType=stress --stressMaxUsers=100
  node scripts/load_test_pro.js --testType=soak --soakDuration=300000
  node scripts/load_test_pro.js --testType=ramp --rampEndUsers=100 --rampSteps=20
`);
}

// ══════════════════════════════════════════════════════════════════════════════
// 🏁 MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    const config = parseArgs();
    const tester = new LoadTester(config);
    
    // Header
    console.log("\n" + "═".repeat(70));
    console.log(bold(c("cyan", "   🚀 LEAP AI LOAD TESTER PRO")));
    console.log("═".repeat(70));
    console.log(`   Server:    ${c("green", tester.config.url)}`);
    console.log(`   Test:      ${c("yellow", tester.config.testType.toUpperCase())}`);
    console.log(`   Timeout:   ${tester.config.timeout / 1000}s`);
    console.log("═".repeat(70));
    
    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log(c("yellow", "\n\n⚠️  Test abgebrochen durch Benutzer\n"));
        tester.stop();
    });
    
    // Health Check
    console.log(c("dim", "\n🏥 Prüfe Server..."));
    try {
        const healthResult = await tester.sendRequest({ message: "ping" });
        if (healthResult.statusCode === 0) {
            console.log(c("red", `   ❌ Server nicht erreichbar: ${healthResult.error}`));
            console.log(c("dim", "   Starte Server mit: cd ai && node server.js\n"));
            process.exit(1);
        }
        console.log(c("green", `   ✓ Server antwortet (${healthResult.duration}ms)`));
        tester.metrics.reset(); // Reset nach Health Check
    } catch (e) {
        console.log(c("red", `   ❌ Server-Fehler: ${e.message}`));
        process.exit(1);
    }
    
    // Test ausführen
    let testResults;
    const testStart = Date.now();
    
    switch (tester.config.testType) {
        case "ramp":
            testResults = await tester.runRampTest();
            break;
        case "spike":
            testResults = await tester.runSpikeTest();
            break;
        case "stress":
            testResults = await tester.runStressTest();
            break;
        case "soak":
            testResults = await tester.runSoakTest();
            break;
        default:
            console.log(c("red", `   Unbekannter Test-Typ: ${tester.config.testType}`));
            process.exit(1);
    }
    
    const testDuration = Date.now() - testStart;
    
    // Finale Stats
    const stats = tester.metrics.getStats();
    const histogram = tester.metrics.getHistogram();
    
    console.log("\n" + "═".repeat(70));
    console.log(bold("📊 FINALE ERGEBNISSE"));
    console.log("═".repeat(70));
    
    console.log(`
   ${c("cyan", "Requests:")}
   ├─ Gesamt:          ${bold(stats.totalRequests.toLocaleString())}
   ├─ Erfolgreich:     ${c("green", stats.successful.toLocaleString())} (${stats.successRate}%)
   └─ Fehlgeschlagen:  ${c("red", stats.failed.toLocaleString())} (${stats.errorRate}%)

   ${c("cyan", "Latenz (ms):")}
   ├─ Min:    ${stats.latency.min}
   ├─ Avg:    ${stats.latency.avg}
   ├─ P50:    ${stats.latency.median}
   ├─ P90:    ${stats.latency.p90}
   ├─ P95:    ${stats.latency.p95}
   ├─ P99:    ${stats.latency.p99}
   └─ Max:    ${stats.latency.max}

   ${c("cyan", "Durchsatz:")}
   ├─ Requests/s:      ${bold(stats.throughput.requestsPerSecond)}
   ├─ Bytes/s:         ${(stats.throughput.bytesPerSecond / 1024).toFixed(2)} KB/s
   └─ Peak Concurrent: ${stats.concurrency.peak}

   ${c("cyan", "Test-Dauer:")}     ${(testDuration / 1000).toFixed(2)}s
`);
    
    // Histogramm anzeigen
    console.log(`   ${c("cyan", "Latenz-Verteilung:")}`);
    const maxBucketCount = Math.max(...Object.values(histogram));
    for (const [bucket, count] of Object.entries(histogram)) {
        const barLength = maxBucketCount > 0 ? Math.round((count / maxBucketCount) * 30) : 0;
        const bar = "█".repeat(barLength) + "░".repeat(30 - barLength);
        const pct = stats.totalRequests > 0 ? ((count / stats.totalRequests) * 100).toFixed(1) : "0.0";
        console.log(`   │ ${bucket.padEnd(12)} ${bar} ${String(count).padStart(5)} (${pct}%)`);
    }
    
    // Report generieren
    const report = generateReport(tester, tester.config.testType, testResults);
    
    // JSON speichern
    const timestamp = Date.now();
    const jsonPath = path.join(__dirname, "..", "logs", `loadtest_${timestamp}.json`);
    const htmlPath = path.join(__dirname, "..", "logs", `loadtest_${timestamp}.html`);
    
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(htmlPath, generateHTMLReport(report));
    
    console.log(`\n   ${c("green", "📄 Reports gespeichert:")}`);
    console.log(`   ├─ JSON: logs/loadtest_${timestamp}.json`);
    console.log(`   └─ HTML: logs/loadtest_${timestamp}.html`);
    
    // Empfehlungen
    console.log("\n" + "═".repeat(70));
    console.log(bold("🎯 EMPFEHLUNGEN"));
    console.log("═".repeat(70) + "\n");
    
    for (const rec of report.recommendations) {
        const icon = rec.severity === "critical" ? "🔴" :
                    rec.severity === "warning" ? "🟡" :
                    rec.severity === "config" ? "🟢" : "🔵";
        console.log(`   ${icon} ${rec.message}`);
        if (rec.action) console.log(`      ${c("dim", rec.action)}`);
        if (rec.config) {
            console.log(`\n      ${c("green", "// Empfohlene Konfiguration:")}`);
            console.log(`      const MAX_QUEUE = ${rec.config.MAX_QUEUE};`);
            console.log(`      const NUM_THREADS = ${rec.config.NUM_THREADS};`);
            console.log(`      const REQUEST_TIMEOUT = ${rec.config.REQUEST_TIMEOUT};`);
        }
        console.log();
    }
    
    console.log("═".repeat(70) + "\n");
}

main().catch(err => {
    console.error(c("red", `\n❌ Fehler: ${err.message}`));
    console.error(err.stack);
    process.exit(1);
});
