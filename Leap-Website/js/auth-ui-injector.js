// js/auth-ui-injector.js

const authComponentHTML = `
<style>
  .userinfo {
    position: fixed !important;
    top: 90px !important;
    right: 30px !important;
    background-color: #333 !important;
    color: white !important;
    padding: 10px 15px !important;
    border-radius: 6px !important;
    font-family: sans-serif !important;
    z-index: 100000 !important;
    cursor: pointer !important;
    width: 300px !important;
    height: 50px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
  }

  .userinfo #username {
    font-size: 18px !important;
    font-weight: 600 !important;
    flex-grow: 1 !important;
    text-align: center !important;
  }

  .userinfo .welcomeNote {
    flex-grow: 1 !important;
    text-align: center !important;
  }

  .logoutButton {
    position: fixed !important;
    right: 40px !important;
    top: 100px !important;
    width: 70px !important;
    height: 40px !important;
    padding: 6px 10px !important;
    background-color: #e74c3c !important;
    color: white !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    z-index: 9999 !important;
    font-weight: bold !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
    transition: background-color 0.3s ease !important;
    font-size: smaller !important;
    display: flex !important;
    align-items: center !important;
  }

  .safelogout {
    position: relative;
    width: 70px;
    height:40px;
    padding: 6px 10px;
    background-color: #e74c3c;
    color: white;
    border-radius: 8px;
    cursor: pointer;
    z-index: 9999;
    font-weight: bold;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    transition: background-color 0.3s ease;
    font-size: smaller;
    display: flex;
    align-items: center; /* Vertikale Zentrierung */
  }

  .logoutButton:hover {
    background-color: #c0392b !important;
  }

  .welcomeNote {
    color: white;
    font-weight: bold;
    font-size: 12px;
    white-space: nowrap;
  } 

  .character {
    position: fixed;               /* oder relative, je nachdem wo dein Avatar sitzt */
    width: 50px;
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 50%;

    /* Avatar-Hintergrund (vom JS gesetzt) */
    background-color: #777;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;

    cursor: pointer;
    overflow: hidden;
    transition: transform 0.2s ease, background-color 0.2s ease;
  }

  /* leichtes Scale beim Hover */
  .character:hover {
    transform: scale(1.1);
    background-color: #555;
  }

  /* 🔥 Overlay + größeres Settings-Icon */
  .character::after {
    content: "";
    position: absolute;
    inset: 0;

    /* dunklerer Hintergrund beim Hover */
    background-color: rgba(0, 0, 0, 0.65);   /* war 0.45 → jetzt dunkler */

    /* Settings-Icon in der Mitte, größer */
    background-image: url("../assets/images/settings.png");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 32px 32px;             /* war 22px → jetzt größer */

    opacity: 0;
    transform: scale(1.1);
    transition: opacity 0.35s ease, transform 0.35s ease;
    pointer-events: none;
    z-index: 1;
  }

  /* Hover-Effekt */
  .character:hover::after {
    opacity: 1;
    transform: scale(1);
  }

  /* Container für Willkommen + Username - zentriert */
  .userinfo-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    overflow: hidden;
  }

  .CharacterName {
    color: white;
    font-weight: bolder;
    font-size: 18px;
    z-index: 1000000;

    text-align: center;
    font-family: monospace;
    letter-spacing: 3px;
    animation: colorRotate 2s linear infinite;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
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


function injectAuth() {
    const authWrapper = document.createElement('div');
    authWrapper.id = "global-auth-container";
    authWrapper.innerHTML = authComponentHTML;
    document.body.prepend(authWrapper);
}

// Sofort ausführen
injectAuth();