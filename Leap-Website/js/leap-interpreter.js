// Simple Leap Interpreter (Browser Version)
export class LeapInterpreter {
    constructor() {
        this.env = {};
    }

    run(code) {
        this.env = {};
        const lines = code.split(";");

        let output = "";

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // print()
            if (/^(print|ausgeben)\s*\(.*\)$/i.test(line)) {
                const expr = line.replace(/^(print|ausgeben)\s*\(/i, "").replace(/\)$/, "");
                const val = this.eval(expr);
                output += val + "\n";
                continue;
            }

            // assignment
            if (line.includes("=")) {
                const [name, expr] = line.split("=");
                const varName = name.trim();
                const value = this.eval(expr.trim());
                this.env[varName] = value;
                continue;
            }

            throw new Error("Ungültige Anweisung: " + line);
        }

        return output;
    }

    eval(expr) {
        // Strings
        if (/^".*"$/.test(expr) || /^'.*'$/.test(expr)) {
            return expr.slice(1, -1);
        }

        // Numbers
        if (!isNaN(expr)) {
            return Number(expr);
        }

        // Addition
        if (expr.includes("+")) {
            const parts = expr.split("+").map(x => this.eval(x.trim()));
            return parts.reduce((a, b) => a + b);
        }

        // Subtraktion
        if (expr.includes("-")) {
            const parts = expr.split("-").map(x => this.eval(x.trim()));
            return parts.slice(1).reduce((a, b) => a - b, parts[0]);
        }

        // Multiplikation
        if (expr.includes("*")) {
            const parts = expr.split("*").map(x => this.eval(x.trim()));
            return parts.reduce((a, b) => a * b);
        }

        // Division
        if (expr.includes("/")) {
            const parts = expr.split("/").map(x => this.eval(x.trim()));
            return parts.slice(1).reduce((a, b) => a / b, parts[0]);
        }

        // Variable
        if (this.env[expr] !== undefined) {
            return this.env[expr];
        }

        throw new Error("Unbekannter Ausdruck: " + expr);
    }
}