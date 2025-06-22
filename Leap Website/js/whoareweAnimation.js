// whoAreWeWelcome.js

function animateStart() {
  const startContainer = document.querySelector('.start');
  if (!startContainer) return;
  // erzwinge Reflow, damit Initialzustand sicher gesetzt ist
  startContainer.getBoundingClientRect();
  startContainer.style.transform = 'scale(1)';
  startContainer.style.opacity   = '1';
}

// „klassischer“ Erstanlauf
window.addEventListener('DOMContentLoaded', animateStart);

// Wiederherstellung aus dem Back-Forward-Cache
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    animateStart();
  }
});