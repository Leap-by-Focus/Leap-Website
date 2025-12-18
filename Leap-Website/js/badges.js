// badges.js
// Firestore-basierte Badge-Logik für LEAP

import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* --- Firebase init (re-use) --- */
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

/* --- Konstanten & Utils --- */
const LAUNCH_DATE = new Date("2025-01-01T00:00:00Z"); // ⬅️ Launchedatum hier pflegen
const MS_PER_DAY  = 24*60*60*1000;

const PAGES = { DOCS:"docs", HUB:"hub", AI:"ai", FORUM:"forum" };
const BADGE = {
  DEVELOPER: "dev_feature",
  BUG_FINDER: "bug_finder",
  BUG_KILLER: "bug_killer",
  FIRST_COMMIT: "first_commit",
  OS_HERO: "open_source_hero",
  PERF_TUNER: "performance_tuner",

  HELPER: "helper",
  MENTOR: "mentor",
  CLUB_500: "club_500",
  CLUB_1K: "club_1k",
  CLUB_2K: "club_2k",
  CLUB_5K: "club_5k",
  EMOJI_SPAMMER: "emoji_spammer",
  COLLECTOR: "collector_10x",
  NIGHT_OWL: "night_owl",

  OG: "og",
  ALPHA: "alpha_tester",
  BETA: "beta_tester",

  YEAR_1: "year_1", YEAR_2: "year_2", YEAR_3: "year_3", YEAR_4: "year_4",
  YEAR_5: "year_5", YEAR_6: "year_6", YEAR_7: "year_7", YEAR_8: "year_8",
  YEAR_9: "year_9", VETERAN_10: "veteran_10",

  RAGE_QUITTER: "rage_quitter",
  AFK_SURFER: "afk_surfer",
  CUSTOMIZER: "customizer",
  EXPLORER: "explorer",

  XMAS: "xmas_programmer",
  NEWYEARS: "newyears_enjoyer",
  ST_PATRICKS: "st_patricks",
  BIRTHDAY_STAR: "birthday_star",
  TEST: "test",
};

function betweenHours(date, startH, endH) {
  // z.B. 2..4 Uhr (lokal)
  const h = date.getHours();
  return h >= startH && h < endH;
}

function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

/* --- Basis: User-Doc vorbereiten --- */
async function ensureUserDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      createdAt: serverTimestamp(),
      stats: {
        messagesTotal: 0,
        helpAnswers: 0,
        emojisUsed: 0,
        profileChanges: 0,
        pagesVisited: [], // string[]
        commits: 0,
        patches: 0,
        bugReports: 0,
        bugFixes: 0,
        perfOptimizations: 0,
        lastActiveAt: serverTimestamp(),
        idleAccumulatedMs: 0
      },
      earnedBadges: [],   // string[]
      achievements: []    // 3 Ausstell-Badges für Profil (separat von earnedBadges)
    }, { merge: true });
  }
}

/* --- Badge vergeben (idempotent) --- */
async function awardBadge(uid, badgeId) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const earned = snap.exists() ? (snap.data().earnedBadges || []) : [];
  if (earned.includes(badgeId)) return false; // schon vorhanden

  await updateDoc(ref, { earnedBadges: arrayUnion(badgeId) });
  // Collector (10 unterschiedliche) prüfen
  const after = [...new Set([...earned, badgeId])];
  if (after.length >= 10 && !after.includes(BADGE.COLLECTOR)) {
    await updateDoc(ref, { earnedBadges: arrayUnion(BADGE.COLLECTOR) });
  }
  return true;
}

/* --- Regeln zentral prüfen --- */
async function recomputeBadges(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const u = snap.data();
  const s = u.stats || {};
  const created = (u.createdAt && u.createdAt.toDate) ? u.createdAt.toDate() : new Date();

  // Helper / Mentor
  if (s.helpAnswers >= 50)  await awardBadge(uid, BADGE.HELPER);
  if (s.helpAnswers >= 100) await awardBadge(uid, BADGE.MENTOR);

  // Clubs
  if (s.messagesTotal >= 500)  await awardBadge(uid, BADGE.CLUB_500);
  if (s.messagesTotal >= 1000) await awardBadge(uid, BADGE.CLUB_1K);
  if (s.messagesTotal >= 2000) await awardBadge(uid, BADGE.CLUB_2K);
  if (s.messagesTotal >= 5000) await awardBadge(uid, BADGE.CLUB_5K);

  // Emoji Spammer
  if (s.emojisUsed >= 100) await awardBadge(uid, BADGE.EMOJI_SPAMMER);

  // Customizer
  if (s.profileChanges >= 10) await awardBadge(uid, BADGE.CUSTOMIZER);

  // Explorer
  if (Array.isArray(s.pagesVisited)) {
    const set = new Set(s.pagesVisited);
    if (set.has(PAGES.DOCS) && set.has(PAGES.HUB) && set.has(PAGES.AI) && set.has(PAGES.FORUM)) {
      await awardBadge(uid, BADGE.EXPLORER);
    }
  }

  // OG (innerhalb 3 Monate nach Launch registriert)
  const threeMonthsMs = 90 * MS_PER_DAY;
  if (created.getTime() - LAUNCH_DATE.getTime() <= threeMonthsMs) {
    await awardBadge(uid, BADGE.OG);
  }

  // Jubiläen
  const now = new Date();
  const years = Math.floor((now.getTime() - created.getTime()) / (365 * MS_PER_DAY));
  const yearBadges = [BADGE.YEAR_1,BADGE.YEAR_2,BADGE.YEAR_3,BADGE.YEAR_4,BADGE.YEAR_5,BADGE.YEAR_6,BADGE.YEAR_7,BADGE.YEAR_8,BADGE.YEAR_9];
  yearBadges.forEach(async (badge, idx) => {
    if (years >= (idx+1)) await awardBadge(uid, badge);
  });
  if (years >= 10) await awardBadge(uid, BADGE.VETERAN_10);

  // Dev-Track (aus Backoffice/GitHub Webhook sinnvoll setzen)
  if (s.commits >= 1)      await awardBadge(uid, BADGE.FIRST_COMMIT);
  if (s.patches >= 1)      await awardBadge(uid, BADGE.DEVELOPER);
  if (s.patches >= 5)      await awardBadge(uid, BADGE.OS_HERO);
  if (s.bugReports >= 1)   await awardBadge(uid, BADGE.BUG_FINDER);
  if (s.bugFixes >= 1)     await awardBadge(uid, BADGE.BUG_KILLER);
  if (s.perfOptimizations>0) await awardBadge(uid, BADGE.PERF_TUNER);

  // AFK Surfer (≥ 6h Inaktivität in einer Session gesammelt)
  if ((s.idleAccumulatedMs || 0) >= 6*60*60*1000) await awardBadge(uid, BADGE.AFK_SURFER);
}

/* --- Öffentliche Event-Hooks: diese rufst du in deiner App auf --- */

// 1) Bei erfolgreichem Login
export async function onUserLogin(uid) {
  await ensureUserDoc(uid);

  // Saisonal/Feiertage
  const now = new Date();
  const m = now.getMonth()+1, d = now.getDate();
  if (m===12 && d===24) await awardBadge(uid, BADGE.XMAS);       // Heiligabend
  if (m===1  && d===1)  await awardBadge(uid, BADGE.NEWYEARS);   // Neujahr
  if (m===3  && d===17) await awardBadge(uid, BADGE.ST_PATRICKS);// St. Patrick’s
  // Birthday Star (wenn Nutzergeburtstag im Profil gepflegt ist)
  // Erwartet users/{uid}.birthday {month, day}
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().birthday) {
    const b = snap.data().birthday;
    if (b.month===m && b.day===d) await awardBadge(uid, BADGE.BIRTHDAY_STAR);
  }

  // Night Owl (Loginzeit + Aktivität 2–4 Uhr)
  if (betweenHours(now, 2, 4)) {
    // wird zusätzlich bei Message gezählt, aber man kann direkt vergeben:
    await awardBadge(uid, BADGE.NIGHT_OWL);
  }

  // „Rage Quitter“(Dokumentation < 10s) → wird separat in onDocsOpen/onDocsClose geprüft
  await recomputeBadges(uid);
}

// 2) Nachricht im Community Hub/Chat erstellt
export async function onMessagePosted(uid, { isHelpAnswer=false, emojiCount=0 }) {
  const ref = doc(db, "users", uid);
  await ensureUserDoc(uid);
  await updateDoc(ref, {
    "stats.messagesTotal": increment(1),
    "stats.helpAnswers": increment(isHelpAnswer ? 1 : 0),
    "stats.emojisUsed": increment(emojiCount),
    "stats.lastActiveAt": serverTimestamp()
  });
  await recomputeBadges(uid);
}

// 3) Avatar/Profil geändert
export async function onProfileChanged(uid) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { "stats.profileChanges": increment(1), "stats.lastActiveAt": serverTimestamp() });
  await recomputeBadges(uid);
}

// 4) Seite geöffnet
export async function onPageOpened(uid, pageKey /* "docs"|"hub"|"ai"|"forum" */) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const visited = new Set((snap.exists() && snap.data().stats?.pagesVisited) || []);
  visited.add(pageKey);
  await updateDoc(ref, {
    "stats.pagesVisited": Array.from(visited),
    "stats.lastActiveAt": serverTimestamp()
  });
  await recomputeBadges(uid);
}

// 5) Doku geöffnet/geschlossen (für Rage Quitter)
const _docsOpenAt = new Map(); // session-scope
export function onDocsOpen(uid) { _docsOpenAt.set(uid, Date.now()); }
export async function onDocsClose(uid) {
  const t0 = _docsOpenAt.get(uid);
  if (!t0) return;
  _docsOpenAt.delete(uid);
  const duration = Date.now() - t0;
  if (duration < 10_000) { // <10s
    await awardBadge(uid, BADGE.RAGE_QUITTER);
  }
}

// 6) Aktivitäts-Tracking (für AFK Surfer)
// Rufe startIdleTracker() einmal pro Seite auf, stopIdleTracker() beim Leave.
let idleTimer = null, idleStart = null;
export function startIdleTracker(uid) {
  stopIdleTracker();
  const reset = () => { idleStart = Date.now(); };
  reset();

  ["mousemove","keydown","scroll","click","touchstart"].forEach(ev =>
    window.addEventListener(ev, reset, { passive:true })
  );

  idleTimer = setInterval(async () => {
    if (!idleStart) { idleStart = Date.now(); return; }
    const idleMs = Date.now() - idleStart;
    // Wir akkumulieren alle 5min die Inaktivität
    if (idleMs >= 5*60*1000) {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, { "stats.idleAccumulatedMs": increment(idleMs) });
      idleStart = Date.now();
      await recomputeBadges(uid);
    }
  }, 60*1000);
}
export function stopIdleTracker() {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null; idleStart = null;
}

/* --- Dev/Open-Source Events (vom Backend/Webhook oder Admin-UI) --- */
export async function onDevContribution(uid, { commit=false, patch=false, bugReport=false, bugFix=false, perf=false }) {
  const ref = doc(db, "users", uid);
  await ensureUserDoc(uid);
  await updateDoc(ref, {
    "stats.commits": increment(commit ? 1 : 0),
    "stats.patches": increment(patch ? 1 : 0),
    "stats.bugReports": increment(bugReport ? 1 : 0),
    "stats.bugFixes": increment(bugFix ? 1 : 0),
    "stats.perfOptimizations": increment(perf ? 1 : 0),
    "stats.lastActiveAt": serverTimestamp()
  });
  await recomputeBadges(uid);
}

/* --- Testerrollen (einmalig vergeben; z.B. durch Admin) --- */
export async function setTesterFlags(uid, { alpha=false, beta=false }) {
  if (alpha) await awardBadge(uid, BADGE.ALPHA);
  if (beta)  await awardBadge(uid, BADGE.BETA);
}