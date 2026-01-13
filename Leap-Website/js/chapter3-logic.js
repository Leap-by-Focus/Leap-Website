/* =========================================================
   LEAP CHAPTER 3 LOGIC - OPERATOR MISSION
   ========================================================= */

import { LeapInterpreter } from "./leap-interpreter.js";

if (window.leapChapter3LogicInitialized) {
    console.warn("Leap Chapter 3 Logic bereits aktiv.");
} else {
    window.leapChapter3LogicInitialized = true;

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
                        insertText: "ausgeben(${1:z});",
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    }
                ]
            })
        });

        if (window.leapEditorInstance) {
            window.leapEditorInstance.dispose();
        }

        container.innerHTML = "";

        const starterCode = `energie = 120;
verbrauchProSprung = 15;
spruenge = 3;
reserveBonus = 12;

// TODO: berechne verbrauch = verbrauchProSprung * spruenge
// TODO: setze verbleibend = energie - verbrauch
// TODO: setze proSprung = energie / spruenge
// TODO: addiere reserveBonus mit gesamt = verbleibend + reserveBonus
// TODO: gib das Ergebnis mit ausgeben(gesamt); aus
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
                const validation = validateMission(clean);

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
                textElement.textContent = "Operator-Mission noch nicht gelöst";
            };
        }
    }

    function validateMission(clean) {
        const steps = [
            { regex: /energie=120;/, message: "Setze energie = 120;" },
            { regex: /verbrauchprosprung=15;/, message: "Definiere verbrauchProSprung = 15;" },
            { regex: /spruenge=3;/, message: "Setze spruenge = 3;" },
            { regex: /reservebonus=12;/, message: "Setze reserveBonus = 12;" },
            { regex: /verbrauch=verbrauchprosprung\*spruenge;/, message: "Berechne verbrauch = verbrauchProSprung * spruenge;" },
            { regex: /verbleibend=energie-verbrauch;/, message: "Ziehe den Verbrauch von energie ab." },
            { regex: /prosprung=energie\/spruenge;/, message: "Teile energie durch spruenge für proSprung." },
            { regex: /gesamt=verbleibend\+reservebonus;/, message: "Addiere reserveBonus zu den Restpunkten." },
            { regex: /ausgeben\(gesamt\);/, message: "Gib das Ergebnis mit ausgeben(gesamt); aus." }
        ];

        for (const step of steps) {
            if (!step.regex.test(clean)) {
                return { success: false, message: step.message };
            }
        }
        return { success: true };
    }

    function triggerSuccess(fill, textElement, bar) {
        fill.style.width = "100%";
        fill.style.background = "linear-gradient(90deg, #148fac, #50e9ba)";
        textElement.textContent = "🚀 Operator-Level abgeschlossen!";
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
