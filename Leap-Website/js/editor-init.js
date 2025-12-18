// editor-init.js
require.config({
    paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" }
});

export let editor;
export const editorReady = new Promise((resolve) => {
    require(["vs/editor/editor.main"], function () {
        editor = monaco.editor.create(document.getElementById("leapEditor"), {
            value: `x = 5;\ny = 10;\nergebnis = x + y;\nausgeben(ergebnis);`,
            language: "javascript",
            theme: "vs-dark",
            fontSize: 15,
            automaticLayout: true,
            minimap: { enabled: false }
        });
        resolve(editor);
    });
});