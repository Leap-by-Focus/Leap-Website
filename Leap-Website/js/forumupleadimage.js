// /js/forumuploadimage.js
console.log("[images] forumuploadimage.js geladen");        //DEV


document.addEventListener("DOMContentLoaded", () => {
  const dz    = document.getElementById("imageDropZone");
  const input = document.getElementById("imageInput");
  const grid  = document.getElementById("imagePreviewGrid");

  if (!dz || !input || !grid) {
    console.warn("[images] Elemente nicht gefunden", { dz, input, grid });
    return;
  }

  console.log("[images] Dropzone bereit");

  // Fehlerbox erstellen (falls nicht da)
  let errorBox = dz.nextElementSibling;
  if (!errorBox || !errorBox.classList?.contains("image-error")) {
    errorBox = document.createElement("div");
    errorBox.className = "image-error";
    errorBox.style.cssText = "color:#f66; font:12px monospace; margin-top:6px;";
    dz.insertAdjacentElement("afterend", errorBox);
  }
  const showError = (msg) => (errorBox.textContent = msg || "");

  let files = [];
  const MAX_FILES = 10;
  const MAX_SIZE  = 25 * 1024 * 1024; // 25 MB

  function renderPreviews(){
    grid.innerHTML = "";
    files.forEach((file, idx) => {
      const url = URL.createObjectURL(file);

      const item = document.createElement("div");
      item.className = "preview-item";

      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;

      const meta = document.createElement("div");
      meta.className = "preview-meta";
      meta.textContent = `${trimName(file.name)} • ${prettySize(file.size)}`;

      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.type = "button";
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        files.splice(idx, 1);
        renderPreviews();
        URL.revokeObjectURL(url);
      });

      item.appendChild(img);
      item.appendChild(btn);
      item.appendChild(meta);
      grid.appendChild(item);
    });
    console.debug("[images] previews:", files.map(f => f.name));
  }

  function trimName(name){
    if (!name) return "";
    if (name.length <= 24) return name;
    const [base, ext = ""] = name.split(/\.(?=[^\.]+$)/);
    return base.slice(0,16) + "…" + (ext ? "."+ext : "");
  }

  function prettySize(bytes){
    if (bytes < 1024) return bytes + " B";
    const kb = bytes/1024; if (kb < 1024) return kb.toFixed(1) + " KB";
    return (kb/1024).toFixed(1) + " MB";
  }

  function addFiles(list){
    const arr = Array.from(list || []);
    console.log("[images] addFiles() — erhalten:", arr.map(f => f.name));
    if (!arr.length) return;

    const rejected = [];
    for (const f of arr){
      if (!f.type?.startsWith("image/")) { rejected.push(`${f.name} (kein Bild)`); continue; }
      if (f.size > MAX_SIZE)              { rejected.push(`${f.name} (> 25MB)`); continue; }
      if (files.length >= MAX_FILES)      { rejected.push(`${f.name} (max. ${MAX_FILES})`); continue; }
      files.push(f);
    }
    showError(rejected.length ? `Nicht hinzugefügt: ${rejected.join(", ")}` : "");
    renderPreviews();
  }

  // Klick → Dateidialog
  dz.addEventListener("click", () => {
    console.log("[images] Zone klick → input.click()");
    input.click();
  });

  // Dateidialog Auswahl
  input.addEventListener("change", (e) => {
    const list = e.target.files;
    console.log("[images] input.change — Files:", list ? list.length : 0);
    addFiles(list);
    input.value = ""; // damit gleiche Datei erneut gewählt werden kann
  });

  // Drag & Drop
  ["dragenter","dragover"].forEach(ev =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add("dz-over");
    })
  );
  ["dragleave","drop"].forEach(ev =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.remove("dz-over");
    })
  );
  dz.addEventListener("drop", (e) => {
    console.log("[images] drop event — Files:", e.dataTransfer?.files?.length || 0);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  // Fensterweit: file:// verhindern
  ["dragover","drop"].forEach(ev =>
    window.addEventListener(ev, (e) => e.preventDefault(), false)
  );

  // API für createPost.js
  window.getSelectedImages = () => files.slice();
  window.clearSelectedImages = () => { files = []; renderPreviews(); showError(""); };
});