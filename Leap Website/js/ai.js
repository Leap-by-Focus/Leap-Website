(() => {
  const box = document.getElementById("messageBox");
  const input = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendMessage");
  const imageInput = document.getElementById("imageUpload");

  // während des lokalen Tests: hart auf :8000 setzen
  const API_BASE = "http://127.0.0.1:8000";

  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const addMsg = (html, cls="ai-message") => {
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
        const err = await resp.text().catch(()=> String(resp.status));
        addMsg(`<b>Fehler:</b> ${esc(err)}`);
        return;
      }
      const data = await resp.json();

      let body = esc(data.answer || "");
      if (body.includes("```")) {
        body = body.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${esc(code)}</code></pre>`);
      }
      if (Array.isArray(data.doc_refs) && data.doc_refs.length) {
        body += `<br/><b>Relevante Seiten:</b><ul>${
          data.doc_refs.slice(0,5).map(d => `<li>${esc(d.title)} — <code>${esc(d.path)}</code></li>`).join("")
        }</ul>`;
      }
      addMsg(body, "ai-message");
    } catch (e) {
      addMsg(`<b>Netzwerkfehler:</b> ${esc(String(e))}`);
    } finally {
      setTyping(false);
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

  addMsg("Hi! Ich bin <b>Leap&nbsp;AI</b>. Frag mich was — z. B. „Wo finde ich die Dokumentation?“", "ai-message");
})();