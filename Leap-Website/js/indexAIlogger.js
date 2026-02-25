import { auth } from "./leap-auth.js"; // Pfad sicherstellen
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

(() => {
    let currentUser = null;
    let isAuthReady = false;

    // 1. Status im Hintergrund überwachen
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        isAuthReady = true;
    });

    // 2. Button-Klick abfangen
    document.addEventListener("DOMContentLoaded", () => {
        const aiBtn = document.getElementById("link-ai");
        if (!aiBtn) return;

        aiBtn.addEventListener("click", (e) => {
            // Standard-Navigation stoppen, um erst zu prüfen
            e.preventDefault();

            if (!isAuthReady) {
                console.log("Warte auf Firebase...");
                return;
            }

            if (currentUser) {
                // FALL: Eingeloggt -> Animation starten und reinlassen
                console.log("Login erkannt, leite weiter...");
                startTransition(aiBtn.href);
            } else {
                // FALL: Nicht angemeldet -> Alert zeigen
                alert("Du musst dich anmelden, um die Leap AI zu nutzen.");
                
                // Optional: Login-Panel direkt öffnen
                const loginPanel = document.getElementById('loginFormular');
                if (loginPanel) loginPanel.classList.add('open');
            }
        });
    });

    // 3. Die Animation (aus deiner animationMain.js)
    function startTransition(targetUrl) {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        const anim = document.body.animate([
            { transform: 'translate(0, 0)', opacity: 1 },
            { transform: 'translate(100vw, 100vh)', opacity: 0 }
        ], {
            duration: 600,
            easing: 'ease-in-out',
            fill: 'forwards'
        });

        anim.onfinish = () => {
            window.location.href = targetUrl;
        };
    }
})();