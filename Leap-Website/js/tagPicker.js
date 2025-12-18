// /js/tagPicker.js
import { db } from "./firebaseauth.js";
import {
  collection, getDocs, orderBy, limit, doc, setDoc, increment
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const tagInput   = document.getElementById("tagInput");
  const tagListEl  = document.getElementById("tagList");
  const suggestEl  = document.getElementById("tagSuggest");
  const form       = document.querySelector(".create-form");
  const searchBox  = document.querySelector(".search-input");

  if (!tagInput || !tagListEl || !suggestEl) return;

  let selected = [];     // ['web', 'hilfe']
  let knownTags = [];    // [{id:'web', count:123}, ...]

  /* ---------- Lade bestehende Tags (Top 50) ---------- */
  (async function loadKnown() {
    try {
      const snap = await getDocs(
        // sortiere nach count absteigend, limitiere
        // (falls du kein 'count' Feld hast, lass orderBy/limit weg)
        // fallback ohne orderBy:
        // collection(db, "tags")
        // Mit orderBy:
        (collection(db, "tags"))
      );
      const arr = [];
      snap.forEach(d => {
        const id = d.id;
        const count = Number(d.data()?.count || 0);
        arr.push({ id, count });
      });
      // sort desc
      arr.sort((a,b) => b.count - a.count);
      knownTags = arr.slice(0, 50);
    } catch (e) {
      knownTags = [];
    }
  })();

  /* ---------- Utils ---------- */
  const norm = s => (s||"")
    .trim()
    .replace(/^#/,'')
    .toLowerCase()
    .replace(/\s+/g,'-')       // spaces -> dashes
    .replace(/[^a-z0-9-_]/g,'') // safe
    .slice(0,30);

  function renderChips(){
    tagListEl.innerHTML = "";
    selected.forEach(t => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `<span>#${t}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label","Tag entfernen");
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        selected = selected.filter(x => x !== t);
        renderChips();
      });
      chip.appendChild(btn);
      tagListEl.appendChild(chip);
    });
  }

  function openSuggest(items){
    suggestEl.innerHTML = "";
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "tag-suggest-item" + (it.new ? " new" : "");
      row.innerHTML = `<span>#${it.id}</span><span class="count">${it.new ? "neu" : (it.count ?? 0)}</span>`;
      row.addEventListener("click", () => {
        addTag(it.id);
        closeSuggest();
        tagInput.value = "";
        tagInput.focus();
      });
      suggestEl.appendChild(row);
    });
    suggestEl.classList.add("open");
  }
  function closeSuggest(){
    suggestEl.classList.remove("open");
    suggestEl.innerHTML = "";
  }

  function addTag(raw){
    const t = norm(raw);
    if (!t) return;
    if (selected.includes(t)) return;
    if (selected.length >= 5) return; // Limit, falls gewünscht
    selected.push(t);
    renderChips();
  }

  function currentSuggestions(q){
    const qn = norm(q);
    if (!qn) return [];
    const exists = knownTags.filter(k => k.id.includes(qn)).slice(0,8);
    if (!exists.find(e => e.id === qn)) {
      exists.unshift({ id: qn, count: 0, new: true });
    }
    return exists;
  }

  /* ---------- Input-Handling ---------- */
  tagInput.addEventListener("input", () => {
    const q = tagInput.value;
    if (!q || q.trim() === "") { closeSuggest(); return; }
    openSuggest(currentSuggestions(q));
  });

  tagInput.addEventListener("keydown", (e) => {
    // Enter / Komma / Space -> Tag übernehmen
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addTag(tagInput.value);
      tagInput.value = "";
      closeSuggest();
    } else if (e.key === "Backspace" && tagInput.value === "" && selected.length) {
      // Backspace bei leerem Input -> letztes Tag entfernen
      selected.pop();
      renderChips();
    } else if (e.key === "Escape") {
      closeSuggest();
    }
  });

  document.addEventListener("click", (e) => {
    if (!suggestEl.contains(e.target) && e.target !== tagInput) {
      closeSuggest();
    }
  });

  /* ---------- Export für Absenden ---------- */
  window.getSelectedTags = () => selected.slice();

  /* ---------- Beim Absenden Tags mitspeichern ---------- */
  form?.addEventListener("submit", async () => {
    const tags = window.getSelectedTags();
    // mache sie global verfügbar für deinen Submit-Code
    form.dataset.tags = JSON.stringify(tags);

    // Tags in Coll. 'tags' hochzählen (Count)
    // (kann auch serverseitig passieren – hier clientseitig pragmatisch)
    try {
      const batchPromises = tags.map(t =>
        setDoc(doc(db, "tags", t), { count: increment(1) }, { merge: true })
      );
      await Promise.all(batchPromises);
    } catch (e) {
      // nicht kritisch für den Submit
      console.warn("Tag-Count update skipped:", e?.message || e);
    }
  });

  /* ---------- Suche: #tag im Suchfeld ---------- */
  searchBox?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const v = (searchBox.value || "").trim();
    const m = v.match(/^#([a-z0-9-_]{1,30})$/i);
    if (!m) return;
    e.preventDefault();
    const tag = m[1].toLowerCase();
    // Dein Routing/Filter hier – wir feuern ein Custom-Event
    document.dispatchEvent(new CustomEvent("searchByTag", { detail: { tag }}));
    // optional: Suchfeld leeren oder beibehalten
    // searchBox.value = "";
  });

  // Beispiel: irgendwo in deiner App abfangen
  document.addEventListener("searchByTag", (e) => {
    const { tag } = e.detail;
    console.log("Suche nach Tag:", tag);
    // TODO: hier deine Post-Liste filtern / Firestore-Query nach Beiträgen mit tags enthält 'tag'
  });
});