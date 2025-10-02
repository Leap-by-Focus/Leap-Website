// /js/postsFeed.js
import { db } from "./firebaseauth.js";
import {
  collection, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* -------------------------------
   Tag-Alias (zu deinen data-tag Werten)
---------------------------------- */
const TAG_ALIAS = {
  beliebt:"beliebt",
  fragen:"fragen",
  "leap-projekte":"leap-projekte",
  diskussion:"diskussion",
  bugs:"bugs",
  feedback:"feedback",
  memes:"memes",
  java:"java",
  csharp:"csharp",
  python:"python",
  html:"html",    // "Web" mapped to html
  web:"html",
  sql:"sql",
  "c-cpp":"c-cpp", c:"c-cpp", cpp:"c-cpp",
};

/* -------------------------------
   DOM & State
---------------------------------- */
const feedEl = document.getElementById("postFeed");
let activeTag = null;

/* -------------------------------
   Live lesen (neueste zuerst)
---------------------------------- */
const q = query(collection(db,"posts"), orderBy("createdAt","desc"));
onSnapshot(q, (snap) => {
  const posts = [];
  snap.forEach((doc) => posts.push({ id: doc.id, ...doc.data() }));
  renderPosts(posts);
});

/* -------------------------------
   Render
---------------------------------- */
function renderPosts(posts){
  if (!feedEl) return;
  feedEl.classList.add("feed", "post-feed"); // falls CSS darauf hört
  feedEl.innerHTML = "";

  const filtered = activeTag
    ? posts.filter(p => (p.tags||[]).map(x=>String(x).toLowerCase()).includes(activeTag))
    : posts;

  if (!filtered.length){
    feedEl.innerHTML = `<p style="color:#888;font:14px monospace;">Keine Beiträge gefunden.</p>`;
    return;
  }

  for (const p of filtered){
    const images = getAllImages(p);     // [] oder [urls...]
    const hasMedia = images.length > 0;

    const item = document.createElement("article");
    item.className = "post-item" + (hasMedia ? "" : " no-media");

    // linke Spalte
    const content = document.createElement("div");
    content.className = "post-content";
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
    `;
    item.appendChild(content);

    // rechte Spalte (1–3 Thumbnails)
    if (hasMedia){
      const mediaWrap = document.createElement("div");
      mediaWrap.className = "post-media-multi";

      const maxThumbs = 3;
      const toShow = images.slice(0, maxThumbs);

      toShow.forEach((url, idx) => {
        const a = document.createElement("a");
        a.href = "#"; // später Detailseite/Lightbox
        a.className = "post-media";

        // Bei > maxThumbs zeige "+X" auf dem letzten
        if (idx === maxThumbs - 1 && images.length > maxThumbs){
          const more = images.length - maxThumbs;
          a.classList.add("more");
          a.setAttribute("data-more", `+${more}`);
        }

        a.innerHTML = `<img src="${url}" alt="">`;
        mediaWrap.appendChild(a);
      });

      item.appendChild(mediaWrap);
    }

    feedEl.appendChild(item);
  }
}

/* -------------------------------
   Helpers
---------------------------------- */
function truncate(str, n){
  const s = String(str || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function escapeHtml(str){
  return (str || "").replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
  );
}

function formatDate(ts){
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("de-DE",{
    day:"2-digit", month:"2-digit",
    hour:"2-digit", minute:"2-digit"
  });
}

/* Liefert alle möglichen Bild-URLs in einheitlichem Array
   Unterstützt:
   - coverUrl: "..."
   - imageUrls: ["...", "..."]
   - images: [{url:"..."}]
*/
function getAllImages(p){
  if (Array.isArray(p.imageUrls)) return p.imageUrls.filter(Boolean);
  if (Array.isArray(p.images)) return p.images.map(x => x?.url).filter(Boolean);
  if (p.coverUrl) return [p.coverUrl];
  return [];
}

/* -------------------------------
   SideMenu: Tag-Filter
---------------------------------- */
document.querySelectorAll(".sideMenu button[data-tag]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const raw = (btn.dataset.tag || "").toLowerCase().trim();
    activeTag = TAG_ALIAS[raw] || raw || null;

    document.querySelectorAll(".sideMenu button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});