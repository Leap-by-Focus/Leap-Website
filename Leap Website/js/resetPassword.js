// js/resetPassword.js
import { auth } from "./firebaseauth.js";
import {
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

(function () {
  // --- Panels / Elemente ---
  const loginPanel    = document.getElementById("loginFormular");
  const registerPanel = document.querySelector(".registerFormularDiv");
  const resetPanel    = document.getElementById("resetFormular");
  const resetForm     = document.getElementById("resetForm");
  const resetMsg      = document.getElementById("resetMessage");

  // Phase A (Mail anfordern)
  const phaseRequest  = document.getElementById("phase-request");
  const emailInput    = document.getElementById("resetEmail");
  const btnSendReset  = document.getElementById("btnSendReset"); // type="button"

  // Phase B (Passwort setzen)
  const phaseSet      = document.getElementById("phase-set");
  const emailLine     = document.getElementById("emailLine");
  const pw1           = document.getElementById("pw1");
  const pw2           = document.getElementById("pw2");

  // Trigger
  const forgotLink    = document.getElementById("forgotLink");
  const backToLogin   = document.getElementById("backToLogin");

  // Query-Params (aus E-Mail-Link)
  const qs      = new URLSearchParams(location.search);
  const mode    = qs.get("mode");
  const oobCode = qs.get("oobCode");

  // Kein native Browser-Validate; wir validieren selbst
  if (resetForm) resetForm.noValidate = true;

  // --- Helpers ---
  const setMsg = (text, color) => {
    if (!resetMsg) return;
    resetMsg.textContent = text || "";
    resetMsg.style.color = color || "";
  };

  const closeAll = () => {
    loginPanel?.classList.remove("open");
    registerPanel?.classList.remove("open");
    resetPanel?.classList.remove("open");
  };
  const openReset = () => { closeAll(); resetPanel?.classList.add("open"); };
  const openLogin = () => { closeAll(); loginPanel?.classList.add("open"); };

  // Phase-Toggles: required/disabled korrekt setzen
  function enablePhaseA() {
    // Email aktiv & required
    if (emailInput) {
      emailInput.disabled = false;
      emailInput.required = true;
      emailInput.removeAttribute("readonly");
    }
    // Passwörter inaktiv & NICHT required
    if (pw1) { pw1.disabled = true; pw1.required = false; pw1.value = ""; }
    if (pw2) { pw2.disabled = true; pw2.required = false; pw2.value = ""; }

    // UI
    if (phaseRequest) phaseRequest.style.display = "";
    if (phaseSet)     phaseSet.style.display     = "none";

    if (btnSendReset) {
      btnSendReset.style.display = "";
      btnSendReset.disabled = false;
      btnSendReset.textContent = "Link zum Zurücksetzen senden";
    }
    setMsg("", "");
  }

  function enablePhaseB(email) {
    // Email nur anzeigen/sperren
    if (emailInput) {
      emailInput.value = email || emailInput.value || "";
      emailInput.readOnly = true;
      emailInput.required = false;
      emailInput.disabled = true; // browser validiert das Feld nicht mehr
    }
    // Passwörter aktiv & required
    if (pw1) { pw1.disabled = false; pw1.required = true; }
    if (pw2) { pw2.disabled = false; pw2.required = true; }

    // UI
    if (phaseRequest) phaseRequest.style.display = "none";
    if (phaseSet)     phaseSet.style.display     = "";
    if (emailLine)    emailLine.textContent = email ? `Für Konto: ${email}` : "";
    setMsg("", "");
  }

  // --- Events ---

  // „Passwort vergessen?“ → Panel öffnen (Phase A)
  forgotLink?.addEventListener("click", (e) => {
    e.preventDefault();
    openReset();
    enablePhaseA();
    emailInput?.focus?.();
  });

  // Zurück zum Login
  backToLogin?.addEventListener("click", () => {
    openLogin();
    setMsg("", "");
  });

  // Phase A: Button-Klick (nicht submit!)
  btnSendReset?.addEventListener("click", async () => {
    const email = (emailInput?.value || "").trim();
    if (!email) return setMsg("Bitte E-Mail eingeben.", "orange");

    try {
      if (btnSendReset) {
        btnSendReset.disabled = true;
        btnSendReset.textContent = "Sende…";
      }

      await sendPasswordResetEmail(auth, email);

      // Erfolg → Button ausblenden, E-Mail-Feld sperren, Meldung
      if (btnSendReset) btnSendReset.style.display = "none";
      if (emailInput)   emailInput.readOnly = true;

      setMsg("✅ Link wurde gesendet – bitte prüfe dein Postfach 📬", "lightgreen");
    } catch (err) {
      const map = {
        "auth/invalid-email":          "Die E-Mail-Adresse ist ungültig.",
        "auth/user-not-found":         "Kein Benutzer mit dieser E-Mail vorhanden.",
        "auth/network-request-failed": "Netzwerkfehler. Bitte später erneut."
      };
      setMsg(map[err?.code] || ("Fehler: " + (err?.message || String(err))), "salmon");
    } finally {
      // Bei Fehler Button wieder freigeben (nur wenn noch sichtbar)
      if (btnSendReset && btnSendReset.style.display !== "none") {
        btnSendReset.disabled = false;
        btnSendReset.textContent = "Link zum Zurücksetzen senden";
      }
    }
  });

  // Phase B: Formular-Submit → Passwort setzen
  resetForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Nur in Phase B handeln
    const inPhaseB = phaseSet && phaseSet.style.display !== "none";
    if (!(mode === "resetPassword" && oobCode && inPhaseB)) return;

    const a = (pw1?.value || "").trim();
    const b = (pw2?.value || "").trim();
    if (a.length < 6) return setMsg("Passwort mindestens 6 Zeichen.", "orange");
    if (a !== b)      return setMsg("Die Passwörter stimmen nicht überein.", "orange");

    try {
      await confirmPasswordReset(auth, oobCode, a);
      setMsg("✅ Passwort gespeichert. Du kannst dich jetzt einloggen.", "lightgreen");

      // URL säubern & Login anzeigen
      setTimeout(() => {
        const clean = location.origin + location.pathname;
        history.replaceState(null, "", clean);
        openLogin();
      }, 1200);
    } catch (err) {
      const map = {
        "auth/expired-action-code": "Der Link ist abgelaufen. Bitte neu anfordern.",
        "auth/invalid-action-code": "Ungültiger Link. Bitte neu anfordern.",
        "auth/weak-password":       "Das Passwort ist zu schwach."
      };
      setMsg(map[err?.code] || ("Fehler: " + (err?.message || String(err))), "salmon");
    }
  });

  // --- Direktaufruf über E-Mail-Link (Phase B aktivieren) ---
  (async function initFromLink() {
    if (mode === "resetPassword" && oobCode) {
      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        openReset();
        enablePhaseB(email);
        pw1?.focus?.();
      } catch {
        openReset();
        enablePhaseA();
        setMsg("❌ Link ungültig oder abgelaufen. Bitte neu anfordern.", "salmon");
      }
    }
  })();
})();