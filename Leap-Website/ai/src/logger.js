// =======================================================================
// 📝 LOGGER.JS — Winston Logging mit Daily Rotation
// =======================================================================
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { AI_DIR } from "./config.js";

// Log-Verzeichnis
const LOG_DIR = path.join(AI_DIR, "logs");

// Custom Format: Timestamp + Level + Message
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
        if (stack) log += `\n${stack}`;
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        return log;
    })
);

// Console Format (mit Farben)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} ${level}: ${message}`;
    })
);

// =======================================================================
// 📁 TRANSPORT: Combined Log (alles)
// =======================================================================
const combinedTransport = new DailyRotateFile({
    filename: path.join(LOG_DIR, "combined-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxFiles: "14d",           // 14 Tage aufbewahren
    maxSize: "20m",            // Max 20MB pro Datei
    level: "info",
    format: logFormat
});

// =======================================================================
// 📁 TRANSPORT: Error Log (nur Fehler)
// =======================================================================
const errorTransport = new DailyRotateFile({
    filename: path.join(LOG_DIR, "error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxFiles: "14d",           // 14 Tage aufbewahren
    maxSize: "20m",            // Max 20MB pro Datei
    level: "error",
    format: logFormat
});

// =======================================================================
// 🖥️ TRANSPORT: Console (Development)
// =======================================================================
const consoleTransport = new winston.transports.Console({
    format: consoleFormat,
    level: "debug"
});

// =======================================================================
// 🏭 LOGGER INSTANZ
// =======================================================================
const logger = winston.createLogger({
    level: "info",
    exitOnError: false, // Nicht bei Fehlern beenden
    transports: [
        combinedTransport,
        errorTransport,
        consoleTransport
    ],
    // Uncaught Exceptions auch loggen
    exceptionHandlers: [
        new DailyRotateFile({
            filename: path.join(LOG_DIR, "exceptions-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxFiles: "14d"
        }),
        consoleTransport
    ],
    // Unhandled Promise Rejections auch loggen
    rejectionHandlers: [
        new DailyRotateFile({
            filename: path.join(LOG_DIR, "rejections-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxFiles: "14d"
        }),
        consoleTransport
    ]
});

// =======================================================================
// 📊 EVENT HANDLERS für Rotation
// =======================================================================
combinedTransport.on("rotate", (oldFilename, newFilename) => {
    logger.info(`Log rotated: ${path.basename(oldFilename)} → ${path.basename(newFilename)}`);
});

errorTransport.on("rotate", (oldFilename, newFilename) => {
    logger.info(`Error log rotated: ${path.basename(oldFilename)} → ${path.basename(newFilename)}`);
});

// =======================================================================
// 🔧 HELPER FUNKTIONEN
// =======================================================================

/**
 * Loggt einen HTTP Request
 */
export function logRequest(req, duration, status) {
    const msg = `${req.method} ${req.path} - ${status} (${duration}ms)`;
    if (status >= 500) {
        logger.error(msg);
    } else if (status >= 400) {
        logger.warn(msg);
    } else {
        logger.info(msg);
    }
}

/**
 * Loggt einen Chat-Request
 */
export function logChat(userMessage, hasImage, duration) {
    logger.info(`CHAT: "${userMessage.substring(0, 50)}..." | Image: ${hasImage} | ${duration}ms`);
}

/**
 * Loggt LEAP Code Execution
 */
export function logLeapExecution(success, duration) {
    if (success) {
        logger.info(`LEAP: Code executed successfully (${duration}ms)`);
    } else {
        logger.error(`LEAP: Code execution failed (${duration}ms)`);
    }
}

/**
 * Loggt Ollama Health Status
 */
export function logHealth(healthy, error = null) {
    if (healthy) {
        logger.info("HEALTH: Ollama is healthy");
    } else {
        logger.error(`HEALTH: Ollama is DOWN - ${error}`);
    }
}

// Standard Logger exportieren
export default logger;
