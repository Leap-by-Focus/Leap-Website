document.addEventListener('scroll', function () {
    const image = document.querySelector('.info-section-main-pic');
    const scrollY = window.scrollY;

    // Positioniere das Bild in der Mitte des Bildschirms
    image.style.position = 'fixed'; // Fixiere das Bild in der Mitte des Bildschirms
    image.style.top = '50%'; // Vertikal zentriert
    image.style.left = '50%'; // Horizontal zentriert
    image.style.transformOrigin = 'center'; // Setzt den Ursprung der Transformation auf die Mitte

    // Animation startet erst nach 100vh Scroll
    const start = window.innerHeight;
    const end = start + 200; // wie weit die Animation gehen soll

    if (scrollY < start) {
        // Reset Zustand
        image.style.transform = `scale(1) translate(-50%, -50%)`; // Bild bleibt in der Mitte
    } else if (scrollY >= start && scrollY <= end) {
        const progress = (scrollY - start) / (end - start); // 0 bis 1
        const scale = 1 - (0.7 * progress); // von 1 bis 0.3
        const translateX = 200 * progress; // von 0 bis 200px

        image.style.transform = `scale(${scale}) translate(-50%, -50%) translateX(${translateX}px)`;
    } else {
        // Endzustand
        image.style.transform = `scale(0.3) translate(-50%, -50%) translateX(200px)`;
    }
});