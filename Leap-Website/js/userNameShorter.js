function fitCharacterName() {
    const box = document.querySelector('.CharacterName');
    if (!box) return;
  
    let fontSize = 20; // Startgröße
    box.style.fontSize = fontSize + 'px';
  
    // Solange der Text breiter ist als die Box UND die Schrift noch nicht zu klein ist
    while (box.scrollWidth > box.clientWidth && fontSize > 8) {
      fontSize -= 1; // Verkleinere die Schrift
      box.style.fontSize = fontSize + 'px';
    }
  }
  
  // Aufrufen wenn Seite geladen ist
  window.addEventListener('load', fitCharacterName);
  // Aufrufen wenn Fenstergröße sich ändert
  window.addEventListener('resize', fitCharacterName);