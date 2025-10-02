// /js/createPost.js
import { auth, db } from "./firebaseauth.js";
import {
  collection, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".create-form");
  if (!form) return;

  const titleEl  = form.querySelector(".post-title");
  const bodyEl   = form.querySelector(".post-body");
  const submitEl = form.querySelector(".submit-post");
  const storage  = getStorage();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitEl?.setAttribute("disabled", "true");

    try {
      // Auth
      const user = auth.currentUser;
      if (!user) {
        alert("Bitte einloggen, um einen Beitrag zu erstellen.");
        return;
      }

      // Eingaben
      const title    = (titleEl?.value ?? "").trim();
      const bodyHtml = (bodyEl?.innerHTML ?? "").trim();
      const bodyText = (bodyEl?.textContent ?? "").trim();

      if (!title)    throw new Error("Bitte einen Titel eingeben.");
      if (!bodyText) throw new Error("Bitte einen Beitragstext eingeben.");

      const tags = (window.getSelectedTags?.() ?? [])
        .map(t => String(t).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);

      const images = window.getSelectedImages?.() ?? [];
      console.log("[createPost] ausgewählte Bilder:", images.map(f => f.name));

      // Doc-ID vorab erzeugen
      const postRef = doc(collection(db, "posts"));

      // Bilder hochladen
      let imageUrls = [];
      if (images.length) {
        imageUrls = await Promise.all(images.map(async (file, idx) => {
          const safe = file.name.replace(/[^\w.\-]+/g, "_");
          const path = `posts/${postRef.id}/${Date.now()}_${idx}_${safe}`;
          const fileRef = ref(storage, path);
          await uploadBytes(fileRef, file);
          return await getDownloadURL(fileRef);
        }));
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
      });

      // UI reset
      if (titleEl) titleEl.value = "";
      if (bodyEl)  bodyEl.innerHTML = "";
      window.clearSelectedTags?.();
      window.clearSelectedImages?.();

      // Panel schließen nach Erfolg
      const createBtn   = document.getElementById("createBtn");
      const createPanel = document.getElementById("createPanel");
      createBtn?.classList.remove("expand");
      createPanel?.classList.remove("open");

    } catch (err) {
      console.error(err);
      alert(err?.message || "Beitrag konnte nicht erstellt werden.");
    } finally {
      submitEl?.removeAttribute("disabled");
    }
  });
});