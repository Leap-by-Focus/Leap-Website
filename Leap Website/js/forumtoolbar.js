document.addEventListener("DOMContentLoaded", () => {
  const toolbar = document.querySelector(".toolbar");
  const postBody = document.querySelector(".post-body");

  if (toolbar && postBody) {
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.value || null;
      document.execCommand(cmd, false, val);
      postBody.focus();
    });
  }
});