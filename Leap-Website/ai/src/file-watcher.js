// =======================================================================
// 👁️ FILE-WATCHER.JS — Live RAG Index Aktualisierung
// =======================================================================
// Überwacht .java und .lp/.leap Dateien und triggert automatischen
// Index-Rebuild bei Änderungen (Hot-Reload ohne Server-Restart)
// =======================================================================

import chokidar from "chokidar";
import { spawn } from "child_process";
import path from "path";
import { AI_DIR, ROOT_DIR } from "./config.js";
import logger from "./logger.js";

// =======================================================================
// 📊 STATE
// =======================================================================
let isRebuilding = false;
let pendingRebuild = false;
let lastRebuildTime = 0;
const DEBOUNCE_MS = 2000; // 2 Sekunden Debounce

// Callback für Hot-Reload
let onIndexRebuilt = null;

// =======================================================================
// 🔨 INDEX REBUILD
// =======================================================================

/**
 * Führt build_leap_index.js aus und triggert Hot-Reload
 */
async function rebuildIndex() {
    // Debounce: Nicht zu oft rebuilden
    const now = Date.now();
    if (now - lastRebuildTime < DEBOUNCE_MS) {
        pendingRebuild = true;
        return;
    }
    
    // Bereits am Rebuilden?
    if (isRebuilding) {
        pendingRebuild = true;
        return;
    }
    
    isRebuilding = true;
    lastRebuildTime = now;
    
    logger.info("🔄 FILE-WATCHER: Starte Index-Rebuild...");
    
    return new Promise((resolve) => {
        const scriptPath = path.join(AI_DIR, "scripts", "build_leap_index.js");
        
        const child = spawn("node", [scriptPath], {
            cwd: AI_DIR,
            stdio: ["ignore", "pipe", "pipe"]
        });
        
        let stdout = "";
        let stderr = "";
        
        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });
        
        child.on("close", (code) => {
            isRebuilding = false;
            
            if (code === 0) {
                logger.info("✅ FILE-WATCHER: Index erfolgreich neu gebaut");
                
                // Hot-Reload Callback triggern
                if (onIndexRebuilt) {
                    onIndexRebuilt();
                }
            } else {
                logger.error(`❌ FILE-WATCHER: Index-Rebuild fehlgeschlagen (Exit ${code})`);
                if (stderr) logger.error(stderr);
            }
            
            // Pending Rebuild ausführen falls vorhanden
            if (pendingRebuild) {
                pendingRebuild = false;
                setTimeout(rebuildIndex, 500);
            }
            
            resolve(code === 0);
        });
        
        child.on("error", (err) => {
            isRebuilding = false;
            logger.error(`❌ FILE-WATCHER: Konnte Script nicht starten: ${err.message}`);
            resolve(false);
        });
    });
}

// =======================================================================
// 👁️ FILE WATCHER
// =======================================================================

/**
 * Startet den File-Watcher für .java und .lp/.leap Dateien
 * @param {Function} reloadCallback - Wird nach Index-Rebuild aufgerufen
 */
export function startFileWatcher(reloadCallback) {
    onIndexRebuilt = reloadCallback;
    
    // Pfade zum Überwachen - absolute Pfade ohne Glob
    const leapCodeDir = path.join(AI_DIR, "leap-code");
    
    // Ignore Patterns
    const ignored = [
        "**/node_modules/**",
        "**/.git/**",
        "**/test-results/**",
        "**/logs/**",
        "**/data/**",
    ];
    
    logger.info("👁️ FILE-WATCHER: Starte Überwachung...");
    logger.debug(`   Pfad: ${leapCodeDir}`);
    
    const watcher = chokidar.watch(leapCodeDir, {
        ignored,
        persistent: true,
        ignoreInitial: true,     // Keine Events beim Start
        awaitWriteFinish: {      // Warte bis Datei fertig geschrieben
            stabilityThreshold: 500,
            pollInterval: 100
        },
        usePolling: false,       // Native Events verwenden (performanter)
        depth: 5,                // Bis 5 Ebenen tief suchen
    });
    
    // Event Handler - nur für .java, .lp, .leap
    const isRelevantFile = (fp) => /\.(java|lp|leap)$/.test(fp);
    
    watcher.on("change", (filePath) => {
        if (!isRelevantFile(filePath)) return;
        const relativePath = path.relative(ROOT_DIR, filePath);
        logger.info(`📝 FILE-WATCHER: Änderung erkannt: ${relativePath}`);
        rebuildIndex();
    });
    
    watcher.on("add", (filePath) => {
        if (!isRelevantFile(filePath)) return;
        const relativePath = path.relative(ROOT_DIR, filePath);
        logger.info(`➕ FILE-WATCHER: Neue Datei: ${relativePath}`);
        rebuildIndex();
    });
    
    watcher.on("unlink", (filePath) => {
        if (!isRelevantFile(filePath)) return;
        const relativePath = path.relative(ROOT_DIR, filePath);
        logger.info(`➖ FILE-WATCHER: Datei gelöscht: ${relativePath}`);
        rebuildIndex();
    });
    
    watcher.on("error", (error) => {
        logger.error(`❌ FILE-WATCHER: Fehler: ${error.message}`);
    });
    
    watcher.on("ready", () => {
        const watchedPaths = Object.keys(watcher.getWatched()).length;
        logger.info(`👁️ FILE-WATCHER: Bereit (überwacht ${watchedPaths} Verzeichnisse)`);
    });
    
    return watcher;
}

/**
 * Stoppt den File-Watcher
 */
export function stopFileWatcher(watcher) {
    if (watcher) {
        watcher.close();
        logger.info("👁️ FILE-WATCHER: Gestoppt");
    }
}

export { rebuildIndex };
