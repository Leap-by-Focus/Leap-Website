/* =========================================================
   LEAP CHAPTER 4 LOGIC - STATEMENTS MISSION
   ========================================================= */

import { LeapInterpreter } from "./leap-interpreter.js";

if (window.leapChapter4LogicInitialized) {
    console.warn("Leap Chapter 4 Logic bereits aktiv.");
} else {
    window.leapChapter4LogicInitialized = true;

    if (!window.leapEditorInstance) {
        window.leapEditorInstance = null;
    }

    require.config({
        paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" }
    });

    require(["vs/editor/editor.main"], function () {
        const container = document.getElementById("leapEditor");
        if (!container) return;

        monaco.languages.register({ id: "leap" });

        monaco.languages.setMonarchTokensProvider("leap", {
            tokenizer: {
                root: [
                    [/\d+/, "number"],
                    [/"[^"]*"/, "string"],
                    [/ausgeben/, "keyword"],
                    [/[=+\-*/()%]/, "operator"],
                    [/[a-zA-Z_]\w*/, "identifier"],
                ]
            }
        });

        monaco.editor.defineTheme("leapTheme", {
            base: "vs-dark",
            inherit: true,
            rules: [
                { token: "keyword", foreground: "50e9ba", fontStyle: "bold" },
                { token: "number", foreground: "ffca28" },
                { token: "string", foreground: "80cbc4" },
                { token: "operator", foreground: "ffffff" }
            ],
            colors: { "editor.background": "#111111" }
        });

        monaco.languages.registerCompletionItemProvider("leap", {
            provideCompletionItems: () => ({
                suggestions: [
                    {
                        label: "ausgeben",
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: "ausgeben(${1:wert});",
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    }
                ]
            })
        });

        if (window.leapEditorInstance) {
            window.leapEditorInstance.dispose();
        }

        container.innerHTML = "";

        const starterCode = `energie = 72;
modus = "scan";
ziel = "asteroid";

// TODO: Lege eine status-Variable an
// TODO: Prüfe die Energie mit falls (energie >= 70)
// TODO: Setze status = "stabil" sonst "kritisch"
// TODO: Entscheide modus und setze aktion entsprechend
// TODO: Gib beide Ergebnisse mit ausgeben(status); und ausgeben(aktion); aus
`;

        window.leapEditorInstance = monaco.editor.create(container, {
            value: starterCode,
            language: "leap",
            theme: "leapTheme",
            fontSize: 16,
            automaticLayout: true,
            minimap: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            tabCompletion: "on",
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
        const textElement = document.getElementById("chapterStatusText");

        if (!runBtn || !outputDiv || !fill || !textElement || !bar) return;

        runBtn.onclick = function () {
            const code = window.leapEditorInstance.getValue();
            const interpreter = new LeapInterpreter();

            bar.classList.remove("success", "failed");
            void bar.offsetWidth;

            try {
                const result = interpreter.run(code);
                outputDiv.innerHTML = result ? `> ${result.replace(/\n/g, '<br>> ')}` : "> Code ausgeführt.";
                outputDiv.style.color = "#00ff90";
                outputDiv.scrollTop = outputDiv.scrollHeight;

                const clean = code.replace(/\s+/g, "").toLowerCase();
                const validation = validateMission(clean, result);

                if (validation.success) {
                    triggerSuccess(fill, textElement, bar);
                } else {
                    triggerFailure(fill, textElement, bar, `❌ ${validation.message}`);
                }
            } catch (err) {
                outputDiv.innerHTML = `<span style="color: #ff4b2b;">> Fehler: ${err.message}</span>`;
                outputDiv.style.color = "#ff4b2b";
                outputDiv.scrollTop = outputDiv.scrollHeight;
                triggerFailure(fill, textElement, bar, `❌ Fehler: ${err.message}`);
            }
        };

        if (stopBtn) {
            stopBtn.onclick = function () {
                outputDiv.innerHTML = "<span style='color:orange'>> Programm gestoppt.</span>";
                fill.style.width = "0%";
                bar.classList.remove("success", "failed");
                textElement.textContent = "Statement-Mission noch nicht gelöst";
            };
        }
    }

    function validateMission(clean, rawOutput) {
        const steps = [
            { regex: /energie=72;/, message: "Setze energie = 72;" },
            { regex: /modus="scan";/, message: "Setze modus = \"scan\";" },
            { regex: /ziel="asteroid";/, message: "Setze ziel = \"asteroid\";" },
            { regex: /falls\(energie>=70\)\{status="stabil";\}sonst\{status="kritisch";\}/, message: "Prüfe energie und setze status stabil/kritisch." },
            { regex: /falls\(modus=="scan"\)\{aktion="sensorenaktiv";\}sonst\{falls\(modus=="dock"\)\{aktion="andockenbereit";\}sonst\{aktion="warteaufbefehl";\}\}/, message: "Verzweige modus korrekt auf aktion." },
            { regex: /ausgeben\(status\);/, message: "Gib zuerst status aus." },
            { regex: /ausgeben\(aktion\);/, message: "Gib danach aktion aus." }
        ];

        for (const step of steps) {
            if (!step.regex.test(clean)) {
                return { success: false, message: step.message };
            }
        }

        const normalizedOutput = (rawOutput || "").trim().split(/\n+/).map(line => line.toLowerCase());
        if (normalizedOutput[0] !== "stabil" || normalizedOutput[1] !== "sensoren aktiv") {
            return { success: false, message: "Output muss stabil und sensoren aktiv lauten." };
        }

        return { success: true };
    }

    function triggerSuccess(fill, textElement, bar) {
        fill.style.width = "100%";
        fill.style.background = "linear-gradient(90deg, #148fac, #50e9ba)";
        textElement.textContent = "✅ Statement-Schaltzentrale aktiv";
        bar.classList.add("success");

        if (typeof confetti !== "undefined") {
            const duration = 2500;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 4,
                    angle: 90,
                    spread: 80,
                    origin: { x: 0.5, y: 0.2 },
                    colors: ["#50e9ba", "#148fac", "#ffffff"],
                    ticks: 200
                });
                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            })();
        }
    }

    function triggerFailure(fill, textElement, bar, msg) {
        fill.style.width = "35%";
        fill.style.background = "#ff4b2b";
        textElement.textContent = msg;
        bar.classList.add("failed");
    }
}
