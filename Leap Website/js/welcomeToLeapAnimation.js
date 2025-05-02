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
  
  function typeLine() {
    if (currentLine >= codeLines.length) return;
  
    const fullHTML = codeLines[currentLine];
    const container = document.createElement("div");
    container.innerHTML = "&nbsp;"; // placeholder für leere Zeilen
    codeBlock.appendChild(container);
  
    let plainText = fullHTML.replace(/<[^>]*>/g, ''); // Strip tags to get text length
    let i = 0;
  
    function typeChar() {
      if (i <= plainText.length) {
        // Update entire line by slicing HTML to i-th character in plain text
        const visibleText = plainText.slice(0, i);
        let htmlToShow = '';
        let count = 0;
  
        // Parse and rebuild HTML up to character i
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