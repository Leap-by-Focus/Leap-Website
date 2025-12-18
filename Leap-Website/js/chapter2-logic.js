import { LeapInterpreter } from "./leap-interpreter.js";

let editorInstance = null; // Verhindert das "Doppel-Löschen" Problem

// 1. MONACO INITIALISIERUNG
require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" }
});

require(["vs/editor/editor.main"], function () {
    // Falls schon ein Editor da ist, zerstören wir ihn (Sicherheit für Reloads)
    if (editorInstance) {
        editorInstance.dispose();
    }

    editorInstance = monaco.editor.create(document.getElementById("leapEditor"), {
        value: `x = 5;\ny = 10;\nergebnis = x + y;\nausgeben(ergebnis);`,
        language: "javascript",
        theme: "vs-dark",
        fontSize: 15,
        automaticLayout: true,
        minimap: { enabled: false }
    });
    
    // UI-Elemente erst binden, wenn der Editor bereit ist
    initApp();
});

// 2. HAUPT-LOGIK & ANIMATIONEN
function initApp() {
    const runBtn = document.getElementById("runBtn");
    const stopBtn = document.getElementById("stopBtn");
    const outputDiv = document.getElementById("editorOutput");
    const bar = document.querySelector(".chapter-statusbar");
    const fill = document.getElementById("chapterStatusFill");
    const text = document.getElementById("chapterStatusText");

    runBtn.onclick = function() {
        const code = editorInstance.getValue();
        const interpreter = new LeapInterpreter();

        // UI Reset vor jedem Run
        bar.classList.remove("success", "failed");
        void bar.offsetWidth; // Magic-Reset für CSS Animationen

        try {
            // A. INTERPRETER AUSFÜHREN
            const result = interpreter.run(code);
            
            // Output anzeigen
            outputDiv.innerHTML = result ? `> ${result.replace(/\n/g, '<br>> ')}` : "> Code ausgeführt.";
            outputDiv.style.color = "#00ff90";

            // B. MISSION-CHECK (Logik-Prüfung)
            const clean = code.replace(/\s+/g, "").toLowerCase();
            
            // Kriterien: Variablen erstellt, Addition vorhanden, Ausgabe genutzt
            const hasVariables = (clean.match(/[a-z0-9]+=\d+;/g) || []).length >= 2;
            const hasAddition = /[a-z0-9]+=[a-z0-9]+\+[a-z0-9]+;/.test(clean);
            const hasOutput = /(ausgeben|print)\([a-z0-9]+\);/.test(clean);

            if (hasVariables && hasAddition && hasOutput) {
                triggerSuccess();
            } else {
                // Code läuft technisch, aber Mission-Ziele fehlen
                let missing = !hasVariables ? "Variablen fehlen" : !hasAddition ? "Addition fehlt" : "Ausgabe fehlt";
                triggerFailure(`❌ Fast geschafft! ${missing}.`);
            }

        } catch (err) {
            // C. FEHLER-FALL (Wird bei JEDEM Interpreter-Fehler getriggert)
            outputDiv.innerHTML = `<span style="color: #ff4b2b;">> Fehler: ${err.message}</span>`;
            outputDiv.style.color = "#ff4b2b";
            triggerFailure(`❌ Fehler: ${err.message}`);
        }
    };

    function triggerSuccess() {
        fill.style.width = "100%";
        fill.style.background = "linear-gradient(90deg, #148fac, #50e9ba)";
        text.textContent = "🚀 MISSION ERFOLGREICH! ✨";
        bar.classList.add("success");
        
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ['#50e9ba', '#148fac', '#ffffff']
            });
        }
    }

    function triggerFailure(msg) {
        fill.style.width = "35%";
        fill.style.background = "#ff4b2b";
        text.textContent = msg || "❌ DA STIMMT WAS NICHT!";
        bar.classList.add("failed");
    }

    stopBtn.onclick = function() {
        outputDiv.innerHTML = "<span style='color:orange'>> Program gestoppt.</span>";
        fill.style.width = "0%";
        bar.classList.remove("success", "failed");
        text.textContent = "Aufgabe noch nicht gelöst";
    };
}