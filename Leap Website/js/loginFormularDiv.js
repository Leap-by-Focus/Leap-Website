(function() {
  const body = document.body;
  const loginBtn = document.querySelector('.loginButton');
  const registerBtn = document.querySelector('.registerButton');
  const forgotLink = document.getElementById('forgotLink');
  const backToLogin = document.getElementById('backToLogin');

  // Panels
  const loginPanel = document.getElementById('loginFormular');
  const registerPanel = document.querySelector('.registerFormularDiv');
  const resetPanel = document.getElementById('resetFormular');

  // Hilfsfunktionen
  function hideAll() {
    loginPanel.classList.remove('open');
    registerPanel.classList.remove('open');
    resetPanel.classList.remove('open');
  }

  function show(panel) {
    hideAll();
    panel.classList.add('open');
  }

  // Events
  loginBtn.addEventListener('click', () => {
    if (loginPanel.classList.contains('open')) {
      hideAll();
    } else {
      show(loginPanel);
    }
  });

  registerBtn.addEventListener('click', () => {
    if (registerPanel.classList.contains('open')) {
      hideAll();
    } else {
      show(registerPanel);
    }
  });

  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    show(resetPanel);
  });

  backToLogin.addEventListener('click', () => {
    show(loginPanel);
  });

  // ESC-Taste schließt alle Panels
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAll();
    }
  });

  // Klick außerhalb schließt alle Panels
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (
      !loginPanel.contains(target) &&
      !registerPanel.contains(target) &&
      !resetPanel.contains(target) &&
      !loginBtn.contains(target) &&
      !registerBtn.contains(target) &&
      !forgotLink.contains(target)
    ) {
      hideAll();
    }
  });
})();