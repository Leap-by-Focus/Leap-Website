const codeLines = [
    '<span class="import">import</span> <span class="namespace">Leap.Core</span>',
    '<span class="import">import</span> <span class="namespace">Leap.Text</span>',
    '',
    '<span class="keyword">var</span> <span class="variable">helloUser</span> <span class="operator">=</span> <span class="string">"Willkommen in Leap!"</span>',
    '',
    '<span class="namespace">Leap.<span class="method">Write</span></span>',
    '<span class="bracket">(</span>',
    '<span class="variable">    helloUser</span>',
    '<span class="bracket">)</span>'
  ];
  
  let currentLine = 0;
  let currentChar = 0;
  let animationStarted = false;
  const codeBlock = document.getElementById("typedCode");
  
  // Animation hinzufügen
  function typeLine() {
    if (currentLine >= codeLines.length) {
      triggerHelloUserAnimation(); // Wenn alle Codezeilen getippt sind, beginne die Animation für die Zeile
      return;
    }
  
    const fullHTML = codeLines[currentLine];
    const container = document.createElement("div");
    container.innerHTML = "&nbsp;"; // placeholder für leere Zeilen
    codeBlock.appendChild(container);
  
    let plainText = fullHTML.replace(/<[^>]*>/g, ''); // Strip tags to get text length
    let i = 0;
  
    function typeChar() {
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
        setTimeout(typeChar, 25);
      } else {
        currentLine++;
        setTimeout(typeLine, 200);
      }
    }
  
    typeChar();
  }
  
  function checkScroll() {
    const editor = document.querySelector(".vsc_editor-container");
    const rect = editor.getBoundingClientRect();
  
    if (!animationStarted && rect.top <= 0) {
      animationStarted = true;
      typeLine();
    }
  }
  
  window.addEventListener("scroll", checkScroll);
  
  // Funktion für das Triggern der Animation der Zeile "var helloUser"
  function triggerHelloUserAnimation() {
    // Die gesamte Zeile, die animiert werden soll, wird als HTML-String gespeichert
    const helloUserLine = '<span class="keyword">var</span> <span class="variable">helloUser</span> <span class="operator">=</span> <span class="string">"Willkommen in Leap!"</span>';
  
    // Div für die Zeile erstellen und hinzufügen
    const lineWrapper = document.createElement("div");
    lineWrapper.classList.add("animate-helloUser");
    lineWrapper.innerHTML = helloUserLine;
    codeBlock.appendChild(lineWrapper);
  
    // Die Animation für die Zeile nach der Eingabe starten
    lineWrapper.style.animation = "moveAndGrow 2s forwards";  // Animation starten
  
    // Nach Abschluss der Animation die Zeile zur Mitte verschieben
    lineWrapper.addEventListener("animationend", function() {
      lineWrapper.style.animation = "moveToCenter 2s forwards";  // Zweite Animation starten
    });
  }

  function triggerHelloUserAnimation() {
    const originalLine = codeBlock.querySelectorAll("div")[3];
    const clone = originalLine.cloneNode(true);
    clone.classList.add("animate-helloUser");
  
    // Anhängen direkt an body oder in ein spezielles Container-Element
    document.querySelector(".notMain").appendChild(clone);
  }

  function triggerHelloUserAnimation() {
    const allLines = codeBlock.querySelectorAll("div");
    const originalLine = allLines[3]; // "var helloUser = ..." ist die Zeile, die du animieren möchtest
  
    if (!originalLine) return;
  
    // Klonen der Zeile, um die Animation anzuwenden
    const clone = originalLine.cloneNode(true);
    clone.classList.add("animate-helloUser");
    document.querySelector(".notMain").appendChild(clone);
  
    // Optional: editorContainer ausblenden
    const editorContainer = document.querySelector(".vsc_editor-container");
    if (editorContainer) {
      editorContainer.classList.add("vsc_fade-out");  // Versteckt den Editor
    }
  
    // Sobald die Animation abgeschlossen ist, zeigen wir TwoBoxSetup an
    clone.addEventListener("animationend", () => {
      // TwoBoxSetup sichtbar machen
      document.querySelector(".TwoBoxSetup").classList.add("show");
    }, { once: true });
  }