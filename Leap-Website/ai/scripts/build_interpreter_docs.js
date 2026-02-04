/**
 * build_interpreter_docs.js
 * 
 * Dieses Skript analysiert die Main.java des LEAP-Interpreters
 * und generiert automatisch die Dokumentation für den RAG-Index.
 * 
 * Usage: node scripts/build_interpreter_docs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAIN_JAVA_PATH = path.join(__dirname, '../leap-code/java-src/leap/Main.java');
const OUTPUT_PATH = path.join(__dirname, '../interpreter_features.json');

// Analysiere Main.java und extrahiere Features
function analyzeInterpreter() {
    const source = fs.readFileSync(MAIN_JAVA_PATH, 'utf8');
    
    const features = {
        updated: new Date().toISOString(),
        interpreter: "leap-interpreter.jar",
        source: "Main.java",
        
        // Erkannte Features aus dem Code
        loops: [],
        conditionals: [],
        output: [],
        variables: [],
        operators: [],
        dataTypes: [],
        notSupported: []
    };

    // === SCHLEIFEN ===
    // Suche nach isForStart, isWhileStart, isRepeatStart
    if (source.includes('c.startsWith("for", true)')) {
        features.loops.push({
            keyword: "for",
            german: "für",
            syntax: "for (init; condition; increment) { ... }",
            example: "for (i = 0; i < 10; i = i + 1) { print(i); }"
        });
    }
    if (source.includes('c.startsWith("für", true)')) {
        features.loops.push({
            keyword: "für",
            german: true,
            syntax: "für (init; bedingung; inkrement) { ... }",
            example: "für (i = 0; i < 5; i = i + 1) { ausgeben(i); }"
        });
    }
    if (source.includes('c.startsWith("while", true)')) {
        features.loops.push({
            keyword: "while",
            german: "während",
            syntax: "while (condition) { ... }",
            example: "while (x < 10) { print(x); x = x + 1; }"
        });
    }
    if (source.includes('c.startsWith("während", true)')) {
        features.loops.push({
            keyword: "während",
            german: true,
            syntax: "während (bedingung) { ... }",
            example: "während (x < 10) { ausgeben(x); x = x + 1; }"
        });
    }
    if (source.includes('c.startsWith("repeat", true)')) {
        features.loops.push({
            keyword: "repeat",
            german: "wiederhole",
            syntax: "repeat (condition) { ... }",
            example: "repeat (x < 5) { print(x); x = x + 1; }"
        });
    }
    if (source.includes('c.startsWith("wiederhole", true)')) {
        features.loops.push({
            keyword: "wiederhole",
            german: true,
            syntax: "wiederhole (bedingung) { ... }",
            example: "wiederhole (x < 5) { ausgeben(x); x = x + 1; }"
        });
    }

    // === BEDINGUNGEN ===
    if (source.includes('c.startsWith("if", true)')) {
        features.conditionals.push({
            keyword: "if",
            german: "falls",
            syntax: "if (condition) { ... } else { ... }",
            example: "if (x > 5) { print(\"groß\"); } else { print(\"klein\"); }"
        });
    }
    if (source.includes('c.startsWith("falls", true)')) {
        features.conditionals.push({
            keyword: "falls",
            german: true,
            syntax: "falls (bedingung) { ... } sonst { ... }",
            example: "falls (x > 5) { ausgeben(\"groß\"); } sonst { ausgeben(\"klein\"); }"
        });
    }
    if (source.includes('"else"') || source.includes('c.startsWith("else"')) {
        features.conditionals.push({
            keyword: "else",
            german: "sonst",
            syntax: "... else { ... }",
            note: "Wird nach if/falls verwendet"
        });
    }
    if (source.includes('c.startsWith("sonst", true)')) {
        features.conditionals.push({
            keyword: "sonst",
            german: true,
            syntax: "... sonst { ... }",
            note: "Wird nach falls verwendet"
        });
    }

    // === AUSGABE ===
    if (source.includes('(?:print|ausgeben)')) {
        features.output.push({
            keyword: "print",
            german: "ausgeben",
            syntax: "print(expression);",
            example: "print(\"Hallo Welt\");"
        });
        features.output.push({
            keyword: "ausgeben",
            german: true,
            syntax: "ausgeben(ausdruck);",
            example: "ausgeben(\"Hallo Welt\");"
        });
    }

    // === RANDOM/ZUFALL ===
    if (source.includes('parseRandomCall') || source.includes('"random"') || source.includes('"zufall"')) {
        features.builtinFunctions = features.builtinFunctions || [];
        features.builtinFunctions.push({
            keyword: "random",
            german: "zufall",
            variants: [
                { syntax: "random()", desc: "Gibt 0 oder 1 zurück", example: "let x = random();" },
                { syntax: "random(max)", desc: "Gibt 0 bis max-1 zurück", example: "let x = random(10);  // 0-9" },
                { syntax: "random(min, max)", desc: "Gibt min bis max-1 zurück", example: "let x = random(5, 10);  // 5-9" }
            ]
        });
        features.builtinFunctions.push({
            keyword: "zufall",
            german: true,
            variants: [
                { syntax: "zufall()", desc: "Gibt 0 oder 1 zurück", example: "let x = zufall();" },
                { syntax: "zufall(max)", desc: "Gibt 0 bis max-1 zurück", example: "let x = zufall(100);  // 0-99" },
                { syntax: "zufall(min, max)", desc: "Gibt min bis max-1 zurück", example: "let x = zufall(1, 7);  // 1-6 (Würfel)" }
            ]
        });
    }

    // === VARIABLEN ===
    features.variables.push({
        syntax: "name = wert;",
        example: "x = 10;",
        note: "KEINE Typ-Keywords wie int, var, const!"
    });
    if (source.includes('t.startsWith("let ")')) {
        features.variables.push({
            syntax: "let name = wert;",
            example: "let x = 10;",
            note: "Optional mit 'let' Prefix"
        });
    }

    // === OPERATOREN ===
    if (source.includes('"=="')) features.operators.push({ op: "==", desc: "Gleich" });
    if (source.includes('"!="')) features.operators.push({ op: "!=", desc: "Ungleich" });
    if (source.includes('"<"')) features.operators.push({ op: "<", desc: "Kleiner" });
    if (source.includes('"<="')) features.operators.push({ op: "<=", desc: "Kleiner oder gleich" });
    if (source.includes('">"')) features.operators.push({ op: ">", desc: "Größer" });
    if (source.includes('">="')) features.operators.push({ op: ">=", desc: "Größer oder gleich" });
    if (source.includes("case '+'")) features.operators.push({ op: "+", desc: "Addition / String-Verkettung" });
    if (source.includes("case '-'")) features.operators.push({ op: "-", desc: "Subtraktion" });
    if (source.includes("case '*'")) features.operators.push({ op: "*", desc: "Multiplikation" });
    if (source.includes("case '/'")) features.operators.push({ op: "/", desc: "Division" });
    
    // Logische Operatoren
    if (source.includes('splitLogicalOr') || source.includes('"||"')) {
        features.operators.push({ op: "||", desc: "Logisches ODER (in Bedingungen)", example: "if (x == 1 || x == 2)" });
    }
    if (source.includes('splitLogicalAnd') || source.includes('"&&"')) {
        features.operators.push({ op: "&&", desc: "Logisches UND (in Bedingungen)", example: "if (x > 0 && x < 10)" });
    }

    // === DATENTYPEN ===
    if (source.includes('Val.num')) features.dataTypes.push({ type: "Number", example: "42, 3.14" });
    if (source.includes('Val.str')) features.dataTypes.push({ type: "String", example: "\"Hallo\", 'Welt'" });
    if (source.includes('Val.bool')) features.dataTypes.push({ type: "Boolean", example: "true, false, wahr, falsch" });
    if (source.includes('Val.arr')) features.dataTypes.push({ type: "Array", example: "[1, 2, 3], [\"a\", \"b\"]" });

    // === NICHT UNTERSTÜTZT ===
    // Prüfe was NICHT im Code vorkommt
    if (!source.includes('Random') && !source.includes('random')) {
        features.notSupported.push({ feature: "Random()", reason: "Keine Zufallszahlen-Funktion implementiert" });
    }
    if (!source.includes('ToLower') && !source.includes('toLowerCase')) {
        features.notSupported.push({ feature: "String-Funktionen", reason: "ToLower, ToUpper, Trim etc. nicht implementiert" });
    }
    if (!source.includes('Math.abs') && !source.includes('Abs(')) {
        features.notSupported.push({ feature: "Math-Funktionen", reason: "Abs, Sqrt, Round etc. nicht implementiert" });
    }
    if (!source.includes('++') || !source.includes('handleIncrement')) {
        features.notSupported.push({ feature: "i++/i--", reason: "Nutze stattdessen: i = i + 1" });
    }
    if (!source.includes('+=')) {
        features.notSupported.push({ feature: "+=/-=", reason: "Nutze stattdessen: i = i + 1" });
    }
    
    // Schreibe Ergebnis
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(features, null, 2));
    console.log(`✅ Interpreter-Dokumentation generiert: ${OUTPUT_PATH}`);
    console.log(`   - ${features.loops.length} Schleifen-Typen`);
    console.log(`   - ${features.conditionals.length} Bedingungs-Typen`);
    console.log(`   - ${features.output.length} Ausgabe-Funktionen`);
    console.log(`   - ${(features.builtinFunctions || []).length} eingebaute Funktionen`);
    console.log(`   - ${features.operators.length} Operatoren`);
    console.log(`   - ${features.dataTypes.length} Datentypen`);
    console.log(`   - ${features.notSupported.length} nicht unterstützte Features`);
    
    return features;
}

// Generiere Text für RAG-Index
function generateRAGEntries(features) {
    const entries = [];
    
    // Übersicht
    const builtinFuncNames = (features.builtinFunctions || []).map(f => f.keyword).join(', ');
    entries.push({
        file: "INTERPRETER_OVERVIEW",
        text: `LEAP Interpreter Features (automatisch aus Main.java extrahiert):

SCHLEIFEN: ${features.loops.map(l => l.keyword).join(', ')}
BEDINGUNGEN: ${features.conditionals.map(c => c.keyword).join(', ')}
AUSGABE: ${features.output.map(o => o.keyword).join(', ')}
FUNKTIONEN: ${builtinFuncNames || 'keine'}
DATENTYPEN: ${features.dataTypes.map(d => d.type).join(', ')}

NICHT UNTERSTÜTZT: ${features.notSupported.map(n => n.feature).join(', ')}`
    });

    // Schleifen-Details
    features.loops.forEach(loop => {
        entries.push({
            file: `INTERPRETER_LOOP_${loop.keyword.toUpperCase()}`,
            text: `LEAP Schleife "${loop.keyword}":
Syntax: ${loop.syntax}
Beispiel: ${loop.example}
${loop.german === true ? '(Deutsche Version)' : `Deutsche Alternative: ${loop.german}`}`
        });
    });

    // Bedingungen
    features.conditionals.forEach(cond => {
        entries.push({
            file: `INTERPRETER_COND_${cond.keyword.toUpperCase()}`,
            text: `LEAP Bedingung "${cond.keyword}":
Syntax: ${cond.syntax}
${cond.example ? `Beispiel: ${cond.example}` : ''}
${cond.note || ''}`
        });
    });

    // Builtin-Funktionen (random/zufall)
    if (features.builtinFunctions) {
        features.builtinFunctions.forEach(func => {
            const variantText = func.variants.map(v => 
                `  ${v.syntax}\n    → ${v.desc}\n    Beispiel: ${v.example}`
            ).join('\n\n');
            
            entries.push({
                file: `INTERPRETER_FUNC_${func.keyword.toUpperCase()}`,
                text: `LEAP Funktion "${func.keyword}"${func.german === true ? ' (Deutsche Version)' : ` / "${func.german}"`}:

${variantText}

${func.german === true ? '(Dies ist die deutsche Version von random())' : `Deutsche Alternative: ${func.german}()`}`
            });
        });
    }

    // Nicht unterstützte Features
    features.notSupported.forEach(ns => {
        entries.push({
            file: `INTERPRETER_NOT_SUPPORTED`,
            text: `ACHTUNG: "${ns.feature}" ist in LEAP NICHT verfügbar!
Grund: ${ns.reason}
Die AI darf dieses Feature NIEMALS im Code verwenden!`
        });
    });

    return entries;
}

// Main
const features = analyzeInterpreter();
const ragEntries = generateRAGEntries(features);
console.log(`\n📝 ${ragEntries.length} RAG-Einträge generiert`);

// Optional: Ausgabe der RAG-Einträge
ragEntries.forEach((entry, i) => {
    console.log(`\n--- Entry ${i+1}: ${entry.file} ---`);
    console.log(entry.text.substring(0, 200) + '...');
});
