// animationMain.js
(() => {
  // Liest den Login-Status über localStorage (wird im firebaseauth.js gesetzt)
  function isLoggedIn() {
    return !!localStorage.getItem('loggedInUserId');
  }

  const configs = [
    { id: 'whoarewe-btn', dx: '-100vw', dy: '-100vh' },      // oben links
    { id: 'docs-btn',       dx: '-100vw', dy: '100vh'   },   // unten links
    { id: 'forum-btn',      dx: '100vw',  dy: '-100vh'  },   // oben rechts
    { id: 'link-ai',        dx: '100vw',  dy: '100vh', requiresAuth: true } // unten rechts + Auth
  ];

  configs.forEach(({ id, dx, dy, requiresAuth }) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', e => {
      // 1) Wenn Auth nötig und nicht eingeloggt ➞ Popup + Abbruch
      if (requiresAuth && !isLoggedIn()) {
        e.preventDefault();
        alert('Bitte melde dich an um dies zu benutzen...');
        return;
      }

      // 2) Sonst Animation wie gehabt
      e.preventDefault();
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.getAnimations().forEach(a => a.cancel());

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

  // 3) Beim Zurück-Navigieren alle Animationen abbrechen & Scroll wieder erlauben
  window.addEventListener('pageshow', () => {
    document.body.getAnimations().forEach(a => a.cancel());
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
})();