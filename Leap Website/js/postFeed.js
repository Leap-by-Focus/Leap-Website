// /js/postFeed.js
import { db } from "./firebaseauth.js";
import {
  collection, query, orderBy, onSnapshot,
  doc, getDoc, updateDoc, increment,
  addDoc, serverTimestamp, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

/* ──────────────────────────────────────────────────────────────────────
   User-Profile Cache (Username + Avatar)
──────────────────────────────────────────────────────────────────────── */
const USER_COLLECTION = "users"; // ggf. anpassen
const profileCache = new Map();  // uid -> { name, avatar }

function deriveNameFromEmail(email) {
  return (typeof email === "string" && email.includes("@"))
    ? email.split("@")[0]
    : "Unbekannt";
}

async function fetchUserProfile(uid, emailFallback, authPhotoURL = null) {
  if (!uid) {
    return { name: deriveNameFromEmail(emailFallback), avatar: authPhotoURL || null };
  }
  if (profileCache.has(uid)) return profileCache.get(uid);

  let name = deriveNameFromEmail(emailFallback);
  let avatar = authPhotoURL || null;

  try {
    const snap = await getDoc(doc(db, USER_COLLECTION, uid));
    if (snap.exists()) {
      const u = snap.data();
      name = u.username || u.displayName || u.name || name;
      avatar = u.avatarUrl || u.photoURL || u.avatar || u.imageUrl || avatar;
    }
  } catch {}

  const prof = { name, avatar: avatar || null };
  profileCache.set(uid, prof);
  return prof;
}

// nur Name
async function fetchUsername(uid, emailFallback) {
  const p = await fetchUserProfile(uid, emailFallback, null);
  return p.name;
}

/* ──────────────────────────────────────────────────────────────────────
   Hybrid-Konfiguration (Modal vs. Seite)
──────────────────────────────────────────────────────────────────────── */
const HYBRID = {
  mobileMax: 900,                                 // < 900px => echte Detailseite
  pageURL: id => `/forum/post/${id}`,             // ggf. anpassen
  modalParam: id => `?post=${encodeURIComponent(id)}`
};
const prefersPage = () =>
  window.matchMedia(`(max-width:${HYBRID.mobileMax}px)`).matches;

/* Modal-Refs (Markup muss existieren) */
const modalEl      = document.getElementById("postModal");
const modalBodyEl  = modalEl?.querySelector(".post-modal__body");
const modalTitleEl = modalEl?.querySelector(".post-modal__title");
const modalMetaEl  = modalEl?.querySelector(".post-modal__meta");
const modalTagsEl  = modalEl?.querySelector(".post-modal__tags");

/* Replies-Refs (unter dem Body) */
const elReplies      = document.getElementById("pm-replies");
const elReplyEditor  = document.getElementById("pm-reply-editor");
const elReplySubmit  = document.getElementById("pm-reply-submit");
const elReplyCancel  = document.getElementById("pm-reply-cancel");
const elReplyAvatar  = document.getElementById("pm-reply-avatar"); // <div class="pm-reply-avatar" id="pm-reply-avatar"></div>

function openModal(){
  if (!modalEl) return;
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}
function closeModal(pushHistory = true){
  if (!modalEl) return;
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
  if (pushHistory){
    const url = new URL(location.href);
    url.searchParams.delete("post");
    history.pushState({view:"feed"}, "", url);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   Auth + Favoriten + Views
──────────────────────────────────────────────────────────────────────── */
const auth = getAuth();

// Favoriten-State
let favoritePosts = [];        // IDs der gemerkten Posts
let favoriteListener = null;   // unsubscribe

function listenToFavorites() {
  if (favoriteListener) { try { favoriteListener(); } catch {} favoriteListener = null; }

  const u = auth.currentUser;
  if (!u) {
    favoritePosts = [];
    renderPosts(latestPosts);
    return;
  }
  const favCol = collection(db, "users", u.uid, "favorites");
  favoriteListener = onSnapshot(favCol, (snap) => {
    favoritePosts = snap.docs.map(d => d.id);
    renderPosts(latestPosts);
  });
}

// global für Buttons nutzbar
async function toggleFavorite(postId) {
  const u = auth.currentUser;
  if (!u) { alert("Bitte einloggen, um Beiträge zu merken."); return; }
  const favRef = doc(db, "users", u.uid, "favorites", postId);
  const isFav = favoritePosts.includes(postId);
  if (isFav) {
    await deleteDoc(favRef);
  } else {
    await setDoc(favRef, { createdAt: serverTimestamp() });
  }
}

onAuthStateChanged(auth, () => listenToFavorites());

function getViewerKey() {
  const u = auth.currentUser;
  if (u && u.uid) return `uid:${u.uid}`;
  let vid = localStorage.getItem("visitorId");
  if (!vid) {
    vid = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    localStorage.setItem("visitorId", vid);
  }
  return `guest:${vid}`;
}

async function incrementViewOnce(postId) {
  try {
    const viewer = getViewerKey();
    const key = `viewed:${viewer}:${postId}`;
    if (sessionStorage.getItem(key)) return;
    const ref = doc(db, "posts", postId);
    await updateDoc(ref, { views: increment(1) });
    sessionStorage.setItem(key, "1");
  } catch (e) {
    console.warn("views increment failed:", e);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   Post holen + Modal füllen
──────────────────────────────────────────────────────────────────────── */
async function fetchPostById(id){
  const ref = doc(db, "posts", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Post nicht gefunden");
  return { id: snap.id, ...snap.data() };
}

const buildMeta = p => {
  const date  = tsToDate(p.createdAt);
  const views = Number(p.views ?? 0);
  const author = p.authorName || "Anonym";
  return `${author} · ${date.toLocaleString("de-DE")} · ${views} Aufrufe`;
};
const renderTags = tags =>
  (tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join("");

async function showPostInModal(id, preloadData = null, push = true){
  try{
    const data = preloadData || await fetchPostById(id);

    if (!data.authorName) {
      data.authorName = await fetchUsername(data.authorUid, data.authorEmail);
    }

    await incrementViewOnce(id);

    modalTitleEl.textContent = data.title || "Ohne Titel";
    modalMetaEl.textContent  = buildMeta(data);
    modalTagsEl.innerHTML    = renderTags(data.tags || []);

    const html = String(data.bodyHtml || data.html || "");
    const text = String(data.bodyText || "");
    modalBodyEl.innerHTML = html ? html : `<p>${escapeHtml(text).replace(/\n/g,"<br>")}</p>`;

    // Replies/Composer aktivieren
    attachRepliesStream(id);
    setupReplyComposer(id);

    if (push){
      const url = new URL(location.href);
      url.search = HYBRID.modalParam(id);
      history.pushState({view:"modal", id}, "", url);
    }
    openModal();
  }catch(err){
    console.error(err);
    location.href = HYBRID.pageURL(id);
  }
}

/* ──────────────────────────────────────────────────────────────────────
   Tag-Normalisierung + Aliase
──────────────────────────────────────────────────────────────────────── */
function deSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[@().]/g, " ")
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const ALIASES = new Map([
  ["beliebt", null],
  ["fragen", "fragen"], ["frage", "fragen"], ["hilfe", "fragen"], ["qna", "fragen"], ["support", "fragen"],
  ["diskussion", "diskussion"], ["discuss", "diskussion"], ["talk", "diskussion"],
  ["feedback", "feedback"],
  ["bugs", "bugs"], ["bug", "bugs"], ["fehler", "bugs"], ["issue", "bugs"],
  ["memes", "memes"], ["spass", "memes"], ["spaß", "memes"],
  ["leap-projekte", "leap-projekte"], ["leap", "leap-projekte"], ["project", "leap-projekte"], ["projekte", "leap-projekte"],
  ["java", "java"],
  ["csharp", "csharp"], ["c-sharp", "csharp"], ["cs", "csharp"], [".net", "csharp"], ["dotnet", "csharp"],
  ["python", "python"], ["py", "python"],
  ["javascript", "javascript"], ["js", "javascript"],
  ["typescript", "typescript"], ["ts", "typescript"],
  ["node", "nodejs"], ["nodejs", "nodejs"], ["node-js", "nodejs"],
  ["react", "react"], ["next", "nextjs"], ["nextjs", "nextjs"], ["next-js", "nextjs"],
  ["vue", "vue"], ["nuxt", "nuxt"], ["nuxtjs", "nuxt"], ["nuxt-js", "nuxt"],
  ["svelte", "svelte"], ["sveltekit", "sveltekit"], ["svelte-kit", "sveltekit"],
  ["angular", "angular"],
  ["html", "html"], ["web", "html"], ["frontend", "html"], ["front-end", "html"], ["html-css", "html"], ["css", "html"],
  ["sql", "sql"], ["database", "sql"], ["db", "sql"],
  ["c", "c-cpp"], ["cpp", "c-cpp"], ["c-plus-plus", "c-cpp"], ["cxx", "c-cpp"], ["c-cpp", "c-cpp"],
  ["go", "go"], ["golang", "go"],
  ["rust", "rust"], ["rs", "rust"],
  ["php", "php"], ["laravel", "php"],
  ["kotlin", "kotlin"], ["kt", "kotlin"],
  ["swift", "swift"], ["ios", "swift"],
  ["android", "kotlin"],
  ["docker", "docker"], ["k8s", "kubernetes"], ["kubernetes", "kubernetes"],
  ["aws", "aws"], ["azure", "azure"], ["gcp", "gcp"],
]);

function smartGuess(slug) {
  if (/^(web|frontend|html|css)/.test(slug)) return "html";
  if (/^(bug|fehler|issue)/.test(slug)) return "bugs";
  if (/^(frage|hilfe|qna|support)/.test(slug)) return "fragen";
  if (/^(c(\-|\+)*|cpp|cxx)/.test(slug)) return "c-cpp";
  if (/^(js|javascript)/.test(slug)) return "javascript";
  if (/^(ts|typescript)/.test(slug)) return "typescript";
  if (/^(node)/.test(slug)) return "nodejs";
  if (/^(next)/.test(slug)) return "nextjs";
  if (/^(nuxt)/.test(slug)) return "nuxt";
  if (/^(svelte)/.test(slug)) return "svelte";
  if (/^(react)/.test(slug)) return "react";
  if (/^(sql|db|database)/.test(slug)) return "sql";
  return slug || null;
}
function normalizeTag(input) {
  const slug = deSlug(input);
  if (!slug) return null;
  if (ALIASES.has(slug)) return ALIASES.get(slug);
  return smartGuess(slug);
}

/* ──────────────────────────────────────────────────────────────────────
   DOM & State
──────────────────────────────────────────────────────────────────────── */
const feedEl     = document.getElementById("postFeed");
const searchBox  = document.querySelector(".search-container .search-input");
const controls   = document.getElementById("controlsBar");
const selSort    = document.getElementById("sortBy");
const selRange   = document.getElementById("timeRange");
const chkWithCode= document.getElementById("withCode");

let latestPosts   = [];
let activeTag     = null;    // null = alle
let prevActiveTag = null;
let searchQuery   = "";
let onlyWithCode  = false;
let sortMode      = "newest"; // "newest" | "oldest" | "title" | "likes" | "comments"
let timeRange     = "all";    // "all" | "24h" | "7d" | "30d"

/* ──────────────────────────────────────────────────────────────────────
   Controls-Bar an Searchbar-Breite anpassen
──────────────────────────────────────────────────────────────────────── */
function syncControlsWidth() {
  const sc = document.querySelector(".search-container");
  if (!sc || !controls) return;
  const rect = sc.getBoundingClientRect();
  controls.style.width = rect.width + "px";
  controls.style.marginLeft = "auto";
  controls.style.marginRight = "auto";
}
window.addEventListener("resize", syncControlsWidth);
window.addEventListener("load", syncControlsWidth);
syncControlsWidth();

/* ──────────────────────────────────────────────────────────────────────
   Controls verkabeln
──────────────────────────────────────────────────────────────────────── */
if (selSort) {
  selSort.addEventListener("change", () => {
    sortMode = selSort.value;
    renderPosts(latestPosts);
  });
}
if (selRange) {
  selRange.addEventListener("change", () => {
    timeRange = selRange.value;
    renderPosts(latestPosts);
  });
}
if (chkWithCode) {
  chkWithCode.addEventListener("change", () => {
    onlyWithCode = chkWithCode.checked;
    renderPosts(latestPosts);
  });
}

/* Suche: Volltext → Tagfilter temporär deaktivieren */
if (searchBox) {
  searchBox.addEventListener("input", () => {
    searchQuery = (searchBox.value || "").trim().toLowerCase();

    if (searchQuery) {
      if (activeTag !== null) prevActiveTag = activeTag;
      activeTag = null;
      document.querySelectorAll(".sideMenu button").forEach(b => b.classList.remove("active"));
    } else {
      if (prevActiveTag !== null) {
        activeTag = prevActiveTag;
        prevActiveTag = null;
        const btn = document.querySelector(`.sideMenu button[data-tag="${activeTag || "beliebt"}"]`)
                  || document.querySelector('.sideMenu button[data-tag="beliebt"]');
        if (btn) btn.classList.add("active");
      }
    }

    renderPosts(latestPosts);
  });
}

/* ──────────────────────────────────────────────────────────────────────
   SideMenu: Tag-Filter
──────────────────────────────────────────────────────────────────────── */
document.querySelectorAll(".sideMenu button[data-tag]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const raw = btn.dataset.tag || "";
    activeTag = normalizeTag(raw);

    document.querySelectorAll(".sideMenu button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    renderPosts(latestPosts);
  });
});
const defaultBtn = document.querySelector('.sideMenu button[data-tag="beliebt"]');
if (defaultBtn) defaultBtn.classList.add("active");

/* ──────────────────────────────────────────────────────────────────────
   Live lesen (neueste zuerst) + Username auflösen
──────────────────────────────────────────────────────────────────────── */
const qLive = query(collection(db, "posts"), orderBy("createdAt", "desc"));
onSnapshot(qLive, async (snap) => {
  const posts = [];
  snap.forEach((d) => posts.push({ id: d.id, ...d.data() }));

  await Promise.all(posts.map(async (p) => {
    if (!p.authorName) {
      p.authorName = await fetchUsername(p.authorUid, p.authorEmail);
    }
  }));

  latestPosts = posts;
  renderPosts(latestPosts);
  forceTopOnceAfterRender();
});

/* ──────────────────────────────────────────────────────────────────────
   Feed rendern
──────────────────────────────────────────────────────────────────────── */
function renderPosts(posts) {
  if (!feedEl) return;
  feedEl.classList.add("feed", "post-feed");
  feedEl.innerHTML = "";

  let out = posts.slice();

  // 1) Tag-Filter + Gemerkte
  if (activeTag === "gemerkte") {
    const ids = new Set(favoritePosts);
    out = out.filter(p => ids.has(p.id));
  } else if (activeTag) {
    out = out.filter(p => (p.tags || []).some(t => normalizeTag(t) === activeTag));
  }

  // 2) Zeitraum
  if (timeRange !== "all") {
    const now = Date.now();
    let cutoff = 0;
    if (timeRange === "24h") cutoff = now - 24*60*60*1000;
    else if (timeRange === "7d") cutoff = now - 7*24*60*60*1000;
    else if (timeRange === "30d") cutoff = now - 30*24*60*60*1000;
    if (cutoff > 0) {
      out = out.filter(p => tsToDate(p.createdAt).getTime() >= cutoff);
    }
  }

  // 3) Nur mit Code?
  if (onlyWithCode) {
    out = out.filter(hasCodeInPost);
  }

  // 4) Suche in Titel + Text
  if (searchQuery) {
    out = out.filter(p => {
      const t = (p.title || "").toLowerCase();
      const b = (p.bodyText || "").toLowerCase();
      return t.includes(searchQuery) || b.includes(searchQuery);
    });
  }

  // 5) Sortierung
  out.sort((a, b) => {
    switch (sortMode) {
      case "oldest": {
        const ad = tsToDate(a.createdAt), bd = tsToDate(b.createdAt);
        return ad - bd;
      }
      case "title": {
        return String(a.title || "").localeCompare(String(b.title || ""), "de", { sensitivity: "base" });
      }
      case "likes": {
        const la = Number(a.likeCount || a.likes || 0);
        const lb = Number(b.likeCount || b.likes || 0);
        return lb - la;
      }
      case "comments": {
        const ca = Number(a.commentCount || a.comments || 0);
        const cb = Number(b.commentCount || b.comments || 0);
        return cb - ca;
      }
      case "newest":
      default: {
        const ad = tsToDate(a.createdAt), bd = tsToDate(b.createdAt);
        return bd - ad;
      }
    }
  });

  // 6) Rendern
  if (!out.length) {
    feedEl.innerHTML = `<p style="color:#888;font:14px monospace;">Keine Beiträge gefunden.</p>`;
    return;
  }

  for (const p of out) {
    const item = document.createElement("article");
    item.className = "post-item no-media";

    item.dataset.id = p.id;
    item.tabIndex = 0;
    item.setAttribute("role", "link");
    item.__postPreview = p;

    const content = document.createElement("div");
    content.className = "post-content";

    const codePreview = buildCodePreview(p);

    content.innerHTML = `
      <div class="post-head">
        <span class="post-author">${escapeHtml(p.authorName || "Unbekannt")}</span>
        <span class="post-dot">•</span>
        <span class="post-time">${formatDate(p.createdAt)}</span>
      </div>
      <h3 class="post-title">${escapeHtml(p.title || "Ohne Titel")}</h3>
      ${p.bodyText ? `<div class="post-body-preview">${escapeHtml(truncate(p.bodyText, 220))}</div>` : ""}
      <div class="post-tags">
        ${(p.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join(" ")}
      </div>
      ${codePreview}
    `;

    item.appendChild(content);
    feedEl.appendChild(item);
  }

  try { feedEl.scrollTop = 0; } catch {}
}

/* ──────────────────────────────────────────────────────────────────────
   Interaktion: Klick/Enter → Modal/Seite
──────────────────────────────────────────────────────────────────────── */
feedEl?.addEventListener("click", async (e)=>{
  if (e.button === 1 || e.metaKey || e.ctrlKey) return;
  const item = e.target.closest(".post-item");
  if (!item) return;
  const id = item.dataset.id;
  if (!id) return;

  if (prefersPage()){
    location.href = HYBRID.pageURL(id);
    return;
  }
  e.preventDefault();
  await showPostInModal(id, item.__postPreview, true);
});

feedEl?.addEventListener("keydown", async (e)=>{
  if (e.key !== "Enter") return;
  const item = e.target.closest(".post-item");
  if (!item) return;
  const id = item.dataset.id;
  if (!id) return;

  if (prefersPage()){
    location.href = HYBRID.pageURL(id);
    return;
  }
  e.preventDefault();
  await showPostInModal(id, item.__postPreview, true);
});

/* ──────────────────────────────────────────────────────────────────────
   Modal schließen
──────────────────────────────────────────────────────────────────────── */
modalEl?.addEventListener("click", (e)=>{
  if (e.target.matches("[data-close]") || e.target === modalEl.querySelector(".post-modal__backdrop")){
    closeModal();
  }
});
document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape" && modalEl?.classList.contains("open")){
    closeModal();
  }
});

/* ──────────────────────────────────────────────────────────────────────
   Deep-Link (?post=ID) + History
──────────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async ()=>{
  const qId = new URL(location.href).searchParams.get("post");
  if (!qId) return;

  if (prefersPage()){
    location.replace(HYBRID.pageURL(qId));
    return;
  }
  await showPostInModal(qId, null, false);
});

window.addEventListener("popstate", async (ev)=>{
  const state = ev.state || {};
  if (state.view === "modal" && state.id){
    if (prefersPage()){
      location.replace(HYBRID.pageURL(state.id));
      return;
    }
    await showPostInModal(state.id, null, false);
  } else {
    if (modalEl?.classList.contains("open")) closeModal(false);
  }
});

/* ──────────────────────────────────────────────────────────────────────
   Replies: Composer (mit Avatar) + Live-Liste
──────────────────────────────────────────────────────────────────────── */
function getAuthPhotoURL() {
  const u = auth.currentUser;
  return u?.photoURL || null;
}
async function setComposerAvatar() {
  if (!elReplyAvatar) return;
  const u = auth.currentUser;
  if (!u) { elReplyAvatar.innerHTML = "👤"; return; }
  const prof = await fetchUserProfile(u.uid, u.email, getAuthPhotoURL());
  if (prof.avatar) {
    elReplyAvatar.innerHTML = `<img src="${prof.avatar}" alt="">`;
  } else {
    elReplyAvatar.innerHTML = "👤";
  }
}

function getCurrentDisplayName() {
  const u = auth.currentUser;
  if (!u) return "User";
  return u.displayName || deriveNameFromEmail(u.email) || "User";
}

function setupReplyComposer(postId) {
  if (!elReplyEditor || !elReplySubmit || !elReplyCancel) return;

  setComposerAvatar();

  elReplyCancel.onclick = () => { elReplyEditor.textContent = ""; };

  elReplySubmit.onclick = async () => {
    const u = auth.currentUser;
    if (!u) { alert("Bitte einloggen, um zu antworten."); return; }
    const text = (elReplyEditor.textContent || "").trim();
    if (!text) return;

    const prof = await fetchUserProfile(u.uid, u.email, getAuthPhotoURL());

    try {
      await addDoc(collection(db, "posts", postId, "replies"), {
        text,
        uid: u.uid,
        authorName: prof.name || getCurrentDisplayName(),
        authorAvatar: prof.avatar || null,
        createdAt: serverTimestamp()
      });
      elReplyEditor.textContent = "";
      try { await updateDoc(doc(db, "posts", postId), { commentCount: increment(1) }); } catch {}
    } catch (e) {
      console.error("Reply fehlgeschlagen:", e);
      alert("Antwort konnte nicht gespeichert werden.");
    }
  };
}

let detachReplies = null;

function renderReplyItem(r) {
  const d  = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt ? new Date(r.createdAt) : new Date());
  const ts = d.toLocaleString("de-DE", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });

  const el = document.createElement("div");
  el.className = "pm-reply";

  const avatarEl = document.createElement("div");
  avatarEl.className = "pm-reply-avatar";
  if (r.authorAvatar) {
    avatarEl.innerHTML = `<img src="${r.authorAvatar}" alt="">`;
  } else {
    avatarEl.textContent = "👤";
    if (r.uid) {
      fetchUserProfile(r.uid, null).then(p => {
        if (p.avatar) avatarEl.innerHTML = `<img src="${p.avatar}" alt="">`;
      });
    }
  }

  const bodyEl = document.createElement("div");
  bodyEl.className = "pm-reply-body";
  bodyEl.innerHTML = `
    <div class="pm-reply-head">
      <span class="pm-reply-author">${escapeHtml(r.authorName || "User")}</span>
      <span class="pm-reply-dot">•</span>
      <span class="pm-reply-time">${ts}</span>
    </div>
    <div class="pm-reply-text">${escapeHtml(r.text || "").replace(/\n/g,"<br>")}</div>
  `;

  el.appendChild(avatarEl);
  el.appendChild(bodyEl);
  return el;
}

function attachRepliesStream(postId) {
  if (!elReplies) return;
  if (detachReplies) { try { detachReplies(); } catch {}; detachReplies = null; }

  const q = query(collection(db, "posts", postId, "replies"), orderBy("createdAt", "asc"));
  detachReplies = onSnapshot(q, (snap) => {
    elReplies.innerHTML = "";
    snap.forEach(docSnap => {
      elReplies.appendChild(renderReplyItem({ id: docSnap.id, ...docSnap.data() }));
    });
  }, (err) => console.error("Replies stream error:", err));
}

/* ──────────────────────────────────────────────────────────────────────
   Code-Erkennung + Preview
──────────────────────────────────────────────────────────────────────── */
function hasCodeInPost(p) {
  const html = String(p.bodyHtml || "");
  if (/<pre[^>]*>\s*<code[^>]*>[\s\S]+<\/code>\s*<\/pre>/i.test(html)) return true;

  const txt = String(p.bodyText || "");
  return /```|;|\bfunction\b|\bclass\b|\bpublic\b|\bconst\b|\bvar\b|\blet\b/.test(txt);
}

function buildCodePreview(p) {
  const html = String(p.bodyHtml || "");
  let code = "";

  const m = html.match(/<pre[^>]*>\s*<code[^>]*>([\s\S]+?)<\/code>\s*<\/pre>/i);
  if (m) {
    code = decodeHtmlEntities(m[1]);
  } else {
    const txt = String(p.bodyText || "");
    if (!txt) return "";
    const lines = txt.split(/\r?\n/);
    const picked = [];
    for (const line of lines) {
      if (line.trim().length === 0 && picked.length === 0) continue;
      picked.push(line);
      if (picked.length >= 8) break;
    }
    code = picked.join("\n").trim();
    if (!code) return "";
  }

  const maxChars = 500;
  if (code.length > maxChars) code = code.slice(0, maxChars - 1) + "…";

  const safe = escapeHtml(code);

  return `
    <div class="post-code-preview" style="
      margin-top:10px; border:1px solid #2a2a2a; border-radius:10px;
      background:#0f0f0f; overflow:auto;
    ">
      <pre style="margin:0; padding:10px; font:12px/1.35 monospace; color:#dfe9e6; white-space:pre;">
${safe}
      </pre>
    </div>
  `;
}
function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/* ──────────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────────────── */
function truncate(str, n) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
  );
}
function tsToDate(ts) {
  return ts?.toDate ? ts.toDate() : new Date(ts || 0);
}
function formatDate(ts) {
  const d = tsToDate(ts);
  if (isNaN(d)) return "";
  return d.toLocaleString("de-DE", {
    day:"2-digit", month:"2-digit",
    hour:"2-digit", minute:"2-digit"
  });
}

/* ──────────────────────────────────────────────────────────────────────
   Scroll-Fix: Feed startet immer oben
──────────────────────────────────────────────────────────────────────── */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.addEventListener('pageshow', () => {
  const el = document.getElementById('postFeed');
  if (el) el.scrollTop = 0;
});
window.addEventListener('load', () => {
  const el = document.getElementById('postFeed');
  if (el) el.scrollTop = 0;
});

function scrollFeedToTop() {
  const el = document.getElementById('postFeed');
  if (el && getComputedStyle(el).overflowY !== 'visible') {
    el.scrollTop = 0;
    requestAnimationFrame(() => el.scrollTop = 0);
  } else {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}
window.addEventListener('load', scrollFeedToTop);
window.addEventListener('pageshow', scrollFeedToTop);

let _didInitialTopScroll = false;
function forceTopOnceAfterRender() {
  if (_didInitialTopScroll) return;
  _didInitialTopScroll = true;
  requestAnimationFrame(() => { setTimeout(scrollFeedToTop, 0); });
}

// 👉 Optional: mach toggleFavorite global erreichbar (für Inline-HTML-Buttons)
window.toggleFavorite = toggleFavorite;