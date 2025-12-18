document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("expandButton");
  const expanded = document.getElementById("expandedContent");
  const label = btn ? btn.querySelector(".buttonLabel") : null;

  if (!btn || !expanded || !label) {
    console.warn("[whoAreWe] expandButton / expandedContent / buttonLabel nicht gefunden.");
    return;
  }

  // Anfangszustand – Inhalt verstecken (falls CSS/HTML hidden nicht reicht)
  expanded.hidden = true;
  expanded.style.display = "none";

  const open = () => {
    btn.classList.add("expanded");              // triggert deine Button-Animation
    btn.setAttribute("aria-expanded", "true");
    label.textContent = "Schließen";

    // Inhalt sichtbar (matcht deine CSS-Logik)
    expanded.hidden = false;
    expanded.style.display = "flex";

    // optional: Scroll lock
    // document.body.style.overflow = "hidden";
  };

  const close = () => {
    btn.classList.remove("expanded");
    btn.setAttribute("aria-expanded", "false");
    label.textContent = "Weiter";

    expanded.style.display = "none";
    expanded.hidden = true;

    // optional: Scroll lock zurück
    // document.body.style.overflow = "";
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (btn.classList.contains("expanded")) {
      close();
    } else {
      open();
    }
  });

  // ESC schließt
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && btn.classList.contains("expanded")) {
      close();
    }
  });
});