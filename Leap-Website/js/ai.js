(() => {
    // ======================================================
    // 0. GLOBALE FUNKTIONEN (Müssen für onclick verfügbar sein)
    // ======================================================
    
    /**
     * 🔥 Kopiervorgang für den Copy-Button im Terminal
     * Wir hängen das ans window-Objekt, damit das HTML-onclick es findet.
     */
    window.copyCode = function(button) {
        // 1. Den Code-Text finden
        const wrapper = button.closest('.code-wrapper');
        // Suche nach <code> oder fallback auf <pre>
        const codeElement = wrapper.querySelector('pre code') || wrapper.querySelector('pre');
        
        if (!codeElement) return;
  
        const textToCopy = codeElement.innerText; 
  
        // 2. In Zwischenablage schreiben
        navigator.clipboard.writeText(textToCopy).then(() => {
            // 3. Visuelles Feedback am Button
            const originalContent = button.innerHTML;
            button.innerHTML = `<span class="copy-icon">✅</span> Kopiert!`;
            button.classList.add('copied');
  
            // Nach 2 Sekunden zurücksetzen
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            button.innerText = "Error ❌";
        });
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
    
    // Einfache Session-ID
    const SESSION_ID = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "web-" + Math.random().toString(36).slice(2);
  
    // ======================================================
    // 2. PARSER & FORMATTER (Das Herzstück ❤️)
    // ======================================================
  

    /**
 * 🖼️ IMAGE COMPRESSOR
 * Skaliert Bilder auf max 1024px und komprimiert sie zu JPEG 80%.
 * Gibt ein Promise zurück, das mit dem optimierten Blob aufgelöst wird.
 */
function compressImage(file) {
    return new Promise((resolve, reject) => {
        // Falls kein Bild oder schon klein genug -> Original zurückgeben (optional)
        // Aber hier wollen wir Konsistenz (JPEG), also immer verarbeiten.
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                // 1. Neue Dimensionen berechnen (Max 1024px)
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

                // 2. Auf Canvas zeichnen
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 3. Als JPEG exportieren (0.8 = 80% Qualität)
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
     * Baut logische Paare: [ Erklärung (Links) | Code (Rechts) ]
     */
    function renderAnswerHTML(text) {
        if (!text) return "";
  
        // Regex: Sucht nach Code-Blöcken ```lang ... ```
        const regex = /```(\w*)?\s*([\s\S]*?)```/g;
        
        let html = "";
        let lastIndex = 0;
        let match;
  
        // Loop durch alle Code-Blöcke
        while ((match = regex.exec(text)) !== null) {
            // 1. Text VOR dem Code (die Erklärung)
            const textPart = text.substring(lastIndex, match.index);
            const formattedText = formatText(textPart);
            
            // 2. Der Code-Block selbst
            const lang = match[1] || "leap";
            const codeContent = match[2];
            const formattedCode = formatCodeBlock(lang, codeContent);
  
            // 3. Nur wenn Inhalt da ist, erstellen wir eine Grid-Zeile
            if (formattedText.trim() || formattedCode.trim()) {
                html += `
                <div class="message-row">
                    <div class="row-text">${formattedText}</div>
                    <div class="row-code">${formattedCode}</div>
                </div>`;
                
                // Trennlinie unter dem Paar (wird per CSS beim letzten Element ausgeblendet)
                html += `<div class="row-separator"></div>`;
            }
  
            lastIndex = regex.lastIndex;
        }
  
        // 4. Restlicher Text nach dem allerletzten Code (z.B. Fazit)
        const remainingText = text.substring(lastIndex);
        if (remainingText.trim()) {
            html += `
            <div class="message-row full-width">
                <div class="row-text">${formatText(remainingText)}</div>
            </div>`;
        }
  
        return html;
    }
  
    /**
     * Baut den Code-Container mit Header und Copy-Button
     */
    function formatCodeBlock(lang, code) {
        const safeCode = escapeHtml(code);
        const langClass = lang.toLowerCase() === 'leap' ? 'leap' : '';
  
        return `
        <div class="code-wrapper">
            <div class="code-header">
                <div class="header-left">
                    <span class="code-icon">Variant:</span>
                    <span class="lang-label ${langClass}">${lang.toUpperCase()}</span>
                </div>
                
                <button class="copy-btn" onclick="copyCode(this)">
                    <span class="copy-icon">📋</span> Kopieren
                </button>
            </div>
            <pre><code>${safeCode}</code></pre>
        </div>`;
    }
  
    /**
     * Formatiert normalen Text (Fett, Kursiv, Inline-Code)
     */
    function formatText(rawText) {
        if (!rawText) return "";
        
        // HTML-Sonderzeichen entschärfen
        let safeText = escapeHtml(rawText);
        
        // Markdown: **Fett**
        safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Markdown: *Kursiv*
        safeText = safeText.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Markdown: `Inline Code`
        safeText = safeText.replace(/`(.*?)`/g, '<code>$1</code>');
  
        // Zeilenumbrüche zu <br> (aber in einen span gewickelt)
        return `<span class="chat-text">${safeText.replace(/\n/g, "<br>")}</span>`;
    }
  
    // Hilfsfunktion: HTML Escaping (Sicherheit gegen XSS)
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
    // 3. CHAT UI LOGIK
    // ======================================================
  
// Speichert den Chat im Browser (ohne die Lade-Animation!)
  function saveChatHistory() {
    if (!box) return;
    
    // Trick: Wir kopieren die Box virtuell
    const clone = box.cloneNode(true);
    
    // Wir suchen und löschen den Typing-Indicator aus der Kopie
    const typingIndicator = clone.querySelector("#typing");
    if (typingIndicator) typingIndicator.remove();
    
    // Jetzt speichern wir nur den sauberen Chat
    localStorage.setItem(STORAGE_KEY, clone.innerHTML);
  }
  
    // Blase hinzufügen
    function addBubble({ html, who = "ai", includeTime = true, imageUrl = null }) {
      if (!box) return;
      const wrap = document.createElement("div");
      // Klassen für Styling
      const cssClasses = who === "user" ? "msg user" : "msg ai";
      wrap.className = cssClasses;
  
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  
      let bubbleHTML = "";
      if (imageUrl) {
          bubbleHTML = `<div class="bubble">${html ? html + "<br/>" : ""}<div class="image-message"><img src="${imageUrl}" alt="Upload" /></div></div>`;
      } else {
          bubbleHTML = `<div class="bubble">${html || ""}</div>`;
      }
  
      wrap.innerHTML = bubbleHTML + (includeTime ? `<div class="meta"><span class="time">${time}</span></div>` : "");
  
      box.appendChild(wrap);
      box.scrollTop = box.scrollHeight;
  
      saveChatHistory();
    }
  
// In js/ai.js - Ersetze setTyping hiermit:
function setTyping(on) {
  if (!box) return;
  let t = document.getElementById("typing");
  
  if (on) {
    if (t) return; // Schon da? Nichts tun.

    t = document.createElement("div");
    t.className = "msg ai typing"; // Wichtig: Klasse "typing" für CSS
    t.id = "typing";
    
    // HTML exakt passend zum CSS oben
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

// UI Helpers
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
    // 4. SUGGESTIONS
    // ======================================================
    function fallbackSuggestions(userText = "", aiText = "") {
      const t = (userText || "").toLowerCase();
      if (/^was ist\b|^what is\b|^erkl(ä|ae)re\b/.test(t)) {
        return ["Was ist OOP", "Erste Schritte", "Java vs C# Vergleich"];
      } else if (/^wie\b|^how\b|^schritt/.test(t)) {
        return ["Alternativer Ansatz", "Häufige Fehler", "Best Practices"];
      } else if (/java|python|leap|oop|klasse|objekt|array|funktion/.test(t)) {
        return ["Einfaches Codebeispiel", "Typische Use Cases", "Weiterführende Ressourcen"];
      }
      return ["Beispiel zeigen", "Vergleich erläutern", "Nächste Schritte"];
    }
  
    function renderSuggestions(list = []) {
      if (!suggWrap) return;
      if (!Array.isArray(list) || list.length === 0) return; 
  
      suggWrap.innerHTML = "";
      list.slice(0, 3).forEach((label) => {
        const b = document.createElement("button");
        b.className = "suggestion";
        b.type = "button";
        b.textContent = label;
        b.addEventListener("click", () => {
          if (!input) return;
          input.value = label;
          input.focus();
          autosize();
          adjustInputFont();
          updateCounterAndSendState();
        });
        suggWrap.appendChild(b);
      });
    }
  
    function setSuggestionsThinking(on) {
      if (!suggWrap) return;
      suggWrap.classList.toggle("thinking", !!on);
    }
  
    function setSuggestionsLoading(on) {
      if (!suggWrap) return;
      const btns = [...suggWrap.querySelectorAll(".suggestion")];
      if (on) {
        btns.forEach(btn => {
          btn.dataset.label = btn.textContent;
          btn.classList.add("loading");
        });
      } else {
        btns.forEach(btn => {
          if (btn.dataset.label) btn.textContent = btn.dataset.label;
          btn.classList.remove("loading");
          delete btn.dataset.label;
        });
      }
    }
  
    // ======================================================
    // 5. SEND FUNKTION
    // ======================================================
   // ======================================================
  // 6. SEND FUNKTION (Updated)
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
             // Kurzes Feedback für User
             addBubble({ html: "<i>⚙️ Optimiere Bild für Vision-Modell...</i>", who: "ai", includeTime: false });
             
             try {
                 const compressedBlob = await compressImage(file);
                 // Wir senden das optimierte JPEG
                 form.append("image", compressedBlob, "optimized.jpg");

                 // Entferne die "Optimiere..." Nachricht wieder
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
    
// Chat wiederherstellen
    const savedHistory = localStorage.getItem(STORAGE_KEY);
  
    if (savedHistory && savedHistory.trim().length > 0) {
      if (box) {
          box.innerHTML = savedHistory;
          
          // 🔥 FIX: Falls aus Versehen eine alte Animation gespeichert wurde -> Löschen!
          const oldTyping = box.querySelectorAll("#typing");
          oldTyping.forEach(el => el.remove());

          setTimeout(() => { box.scrollTop = box.scrollHeight; }, 100);
      }
    } else {
       // ... (Rest bleibt gleich)^
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