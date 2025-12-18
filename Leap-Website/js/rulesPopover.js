
(function () {
  const ready = (fn) =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", fn)
      : fn();

  ready(() => {
    const rulesWrap  = document.querySelector(".rules-button");
    if (!rulesWrap) return;

    const rulesBtn   = rulesWrap.querySelector(".rules-btn");
    const rulesPop   = rulesWrap.querySelector(".rules-popup");
    const rulesClose = rulesWrap.querySelector(".rules-close");

    function openRules() {
      rulesWrap.classList.add("open");
      rulesBtn.setAttribute("aria-expanded", "true");
      setTimeout(() => rulesPop && rulesPop.focus(), 0);
      document.addEventListener("click", onDocClick, true);
      document.addEventListener("keydown", onKeyDown, true);
    }
    function closeRules() {
      rulesWrap.classList.remove("open");
      rulesBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      rulesBtn.focus();
    }
    function toggleRules() {
      rulesWrap.classList.contains("open") ? closeRules() : openRules();
    }
    function onDocClick(e) {
      if (!rulesWrap.contains(e.target)) closeRules();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") closeRules();
      if (rulesWrap.classList.contains("open") && !rulesPop.contains(document.activeElement)) {
        rulesPop.focus();
      }
    }

    rulesBtn?.addEventListener("click", (e) => { e.stopPropagation(); toggleRules(); });
    rulesClose?.addEventListener("click", (e) => { e.stopPropagation(); closeRules(); });

    // Optional: Settings schließen, wenn Regeln geöffnet werden (und umgekehrt)
    const settingsWrap = document.querySelector(".settings-button");
    const settingsBtn  = settingsWrap?.querySelector(".gear-btn");
    function closeSettingsIfOpen() {
      if (settingsWrap?.classList.contains("open")) {
        settingsWrap.classList.remove("open");
        settingsBtn?.setAttribute("aria-expanded", "false");
      }
    }
    function closeRulesIfOpen() {
      if (rulesWrap?.classList.contains("open")) closeRules();
    }
    rulesBtn?.addEventListener("click", closeSettingsIfOpen);
    settingsBtn?.addEventListener("click", closeRulesIfOpen);
  });
})();
