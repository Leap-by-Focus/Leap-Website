// ai.js

// ======================================================
// 🔥 FEEDBACK SYSTEM — Globale Variablen für Prompt/Response Tracking
// ======================================================
let _lastUserPrompt = "";
let _lastAiResponse = "";

(() => {
    // ======================================================
    // 0. GLOBALE FUNKTIONEN (Müssen für onclick verfügbar sein)
    // ======================================================
    
    /**
     * 👍👎 FEEDBACK SENDEN — Speichert User-Bewertung für Training
     */
    window.sendFeedback = async function(button, rating) {
        // Verhindere doppeltes Klicken
        const feedbackContainer = button.closest('.feedback-buttons');
        if (!feedbackContainer || feedbackContainer.classList.contains('submitted')) return;
        
        // Prompt/Response aus der Bubble extrahieren
        const bubble = button.closest('.msg.ai');
        const bubbleContent = bubble?.querySelector('.bubble')?.innerHTML || "";
        
        // Die letzte User-Nachricht finden (direkt davor)
        let userPrompt = _lastUserPrompt;
        const prevSibling = bubble?.previousElementSibling;
        if (prevSibling?.classList.contains('user')) {
            userPrompt = prevSibling.querySelector('.bubble')?.textContent?.trim() || _lastUserPrompt;
        }
        
        try {
            const resp = await fetch(`${window.AI_API_BASE || 'http://localhost:8081'}/api/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: userPrompt,
                    response: bubbleContent,
                    rating: rating  // "positive" oder "negative"
                })
            });
            
            if (resp.ok) {
                // Visuelles Feedback: Button markieren
                feedbackContainer.classList.add('submitted');
                button.classList.add('selected');
                
                // Anderen Button deaktivieren
                const otherBtn = feedbackContainer.querySelector(rating === 'positive' ? '.feedback-negative' : '.feedback-positive');
                if (otherBtn) otherBtn.disabled = true;
                button.disabled = true;
                
                // Danke-Nachricht
                const thanks = document.createElement('span');
                thanks.className = 'feedback-thanks';
                thanks.textContent = ' Danke!';
                feedbackContainer.appendChild(thanks);
            }
        } catch (err) {
            console.error('Feedback Error:', err);
        }
    };
    
    /**
     * 🔥 Kopiervorgang für den Copy-Button
     */
    window.copyCode = function(button) {
        const wrapper = button.closest('.code-wrapper');
        const codeElement = wrapper.querySelector('pre code') || wrapper.querySelector('pre');
        
        if (!codeElement) return;
  
        const textToCopy = codeElement.innerText; 
  
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalContent = button.innerHTML;
            button.innerHTML = `<span class="copy-icon">✅</span>`; // Kurzzeichen
            button.classList.add('copied');
  
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            button.innerText = "Error ❌";
        });
    };

    /**
     * 🚀 LEAP CODE AUSFÜHREN (Neu fürs Ticket)
     */
    /**
     * 🚀 LEAP CODE AUSFÜHREN (Fixed URL + HTML Decode)
     */
    window.runLeapCode = async function(button) {
        const wrapper = button.closest('.code-wrapper');
        const codeElement = wrapper.querySelector('pre code') || wrapper.querySelector('pre');
        const consoleDiv = wrapper.querySelector('.console-output');

        if (!codeElement || !consoleDiv) return;

        // 🔥 FIX: innerText holen und HTML-Entities dekodieren
        let code = codeElement.innerText;
        
        // HTML-Entities manuell dekodieren (falls innerText sie nicht dekodiert hat)
        code = code
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&nbsp;/g, ' ');
        
        console.log("🔍 DEBUG - Code to run:", code); // Debug

        // UI Feedback: Laden
        const originalText = button.innerText;
        button.disabled = true;
        button.innerText = "⏳ ...";
        
        consoleDiv.style.display = "block";
        consoleDiv.className = "console-output loading";
        consoleDiv.innerText = "Sende an Interpreter...";

        try {
            // 🔥 FIX: Volle URL verwenden (http://localhost:8081/api/runLeap)
            // Das verhindert Fehler, wenn die HTML-Datei lokal geöffnet wurde.
            const response = await fetch('http://localhost:8081/api/runLeap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            });

            const data = await response.json();

            // Output anzeigen
            consoleDiv.innerText = "> " + data.output;

            // Styling je nach Erfolg/Fehler
            const outputLower = (data.output || "").toLowerCase();
            if (outputLower.includes("fehler") || outputLower.includes("error") || outputLower.includes("timeout")) {
                consoleDiv.className = "console-output error";
            } else {
                consoleDiv.className = "console-output success";
            }

        } catch (err) {
            consoleDiv.innerText = "🔥 Verbindungsfehler: " + err.message + "\n(Läuft der Server auf Port 8081?)";
            consoleDiv.className = "console-output error";
        } finally {
            // Button Reset
            button.disabled = false;
            button.innerText = originalText;
        }
    };
  
    // ======================================================
    // 1. DOM REF & CONFIG
    // ======================================================
    const box        = document.getElementById("messageBox");
    const input      = document.getElementById("userInput");
    const sendBtn    = document.getElementById("sendMessage");
    const imageInput = document.getElementById("imageUpload");
  
    const charCounter = document.getElementById("charCounter");
    const dropzone    = document.getElementById("dropzone");
    const filePreview = document.getElementById("filePreview");
    const clearBtn    = document.getElementById("clearChat");
    const exportBtn   = document.getElementById("exportChat");
    const suggWrap    = document.querySelector(".suggestions"); 
  
    const API_BASE    = "http://localhost:8081";
    const STORAGE_KEY = "leap_chat_history"; 
    
    const SESSION_ID = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "web-" + Math.random().toString(36).slice(2);
  
    // ======================================================
    // 2. PARSER & FORMATTER (Das Herzstück ❤️)
    // ======================================================
  
    /**
     * 🖼️ IMAGE COMPRESSOR
     */
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                
                img.onload = () => {
                    const MAX_SIZE = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error("Komprimierung fehlgeschlagen"));
                            return;
                        }
                        console.log(`📉 Bild optimiert: ${(file.size/1024).toFixed(1)}KB -> ${(blob.size/1024).toFixed(1)}KB`);
                        resolve(blob);
                    }, 'image/jpeg', 0.8);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    /**
     * 🛠️ GRID PARSER (Final Version)
     */
    function renderAnswerHTML(text) {
        if (!text) return "";
  
        // Regex: Sucht nach Code-Blöcken ```lang ... ```
        const regex = /```(\w*)?\s*([\s\S]*?)```/g;
        
        let html = "";
        let lastIndex = 0;
        let match;
        let hasCodeBlocks = false;
  
        while ((match = regex.exec(text)) !== null) {
            hasCodeBlocks = true;
            // 1. Text VOR dem Code
            const textPart = text.substring(lastIndex, match.index);
            const formattedText = formatText(textPart);
            
            // 2. Der Code-Block
            const lang = match[1] || ""; // Wenn leer, behandeln wir es evtl. auch als Leap
            const codeContent = match[2];
            const formattedCode = formatCodeBlock(lang, codeContent);
  
            // 3. Grid-Zeile erstellen
            if (formattedText.trim() || formattedCode.trim()) {
                html += `
                <div class="message-row">
                    <div class="row-text">${formattedText}</div>
                    <div class="row-code">${formattedCode}</div>
                </div>`;
                
                html += `<div class="row-separator"></div>`;
            }
  
            lastIndex = regex.lastIndex;
        }
  
        // 4. Restlicher Text
        const remainingText = text.substring(lastIndex);
        if (remainingText.trim()) {
            // 🔥 NEU: Prüfe ob der Text wie Leap-Code aussieht (ohne ``` Wrapper)
            const looksLikeCode = detectLeapCode(remainingText);
            
            if (looksLikeCode && !hasCodeBlocks) {
                // Wenn es wie Code aussieht und keine anderen Code-Blöcke da waren
                html += `
                <div class="message-row">
                    <div class="row-text"></div>
                    <div class="row-code">${formatCodeBlock('leap', remainingText.trim())}</div>
                </div>`;
            } else {
                html += `
                <div class="message-row full-width">
                    <div class="row-text">${formatText(remainingText)}</div>
                </div>`;
            }
        }
  
        return html;
    }
    
    /**
     * 🔍 Erkennt ob Text wie Leap-Code aussieht (auch ohne ``` Wrapper)
     * STRENGER: Nur wenn es WIRKLICH wie Code aussieht, nicht bei normalem Text
     */
    function detectLeapCode(text) {
        if (!text || text.length < 5) return false;
        
        const trimmed = text.trim();
        
        // Wenn es mehr als 50% Buchstaben ohne Sonderzeichen hat, ist es wahrscheinlich Text
        const words = trimmed.split(/\s+/);
        if (words.length > 10) return false; // Lange Sätze sind kein Code
        
        // Prüfe ob es wie normaler deutscher/englischer Text aussieht
        const looksLikeNaturalText = /^[A-ZÄÖÜ][a-zäöüß]+(\s+[a-zäöüßA-ZÄÖÜ]+)*[.!?]?$/i.test(trimmed);
        if (looksLikeNaturalText && !trimmed.includes('(') && !trimmed.includes(';')) {
            return false;
        }
        
        // STARKE Leap-Code-Patterns (muss mindestens eines haben)
        const strongPatterns = [
            /\bausgeben\s*\([^)]+\)\s*;/i,      // ausgeben("..."); mit Semikolon
            /\beingabe\s*\([^)]*\)/i,           // eingabe(...)
            /\bfür\s*\([^)]+\)\s*\{/i,          // für(...) {
            /\bfalls\s*\([^)]+\)\s*\{/i,        // falls(...) {
            /\bsolange\s*\([^)]+\)\s*\{/i,      // solange(...) {
            /\bwiederhole\s+\d+\s+mal\s*\{/i,   // wiederhole X mal {
            /^[a-zA-Z_]\w*\s*=\s*\d+\s*;/m,     // x = 10;
            /^[a-zA-Z_]\w*\s*=\s*"[^"]*"\s*;/m, // x = "text";
            /\bprint\s*\([^)]+\)\s*;/i          // print("..."); mit Semikolon
        ];
        
        // Mindestens EIN starkes Pattern muss matchen
        for (const pattern of strongPatterns) {
            if (pattern.test(trimmed)) {
                return true;
            }
        }
        
        return false;
    }
  
    /**
     * Baut den Code-Container mit Header, Copy-Button UND Run-Button
     */
    /**
     * Baut den Code-Container:
     * Links: Label (z.B. LEAP)
     * Rechts: Gruppe aus [RUN] und [COPY]
     */
    function formatCodeBlock(lang, code) {
        const lowerLang = lang.toLowerCase();
        
        // Leap erkennen
        const isLeap = lowerLang === 'leap' || lowerLang === 'leaps' || lowerLang === ''; 
        const langLabel = lang ? lang.toUpperCase() : 'LEAP';
        const langClass = isLeap ? 'leap' : '';

        // 🎨 Syntax Highlighting anwenden (nur für Leap)
        const highlightedCode = isLeap ? highlightLeapCode(code) : escapeHtml(code);

        // Run Button HTML (nur wenn Leap)
        const runBtnHTML = isLeap 
            ? `<button class="run-btn" onclick="runLeapCode(this)">▶ RUN</button>` 
            : '';
  
        return `
        <div class="code-wrapper">
            <div class="code-header">
                <div class="header-left">
                    <span class="lang-label ${langClass}">${langLabel}</span>
                </div>
                
                <div class="header-right">
                    ${runBtnHTML}
                    <button class="copy-btn" onclick="copyCode(this)" title="Code kopieren">
                        <span class="copy-icon">📋</span>
                    </button>
                </div>
            </div>
            <pre><code class="${isLeap ? 'language-leap' : ''}">${highlightedCode}</code></pre>
            <div class="console-output" style="display:none;"></div>
        </div>`;
    }
  
    /**
     * Formatiert normalen Text
     */
    function formatText(rawText) {
        if (!rawText) return "";
        let safeText = escapeHtml(rawText);
        
        safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        safeText = safeText.replace(/\*(.*?)\*/g, '<em>$1</em>');
        safeText = safeText.replace(/`(.*?)`/g, '<code>$1</code>');
  
        return `<span class="chat-text">${safeText.replace(/\n/g, "<br>")}</span>`;
    }
  
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
  
    const esc = (s) => escapeHtml(s || "");
    const escAttr = (s = "") => String(s).replace(/"/g, "&quot;");

    // ======================================================
    // 🎨 SYNTAX HIGHLIGHTING (Leap Code)
    // ======================================================
    
    /**
     * Highlightet Leap-Code mit Farben für Keywords, Strings, Zahlen, Kommentare
     */
    function highlightLeapCode(code) {
        // Leap Keywords (deutsch + englisch)
        const keywords = [
            'für', 'for', 'falls', 'if', 'sonst', 'else', 'solange', 'while',
            'wiederhole', 'repeat', 'ausgeben', 'print', 'eingabe', 'input',
            'return', 'funktion', 'function', 'wahr', 'true', 'falsch', 'false',
            'und', 'and', 'oder', 'or', 'nicht', 'not', 'break', 'continue',
            'liste', 'list', 'länge', 'length', 'hinzufügen', 'add', 'entfernen', 'remove'
        ];
        
        // Token-Typen in Reihenfolge der Priorität
        const tokenPatterns = [
            // Kommentare (// ...)
            { type: 'comment', regex: /(\/\/[^\n]*)/g },
            // Strings ("..." oder '...')
            { type: 'string', regex: /(&quot;[^&]*&quot;|&#039;[^&]*&#039;|"[^"]*"|'[^']*')/g },
            // Zahlen (Integer und Floats)
            { type: 'number', regex: /\b(\d+\.?\d*)\b/g },
            // Keywords
            { type: 'keyword', regex: new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi') },
            // Funktionsaufrufe (name gefolgt von Klammer)
            { type: 'function', regex: /\b([a-zA-ZäöüÄÖÜß_][a-zA-Z0-9äöüÄÖÜß_]*)\s*(?=\()/g },
            // Operatoren
            { type: 'operator', regex: /([+\-*/%=<>!&|]+)/g }
        ];
        
        // Escape HTML zuerst
        let escaped = escapeHtml(code);
        
        // Platzhalter-System um Überlappungen zu vermeiden
        const placeholders = [];
        let placeholderIndex = 0;
        
        const createPlaceholder = (type, content) => {
            const id = `__PLACEHOLDER_${placeholderIndex++}__`;
            placeholders.push({ id, type, content });
            return id;
        };
        
        // Kommentare zuerst (höchste Priorität)
        escaped = escaped.replace(tokenPatterns[0].regex, (match) => {
            return createPlaceholder('comment', match);
        });
        
        // Strings
        escaped = escaped.replace(tokenPatterns[1].regex, (match) => {
            return createPlaceholder('string', match);
        });
        
        // Zahlen (nur wenn nicht in Platzhalter)
        escaped = escaped.replace(tokenPatterns[2].regex, (match, num) => {
            if (match.includes('__PLACEHOLDER_')) return match;
            return createPlaceholder('number', num);
        });
        
        // Keywords
        escaped = escaped.replace(tokenPatterns[3].regex, (match) => {
            if (match.includes('__PLACEHOLDER_')) return match;
            return createPlaceholder('keyword', match);
        });
        
        // Funktionen
        escaped = escaped.replace(tokenPatterns[4].regex, (match, funcName) => {
            if (match.includes('__PLACEHOLDER_')) return match;
            return createPlaceholder('function', funcName);
        });
        
        // Operatoren
        escaped = escaped.replace(tokenPatterns[5].regex, (match) => {
            if (match.includes('__PLACEHOLDER_')) return match;
            return createPlaceholder('operator', match);
        });
        
        // Platzhalter durch Spans ersetzen
        placeholders.forEach(({ id, type, content }) => {
            escaped = escaped.replace(id, `<span class="hl-${type}">${content}</span>`);
        });
        
        return escaped;
    }
  
    // ======================================================
    // 3. CHAT UI LOGIK
    // ======================================================
  
    function saveChatHistory() {
        if (!box) return;
        const clone = box.cloneNode(true);
        const typingIndicator = clone.querySelector("#typing");
        if (typingIndicator) typingIndicator.remove();
        localStorage.setItem(STORAGE_KEY, clone.innerHTML);
    }
  
    function addBubble({ html, who = "ai", includeTime = true, imageUrl = null }) {
      if (!box) return;
      const wrap = document.createElement("div");
      const cssClasses = who === "user" ? "msg user" : "msg ai";
      wrap.className = cssClasses;

      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      let bubbleHTML = "";
      if (imageUrl) {
          bubbleHTML = `<div class="bubble">${html ? html + "<br/>" : ""}<div class="image-message"><img src="${imageUrl}" alt="Upload" /></div></div>`;
      } else {
          bubbleHTML = `<div class="bubble">${html || ""}</div>`;
      }

      // 🔥 FEEDBACK BUTTONS nur für echte AI-Antworten (nicht Fehlermeldungen/Status)
      let feedbackHTML = "";
      if (who === "ai" && includeTime && html && !html.includes("Fehler:") && !html.includes("⚙️")) {
          feedbackHTML = `
            <div class="feedback-buttons">
              <button type="button" class="feedback-btn feedback-positive" onclick="sendFeedback(this, 'positive')" title="Gute Antwort">👍</button>
              <button type="button" class="feedback-btn feedback-negative" onclick="sendFeedback(this, 'negative')" title="Schlechte Antwort">👎</button>
            </div>`;
          // Response für Feedback-System speichern
          _lastAiResponse = html;
      }
      
      // User-Prompt für Feedback-System speichern
      if (who === "user" && html) {
          _lastUserPrompt = html.replace(/<[^>]*>/g, '').trim();
      }

      wrap.innerHTML = bubbleHTML + (includeTime ? `<div class="meta"><span class="time">${time}</span>${feedbackHTML}</div>` : "");

      box.appendChild(wrap);
      box.scrollTop = box.scrollHeight;

      saveChatHistory();
    }
  
    function setTyping(on) {
      if (!box) return;
      let t = document.getElementById("typing");
      
      if (on) {
        if (t) return;
        t = document.createElement("div");
        t.className = "msg ai typing";
        t.id = "typing";
        t.innerHTML = `
          <div class="bubble">
             <div class="typing-indicator">
               <span class="typing-bar"></span>
               <span class="typing-bar"></span>
               <span class="typing-bar"></span>
               <span class="typing-bar"></span>
               <span class="typing-bar"></span>
             </div>
             <span class="typing-text">Leap denkt...</span>
          </div>
        `;
        box.appendChild(t);
        box.scrollTop = box.scrollHeight;
      } else {
        if (t) t.remove();
      }
    }

    function autosize() {
      if (!input) return;
      input.style.height = "auto";
      input.style.height = Math.min(180, input.scrollHeight) + "px";
    }
  
    function adjustInputFont() {
      if (!input) return;
      const len = input.value.length;
      input.classList.toggle("l2", len > 80 && len <= 160);
      input.classList.toggle("l3", len > 160);
    }
  
    function updateCounterAndSendState() {
      if (!sendBtn || !input) return;
      if (input.disabled) return;
  
      const len = input.value.trim().length;
      const hasFile = !!(imageInput && imageInput.files && imageInput.files.length);
      if (charCounter) charCounter.textContent = String(len);
      sendBtn.disabled = len === 0 && !hasFile;
    }
  
    function renderPreview(file) {
      if (!filePreview) return;
      if (!file) {
        filePreview.hidden = true;
        filePreview.innerHTML = "";
        return;
      }
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      filePreview.hidden = false;
      filePreview.innerHTML = `
        <span class="file-chip" title="${escAttr(file.name)}">
          📷 ${esc(file.name)} · ${sizeKb} KB
          <button type="button" id="removeFile" aria-label="Bild entfernen">✕</button>
        </span>
      `;
      const rm = filePreview.querySelector("#removeFile");
      if (rm) {
        rm.onclick = () => {
          if (imageInput) imageInput.value = "";
          renderPreview(null);
          updateCounterAndSendState();
        };
      }
    }
  
    // ======================================================
    // 4. SUGGESTIONS (Repariert & Sofort-Senden)
    // ======================================================
    
    // Findet das Element, egal ob class=".suggestions" oder id="suggestions"

    function fallbackSuggestions(userText = "", aiText = "") {
      const t = (userText || "").toLowerCase();
      
      // 1. Spezifische Fragen erkennen
      if (/^was ist\b|^what is\b|^erkl(ä|ae)re\b/.test(t)) {
        return ["Was ist eine Variable?", "Erkläre 'für' Schleifen", "Zeig mir ein Beispiel"];
      } 
      // 2. Programmier-Keywords
      else if (/schleife|loop|for|while/.test(t)) {
        return ["Schleife mit Bedingung", "Endlosschleife verhindern", "Code ausführen"];
      }
      else if (/fehler|error|problem/.test(t)) {
        return ["Typische Syntaxfehler", "Wie debugge ich?", "Hilfe bei Fehlermeldung"];
      }
      
      // 3. Standard (Fallback)
      return ["Zeig mir Code", "Wie mache ich eine Ausgabe?", "Was kann Leap?"];
    }
  
    function renderSuggestions(list = []) {
      if (!suggWrap) return; // Wenn Element fehlt, abbrechen
      if (!Array.isArray(list) || list.length === 0) return; 
  
      suggWrap.innerHTML = "";
      
      // Max 3 Vorschläge anzeigen
      list.slice(0, 3).forEach((label) => {
        const b = document.createElement("button");
        b.className = "suggestion";
        b.type = "button";
        b.textContent = label;
        
        // 🔥 FIX: Beim Klick sofort senden!
        b.addEventListener("click", () => {
          if (!input) return;
          
          input.value = label; // Text einfügen
          input.focus();
          
          // UI Updates
          autosize();
          if (typeof updateCounterAndSendState === "function") updateCounterAndSendState();
          
          // 🚀 SOFORT SENDEN
          if (typeof send === "function") send(); 
        });
        
        suggWrap.appendChild(b);
      });
    }
  
    function setSuggestionsThinking(on) {
      if (!suggWrap) return;
      suggWrap.classList.toggle("thinking", !!on);
      // Wenn er denkt, Buttons deaktivieren
      const btns = suggWrap.querySelectorAll("button");
      btns.forEach(b => b.disabled = !!on);
    }
  
    function setSuggestionsLoading(on) {
        // Optional: Lade-Animation für die Buttons selbst
        if (!suggWrap) return;
        if(on) suggWrap.classList.add("loading");
        else suggWrap.classList.remove("loading");
    }
  
    // ======================================================
    // 5. SEND FUNKTION
    // ======================================================
    async function send() {
        if (!input || !sendBtn) return;
    
        const text = input.value.trim();
        const file = imageInput?.files?.[0] || null;
        if (!text && !file) return;
    
        // Sperren
        input.disabled = true;
        sendBtn.disabled = true;
        if (imageInput) imageInput.disabled = true;
    
        // User Nachricht anzeigen
        const userTextHTML = text ? esc(text).replace(/\n/g, "<br>") : "";
        const objectUrl = file ? URL.createObjectURL(file) : null;
    
        addBubble({
          html: userTextHTML || (file ? "📷 Bild gesendet" : ""),
          who: "user",
          imageUrl: objectUrl,
        });
    
        // Reset Inputs
        input.value = "";
        autosize();
        adjustInputFont();
        if (imageInput) imageInput.value = "";
        renderPreview(null);
    
        // Loading Status
        setTyping(true);
        setSuggestionsThinking(true);
        setSuggestionsLoading(true);
    
        try {
          const form = new FormData();
          if (text) form.append("text", text);
  
          // 🔥 LOGIK: Bild optimieren vor dem Senden
          if (file) {
               addBubble({ html: "<i>⚙️ Optimiere Bild für Vision-Modell...</i>", who: "ai", includeTime: false });
               
               try {
                   const compressedBlob = await compressImage(file);
                   form.append("image", compressedBlob, "optimized.jpg");
  
                   if (box && box.lastChild && box.lastChild.innerText.includes("Optimiere")) {
                      box.lastChild.remove();
                   }
               } catch (err) {
                   console.error("Optimierung fehlgeschlagen, sende Original:", err);
                   form.append("image", file, file.name);
               }
          }
    
          form.append("useLeapContext", "true");
          form.append("sessionId", SESSION_ID);
    
          // Request
          const resp = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            body: form
          });
    
          if (!resp.ok) {
            const err = await resp.text().catch(() => String(resp.status));
            addBubble({ html: `<b>Fehler:</b> ${esc(err)}`, who: "ai" });
            renderSuggestions(fallbackSuggestions(text, ""));
            return;
          }
    
          const data = await resp.json();
          
          // Grid-Parser aufrufen
          const html = renderAnswerHTML(String(data.answer || ""));
          addBubble({ html, who: "ai" });
    
          const sugg = (Array.isArray(data.suggestions) && data.suggestions.length)
            ? data.suggestions
            : fallbackSuggestions(text, data.answer);
          renderSuggestions(sugg);
    
        } catch (e) {
          console.error("Fetch Error:", e);
          addBubble({ 
            html: `<b>Netzwerkfehler:</b> Der Server ist nicht erreichbar.<br>Prüfe ob 'node server.js' läuft!`, 
            who: "ai" 
          });
          renderSuggestions(fallbackSuggestions(text, ""));
        } finally {
          setTyping(false);
          setSuggestionsThinking(false);
          setSuggestionsLoading(false);
          
          input.disabled = false;
          sendBtn.disabled = false;
          if (imageInput) imageInput.disabled = false;
    
          setTimeout(() => {
            input.focus();
            autosize();
            updateCounterAndSendState();
          }, 50);
        }
      }
  
    // ======================================================
    // 6. EVENT LISTENER
    // ======================================================
    if (sendBtn) sendBtn.addEventListener("click", send);
  
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
  
      ["input", "change"].forEach((evt) =>
        input.addEventListener(evt, () => {
          autosize();
          adjustInputFont();
          updateCounterAndSendState();
          const hasText = input.value.trim().length > 0;
          setSuggestionsThinking(hasText);
        })
      );
    }
  
    if (imageInput) {
      imageInput.addEventListener("change", () => {
        renderPreview(imageInput.files?.[0] || null);
        updateCounterAndSendState();
      });
    }
  
    if (dropzone) {
      ["dragenter", "dragover"].forEach((evt) =>
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("dragover");
        })
      );
      ["dragleave", "drop"].forEach((evt) =>
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("dragover");
        })
      );
      dropzone.addEventListener("drop", (e) => {
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/") && imageInput) {
          const dt = new DataTransfer();
          dt.items.add(file);
          imageInput.files = dt.files;
          renderPreview(file);
          updateCounterAndSendState();
        }
      });
    }
  
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (!box) return;
      box.innerHTML = "";
      localStorage.removeItem(STORAGE_KEY);
      addBubble({
          html: "<i>Chatverlauf gelöscht. Alles auf Anfang! 🚀</i>",
          who: "ai",
          includeTime: true
      });
    });
  
    if (exportBtn)
      exportBtn.addEventListener("click", () => {
        if (!box) return;
        const lines = [...box.querySelectorAll(".msg")].map((m) => {
          const who = m.classList.contains("user") ? "User" : "AI";
          const content = m.querySelector(".bubble")?.innerText || m.innerText || "";
          return `[${who}] ${content.trim()}`;
        });
        const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "leap_chat.txt";
        a.click();
        URL.revokeObjectURL(url);
      });
  
    // ======================================================
    // 7. INIT
    // ======================================================
    const savedHistory = localStorage.getItem(STORAGE_KEY);
  
    if (savedHistory && savedHistory.trim().length > 0) {
      if (box) {
          box.innerHTML = savedHistory;
          const oldTyping = box.querySelectorAll("#typing");
          oldTyping.forEach(el => el.remove());
          setTimeout(() => { box.scrollTop = box.scrollHeight; }, 100);
      }
    } else {
      addBubble({
        html: "Hi! Ich bin <b>Leap&nbsp;AI</b>. Frag mich was — z. B. „Wie mache ich eine Schleife?“",
        who: "ai",
        includeTime: true,
      });
    }
  
    renderSuggestions([
      "Erste Schritte mit Leap",
      "Erkläre mir eine Schleife",
      "Zeig mir die Leap Syntax"
    ]);
  
    setTimeout(() => {
        autosize();
        updateCounterAndSendState();
    }, 100);
  
  })();