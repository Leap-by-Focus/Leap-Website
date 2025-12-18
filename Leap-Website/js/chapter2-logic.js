/* =========================================================
   LEAP CHAPTER 2 LOGIC - REPARIERTE VERSION
   ========================================================= */

import { LeapInterpreter } from "./leap-interpreter.js";

if (window.leapLogicInitialized) {
    console.warn("Leap-Logic bereits aktiv. Verhindere doppeltes Laden.");
} else {
    window.leapLogicInitialized = true;

    if (!window.leapEditorInstance) {
        window.leapEditorInstance = null;
    }

    require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" }
    });

    require(["vs/editor/editor.main"], function () {
        const container = document.getElementById("leapEditor");
        if (!container) return;

        // --- 1. SPRACHE 'LEAP' FÜR MONACO REGISTRIEREN (Fix für Farben) ---
        monaco.languages.register({ id: 'leap' });

        monaco.languages.setMonarchTokensProvider('leap', {
            tokenizer: {
                root: [
                    [/\d+/, "number"],
                    [/"[^"]*"/, "string"],
                    [/ausgeben/, "keyword"],
                    [/[=+\-*/()]/, "operator"],
                    [/[a-zA-Z_]\w*/, "identifier"],
                ]
            }
        });

        monaco.editor.defineTheme('leapTheme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: '50e9ba', fontStyle: 'bold' },
                { token: 'number', foreground: 'ffca28' },
                { token: 'string', foreground: '80cbc4' },
                { token: 'operator', foreground: 'ffffff' }
            ],
            colors: { 'editor.background': '#111111' }
        });

        // --- 2. AUTO-TAB PROVIDER (Vervollständigung ohne Fenster) ---
        monaco.languages.registerCompletionItemProvider('leap', {
            provideCompletionItems: () => ({
                suggestions: [
                    {
                        label: 'ausgeben',
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'ausgeben(${1:z});',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    }
                ]
            })
        });

        if (window.leapEditorInstance) {
            window.leapEditorInstance.dispose();
        }

        container.innerHTML = "";

        // --- 3. EDITOR ERSTELLEN ---
        window.leapEditorInstance = monaco.editor.create(container, {
            value: "",
            language: "leap",
            theme: "leapTheme",
            fontSize: 16,
            automaticLayout: true,
            minimap: { enabled: false },
            quickSuggestions: false,          // Kein automatisches Aufpoppen
            suggestOnTriggerCharacters: false,
            tabCompletion: "on",              // Tab vervollständigt
            wordBasedSuggestions: false
        });
        
        initApp();
    });

    function initApp() {
        const runBtn = document.getElementById("runBtn");
        const stopBtn = document.getElementById("stopBtn");
        const outputDiv = document.getElementById("editorOutput");
        const bar = document.querySelector(".chapter-statusbar");
        const fill = document.getElementById("chapterStatusFill");
        const textElement = document.getElementById("chapterStatusText"); // Umbenannt von 'text' zu 'textElement' (Fix für den Fehler im Screen!)

        if (!runBtn) return;

        runBtn.onclick = function() {
            const code = window.leapEditorInstance.getValue();
            const interpreter = new LeapInterpreter();

            bar.classList.remove("success", "failed");
            void bar.offsetWidth; 

            try {
                const result = interpreter.run(code);
                outputDiv.innerHTML = result ? `> ${result.replace(/\n/g, '<br>> ')}` : "> Code ausgeführt.";
                outputDiv.style.color = "#00ff90";

                const clean = code.replace(/\s+/g, "").toLowerCase();
                
                // Strengere Prüfung für Kapitel 2 Mission
                const hasX = /x=10;/.test(clean);
                const hasY = /y=20;/.test(clean);
                const hasZ = /z=x\+y;/.test(clean);
                const hasOutput = /ausgeben\(z\);/.test(clean);

                if (hasX && hasY && hasZ && hasOutput) {
                    triggerSuccess(fill, textElement, bar);
                } else {
                    let missing = !hasX ? "x = 10; fehlt" : !hasY ? "y = 20; fehlt" : !hasZ ? "z = x + y; fehlt" : "ausgeben(z); fehlt";
                    triggerFailure(fill, textElement, bar, `❌ Fast geschafft! ${missing}.`);
                }

            } catch (err) {
                outputDiv.innerHTML = `<span style="color: #ff4b2b;">> Fehler: ${err.message}</span>`;
                outputDiv.style.color = "#ff4b2b";
                triggerFailure(fill, textElement, bar, `❌ Fehler: ${err.message}`);
            }
        };

        stopBtn.onclick = function() {
            outputDiv.innerHTML = "<span style='color:orange'>> Programm gestoppt.</span>";
            fill.style.width = "0%";
            bar.classList.remove("success", "failed");
            textElement.textContent = "Aufgabe noch nicht gelöst";
        };
    }

    // --- HELPER FUNKTIONEN ---
    function triggerSuccess(f, t, b) {
        f.style.width = "100%";
        f.style.background = "linear-gradient(90deg, #148fac, #50e9ba)";
        t.textContent = "🚀 MISSION ERFOLGREICH! ✨";
        b.classList.add("success");

        if (typeof confetti !== 'undefined') {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#50e9ba', '#148fac'] });
        }
    }

    function triggerFailure(f, t, b, msg) {
        f.style.width = "35%";
        f.style.background = "#ff4b2b";
        t.textContent = msg;
        b.classList.add("failed");
    }
}