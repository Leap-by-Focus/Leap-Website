import { auth } from "./js/leap-auth.js"; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

(() => {
  let authenticatedUser = null;
  let authChecked = false;

  // Wir hören aktiv auf den Auth-Status
  onAuthStateChanged(auth, (user) => {
    authenticatedUser = user;
    authChecked = true;
    console.log("Auth-Status aktualisiert:", user ? "Eingeloggt" : "Ausgeloggt");
  });

  const configs = [
    { id: 'whoarewe-btn', dx: '-100vw', dy: '-100vh' },
    { id: 'docs-btn',       dx: '-100vw', dy: '100vh'   },
    { id: 'forum-btn',      dx: '100vw',  dy: '-100vh'  },
    { id: 'link-ai',        dx: '100vw',  dy: '100vh', requiresAuth: true }
  ];

  configs.forEach(({ id, dx, dy, requiresAuth }) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', e => {
      e.preventDefault();

      // Falls Firebase noch prüft, kurz warten oder ignorieren
      if (!authChecked) {
          console.log("Warte auf Firebase...");
          return;
      }

      // Die harte Prüfung
      if (requiresAuth && !authenticatedUser) {
        const loginPanel = document.getElementById('loginFormular');
        if (loginPanel) {
          loginPanel.classList.add('open');
        } else {
          alert('Bitte melde dich an.');
        }
        return; 
      }

      // Animation starten (nur wenn eingeloggt oder keine Auth nötig)
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      const anim = document.body.animate([
        { transform: 'translate(0, 0)',         opacity: 1 },
        { transform: `translate(${dx}, ${dy})`, opacity: 0 }
      ], {
        duration: 600,
        easing: 'ease-in-out',
        fill: 'forwards'
      });

      anim.onfinish = () => {
        window.location.href = btn.href;
      };
    });
  });

  window.addEventListener('pageshow', () => {
    document.body.getAnimations().forEach(a => a.cancel());
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
})();