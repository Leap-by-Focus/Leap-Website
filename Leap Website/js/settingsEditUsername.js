// settingsEditUsername.js
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* Firebase init (reuse existing) */
const firebaseConfig = {
  apiKey: "AIzaSyBGs1Xx3VH2XZHT-k12Xsf_1Nz0gJBNB-Y",
  authDomain: "leap-001.firebaseapp.com",
  projectId: "leap-001",
  storageBucket: "leap-001.firebasestorage.app",
  messagingSenderId: "177255891538",
  appId: "1:177255891538:web:9a7cc6d28f874aadc7d58b"
};
let app; try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
const auth = getAuth(app);
const db   = getFirestore(app);

/* Helpers */
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const COOLDOWN_DAYS = 365;

function setAllUsernameTexts(name){ $$(".usernameDisplay").forEach(el=> el.textContent = name); }
function validateName(name){
  const trimmed = name.trim();
  return { ok: /^[A-Za-z0-9._-]{3,24}$/.test(trimmed), value: trimmed };
}
function daysBetween(a,b){ return Math.floor((b - a) / (1000*60*60*24)); }

/* Modals (dynamisch erstellt, nutzen deine CSS-Klassen) */
function ensureModal(id, {title, html, okText="OK", cancelText=null}) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement("div");
    modal.id = id;
    modal.className = "modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-content">
        <h2>${title}</h2>
        <div class="modal-body">${html}</div>
        <div class="modal-actions">
          ${cancelText ? `<button data-role="cancel">${cancelText}</button>` : ""}
          <button data-role="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    // Inhalt aktualisieren, falls bereits vorhanden
    $(".modal-content h2", modal).textContent = title;
    $(".modal-body", modal).innerHTML = html;
    const actions = $(".modal-actions", modal);
    actions.innerHTML = `${cancelText ? `<button data-role="cancel">${cancelText}</button>` : ""}<button data-role="ok">${okText}</button>`;
  }
  return modal;
}
function openModalEl(modal){ modal.style.display = "flex"; }
function closeModalEl(modal){ modal.style.display = "none"; }

function confirmChange(message){
  const modal = ensureModal("confirm-username-modal", {
    title: "Bist du sicher?",
    html: `<p>${message}</p>`,
    okText: "Ja, ändern",
    cancelText: "Abbrechen"
  });
  return new Promise(resolve=>{
    const onEsc = (e)=>{ if(e.key==="Escape"){ cleanup(false); } };
    const onBackdrop = (e)=>{ if(e.target===modal){ cleanup(false); } };
    const okBtn = $('[data-role="ok"]', modal);
    const cancelBtn = $('[data-role="cancel"]', modal);

    function cleanup(result){
      closeModalEl(modal);
      document.removeEventListener("keydown", onEsc);
      modal.removeEventListener("click", onBackdrop);
      okBtn?.removeEventListener("click", okHandler);
      cancelBtn?.removeEventListener("click", cancelHandler);
      resolve(result);
    }
    const okHandler = ()=>cleanup(true);
    const cancelHandler = ()=>cleanup(false);

    okBtn?.addEventListener("click", okHandler);
    cancelBtn?.addEventListener("click", cancelHandler);
    document.addEventListener("keydown", onEsc);
    modal.addEventListener("click", onBackdrop);

    openModalEl(modal);
  });
}

function showCooldown(daysLeft){
  const modal = ensureModal("cooldown-username-modal", {
    title: "Änderung noch nicht möglich",
    html: `<p>Du kannst deinen Namen erst wieder in <b>${daysLeft}</b> Tagen ändern.</p>`,
    okText: "Ok"
  });
  const okBtn = $('[data-role="ok"]', modal);
  const onEsc = (e)=>{ if(e.key==="Escape"){ cleanup(); } };
  const onBackdrop = (e)=>{ if(e.target===modal){ cleanup(); } };
  function cleanup(){
    closeModalEl(modal);
    document.removeEventListener("keydown", onEsc);
    modal.removeEventListener("click", onBackdrop);
    okBtn?.removeEventListener("click", cleanup);
  }
  okBtn?.addEventListener("click", cleanup);
  document.addEventListener("keydown", onEsc);
  modal.addEventListener("click", onBackdrop);
  openModalEl(modal);
}

/* Hauptlogik */
document.addEventListener("DOMContentLoaded", async () => {
  const trigger = $(".edit-username-btn");
  if (!trigger) return;

  // Bearbeiten-Modal (statisch im HTML vorhanden)
  let editModal = $("#edit-username-modal");
  if (!editModal) {
    // Fallback: erstellen, falls nicht im HTML
    editModal = document.createElement("div");
    editModal.id = "edit-username-modal";
    editModal.className = "modal-overlay";
    editModal.style.display = "none";
    editModal.innerHTML = `
      <div class="modal-content">
        <h2>Benutzernamen bearbeiten</h2>
        <input type="text" id="new-username" placeholder="Neuer Benutzername" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text" />
        <div class="modal-actions">
          <button id="save-username">Speichern</button>
          <button id="cancel-username">Abbrechen</button>
        </div>
      </div>`;
    document.body.appendChild(editModal);
  }
  const input  = $("#new-username", editModal);
  const save   = $("#save-username", editModal);
  const cancel = $("#cancel-username", editModal);

  // User laden
  const uid = localStorage.getItem("loggedInUserId") || auth.currentUser?.uid || null;
  let lastChangeDate = null;

  async function hydrateUser(){
    if (!uid) {
      const lsName = localStorage.getItem("displayName");
      if (lsName) setAllUsernameTexts(lsName);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.displayName) setAllUsernameTexts(data.displayName);
        if (data.usernameLastChanged?.toDate) {
          lastChangeDate = data.usernameLastChanged.toDate();
        }
      }
    } catch {}
  }
  await hydrateUser();

  function openEditModal(){
    // Cooldown?
    if (lastChangeDate) {
      const diff = daysBetween(lastChangeDate, new Date());
      if (diff < COOLDOWN_DAYS) {
        showCooldown(COOLDOWN_DAYS - diff);
        return;
      }
    }
    // iOS/AutoFill-Workaround
    input.value = ($(".usernameDisplay")?.textContent || "").trim();
    input.setAttribute("readonly", "readonly");
    openModalEl(editModal);
    const dropReadonly = ()=> {
      input.removeAttribute("readonly");
      input.removeEventListener("pointerdown", dropReadonly);
      input.removeEventListener("keydown", dropReadonly);
    };
    input.addEventListener("pointerdown", dropReadonly, { once:true });
    input.addEventListener("keydown", dropReadonly, { once:true });
    setTimeout(()=> input.focus({ preventScroll:true }), 0);
  }
  function closeEditModal(){ closeModalEl(editModal); }

  trigger.addEventListener("click", openEditModal);
  cancel.addEventListener("click", closeEditModal);
  editModal.addEventListener("click", (e)=>{ if (e.target===editModal) closeEditModal(); });
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && editModal.style.display!=="none") closeEditModal(); });

  save.addEventListener("click", async () => {
    const { ok, value } = validateName(input.value);
    if (!ok) { alert("Ungültiger Benutzername. 3–24 Zeichen (A–Z, 0–9, ., _, -)"); input.focus(); input.select(); return; }

    const confirmed = await confirmChange("Du kannst den Namen erst nach 1 Jahr wieder ändern. Fortfahren?");
    if (!confirmed) return;

    try {
      // Optimistic UI
      setAllUsernameTexts(value);

      if (uid) {
        await setDoc(doc(db, "users", uid), {
          displayName: value,
          usernameLastChanged: serverTimestamp()
        }, { merge: true });

        if (auth.currentUser) {
          try { await updateProfile(auth.currentUser, { displayName: value }); } catch {}
        }
        lastChangeDate = new Date(); // lokal setzen
        // === GLOBAL BROADCAST ===
try {
  localStorage.setItem("displayName", value);
  window.dispatchEvent(new CustomEvent("leap:userProfile", { detail: { displayName: value } }));
  // cross-tab
  localStorage.setItem("LEAP_USER_PROFILE_BROADCAST", JSON.stringify({ ts: Date.now(), displayName: value }));
} catch {}
      } else {
        localStorage.setItem("displayName", value);
      }
      closeEditModal();
    } catch (e) {
      console.error("Username speichern fehlgeschlagen:", e);
      alert("Konnte den Benutzernamen nicht speichern. Bitte später erneut versuchen.");
    }
  });
});