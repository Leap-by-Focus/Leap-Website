// whoAreWeWelcome.js

document.addEventListener('DOMContentLoaded', () => {
  const startContainer = document.querySelector('.start');
  if (!startContainer) return;

  // Endzustand setzen: skaliere auf 100 % und setze opacity auf 1
  // → weil die CSS-Regel eine 10-s-Transition definiert,
  //    läuft der Zoom jetzt über 10 Sekunden.
  startContainer.style.transform = 'scale(1)';
  startContainer.style.opacity = '1';
});