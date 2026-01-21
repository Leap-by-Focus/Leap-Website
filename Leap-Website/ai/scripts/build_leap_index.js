import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// --- KONFIGURATION ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..'); 
const SOURCE_DIR = path.join(ROOT_DIR, 'leap-code'); // Scannt ab hier rekursiv
// Wir sind schon im AI-Root, also direkt die Datei angeben
const OUTPUT_FILE = path.join(ROOT_DIR, 'leap_index.json');

const OLLAMA_EMBED_URL = "http://127.0.0.1:11434/api/embeddings";
const EMBED_MODEL = "nomic-embed-text"; 

// --- 1. REKURSIVER DATEI-SUCHER ---
// Findet hello.lp auch in Unterordnern (z.B. leap-code/csvode/example/)
function getAllFiles(dirPath, arrayOfFiles) {
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

// --- 2. SMART CHUNKER MIT LOOKAHEAD ---
function semanticChunking(content, fileName) {
    const lines = content.split('\n');
    const chunks = [];
    
    let currentChunk = [];
    let balance = 0;
    let currentSignature = "Global Script Context";

    // Helper: Prüft, ob eine Zeile ein Fortsetzungs-Keyword enthält (else, sonst)
    const isChainedKeyword = (line) => {
        if (!line) return false;
        const t = line.trim();
        return t.startsWith('else') || t.startsWith('sonst') || t.startsWith('catch') || t.startsWith('finally');
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Leere Zeilen ignorieren, wenn wir nicht im Block sind, um saubere Starts zu haben
        if (balance === 0 && currentChunk.length === 0 && trimmed === '') continue;

        // Klammern zählen (Kommentare vorher entfernen)
        const codeOnly = trimmed.replace(/\/\/.*$/, ''); 
        const openBraces = (codeOnly.match(/\{/g) || []).length;
        const closeBraces = (codeOnly.match(/\}/g) || []).length;

        // Signatur erkennen (nur beim Start eines Blocks auf Ebene 0)
        if (balance === 0 && openBraces > 0) {
            const match = trimmed.match(/(?:funktion|class|function|wiederhole|falls|sonst|if|else|while|for|repeat|während|für)\s*\(?([a-zA-Z0-9_]*)/);
            if (match) {
                // z.B. "if" oder "wiederhole" als "Name" nehmen, damit die AI weiß was es ist
                currentSignature = match[0].trim(); 
            }
        }

        currentChunk.push(line);
        balance += openBraces;
        balance -= closeBraces;
        if (balance < 0) balance = 0; // Safety

        // --- ENTSCHEIDUNG: Chunk beenden? ---
        if (balance === 0 && currentChunk.length > 0) {
            
            // 🔥 LOOKAHEAD LOGIK:
            // Wenn der Block zu Ende ist, prüfen wir die NÄCHSTEN Zeilen.
            // Kommt gleich ein "else" oder "sonst"? Wenn ja -> Chunk NICHT beenden!
            
            let isChainContinuing = false;
            let peekIndex = i + 1;
            
            // Wir überspringen leere Zeilen und Kommentare beim Vorrausschauen
            while(peekIndex < lines.length) {
                const peekLine = lines[peekIndex].trim();
                if (peekLine === '' || peekLine.startsWith('//')) {
                    peekIndex++;
                    continue;
                }
                
                // Jetzt haben wir die nächste echte Code-Zeile
                if (isChainedKeyword(peekLine)) {
                    isChainContinuing = true;
                }
                break; // Wir schauen nur bis zum ersten echten Code
            }

            // Wenn es weitergeht (else/sonst), machen wir hier NICHTS und lassen den Loop weiterlaufen.
            // Wenn nicht, speichern wir den Chunk.
            if (!isChainContinuing) {
                const chunkText = currentChunk.join('\n');
                
                // Nur sinnvolle Größen speichern
                if (chunkText.trim().length > 10) {
                    chunks.push({
                        text: chunkText,
                        metadata: {
                            file: path.basename(fileName), // Nur Dateiname, nicht ganzer Pfad
                            method: currentSignature,
                            lines: currentChunk.length
                        }
                    });
                }

                // Reset
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
        console.warn(`   ⚠️ Embedding-Fehler (Server läuft?): ${error.message}`);
        return null;
    }
}

// --- MAIN ---
async function main() {
    console.log(`🚀 Starte SMART Indexer für Leap...`);
    console.log(`📂 Suche in: ${SOURCE_DIR}`);

    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`❌ Ordner nicht gefunden: ${SOURCE_DIR}`);
        return;
    }

    // Rekursiv alle Dateien holen
    const files = getAllFiles(SOURCE_DIR);
    let allChunks = [];

    console.log(`🔍 Gefundene .lp Dateien: ${files.length}`);

    for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const chunks = semanticChunking(content, filePath);
        
        console.log(`   📄 ${path.basename(filePath)}: ${chunks.length} logische Blöcke.`);

        for (const chunk of chunks) {
            // Metadaten für die AI vorbereiten
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

    const outputData = { updated: new Date().toISOString(), items: allChunks };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`\n🎉 INDEX FERTIG! Gespeichert in: ${OUTPUT_FILE}`);
    console.log(`📚 Anzahl Vektoren: ${allChunks.length}`);
}

main();