document.querySelectorAll(".usernameDisplay").forEach(el => {
  el.textContent = username; // kommt aus Firestore
});