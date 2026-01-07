// js/auth-ui-injector.js

const authComponentHTML = `
<div class="Main">
    <div class="loginDiv">
        <div class="loginButton" id="loginButton">Login</div>
        <div class="registerButton" id="registerButton">Register</div>

        <div class="loginFormularDiv" id="loginFormular">
            <form class="loginForm">
                <label for="logUsername">Benutzername:</label>
                <input type="text" id="logUsername" required>
                <label for="logPassword">Passwort:</label>
                <input type="password" id="logPassword" required>
                <button type="submit" class="submitButton" id="submitbuttonlogin">Anmelden</button>
                <div id="signInMessage" class="alert"></div>
            </form>
            <div class="reset-password-link">
                <a href="#" id="forgotLink">Passwort vergessen?</a>
            </div>
        </div>

        <div class="resetFormularDiv" id="resetFormular">
            <form class="loginForm" id="resetForm">
                <div id="phase-request">
                    <label for="resetEmail">E-Mail-Adresse:</label>
                    <input type="email" id="resetEmail" name="resetEmail" placeholder="dein@mail.tld" required />
                    <button type="submit" class="submitButton" id="btnSendReset">Link senden</button>
                </div>
                <div id="phase-set" style="display:none">
                    <p id="emailLine" class="muted"></p>
                    <label for="pw1">Neues Passwort:</label>
                    <input type="password" id="pw1" name="newPassword" minlength="6" required />
                    <label for="pw2">Passwort wiederholen:</label>
                    <input type="password" id="pw2" name="newPasswordRepeat" minlength="6" required />
                    <button type="submit" class="submitButton" id="btnConfirmReset">Speichern</button>
                </div>
                <div id="resetMessage" class="alert"></div>
                <div class="reset-actions">
                    <button type="button" class="textButton" id="backToLogin">← Zurück</button>
                </div>
            </form>
        </div>

        <div class="registerFormularDiv">
            <form class="registerForm" id="registerForm">
                <label for="regUsername">Benutzername:</label>
                <input type="text" id="regUsername" name="username" placeholder="Benutzername" required>
                <label for="regEmail">Email:</label>
                <input type="email" id="regEmail" name="email" placeholder="Email" required>
                <label for="regPassword">Passwort:</label>
                <input type="password" id="regPassword" placeholder="Passwort" required />
                <button type="submit" class="submitButton" id="submitbuttonregister">Registrieren</button>
            </form>
        </div>
    </div>

    <div class="userinfo" style="display:none;">
        <div class="character" id="avatarLink"></div>
        <div class="welcomeNote">Willkommen</div>
        <div class="CharacterName" style="font-size: 18px;"></div>
        <div id="submitlogout" class="logoutButton" style="display: none;">⎋ Logout</div>
    </div>
</div>
`;

// Diese Funktion injiziert das HTML ganz oben in den Body
function injectAuth() {
    const authWrapper = document.createElement('div');
    authWrapper.id = "global-auth-container";
    authWrapper.innerHTML = authComponentHTML;
    document.body.prepend(authWrapper);
}

// Sofort ausführen
injectAuth();