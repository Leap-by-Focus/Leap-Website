const fs = require('fs');

// 1. Argumente prüfen (Die temporäre Datei vom Server)
const filePath = process.argv[2];

if (!filePath) {
    console.error("❌ Fehler: Keine Datei zum Ausführen angegeben.");
    process.exit(1);
}

// 2. Datei lesen
fs.readFile(filePath, 'utf8', (err, leapCode) => {
    if (err) {
        console.error(`❌ Fehler beim Lesen der Datei: ${err.message}`);
        process.exit(1);
    }

    try {
        // 3. LEAP -> JavaScript "Transpiler" (Übersetzer)
        // Wir ersetzen deutsche Keywords durch JS-Syntax
        let jsCode = leapCode
            // Output: ausgeben(...) -> console.log(...)
            .replace(/ausgeben\s*\(/g, 'console.log(')
            
            // Schleifen: für(...) -> for(...)
            .replace(/\bfür\s*\(/g, 'for(')
            .replace(/\bwiederhole\s*\(/g, 'for(') // Alternative
            
            // Bedingungen: falls(...) -> if(...), sonst -> else
            .replace(/\bfalls\s*\(/g, 'if(')
            .replace(/\bsonst\s*\{/g, 'else {')
            .replace(/\bsonst\s*if\s*\(/g, 'else if(')
            
            // Logik: und -> &&, oder -> ||
            .replace(/\bund\b/g, '&&')
            .replace(/\boder\b/g, '||')
            
            // Booleans: wahr -> true, falsch -> false
            .replace(/\bwahr\b/g, 'true')
            .replace(/\bfalsch\b/g, 'false');

        // 4. Ausführen (Eval ist hier okay für einen Prototyp)
        // Wir fangen console.log ab, falls wir es formatieren wollen, 
        // aber node leap.js leitet stdout eh an den Server weiter.
        eval(jsCode);

    } catch (e) {
        // Syntaxfehler abfangen
        console.error(`❌ Laufzeit-Fehler im LEAP Script:\n${e.message}`);
    }
});