// /js/createPost.js
import { auth, db } from "./firebaseauth.js";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

document.addEventListener("DOMContentLoaded", () => {
  // --- Grund-Elemente ---
  const createBtn       = document.getElementById("createBtn");
  const createPanel     = document.getElementById("createPanel");
  const createContainer = document.querySelector(".create-container");
  const form            = createPanel?.querySelector(".create-form");
  const titleEl         = form?.querySelector(".post-title");
  const bodyEl          = form?.querySelector(".post-body");
  const submitEl        = form?.querySelector(".submit-post");
  const storage         = getStorage();

  // Tag-UI-Elemente
  const tagInput   = document.getElementById("tagInput");
  const tagListEl  = document.getElementById("tagList");
  const tagSuggest = document.getElementById("tagSuggest");

  if (!createBtn || !createPanel || !form || !titleEl || !bodyEl || !submitEl) {
    console.warn("[createPost] Not all elements found, aborting init.");
    return;
  }

  // 6-stellige Kurz-ID aus der Firestore-Dokument-ID erzeugen
  function computeShortIdFromDocId(docId) {
    let hash = 0;
    const src = String(docId || "");
    for (let i = 0; i < src.length; i++) {
      hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
    }
    const num = hash % 1_000_000; // 0–999999
    return num;                   // als Number
  }

  // 🔹 Basis-Tags (Fallback)
  let TAGS = [
    "Diskussion",
    "Memes & Spaß",
    "Java",
    "C#",
    "Python",
    "Web",
    "SQL",
    "Fragen & Hilfe",
    "Leap-Projekte",
  ];

  // 🔹 Aus Firestore dynamisch erweitern (tags-Collection)
  (async () => {
    try {
      const qTags = query(
        collection(db, "tags"),
        orderBy("count", "desc"),
        limit(50)
      );
      const snap = await getDocs(qTags);

      const dynamic = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d?.name) dynamic.push(String(d.name));
      });

      const merged = Array.from(new Set([...TAGS, ...dynamic]));
      TAGS = merged;
      console.log("[TagSuggestions] geladen:", TAGS);
    } catch (e) {
      console.warn("[TagSuggestions] konnte Tags nicht laden:", e);
    }
  })();

  // =========================
  //  PANEL: Öffnen / Schließen
  // =========================
  let panelOpen = false;

  function openPanel() {
    panelOpen = true;
    createPanel.classList.add("open");
    createBtn.classList.add("expand");
  }

  function closePanel() {
    panelOpen = false;
    createPanel.classList.remove("open");
    createBtn.classList.remove("expand");
    if (tagSuggest) {
      tagSuggest.innerHTML = "";
      tagSuggest.classList.remove("open");
    }
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
  }

  // Klick auf "Neuer Beitrag" → Panel toggeln
  createBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // verhindert, dass document-Click es direkt wieder schließt
    togglePanel();
  });

  // Klick außerhalb → Panel schließen
  document.addEventListener("click", (e) => {
    if (!panelOpen) return;
    const target = e.target;
    // innerhalb der create-container: NICHT schließen
    if (createContainer && createContainer.contains(target)) return;
    closePanel();
  });

  // =========================
  //  TAG-PICKER
  // =========================
  const selectedTags = new Set();

  function renderSelectedTags() {
    if (!tagListEl) return;
    tagListEl.innerHTML = "";
    selectedTags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.dataset.tag = tag;

      const label = document.createElement("span");
      label.textContent = "#" + tag;

      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.innerHTML = "×";

      chip.appendChild(label);
      chip.appendChild(btnRemove);

      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation(); // Panel bleibt offen
      });

      btnRemove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedTags.delete(tag);
        renderSelectedTags();
      });

      tagListEl.appendChild(chip);
    });
  }

  function addTag(tag) {
    tag = String(tag).trim();
    if (!tag) return;
    selectedTags.add(tag);
    renderSelectedTags();
  }

  function hideSuggestions() {
    if (!tagSuggest) return;
    tagSuggest.innerHTML = "";
    tagSuggest.classList.remove("open");
  }

  function showSuggestions(items) {
    if (!tagSuggest) return;
    tagSuggest.innerHTML = "";
    if (!items.length) {
      hideSuggestions();
      return;
    }

    items.forEach(({ tag, isNew }) => {
      const item = document.createElement("div");
      item.className = "tag-suggest-item" + (isNew ? " new" : "");
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const label = document.createElement("span");
      label.textContent = "#" + tag;

      if (isNew) {
        const badge = document.createElement("span");
        badge.className = "count";
        badge.textContent = "neu";
        item.appendChild(label);
        item.appendChild(badge);
      } else {
        item.appendChild(label);
      }

      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation(); // Panel soll offen bleiben
        addTag(tag);
        if (tagInput) tagInput.value = "";
        hideSuggestions();
      });

      tagSuggest.appendChild(item);
    });

    tagSuggest.classList.add("open");
  }

  // Vorschläge beim Tippen anzeigen
  tagInput?.addEventListener("input", () => {
    const val = tagInput.value.toLowerCase().trim();
    if (!val) {
      hideSuggestions();
      return;
    }

    // bekannte Tags filtern
    const filtered = TAGS.filter((t) => t.toLowerCase().includes(val));
    const suggestionItems = [];

    filtered.forEach((tag) => {
      suggestionItems.push({ tag, isNew: false });
    });

    // Wenn der eingegebene Wert noch kein existierender Tag ist → "neu"-Vorschlag
    if (!TAGS.some((t) => t.toLowerCase() === val)) {
      suggestionItems.unshift({ tag: val, isNew: true });
    }

    showSuggestions(suggestionItems);
  });

  // Enter im Tag-Input → ersten Vorschlag übernehmen (falls da)
  tagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();

      const val = tagInput.value.toLowerCase().trim();
      if (!val) return;

      // Priorität: exakter Match, sonst das, was gerade getippt ist
      const exact = TAGS.find((t) => t.toLowerCase() === val);
      addTag(exact || val);
      tagInput.value = "";
      hideSuggestions();
    }
  });

  // Klicks INS Tag-Suggest-Bereich sollen NICHT als "outside" zählen
  tagSuggest?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // API für andere Skripte (hier für den Submit)
  window.getSelectedTags = () => Array.from(selectedTags);
  window.clearSelectedTags = () => {
    selectedTags.clear();
    renderSelectedTags();
    hideSuggestions();
  };

  // =========================
  //  BEITRAG ERSTELLEN (Submit)
  // =========================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!submitEl) return;

    submitEl.setAttribute("disabled", "true");

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Bitte einloggen, um einen Beitrag zu erstellen.");
      }

      const title    = (titleEl?.value ?? "").trim();
      const bodyHtml = (bodyEl?.innerHTML ?? "").trim();
      const bodyText = (bodyEl?.textContent ?? "").trim();

      if (!title)    throw new Error("Bitte einen Titel eingeben.");
      if (!bodyText) throw new Error("Bitte einen Beitragstext eingeben.");

      const tags = (window.getSelectedTags?.() ?? [])
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);

      const images = window.getSelectedImages?.() ?? [];
      console.log("[createPost] ausgewählte Bilder:", images.map((f) => f.name));

      // Doc-ID vorab erzeugen
      const postRef = doc(collection(db, "posts"));
      const shortId = computeShortIdFromDocId(postRef.id);

      // Bilder hochladen
      let imageUrls = [];
      if (images.length) {
        imageUrls = await Promise.all(
          images.map(async (file, idx) => {
            const safe = file.name.replace(/[^\w.\-]+/g, "_");
            const path = `posts/${postRef.id}/${Date.now()}_${idx}_${safe}`;
            const fileRef = ref(storage, path);
            await uploadBytes(fileRef, file);
            return await getDownloadURL(fileRef);
          })
        );
      }

      const authorName =
        user.displayName || (user.email ? user.email.split("@")[0] : "User");

      await setDoc(postRef, {
        title,
        bodyHtml,
        bodyText,
        tags,
        imageUrls,
        coverUrl: imageUrls[0] || "",
        authorUid: user.uid,
        authorName,
        createdAt: serverTimestamp(),
        shortId, // 🔹 hier speichern
      });

      // UI reset
      titleEl.value = "";
      bodyEl.innerHTML = "";
      window.clearSelectedTags?.();
      window.clearSelectedImages?.();

      // Panel nach Erfolg schließen
      closePanel();
    } catch (err) {
      console.error("[createPost] Fehler beim Erstellen:", err);
      alert(err?.message || "Beitrag konnte nicht erstellt werden.");
    } finally {
      submitEl.removeAttribute("disabled");
    }
  });
});