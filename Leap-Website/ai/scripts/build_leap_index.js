import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// --- KONFIGURATION ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..'); 
const SOURCE_DIR = path.join(ROOT_DIR, 'leap-code'); 
const OUTPUT_FILE = path.join(ROOT_DIR, 'leap_index.json');

const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";
const EMBED_MODEL = "nomic-embed-text"; 

// 🔥 NEU: DIE GOLDENEN REGELN (Anti-Halluzination)
// Diese Regeln werden fest in das Gehirn der AI eingebrannt.
const MANUAL_RULES = [
    {
        file: "SYSTEM_RULES_LOOPS",
        text: "In der Sprache LEAP ist die Schleife 'für(k=0; k<10; k=k+1)' zu 100% korrekt. Das Wort 'für' ist kein Tippfehler (deutsch für 'for'). Auch 'wiederhole 5 mal' ist korrekt."
    },
    {
        file: "SYSTEM_RULES_VARS",
        text: "Variablen in LEAP: Man schreibt 'x = 10;'. Man benutzt NIEMALS 'int', 'var', 'let' oder 'const' für die Deklaration."
    },
    {
        file: "SYSTEM_RULES_PRINT",
        text: "Ausgabe in LEAP: Man benutzt 'ausgeben(\"Text\")'. Man benutzt NIEMALS 'Console.WriteLine', 'System.out' oder 'print'."
    },
    {
        file: "SYSTEM_RULES_FILES",
        text: "Datei-Operationen in LEAP: Man benutzt 'File.Read(pfad)' oder 'Datei.Lesen(pfad)' um eine Datei zu lesen. Man benutzt 'File.Write(pfad, text)' oder 'Datei.Schreiben(pfad, text)' um in eine Datei zu schreiben. Man benutzt 'File.Append(pfad, text)' oder 'Datei.Anhängen(pfad, text)' um Text an eine Datei anzuhängen. Man benutzt 'File.Exists(pfad)' oder 'Datei.Existiert(pfad)' um zu prüfen ob eine Datei existiert. Alle deutschen Varianten (Datei.Lesen, Datei.Schreiben, Datei.Anhängen, Datei.Existiert) sind korrekt!"
    },
    {
        file: "SYSTEM_RULES_ARRAYS",
        text: "Arrays in LEAP: Man erstellt Arrays mit eckigen Klammern z.B. 'zahlen = [1, 2, 3];'. Zugriff auf Elemente: 'zahlen[0]' gibt das erste Element. Arrays können Zahlen, Strings oder gemischte Werte enthalten."
    },
    {
        file: "SYSTEM_RULES_STRINGS",
        text: "String-Methoden in LEAP: Alle String-Operationen werden über 'String.Methode()' oder 'Text.Methode()' aufgerufen. Verfügbare Methoden: String.Length(text)/Text.Länge(text) für Länge, String.ToUpper(text)/Text.Gross(text) für Großbuchstaben, String.ToLower(text)/Text.Klein(text) für Kleinbuchstaben, String.Substring(text,start,länge)/Text.Teil(text,start,länge) für Teilstrings, String.CharAt(text,pos)/Text.ZeichenAn(text,pos) für einzelne Zeichen, String.Contains(text,suche)/Text.Enthält(text,suche) zum Prüfen ob enthalten, String.IndexOf(text,suche)/Text.Position(text,suche) für Position, String.Replace(text,suche,ersatz)/Text.Ersetze(text,suche,ersatz) zum Ersetzen, String.Trim(text)/Text.Kürze(text) zum Entfernen von Leerzeichen, String.Split(text,trenner)/Text.Teile(text,trenner) zum Aufteilen in Array, String.Reverse(text)/Text.Umkehren(text) zum Umkehren, String.Repeat(text,n)/Text.Wiederhole(text,n) zum Wiederholen, String.StartsWith(text,prefix)/Text.BeginntMit(text,prefix) und String.EndsWith(text,suffix)/Text.EndetMit(text,suffix) zum Prüfen von Anfang/Ende, String.IsEmpty(text)/Text.IstLeer(text) zum Prüfen ob leer, String.IsNumber(text)/Text.IstZahl(text) zum Prüfen ob Zahl, String.ToNumber(text)/Text.ZuZahl(text) zum Konvertieren in Zahl, String.PadLeft(text,länge,zeichen)/Text.LinksFüllen(text,länge,zeichen) und String.PadRight(text,länge,zeichen)/Text.RechtsFüllen(text,länge,zeichen) zum Auffüllen."
    },
    {
        file: "SYSTEM_RULES_RANDOM",
        text: "Zufallszahlen in LEAP: Mit random(n) oder zufall(n) erhält man eine Zufallszahl von 0 bis n-1. Beispiel: x = random(10); // 0 bis 9. x = zufall(100); // 0 bis 99. Das Argument n muss eine positive Zahl sein."
    },
    // Goldene Regel: Exception Handling (try/catch, versuche/fange)
    {
        file: "SYSTEM_RULES_EXCEPTION",
        text: "Mit try { ... } catch (err) { ... } oder versuche { ... } fange (err) { ... } kann man Fehler abfangen. Im catch/fange-Block steht die Fehlermeldung als Variable zur Verfügung."
    }
];

// --- 1. REKURSIVER DATEI-SUCHER ---
function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return [];
    
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.lp') || file.endsWith('.leap')) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });
    return arrayOfFiles;
}

// --- 2. SMART CHUNKER MIT LOOKAHEAD (Dein Code) ---
function semanticChunking(content, fileName) {
    const lines = content.split('\n');
    const chunks = [];
    
    let currentChunk = [];
    let balance = 0;
    let currentSignature = "Global Script Context";

    const isChainedKeyword = (line) => {
        if (!line) return false;
        const t = line.trim();
        return t.startsWith('else') || t.startsWith('sonst') || t.startsWith('catch') || t.startsWith('finally');
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (balance === 0 && currentChunk.length === 0 && trimmed === '') continue;

        const codeOnly = trimmed.replace(/\/\/.*$/, ''); 
        const openBraces = (codeOnly.match(/\{/g) || []).length;
        const closeBraces = (codeOnly.match(/\}/g) || []).length;

        if (balance === 0 && openBraces > 0) {
            const match = trimmed.match(/(?:funktion|class|function|wiederhole|falls|sonst|if|else|while|for|repeat|während|für)\s*\(?([a-zA-Z0-9_]*)/);
            if (match) currentSignature = match[0].trim(); 
        }

        currentChunk.push(line);
        balance += openBraces;
        balance -= closeBraces;
        if (balance < 0) balance = 0;

        if (balance === 0 && currentChunk.length > 0) {
            let isChainContinuing = false;
            let peekIndex = i + 1;
            while(peekIndex < lines.length) {
                const peekLine = lines[peekIndex].trim();
                if (peekLine === '' || peekLine.startsWith('//')) {
                    peekIndex++;
                    continue;
                }
                if (isChainedKeyword(peekLine)) isChainContinuing = true;
                break;
            }

            if (!isChainContinuing) {
                const chunkText = currentChunk.join('\n');
                if (chunkText.trim().length > 5) { // Kleines Limit für kurze Befehle
                    chunks.push({
                        text: chunkText,
                        metadata: {
                            file: path.basename(fileName),
                            method: currentSignature,
                            lines: currentChunk.length
                        }
                    });
                }
                currentChunk = [];
                currentSignature = "Global Script Context";
            }
        }
    }
    return chunks;
}

// --- 3. EMBEDDING GENERATOR ---
async function generateEmbedding(text) {
    try {
        const response = await fetch(OLLAMA_EMBED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, input: text })
        });
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.warn(`   ⚠️ Embedding-Fehler: ${error.message}`);
        return null;
    }
}

// --- MAIN ---
async function main() {
    console.log(`🚀 Starte ULTIMATE Indexer für Leap...`);
    
    const allChunks = [];

    // A) GOLDENE REGELN EINBRENNEN
    console.log("📜 Verarbeite Goldene Regeln (Manual Rules)...");
    for (const rule of MANUAL_RULES) {
        process.stdout.write('⭐'); 
        const embedding = await generateEmbedding(rule.text);
        if (embedding) {
            allChunks.push({
                id: crypto.randomUUID(),
                text: rule.text, // Hier steht explizit: "für ist korrekt"
                embedding: embedding,
                file: rule.file,
                method: "System Rule"
            });
        }
    }
    console.log(" ✅ Regeln gespeichert.");

    // B) DATEIEN SCANNEN
    console.log(`📂 Suche in: ${SOURCE_DIR}`);
    if (fs.existsSync(SOURCE_DIR)) {
        const files = getAllFiles(SOURCE_DIR);
        console.log(`🔍 Gefundene .lp Dateien: ${files.length}`);

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const chunks = semanticChunking(content, filePath);
            
            console.log(`   📄 ${path.basename(filePath)}: ${chunks.length} Blöcke.`);

            for (const chunk of chunks) {
                const textForAI = `// Datei: ${chunk.metadata.file}\n// Kontext: ${chunk.metadata.method}\n${chunk.text}`;
                process.stdout.write('.'); 
                const embedding = await generateEmbedding(textForAI);
                
                if (embedding) {
                    allChunks.push({
                        id: crypto.randomUUID(),
                        text: textForAI,
                        embedding: embedding,
                        file: chunk.metadata.file,
                        method: chunk.metadata.method
                    });
                }
            }
            console.log(" ✅");
        }
    } else {
        console.log("⚠️ Kein 'leap-code' Ordner gefunden. Nutze nur Regeln.");
    }

    const outputData = { updated: new Date().toISOString(), items: allChunks };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`\n🎉 INDEX FERTIG! ${allChunks.length} Vektoren in ${OUTPUT_FILE}`);
}

main();