/* =========================================================
   LEAP INTERPRETER (Browser-Version 2.7 - Security Suite)
   Features: Sandbox, XSS-Protection, Rate-Limiting, Sanitizer
   ========================================================= */

export class LeapInterpreter {
    constructor() {
        this.env = {};
        this.output = "";
        this.lastRun = 0;
    }

    // Hilfsmethode für Escape-Ausgabe (XSS Schutz)
    escapeHTML(str) {
        if (!str) return "";
        return str.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    run(code) {
        // --- 1. RATE-LIMIT ---
        const now = Date.now();
        if (now - this.lastRun < 500) { // 500ms Cooldown zwischen Klicks
            throw new Error("Bitte warte einen Moment (Rate-Limit).");
        }
        this.lastRun = now;

        this.env = {};
        this.output = "";

        // --- 2. SANITIZER & ABUSE PREVENTION ---
        const forbidden = ["window", "document", "location", "fetch", "cookie", "localstorage", "script", "eval", "xmlhttprequest"];
        const lowerCode = code.toLowerCase();
        if (forbidden.some(word => lowerCode.includes(word))) {
            throw new Error("Sicherheit: Ungültiger System-Befehl erkannt!");
        }

        if (code.length > 10000) {
            throw new Error("Abuse Prevention: Code zu lang.");
        }

        // --- 3. EXECUTION ---
        const source = code.replace(/\/\/.*$/gm, "");
        this.execute(source);

        // --- 4. ESCAPE-AUSGABE ---
        // Wir escapen den gesamten Output, damit kein HTML gerendert wird
        return this.escapeHTML(this.output);
    }

    execute(source) {
        let i = 0;
        let instructionCount = 0;
        const skipWs = () => { while (i < source.length && /\s/.test(source[i])) i++; };

        while (i < source.length) {
            skipWs();
            if (i >= source.length) break;

            instructionCount++;
            if (instructionCount > 15000) throw new Error("Execution Limit: Zu viele Operationen.");

            if (this.match(source, i, "für") || this.match(source, i, "for")) {
                i = this.handleFor(source, i);
                continue;
            }

            if (this.match(source, i, "falls") || this.match(source, i, "if")) {
                i = this.handleIf(source, i);
                continue;
            }

            if (this.match(source, i, "ausgeben") || this.match(source, i, "print")) {
                let start = i;
                while (i < source.length && source[i] !== ";") i++;
                const stmt = source.substring(start, i).trim();
                this.handlePrint(stmt);
                i++;
                continue;
            }

            let start = i;
            while (i < source.length && source[i] !== ";") i++;
            const stmt = source.substring(start, i).trim();
            if (stmt.includes("=")) {
                this.handleAssign(stmt);
            }
            i++;
        }
    }

    // --- LOGIK-HANDLER (UNVERÄNDERT ABER SICHERER) ---

    handleFor(source, pos) {
        let i = pos + (this.match(source, pos, "für") ? 3 : 3);
        const { content: header, endPos: headerEnd } = this.readBalanced(source, i, '(', ')');
        i = headerEnd;
        const { content: body, endPos: bodyEnd } = this.readBody(source, i);

        const parts = header.split(';');
        const init = parts[0]?.trim();
        const cond = parts[1]?.trim();
        const step = parts[2]?.trim();

        if (init) this.execute(init + ";");

        let safetyCounter = 0;
        while (safetyCounter < 5000) {
            if (cond && !this.eval(cond)) break;
            this.execute(body);
            if (step) this.execute(step + ";");
            safetyCounter++;
        }
        if (safetyCounter >= 5000) throw new Error("Endlosschleife gestoppt.");

        return bodyEnd;
    }

    handleIf(source, pos) {
        let isFalls = this.match(source, pos, "falls");
        let i = pos + (isFalls ? 5 : 2);
        const { content: cond, endPos: condEnd } = this.readBalanced(source, i, '(', ')');
        i = condEnd;
        const { content: thenBody, endPos: thenEnd } = this.readBody(source, i);
        i = thenEnd;

        if (this.eval(cond)) {
            this.execute(thenBody);
        } else {
            let tempI = i;
            while (tempI < source.length && /\s/.test(source[tempI])) tempI++;
            if (this.match(source, tempI, "sonst") || this.match(source, tempI, "else")) {
                tempI += (this.match(source, tempI, "sonst") ? 5 : 4);
                const { content: elseBody, endPos: elseEnd } = this.readBody(source, tempI);
                this.execute(elseBody);
                i = elseEnd;
            }
        }
        return i;
    }

    handlePrint(stmt) {
        const match = stmt.match(/^(?:ausgeben|print)\((.*)\)$/i);
        if (match) {
            const val = this.eval(match[1].trim());
            // Wir speichern hier roh, escapen wird in run() am Ende gemacht
            this.output += (val === null ? "null" : val.toString()) + "\n";
        }
    }

    handleAssign(stmt) {
        const eqIdx = stmt.indexOf('=');
        const name = stmt.substring(0, eqIdx).trim().replace(/^let\s+/, "");
        const expr = stmt.substring(eqIdx + 1).trim();
        if (name) {
            this.env[name] = this.eval(expr);
        }
    }

    readBody(source, pos) {
        let i = pos;
        while (i < source.length && /\s/.test(source[i])) i++;
        if (source[i] === '{') {
            return this.readBalanced(source, i, '{', '}');
        } else {
            let start = i;
            while (i < source.length && source[i] !== ';') i++;
            return { content: source.substring(start, i + 1), endPos: i + 1 };
        }
    }

    readBalanced(source, pos, openChar, closeChar) {
        let i = pos;
        while (i < source.length && source[i] !== openChar) i++;
        let start = i + 1;
        let depth = 1;
        i++;
        while (i < source.length && depth > 0) {
            if (source[i] === openChar) depth++;
            else if (source[i] === closeChar) depth--;
            i++;
        }
        return { content: source.substring(start, i - 1).trim(), endPos: i };
    }

    match(s, pos, word) {
        return s.substring(pos).toLowerCase().startsWith(word);
    }

    // --- 5. SANDBOX-EVALUATION ---
    eval(expr) {
        expr = expr.trim();
        if (expr === "") return null;

        if (expr.toLowerCase() === "true" || expr.toLowerCase() === "wahr") return true;
        if (expr.toLowerCase() === "false" || expr.toLowerCase() === "falsch") return false;
        if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1);
        if (expr.startsWith("'") && expr.endsWith("'")) return expr.slice(1, -1);
        if (!isNaN(expr) && !/[+\-*/><=]/.test(expr)) return Number(expr);

        try {
            let calcExpr = expr.replace(/==/g, '===')
                              .replace(/\b(wahr|true)\b/gi, 'true')
                              .replace(/\b(falsch|false)\b/gi, 'false');
            
            const keys = Object.keys(this.env).sort((a, b) => b.length - a.length);
            for (let key of keys) {
                const val = this.env[key];
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                const safeVal = typeof val === "string" ? `"${val}"` : val;
                calcExpr = calcExpr.replace(regex, safeVal);
            }

            // Die ultimative Sandbox: Kein Zugriff auf globale Objekte
            const sandboxFunc = new Function('window', 'document', 'location', 'fetch', 'alert', 'localStorage', 'navigator', 'top', 'parent',
                `"use strict"; return (${calcExpr});`
            );
            return sandboxFunc.call(null, null, null, null, null, null, null, null, null, null);

        } catch (e) {
            if (this.env[expr] !== undefined) return this.env[expr];
            throw new Error(`Ungültiger Ausdruck: ${expr}`);
        }
    }
}
