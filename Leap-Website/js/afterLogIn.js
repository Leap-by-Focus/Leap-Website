window.addEventListener("DOMContentLoaded", () => {
  const userId = localStorage.getItem("loggedInUserId"); // Überprüfen, ob der Benutzer eingeloggt ist
  const logoutButton = document.querySelector('#logoutButton');
  const loginButton = document.querySelector('#loginButton');
  const registerButton = document.querySelector('#registerButton');

  // Wenn der Benutzer eingeloggt ist
  if (userId) {
    // Zeige den Logout-Button an
    document.querySelector('.userinfo').style.display = "block"; // Anzeigen des divs, das den Logout-Button enthält
    loginButton.style.display = "none"; // Verstecke den Login-Button
    registerButton.style.display = "none"; // Verstecke den Register-Button

    // Event Listener für den Logout-Button
    logoutButton.addEventListener('click', () => {
      // Hier setzt du den Logout-Prozess, z.B. löschen des Benutzers aus dem Local Storage
      localStorage.removeItem("loggedInUserId");

      // Anzeigen der Buttons zurücksetzen
      document.querySelector('.userinfo').style.display = "none"; // Verstecke den Logout-Button
      loginButton.style.display = "block"; // Zeige den Login-Button
      registerButton.style.display = "block"; // Zeige den Register-Button
    });
  } else {
    // Wenn der Benutzer nicht eingeloggt ist
    document.querySelector('.userinfo').style.display = "none"; // Verstecke den Logout-Button
    loginButton.style.display = "block"; // Zeige den Login-Button
    registerButton.style.display = "block"; // Zeige den Register-Button
  }

  // Event Listener für den Login-Button (dies könnte auch zu einer Login-Seite weiterleiten)
  loginButton.addEventListener('click', () => {
    // Logik für den Login-Prozess
    console.log("Login clicked");
    // Beispiel: Hier könntest du einen Redirect zu einer Login-Seite oder Modal einfügen
  });

  // Event Listener für den Register-Button (dies könnte auch zu einer Register-Seite weiterleiten)
  registerButton.addEventListener('click', () => {
    // Logik für den Registrierungsprozess
    console.log("Register clicked");
    // Beispiel: Hier könntest du einen Redirect zu einer Register-Seite oder Modal einfügen
  });
});