
document.addEventListener("DOMContentLoaded", () => {
  const dz    = document.getElementById("imageDropZone");
  const input = document.getElementById("imageInput");
  const grid  = document.getElementById("imagePreviewGrid");

  if (!dz || !input || !grid) {
    console.warn("[images] Elemente nicht gefunden", { dz, input, grid });
    return;
  }

  let files = [];
  const MAX_FILES = 10;
  const MAX_SIZE  = 8 * 1024 * 1024; // 8MB

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
    // Debug: siehst du diese Log-Zeile?
    console.debug("[images] previews:", files.map(f => f.name));
  }

  function trimName(name){
    if (name.length <= 20) return name;
    const parts = name.split(/\.(?=[^\.]+$)/);
    const base = parts[0], ext = parts[1] ? "."+parts[1] : "";
    return base.slice(0,12) + "…" + ext;
  }

  function prettySize(bytes){
    if (bytes < 1024) return bytes + " B";
    const kb = bytes/1024; if (kb < 1024) return kb.toFixed(1) + " KB";
    return (kb/1024).toFixed(1) + " MB";
  }

  function addFiles(list){
    const arr = Array.from(list || []);
    for (const f of arr){
      if (!f.type?.startsWith("image/")) continue;
      if (f.size > MAX_SIZE) continue;
      if (files.length >= MAX_FILES) break;
      files.push(f);
    }
    renderPreviews();
  }

  // 1) Klick auf Zone oder Input
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", (e) => {
    addFiles(e.target.files);
    input.value = ""; // reset, damit gleiche Datei erneut geht
  });

  // 2) Drag & Drop (nur auf der Zone)
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
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  // 3) Global: verhinder file://-Öffnen beim Drag aufs Fenster
  ["dragover","drop"].forEach(ev =>
    window.addEventListener(ev, (e) => e.preventDefault(), false)
  );

  // Optional: extern abrufbar
  window.getSelectedImages = () => files.slice();
});
