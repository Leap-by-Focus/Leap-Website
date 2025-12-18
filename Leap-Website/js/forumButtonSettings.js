// forumButtonSettings.js
(() => {
  // Warten bis DOM fertig (defer sollte reichen, aber safe ist safe)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    const gearWrapper = document.querySelector(".settings-button");
    const gearBtn     = gearWrapper?.querySelector(".gear-btn");
    const popup       = gearWrapper?.querySelector(".settings-popup");

    // Inputs
    const nameColorInput = document.getElementById("nameColor");
    const borderInput    = document.getElementById("borderGradient");
    const particleInput  = document.getElementById("particleColor");
    const bgSelect       = document.getElementById("backgroundSelect");
    const glowToggle     = document.getElementById("enableGlow");

    // Falls die Elemente fehlen (andere Seite), abbrechen
    if (!gearWrapper || !gearBtn || !popup ||
        !nameColorInput || !borderInput || !particleInput || !bgSelect || !glowToggle) {
      console.warn("[forumButtonSettings] Settings UI nicht komplett gefunden.");
      return;
    }

    // Popup öffnen/schließen
    gearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      gearWrapper.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!gearWrapper.contains(e.target)) gearWrapper.classList.remove("open");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") gearWrapper.classList.remove("open");
    });

    function applyTheme(bgMode) {
      const body = document.body;
      body.setAttribute("data-theme", bgMode);

      const root = document.documentElement;
      // Gradient-Bar Farben je nach Theme setzen
      if (bgMode === "dark") {
        root.style.setProperty("--bg", "#14272A");
        root.style.setProperty("--grad-top", "#14272A");
        root.style.setProperty("--grad-bottom", "#0c181a");
      } else if (bgMode === "light") {
        root.style.setProperty("--bg", "#f4f6f8");
        root.style.setProperty("--grad-top", "#f9fafb");
        root.style.setProperty("--grad-bottom", "#e9edf1");
      } else if (bgMode === "gradient") {
        // neutral graues Theme
        root.style.setProperty("--bg", "#e9ecf1");      // Seitenhintergrund
        root.style.setProperty("--grad-top", "#eef1f6"); // Gradient-Leiste sanft
        root.style.setProperty("--grad-bottom", "#dfe4ea");
      } else if (bgMode === "stars") {
        root.style.setProperty("--bg", "transparent"); // body nutzt radial in CSS
        root.style.setProperty("--grad-top", "#0c1217");
        root.style.setProperty("--grad-bottom", "#0a0f14");
      }
    }

    function applySettings() {
      const nameColor   = nameColorInput.value || "#50e9ba";
      const hoverBorder = borderInput.value    || "#148fac";
      const particle    = particleInput.value  || "#00e3b6";
      const bgMode      = bgSelect.value       || "dark";
      const glow        = !!glowToggle.checked;

      const root = document.documentElement;
      root.style.setProperty("--name-color", nameColor);
      root.style.setProperty("--hover-border-color", hoverBorder);
      root.style.setProperty("--particle-color", particle);

      applyTheme(bgMode);

      // Glow z. B. auf Namen anwenden
      const glowValue = glow ? `0 0 8px ${nameColor}` : "none";
      document.querySelectorAll(".CharacterName, .userinfo, .usernameDisplay, .post-author, .pm-reply-author")
        .forEach(el => el.style.textShadow = glowValue);

      // Partikel updaten (falls vorhanden)
      if (typeof window.updateParticles === "function") {
        window.updateParticles({ color: particle });
      }

      // Persistieren
      const settings = { nameColor, hoverBorder, particle, bgMode, glow };
      try { localStorage.setItem("appearance", JSON.stringify(settings)); } catch {}
    }

    // Wiederherstellen
    try {
      const saved = localStorage.getItem("appearance");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.nameColor) nameColorInput.value = s.nameColor;
        if (s.hoverBorder) borderInput.value = s.hoverBorder;
        if (s.particle) particleInput.value = s.particle;
        if (s.bgMode) bgSelect.value = s.bgMode;
        if (typeof s.glow === "boolean") glowToggle.checked = s.glow;
      }
    } catch {}

    // Live-Kopplung
    [nameColorInput, borderInput, particleInput, bgSelect, glowToggle]
      .forEach(el => el.addEventListener("input", applySettings));

    // Initial anwenden
    applySettings();
  }
})();