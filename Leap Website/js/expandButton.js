document.addEventListener("DOMContentLoaded", () => {
  const btn   = document.getElementById("createBtn");
  if (!btn) return;

  // Panel einmal erzeugen, falls nicht im HTML vorhanden:
  let panel = document.querySelector(".create-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "create-panel";
    // optionaler Inhalt:
    panel.innerHTML = "";
    btn.parentElement.appendChild(panel);
  }

  let isOpen = false;
  let waiting = false; // blockt Doppelclick während Transition

  const open = () => {
    if (isOpen || waiting) return;
    waiting = true;
    btn.classList.add("expand");

    // Nach Ende der WIDTH-Transition Panel öffnen
    const onEnd = (e) => {
      if (e.propertyName !== "width") return;
      btn.removeEventListener("transitionend", onEnd);
      panel.classList.add("open");   // sofort, ohne Delay
      isOpen = true;
      // kleines Timeout, damit panel-Transition starten kann, bevor neue Aktionen erlaubt sind
      setTimeout(() => (waiting = false), 120);
    };
    btn.addEventListener("transitionend", onEnd);
  };

  const close = () => {
    if (!isOpen || waiting) return;
    waiting = true;
    // erst Panel schließen, dann nach Ende die Breite zurückfahren
    const onPanelEnd = (e) => {
      if (e.propertyName !== "transform") return;
      panel.removeEventListener("transitionend", onPanelEnd);
      btn.classList.remove("expand");
      // nach Button-Transition wieder frei
      const onBtnEnd = (ev) => {
        if (ev.propertyName !== "width") return;
        btn.removeEventListener("transitionend", onBtnEnd);
        isOpen = false;
        setTimeout(() => (waiting = false), 80);
      };
      btn.addEventListener("transitionend", onBtnEnd);
    };
    panel.classList.remove("open");
    panel.addEventListener("transitionend", onPanelEnd);
  };

  btn.addEventListener("click", () => (isOpen ? close() : open()));
});