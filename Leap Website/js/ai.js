(() => {
  const box = document.getElementById("messageBox");
  const input = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendMessage");
  const imageInput = document.getElementById("imageUpload");

  // während des lokalen Tests: hart auf :8000 setzen
  const API_BASE = "http://127.0.0.1:8000";

  // ---- Helpers --------------------------------------------------------
  const esc = (s = "") =>
    s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const escAttr = (s = "") => String(s).replace(/"/g, "&quot;");

  // Rendert normalen Text sicher, lässt aber Markdown-Links als <a> durch
  function renderTextWithLinksSafe(text = "") {
    const re = /\[([^\]]+)\]\(([^)]+)\)/g; // [text](url)
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      out += esc(text.slice(last, m.index)); // Teil vor dem Link
      const linkText = esc(m[1]);
      const href = escAttr(m[2]);
      out += `<a href="${href}" target="_self" rel="noopener">${linkText}</a>`;
      last = m.index + m[0].length;
    }
    out += esc(text.slice(last));
    return out;
  }

  // Zerlegt Antwort in Text-/Codeblöcke und rendert sie sicher
  function renderAnswerHTML(raw = "") {
    // Codeblöcke mit ```
    const reFence = /```([\s\S]*?)```/g;
    let html = "";
    let last = 0;
    let m;

    while ((m = reFence.exec(raw)) !== null) {
      const before = raw.slice(last, m.index);
      html += renderTextWithLinksSafe(before);
      const code = esc(m[1]);
      html += `<pre><code>${code}</code></pre>`;
      last = m.index + m[0].length;
    }
    html += renderTextWithLinksSafe(raw.slice(last));
    return html;
  }

  const addMsg = (html, cls = "ai-message") => {
    const el = document.createElement("div");
    el.className = `message ${cls}`;
    el.innerHTML = html;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  };

  const setTyping = on => {
    let t = document.getElementById("typing");
    if (on && !t) {
      t = document.createElement("div");
      t.id = "typing";
      t.className = "message ai-message typing";
      t.innerHTML = "<span class='dot'></span><span class='dot'></span><span class='dot'></span>";
      box.appendChild(t);
    } else if (!on && t) t.remove();
    box.scrollTop = box.scrollHeight;
  };

  // ---- Sendelogik -----------------------------------------------------
  async function send() {
    const text = input.value.trim();
    const file = imageInput.files?.[0] || null;
    if (!text && !file) return;

    // user bubble
    let userHTML = text ? esc(text) : "";
    if (file) {
      const url = URL.createObjectURL(file);
      userHTML += (userHTML ? "<br/>" : "") + `<div class="image-message"><img src="${url}" alt="Upload" /></div>`;
    }
    addMsg(userHTML || "[Bild gesendet]", "user-message");
    input.value = "";
    imageInput.value = "";

    // API
    setTyping(true);
    sendBtn.disabled = true;
    try {
      const form = new FormData();
      if (text) form.append("text", text);
      if (file) form.append("image", file, file.name);

      const resp = await fetch(`${API_BASE}/api/chat`, { method: "POST", body: form });
      if (!resp.ok) {
        const err = await resp.text().catch(() => String(resp.status));
        addMsg(`<b>Fehler:</b> ${esc(err)}`);
        return;
      }
      const data = await resp.json();

      const html = renderAnswerHTML(String(data.answer || ""));
      addMsg(html, "ai-message");
    } catch (e) {
      addMsg(`<b>Netzwerkfehler:</b> ${esc(String(e))}`);
    } finally {
      setTyping(false);
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  addMsg("Hi! Ich bin <b>Leap&nbsp;AI</b>. Frag mich was — z. B. „Wo finde ich die Dokumentation?“", "ai-message");
})();