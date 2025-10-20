document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("expandButton");
  const expandedContent = document.getElementById("expandedContent");
  const label = button.querySelector(".buttonLabel");

  button.addEventListener("click", (e) => {
    // Verhindere das Klick-Event auf Video den Button "close/open" triggert
    if (e.target.tagName.toLowerCase() === "video") return;

    const isExpanded = button.classList.toggle("expanded");

    if (isExpanded) {
      // Inhalt anzeigen & Button-Text ausblenden passiert durch CSS
    } else {
      // Inhalt verstecken & Button-Text zeigen passiert durch CSS
    }
  });

  // Video click & dblclick handlers
  document.querySelectorAll('.video').forEach(video => {
    video.addEventListener('click', (event) => {
      event.stopPropagation();
      if (video.paused) video.play();
      else video.pause();
    });

    video.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      if (video.requestFullscreen) video.requestFullscreen();
      else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
      else if (video.mozRequestFullScreen) video.mozRequestFullScreen();
      else if (video.msRequestFullscreen) video.msRequestFullscreen();
    });
  });
});