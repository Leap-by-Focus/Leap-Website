// settingsAchievementsPicker.js
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* ---------- Firebase init (re-use existing app) ---------- */
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

/* ---------- Badge-Definitionen (ID, Bild, Titel, Beschreibung) ---------- */
/* Pfade zeigen auf ../assets/achivements/ */
const ALL_ACHIEVEMENTS = [
  { id: "dev_feature",      src: "../assets/achivements/developer.png",              label: "Developer",          desc: "Programmiere ein Feature für Leap und füge es erfolgreich im Open-Source-Code hinzu." },
  { id: "bug_finder",       src: "../assets/achivements/bug_finder.png",             label: "Bug Finder",         desc: "Melde einen wichtigen Bug für Leap." },
  { id: "bug_killer",       src: "../assets/achivements/bug_killer.png",             label: "Bug Killer",         desc: "Fixe einen Bug im Open-Source-Teil von Leap." },
  { id: "first_commit",     src: "../assets/achivements/first_commit.png",           label: "First Commit",       desc: "Dein erster erfolgreicher Commit in das Leap-Repo." },
  { id: "open_source_hero", src: "../assets/achivements/open_source_hero.png",       label: "Open Source Hero",   desc: "Trage 5+ Patches zu Leap bei." },
  { id: "performance_tuner",src: "../assets/achivements/performance_tuner.png",      label: "Performance Tuner",  desc: "Optimiere Code, sodass Leap nachweisbar schneller läuft." },

  { id: "helper",           src: "../assets/achivements/helper.png",                 label: "Helper",             desc: "Mindestens 50 Antworten im Help-Thread." },
  { id: "mentor",           src: "../assets/achivements/mentor.png",                 label: "Mentor",             desc: "Mindestens 100 Antworten im Help-Thread." },
  { id: "club_500",         src: "../assets/achivements/500_club.png",               label: "500 Club",           desc: "500+ Nachrichten im Community Hub." },
  { id: "club_1k",          src: "../assets/achivements/1k_club.png",                label: "1K Club",            desc: "1000+ Nachrichten im Community Hub." },
  { id: "club_2k",          src: "../assets/achivements/2k_club.png",                label: "2K Club",            desc: "2000+ Nachrichten im Community Hub." },
  { id: "club_5k",          src: "../assets/achivements/5k_club.png",                label: "5K Master Club",     desc: "5000+ Nachrichten im Community Hub." },

  { id: "emoji_spammer",    src: "../assets/achivements/emoji_spammer.png",          label: "Emoji Spammer",      desc: "Verwende 100 Emojis in Chat oder Hub." },
  { id: "collector_10x",    src: "../assets/achivements/collector.png",              label: "Collector",          desc: "Schalte 10 verschiedene Achievements frei." },
  { id: "night_owl",        src: "../assets/achivements/night_owl.png",              label: "Night Owl",          desc: "Schreibe 20+ Nachrichten zwischen 2–4 Uhr nachts." },
  { id: "og",               src: "../assets/achivements/og.png",                     label: "OG",                 desc: "In den ersten 3 Monaten nach Launch registriert." },
  { id: "alpha_tester",     src: "../assets/achivements/alpha_tester.png",           label: "Alpha Tester",       desc: "Mitglied im Alpha-Test." },
  { id: "beta_tester",      src: "../assets/achivements/beta_tester.png",            label: "Beta Tester",        desc: "Mitglied im Beta-Test." },

  { id: "year_1",           src: "../assets/achivements/one_year_with_us.png",       label: "Year 1",             desc: "1 Jahr Leap-Nutzer." },
  { id: "year_2",           src: "../assets/achivements/two_years_with_us.png",      label: "Year 2",             desc: "2 Jahre Leap-Nutzer." },
  { id: "year_3",           src: "../assets/achivements/three_years_with_us.png",    label: "Year 3",             desc: "3 Jahre Leap-Nutzer." },
  { id: "year_4",           src: "../assets/achivements/four_years_with_us.png",     label: "Year 4",             desc: "4 Jahre Leap-Nutzer." },
  { id: "year_5",           src: "../assets/achivements/five_years_with_us.png",     label: "Year 5",             desc: "5 Jahre Leap-Nutzer." },
  { id: "year_6",           src: "../assets/achivements/six_years_with_us.png",      label: "Year 6",             desc: "6 Jahre Leap-Nutzer." },
  { id: "year_7",           src: "../assets/achivements/seven_years_with_us.png",    label: "Year 7",             desc: "7 Jahre Leap-Nutzer." },
  { id: "year_8",           src: "../assets/achivements/eight_years_with_us.png",    label: "Year 8",             desc: "8 Jahre Leap-Nutzer." },
  { id: "year_9",           src: "../assets/achivements/nine_years_with_us.png",     label: "Year 9",             desc: "9 Jahre Leap-Nutzer." },
  { id: "veteran_10",       src: "../assets/achivements/ten_years_with_us.png",      label: "Veteran (10)",       desc: "10 Jahre Leap-Nutzer." },

  { id: "rage_quitter",     src: "../assets/achivements/rage_quitter.png",           label: "Rage Quitter",       desc: "Docs öffnen und nach < 10 Sekunden wieder schließen." },
  { id: "afk_surfer",       src: "../assets/achivements/afk_surfer.png",             label: "AFK Surfer",         desc: "6 Stunden eingeloggt ohne Aktivität." },
  { id: "customizer",       src: "../assets/achivements/customizer.png",             label: "Customizer",         desc: "Profilbild 10× geändert." },
  { id: "explorer",         src: "../assets/achivements/explorer.png",               label: "Explorer",           desc: "Alle 4 Hauptseiten (Docs, Hub, AI, Forum) geöffnet." },
  { id: "xmas_programmer",  src: "../assets/achivements/santas_little_programmer.png",label:"Santa’s Little Programmer", desc: "An Weihnachten eingeloggt." },
  { id: "newyears",         src: "../assets/achivements/newyears_enjoyer.png",       label: "New Year’s Enjoyer", desc: "An Neujahr eingeloggt." },
  { id: "st_patricks",      src: "../assets/achivements/st_patricks_day.png",        label: "St. Patrick’s Day",  desc: "Am 17. März eingeloggt." },
  { id: "birthday_star",    src: "../assets/achivements/birthday_star.png",          label: "Birthday Star",      desc: "Am gespeicherten Geburtstag eingeloggt." },

];

const byId = Object.fromEntries(ALL_ACHIEVEMENTS.map(a => [a.id, a]));

/* ---------- Minimal-Styles für Tooltip (falls nicht vorhanden) ---------- */
(function injectTooltipCSS(){
  if (document.getElementById("badge-tooltip-css")) return;
  const style = document.createElement("style");
  style.id = "badge-tooltip-css";
  style.textContent = `
  .badge-tooltip {
    position: fixed; z-index: 100000; display:none;
    max-width: 260px; background: #0f0f11; color:#fff; border:1px solid #2e2e35;
    border-radius:10px; padding:10px 12px; box-shadow:0 8px 24px rgba(0,0,0,.35);
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size:12px; line-height:1.25;
  }
  .badge-tooltip .tt-title { font-weight:700; margin-bottom:4px; font-size:13px; }
  .badge-tooltip .tt-desc  { opacity:.9; }
  .locked-badge { position: relative; filter: grayscale(0.8) brightness(0.7); cursor: not-allowed; }
  .locked-badge::after {
    content: "🔒"; position:absolute; right:4px; bottom:4px; font-size:14px; opacity:.9; text-shadow:0 1px 2px rgba(0,0,0,.5);
  }`;
  document.head.appendChild(style);
})();

/* ---------- Tooltip-Helpers ---------- */
let tooltipEl = null;
function ensureTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "badge-tooltip";
  tooltipEl.style.display = "none";
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}
function showTooltip(title, desc, ev) {
  const tt = ensureTooltip();
  tt.innerHTML = `<div class="tt-title">${escapeHTML(title)}</div><div class="tt-desc">${escapeHTML(desc)}</div>`;
  tt.style.display = "block";
  positionTooltip(tt, ev);
}
function moveTooltip(ev) {
  if (!tooltipEl || tooltipEl.style.display === "none") return;
  positionTooltip(tooltipEl, ev);
}
function hideTooltip() { if (tooltipEl) tooltipEl.style.display = "none"; }
function positionTooltip(el, ev) {
  const pad = 12;
  const x = Math.min(ev.clientX + pad, window.innerWidth - el.offsetWidth - 6);
  const y = Math.min(ev.clientY + pad, window.innerHeight - el.offsetHeight - 6);
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;
}
function escapeHTML(s=""){ return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* ---------- Hover an ein (Grid- oder Slot-)Bild hängen ---------- */
function hookTooltip(imgEl) {
  const id    = imgEl.dataset.id || "";
  const meta  = byId[id];
  const title = meta?.label || imgEl.alt || id;
  const desc  = imgEl.dataset.locked === "1"
    ? `${meta?.desc || ""}`
    : (meta?.desc || imgEl.dataset.desc || "");
  imgEl.addEventListener("mouseenter", (ev) => showTooltip(title, desc, ev));
  imgEl.addEventListener("mousemove", moveTooltip);
  imgEl.addEventListener("mouseleave", hideTooltip);
}

/* ---------- User-Badges & Auswahl laden ---------- */
async function getUserBadgeState(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return { earned: [], selected: [] };
  const data = snap.data();
  return {
    earned: Array.isArray(data.earnedBadges) ? data.earnedBadges : [],
    selected: Array.isArray(data.achievements) ? data.achievements : []
  };
}

/* ---------- Anzeige unter 'Member seit' (nur verdiente) ---------- */
async function loadAndRenderSelectedAchievements() {
  const uid = localStorage.getItem("loggedInUserId");
  if (!uid) return;

  const wrap = document.querySelector(".achievements");
  if (!wrap) return;

  try {
    const { earned, selected } = await getUserBadgeState(uid);
    wrap.innerHTML = "";
    [0,1,2].forEach(i => {
      const id = selected[i];
      const img = document.createElement("img");
      img.className = "badge";
      if (id && byId[id] && earned.includes(id)) {
        img.src = byId[id].src;
        img.alt = byId[id].label;
        img.dataset.id = id;
        img.dataset.desc = byId[id].desc || "";
        hookTooltip(img);
      } else {
        img.src = "../assets/images/achivments_placeholder.png";
        img.alt = "leer";
        img.style.opacity = ".4";
      }
      wrap.appendChild(img);
    });
  } catch (e) {
    console.error("Achievements laden fehlgeschlagen:", e);
  }
}

/* ---------- Picker öffnen ---------- */
async function openAchievementsPicker(preset = []) {
  const uid = localStorage.getItem("loggedInUserId");
  const { earned } = await getUserBadgeState(uid || "");

  const overlay = document.createElement("div");
  overlay.className = "overlay";

  const modal = document.createElement("div");
  modal.className = "achievements-modal";

  const title = document.createElement("h2");
  title.textContent = "Wähle deine Achievements (max. 3)";

  const grid = document.createElement("div");
  grid.className = "achievements-grid";

  const slotsRow = document.createElement("div");
  slotsRow.className = "slots-row";

  // 3 Drop-Slots
  const slotEls = [0,1,2].map(i => {
    const slot = document.createElement("div");
    slot.className = "drop-slot";
    slot.dataset.index = String(i);

    if (preset[i] && byId[preset[i]] && earned.includes(preset[i])) {
      const im = makeThumbById(preset[i], true); // unlocked thumb
      slot.appendChild(im);
    }

    // Drop nur erlauben, wenn das gezogene Badge earned ist (prüfen wir beim drop)
    slot.addEventListener("dragover", (ev) => { ev.preventDefault(); slot.classList.add("over"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("over"));
    slot.addEventListener("drop", (ev) => {
      ev.preventDefault(); slot.classList.remove("over");
      const id = ev.dataTransfer?.getData("text/plain");
      if (!id || !byId[id] || !earned.includes(id)) return; // nur verdiente
      slot.innerHTML = "";
      slot.appendChild(makeThumbById(id, true));
    });

    // Klick leert den Slot
    slot.addEventListener("click", () => { slot.innerHTML = ""; });
    return slot;
  });
  slotEls.forEach(s => slotsRow.appendChild(s));

  // Grid füllen (verdiente = aktiv; gesperrte = grau + 🔒)
  ALL_ACHIEVEMENTS.forEach(a => {
    const unlocked = earned.includes(a.id);
    const img = makeThumbById(a.id, unlocked);
    img.classList.add("grid-item");

    if (unlocked) {
      img.addEventListener("click", () => {
        const free = slotEls.find(s => s.children.length === 0);
        if (!free) return;
        const copy = makeThumbById(a.id, true);
        free.innerHTML = "";
        free.appendChild(copy);
      });
    }
    grid.appendChild(img);
  });

  const actions = document.createElement("div");
  actions.className = "actions";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Speichern";
  saveBtn.onclick = async () => {
    const uid = localStorage.getItem("loggedInUserId");
    if (!uid) return;

    // nur earned IDs speichern
    const selection = slotEls.map(s => {
      const id = s.querySelector("img")?.dataset.id || null;
      return (id && earned.includes(id)) ? id : null;
    });

    try {
      await setDoc(doc(db, "users", uid), { achievements: selection }, { merge: true });
      await loadAndRenderSelectedAchievements();
    } catch (e) {
      console.error("Speichern fehlgeschlagen:", e);
    } finally {
      hideTooltip();
      document.body.removeChild(overlay);
    }
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Abbrechen";
  cancelBtn.onclick = () => { hideTooltip(); document.body.removeChild(overlay); };

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  modal.appendChild(title);
  modal.appendChild(grid);
  modal.appendChild(slotsRow);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ---------- Thumb-Fabrik ---------- */
function makeThumbById(id, unlocked) {
  const a = byId[id];
  if (!a) return null;
  const img = document.createElement("img");
  img.src = a.src;
  img.alt = a.label;
  img.dataset.id = a.id;
  img.dataset.desc = a.desc || "";

  if (unlocked) {
    img.draggable = true;
    img.className = "achievement-option";
    img.addEventListener("dragstart", (ev) => {
      ev.dataTransfer?.setData("text/plain", a.id);
    });
  } else {
    img.draggable = false;
    img.className = "achievement-option locked-badge";
    img.dataset.locked = "1";
  }

  hookTooltip(img);
  return img;
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadAndRenderSelectedAchievements();

  const btn = document.getElementById("manageAchievements");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const uid = localStorage.getItem("loggedInUserId");
    let preset = [];
    if (uid) {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        preset = snap.exists() ? (snap.data().achievements || []) : [];
      } catch {}
    }
    openAchievementsPicker(preset);
  });
});