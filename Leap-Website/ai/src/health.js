// =======================================================================
// 🏥 HEALTH.JS — Ollama Health-Check & Auto-Recovery
// =======================================================================
import { spawn } from "child_process";
import fetch from "node-fetch";
import logger, { logHealth } from "./logger.js";

// Ollama Status
let ollamaStatus = {
    healthy: true,
    lastCheck: null,
    lastError: null,
    consecutiveFailures: 0,
    restartAttempts: 0
};

// Konstanten
const OLLAMA_API_URL = "http://127.0.0.1:11434/api/tags";
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 Minuten
const HEALTH_CHECK_TIMEOUT = 10000; // 10 Sekunden Timeout
const MAX_RESTART_ATTEMPTS = 3;

/**
 * Prüft ob Ollama erreichbar ist
 * @returns {Promise<boolean>}
 */
export async function checkOllamaHealth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch(OLLAMA_API_URL, {
            method: "GET",
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            // Ollama antwortet!
            ollamaStatus.healthy = true;
            ollamaStatus.lastCheck = new Date().toISOString();
            ollamaStatus.lastError = null;
            ollamaStatus.consecutiveFailures = 0;
            return true;
        } else {
            throw new Error(`Ollama returned status ${response.status}`);
        }
    } catch (error) {
        ollamaStatus.healthy = false;
        ollamaStatus.lastCheck = new Date().toISOString();
        ollamaStatus.lastError = error.message;
        ollamaStatus.consecutiveFailures++;
        return false;
    }
}

/**
 * Versucht Ollama neu zu starten (macOS/Linux)
 * @returns {Promise<boolean>}
 */
async function restartOllama() {
    if (ollamaStatus.restartAttempts >= MAX_RESTART_ATTEMPTS) {
        logger.error("OLLAMA: Max restart attempts reached. Manual intervention required.");
        return false;
    }

    ollamaStatus.restartAttempts++;
    logger.warn(`OLLAMA: Attempting restart (attempt ${ollamaStatus.restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);

    return new Promise((resolve) => {
        // Zuerst Ollama stoppen (falls hängt)
        const killProcess = spawn("pkill", ["-f", "ollama"], { stdio: "ignore" });

        killProcess.on("close", () => {
            // Kurz warten, dann Ollama starten
            setTimeout(() => {
                const startProcess = spawn("ollama", ["serve"], {
                    detached: true,
                    stdio: "ignore"
                });

                startProcess.unref();

                // Warten und prüfen ob es funktioniert hat
                setTimeout(async () => {
                    const success = await checkOllamaHealth();
                    if (success) {
                        logger.info("OLLAMA: Successfully restarted!");
                        ollamaStatus.restartAttempts = 0; // Reset bei Erfolg
                        resolve(true);
                    } else {
                        logger.error("OLLAMA: Restart failed.");
                        resolve(false);
                    }
                }, 5000); // 5 Sekunden warten bis Ollama hochgefahren ist
            }, 2000);
        });
    });
}

/**
 * Führt den Health-Check aus und versucht bei Bedarf Neustart
 */
async function performHealthCheck() {
    logger.debug("HEALTH CHECK: Checking Ollama status...");

    const isHealthy = await checkOllamaHealth();

    if (isHealthy) {
        logHealth(true);
    } else {
        logHealth(false, ollamaStatus.lastError);
        logger.warn(`HEALTH CHECK: Ollama is DOWN! (Failures: ${ollamaStatus.consecutiveFailures})`);

        // Bei 2+ aufeinanderfolgenden Fehlern → Neustart versuchen
        if (ollamaStatus.consecutiveFailures >= 2) {
            await restartOllama();
        }
    }
}

/**
 * Startet den periodischen Health-Check
 */
export function startHealthMonitor() {
    logger.info("🏥 Starting Ollama Health Monitor (interval: 5 min)");

    // Initialer Check nach 30 Sekunden (Server-Start abwarten)
    setTimeout(async () => {
        await performHealthCheck();

        // Dann alle 5 Minuten
        setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);
    }, 30000);
}

/**
 * Gibt den aktuellen Ollama-Status zurück
 * @returns {Object}
 */
export function getOllamaStatus() {
    return { ...ollamaStatus };
}

/**
 * Middleware: Prüft ob Ollama verfügbar ist
 */
export function ollamaGuard(req, res, next) {
    if (!ollamaStatus.healthy) {
        return res.status(503).json({
            error: "AI-Service vorübergehend nicht verfügbar",
            message: "Ollama antwortet nicht. Bitte versuche es in ein paar Minuten erneut.",
            maintenance: true,
            lastError: ollamaStatus.lastError,
            lastCheck: ollamaStatus.lastCheck
        });
    }
    next();
}

/**
 * Manueller Health-Check auslösen
 * @returns {Promise<Object>}
 */
export async function manualHealthCheck() {
    await performHealthCheck();
    return getOllamaStatus();
}
