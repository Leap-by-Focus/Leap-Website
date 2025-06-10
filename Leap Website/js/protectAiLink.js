// protectAiLink.js
(() => {
  // erst nach DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const aiLink = document.getElementById('link-ai');
    if (!aiLink) return;

    aiLink.addEventListener('click', e => {
      e.preventDefault(); // Browser-Bouncer unterbinden

      // Prüfe Firebase-Auth-Status
      const user = firebase.auth().currentUser;
      if (user) {
        // eingeloggter User → Navigation
        const target = aiLink.dataset.href;
        window.location.href = target;
      } else {
        // Gast → Warnung
        alert('Du bist nicht angemeldet');
      }
    });
  });
})();