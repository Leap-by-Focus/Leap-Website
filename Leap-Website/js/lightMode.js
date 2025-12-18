  const modeToggle = document.getElementById('modeToggle');

  modeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');

    // Im LocalStorage speichern
    if (document.body.classList.contains('light-mode')) {
      localStorage.setItem('theme', 'light');
    } else {
      localStorage.setItem('theme', 'dark');
    }
  });

  // Beim Laden Theme wiederherstellen
  window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
    }
  });
