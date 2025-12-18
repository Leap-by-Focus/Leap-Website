// /js/expandButton.js
document.addEventListener("DOMContentLoaded", () => {
  const btn   = document.getElementById("createBtn");
  const panel = document.getElementById("createPanel");
  if (!btn || !panel) return;

  const open = () => {
    btn.classList.add("expand");
    panel.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    btn.classList.remove("expand");
    panel.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  };

  const toggle = () => (panel.classList.contains("open") ? close() : open());

  // Haupt-Toggle
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  // ESC schließt
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });

  // Klick außerhalb schließt
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn && panel.classList.contains("open")) {
      close();
    }
  });

  // Für andere Module verfügbar machen:
  window.openCreatePanel  = open;
  window.closeCreatePanel = close;
});