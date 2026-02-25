// welcomeToLeapAnimation.js

const codeLines = [
  '<span class="import">Import</span> <span class="namespace">Leap</span><span class="operator">;</span>',
  '',
  '<span class="variable">helloUser</span> <span class="operator">=</span> <span class="string">"Willkommen in Leap!"</span><span class="operator">;</span>',
  '<span class="method">ausgeben</span><span class="bracket">(</span><span class="variable">helloUser</span><span class="bracket">)</span><span class="operator">;</span>'
];

let currentLine = 0;
let animationStarted = false;
let isSkipped = false;

const codeBlock = document.getElementById("typedCode");
const skipBtn = document.getElementById("skipAnimation");

// --- 1. Die Tipp-Animation ---
function typeLine() {
  if (isSkipped || currentLine >= codeLines.length) {
    if (!isSkipped) triggerHelloUserAnimation();
    return;
  }

  const fullHTML = codeLines[currentLine];
  const container = document.createElement("div");
  container.innerHTML = "&nbsp;"; 
  codeBlock.appendChild(container);

  let plainText = fullHTML.replace(/<[^>]*>/g, ''); 
  let i = 0;

  function typeChar() {
    if (isSkipped) return; // Stoppt sofort, wenn Skip gedrückt wird

    if (i <= plainText.length) {
      let htmlToShow = '';
      let count = 0;

      fullHTML.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
        if (tag) {
          htmlToShow += tag;
        } else {
          const slice = text.slice(0, Math.max(0, Math.min(i - count, text.length)));
          htmlToShow += slice;
          count += text.length;
        }
      });

      container.innerHTML = htmlToShow || "&nbsp;";
      i++;
      
      // HIER GEÄNDERT: Tipp-Geschwindigkeit (Buchstaben) - z.B. 50ms statt 25ms
      setTimeout(typeChar, 40); 
    } else {
      currentLine++;
      
      // HIER GEÄNDERT: Pause nach jeder Zeile - z.B. 500ms statt 200ms
      setTimeout(typeLine, 200); 
    }
  }

  typeChar();
}

// --- 2. Die finale Zeilen-Animation (Verschieben & Vergrößern) ---
function triggerHelloUserAnimation() {
  const allLines = codeBlock.querySelectorAll("div");
  const originalLine = allLines[2]; // Die Zeile "var helloUser..."

  if (!originalLine || isSkipped) return;

  // Klonen für die CSS-Animation
  const clone = originalLine.cloneNode(true);
  clone.classList.add("animate-helloUser");
  document.querySelector(".notMain").appendChild(clone);

  // Editor ausblenden
  const editorContainer = document.querySelector(".vsc_editor-container");
  if (editorContainer) {
    editorContainer.classList.add("vsc_fade-out");
  }

  // Skip-Button ausblenden, da Animation fast fertig
  if (skipBtn) skipBtn.classList.add("vsc_fade-out");

  // WICHTIG: Wenn die CSS-Animation der Zeile fertig ist
  clone.addEventListener("animationend", () => {
    finishLayout();
    // clone.remove();  <-- Diese Zeile ist jetzt WEG! Die Animation bleibt stehen.
  }, { once: true });
}

// --- 3. Layout finalisieren (Footer & Content zeigen) ---
function finishLayout() {
  // 1. Editor sofort aus dem Layout entfernen
  const editorContainer = document.querySelector(".vsc_editor-container");
  if (editorContainer) editorContainer.style.display = "none";

  // 2. Klasse für flexibles Layout hinzufügen (min-height: 100vh)
  const notMain = document.querySelector(".notMain");
  if (notMain) notMain.classList.add("layout-ready");

  // 3. GitHub Commits & WhyUs anzeigen
  const twoBox = document.querySelector(".TwoBoxSetup");
  if (twoBox) twoBox.classList.add("show");

  // 4. NUR den unteren Impressum-Footer einblenden
  const finalFooter = document.querySelector(".final-footer");
  if (finalFooter) finalFooter.classList.add("show-footer");

  // 5. Skip-Button komplett entfernen
  if (skipBtn) skipBtn.style.display = "none";

  // 6. Richtig scrollen: Sanft zum Start des neuen Contents (nicht ganz nach oben!)
  if (notMain) {
      notMain.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}


// --- 4. Skip-Funktion ---
function skipAnimation() {
  isSkipped = true;
  
  // 1. Prüfen, ob die Zeile nicht schon durch die normale Animation erstellt wurde
  if (!document.querySelector(".animate-helloUser")) {
    // Wir holen uns den fertigen Text direkt aus dem Array (Index 2)
    const finalHTML = codeLines[2]; 
    
    // Wir bauen den Klon manuell
    const clone = document.createElement("div");
    clone.classList.add("animate-helloUser");
    clone.innerHTML = finalHTML;

    // Wir schalten die Animation aus und setzen die Zeile direkt an die Endposition
    clone.style.animation = "none";
    clone.style.top = "5%";
    clone.style.left = "40%";
    
    // HINWEIS: Trage hier denselben scale-Wert ein, den du in deiner CSS bei 100% gewählt hast (z.B. 1.5)
    clone.style.transform = "scale(1.5)"; 

    // Die Zeile in die Hauptsektion einfügen
    const notMain = document.querySelector(".notMain");
    if (notMain) notMain.appendChild(clone);
  }

  // 2. Sofort den Editor ausblenden
  const editorContainer = document.querySelector(".vsc_editor-container");
  if (editorContainer) editorContainer.style.display = "none";
  
  // 3. Den restlichen Content anzeigen und hochscrollen
  finishLayout();
}

// --- 5. Scroll-Wächter ---
function checkScroll() {
  const editor = document.querySelector(".vsc_editor-container");
  if (!editor) return;
  
  const rect = editor.getBoundingClientRect();

  if (!animationStarted && rect.top <= 0) {
    animationStarted = true;

    // Skip-Button zeigen
    if (skipBtn) skipBtn.classList.add("show");

    typeLine();
  }
}

// Event Listener
if (skipBtn) skipBtn.addEventListener("click", skipAnimation);
window.addEventListener("scroll", checkScroll);