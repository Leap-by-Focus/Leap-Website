(() => {
  // ======================================================
  // DOM Refs (robust)
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

  // ======================================================
  // Config
  // ======================================================
  const API_BASE   = "http://127.0.0.1:8000";
  const SESSION_ID =
    (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : "web-" + Math.random().toString(36).slice(2);

  // ======================================================
  // Utils
  // ======================================================
  const esc = (s = "") =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const escAttr = (s = "") => String(s).replace(/"/g, "&quot;");

  // ======================================================
  // HTML GENERATOR (Mit Mac-Style Terminals)
  // ======================================================
  function renderAnswerHTML(raw) {
    if (!raw) return "";

    // 1. SANITIZER: Repariert kaputten AI-Output
    let cleanRaw = raw.replace(/```leap(?=[^\s])/gi, "```leap\n");
    cleanRaw = cleanRaw.replace(/```(?=[^a-z\n\s])/gi, "```\n");

    // 2. Splitten
    const parts = cleanRaw.split("```");
    let html = "";

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];

      // --- TEXT ---
      if (i % 2 === 0) {
        part = part.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
        part = part.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        part = part.replace(/^###\s*(.*$)/gm, "<h3>$1</h3>");
        part = part.replace(/^[\*\-]\s+(.*$)/gm, "<li>$1</li>");
        part = part.replace(/\n/g, "<br>");
        html += part;
      } 
      // --- CODE ---
      else {
        let firstBreak = part.search(/[\n\s]/);
        let lang = "CODE";
        let codeContent = part;

        if (firstBreak > -1 && firstBreak < 20) {
           const potentialLang = part.substring(0, firstBreak).trim();
           if (!potentialLang.includes("=") && !potentialLang.includes("[")) {
             lang = potentialLang;
             codeContent = part.substring(firstBreak + 1);
           }
        }

        // Label Logik
        let isLeap = false;
        if (lang.toLowerCase().includes("leap")) {
            lang = "LEAP";
            isLeap = true; // Flag für CSS Farbe
        } else if (lang === ".lp") {
            lang = "LEAP";
            isLeap = true;
        }

        // Code Escapen & Trimmen
        codeContent = codeContent.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
        codeContent = codeContent.trim();

        // ✨ HIER IST DAS NEUE DESIGN: Mac Dots + Label
        html += `<div class="code-wrapper">
                   <div class="code-header">
                     <div class="window-controls">
                       <span class="dot red"></span>
                       <span class="dot yellow"></span>
                       <span class="dot green"></span>
                     </div>
                     <span class="lang-label ${isLeap ? 'leap' : ''}">${lang.toUpperCase()}</span>
                   </div>
                   <pre><code>${codeContent}</code></pre>
                 </div>`;
      }
    }
    return html;
  }

  // ======================================================
  // Chat UI helpers
  // ======================================================
  function addBubble({ html, who = "ai", includeTime = true, imageUrl = null }) {
    if (!box) return;
    const wrap = document.createElement("div");
    const legacy = who === "user" ? "message user-message" : "message ai-message";
    const modern = who === "user" ? "msg user" : "msg ai";
    wrap.className = `${legacy} ${modern}`;

    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    let bubbleHTML = `<div class="bubble">${html || ""}</div>`;
    if (imageUrl) {
      bubbleHTML = `<div class="bubble">${html ? html + "<br/>" : ""}<div class="image-message"><img src="${imageUrl}" alt="Upload" /></div></div>`;
    }

    wrap.innerHTML =
      bubbleHTML + (includeTime ? `<div class="meta"><span class="time">${time}</span></div>` : "");

    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
  }

  function setTyping(on) {
    if (!box) return;
    let t = document.getElementById("typing");
    if (on && !t) {
      t = document.createElement("div");
      t.className = "message ai-message typing msg ai";
      t.id = "typing";
      t.innerHTML =
        "<div class='bubble'><span class='dot'></span><span class='dot'></span><span class='dot'></span></div>";
      box.appendChild(t);
    } else if (!on && t) {
      t.remove();
    }
    box.scrollTop = box.scrollHeight;
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
  // Suggestions
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
  // HAUPTFUNKTION: Senden
  // ======================================================
  async function send() {
    if (!input || !sendBtn) return;

    const text = input.value.trim();
    const file = imageInput?.files?.[0] || null;
    if (!text && !file) return;

    // UI SPERREN
    input.disabled = true;
    sendBtn.disabled = true;
    if (imageInput) imageInput.disabled = true;

    // User Echo
    const userTextHTML = text ? esc(text).replace(/\n/g, "<br>") : "";
    const objectUrl = file ? URL.createObjectURL(file) : null;

    addBubble({
      html: userTextHTML || (file ? "📷 Bild gesendet" : ""),
      who: "user",
      imageUrl: objectUrl,
    });

    // Reset Input
    input.value = "";
    autosize();
    adjustInputFont();
    if (imageInput) imageInput.value = "";
    renderPreview(null);

    // API Call Setup
    setTyping(true);
    setSuggestionsThinking(true);
    setSuggestionsLoading(true);

    try {
      const form = new FormData();
      if (text) form.append("text", text);
      if (file) form.append("image", file, file.name);

      form.append("useLeapContext", "true");
      form.append("sessionId", SESSION_ID);

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

      // Antwort anzeigen
      const html = renderAnswerHTML(String(data.answer || ""));
      addBubble({ html, who: "ai" });

      // Suggestions
      const sugg = (Array.isArray(data.suggestions) && data.suggestions.length)
        ? data.suggestions
        : fallbackSuggestions(text, data.answer);
      renderSuggestions(sugg);

    } catch (e) {
      addBubble({ html: `<b>Netzwerkfehler:</b> ${esc(String(e))}`, who: "ai" });
      renderSuggestions(fallbackSuggestions(text, ""));
    } finally {
      // UI FREIGEBEN
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
  // Events
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

    setTimeout(() => {
      autosize();
      adjustInputFont();
      updateCounterAndSendState();
    }, 0);
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

  if (clearBtn) clearBtn.addEventListener("click", () => (box ? (box.innerHTML = "") : null));
  if (exportBtn)
    exportBtn.addEventListener("click", () => {
      if (!box) return;
      const lines = [...box.querySelectorAll(".msg,.message")].map((m) => {
        const who = m.classList.contains("user") || m.classList.contains("user-message") ? "User" : "AI";
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

  // Begrüßung
  addBubble({
    html: "Hi! Ich bin <b>Leap&nbsp;AI</b>. Frag mich was — z. B. „Wo finde ich die Dokumentation?“",
    who: "ai",
    includeTime: true,
  });
  renderSuggestions([
    "Erste Schritte mit Leap",
    "Erkläre mir eine Leap-Methode",
    "Analysiere meinen Code-Screenshot"
  ]);
})();