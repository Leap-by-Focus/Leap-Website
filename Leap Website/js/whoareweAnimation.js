// oben in whoAreWeAnimation.js
const codeLines = [
    '<span class="import">import</span> <span class="namespace">Leap.Core</span>',
    '<span class="import">import</span> <span class="namespace">Leap.Text</span>',
    '',
    '<span class="keyword">var</span> <span class="variable">whoAreWe</span> <span class="operator">=</span> <span class="string">"Who are we?"</span>',
    '',
    '<span class="namespace">Leap.<span class="method">Write</span></span>',
    '<span class="bracket">(</span>',
    '<span class="variable">    whoAreWe</span>',
    '<span class="bracket">)</span>'
  ];

  let currentLine = 0;
  let animationStarted = false;
  const codeBlock = document.getElementById("typedCode");
  
  function typeLine() {
    if (currentLine >= codeLines.length) {
      triggerHelloUserAnimation();
      return;
    }
    const fullHTML = codeLines[currentLine];
    const container = document.createElement("div");
    container.innerHTML = "&nbsp;";
    codeBlock.appendChild(container);
  
    const plain = fullHTML.replace(/<[^>]*>/g, '');
    let i = 0;
    (function typeChar() {
      if (i <= plain.length) {
        let html = '', count = 0;
        fullHTML.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
          if (tag) html += tag;
          else {
            const slice = text.slice(0, Math.max(0, Math.min(i - count, text.length)));
            html += slice;
            count += text.length;
          }
        });
        container.innerHTML = html || "&nbsp;";
        i++;
        setTimeout(typeChar, 25);
      } else {
        currentLine++;
        setTimeout(typeLine, 200);
      }
    })();
  }
  
  function triggerHelloUserAnimation() {
    const lineWrapper = document.createElement("div");
    lineWrapper.classList.add("animate-helloUser");
    lineWrapper.innerHTML =
      '<span class="keyword">var</span> <span class="variable">helloUser</span> ' +
      '<span class="operator">=</span> <span class="string">"Who are we?"</span>';
    codeBlock.appendChild(lineWrapper);
    lineWrapper.style.animation = "moveAndGrow 2s forwards";
  
    lineWrapper.addEventListener("animationend", () => {
      lineWrapper.style.animation = "moveToCenter 2s forwards";
    }, { once: true });
  }
  
  // Statt auf Scroll zu warten, starten wir direkt bei DOMContentLoaded:
  window.addEventListener("DOMContentLoaded", () => {
    typeLine();
  });