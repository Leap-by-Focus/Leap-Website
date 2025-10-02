// z.B. /js/searchPosts.js (als eigenes Modul einbinden,  NUR LESEN – nix ändert deinen Code)
import { db } from "./firebaseauth.js";
import {
  collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector(".search-input");
  const btn   = document.querySelector(".search-btn");
  if (!input || !btn) return;

  async function runSearch() {
    const q = input.value.trim();
    const postsRef = collection(db, "posts");

    let qRef;
    if (q.startsWith("#") && q.length > 1) {
      const tag = q.slice(1).toLowerCase(); // falls du Tags lowercase speicherst
      // Array-Filter auf Tags
      qRef = query(postsRef,
        where("tags", "arrayContains", tag),
        orderBy("createdAt", "desc"),
        limit(50)
      );
    } else {
      // einfache Fallback-Suche: nach Zeit
      qRef = query(postsRef, orderBy("createdAt", "desc"), limit(50));
    }

    const snap = await getDocs(qRef);
    // TODO: hier rendern (Liste deiner Beiträge im UI)
    console.log("Search results:", snap.docs.map(d => d.data()));
  }

  btn.addEventListener("click", (e) => { e.preventDefault(); runSearch(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); runSearch(); }
  });
});