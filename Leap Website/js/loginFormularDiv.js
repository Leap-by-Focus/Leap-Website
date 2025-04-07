document.querySelector('.loginButton').addEventListener('click', function() {
    const loginFormularDiv = document.querySelector('.loginFormularDiv');
    const registerFormularDiv = document.querySelector('.registerFormularDiv');

    // Wenn das Login-Formular sichtbar ist, schließen
    if (loginFormularDiv.style.opacity === '1') {
        loginFormularDiv.style.opacity = '0';
        loginFormularDiv.style.visibility = 'hidden';
        loginFormularDiv.style.transform = 'translateY(-20px)';
        loginFormularDiv.style.backgroundColor = 'transparent';
    } else {
        // Wenn das Login-Formular unsichtbar ist, anzeigen
        loginFormularDiv.style.opacity = '1';
        loginFormularDiv.style.visibility = 'visible';
        loginFormularDiv.style.transform = 'translateY(0)';
        loginFormularDiv.style.backgroundColor = '#444'; // Hintergrundfarbe
    }

    // Wenn das Register-Formular sichtbar ist, schließen
    if (registerFormularDiv.style.opacity === '1') {
        registerFormularDiv.style.opacity = '0';
        registerFormularDiv.style.visibility = 'hidden';
        registerFormularDiv.style.transform = 'translateY(-20px)';
        registerFormularDiv.style.backgroundColor = 'transparent';
    }
});

document.querySelector('.registerButton').addEventListener('click', function() {
    const loginFormularDiv = document.querySelector('.loginFormularDiv');
    const registerFormularDiv = document.querySelector('.registerFormularDiv');

    // Wenn das Register-Formular sichtbar ist, schließen
    if (registerFormularDiv.style.opacity === '1') {
        registerFormularDiv.style.opacity = '0';
        registerFormularDiv.style.visibility = 'hidden';
        registerFormularDiv.style.transform = 'translateY(-20px)';
        registerFormularDiv.style.backgroundColor = 'transparent';
    } else {
        // Wenn das Register-Formular unsichtbar ist, anzeigen
        registerFormularDiv.style.opacity = '1';
        registerFormularDiv.style.visibility = 'visible';
        registerFormularDiv.style.transform = 'translateY(0)';
        registerFormularDiv.style.backgroundColor = '#444'; // Hintergrundfarbe
    }

    // Wenn das Login-Formular sichtbar ist, schließen
    if (loginFormularDiv.style.opacity === '1') {
        loginFormularDiv.style.opacity = '0';
        loginFormularDiv.style.visibility = 'hidden';
        loginFormularDiv.style.transform = 'translateY(-20px)';
        loginFormularDiv.style.backgroundColor = 'transparent';
    }
});