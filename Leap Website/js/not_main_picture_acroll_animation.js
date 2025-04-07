document.addEventListener('scroll', function () {
    const image = document.querySelector('.info-section-main-pic');
    const scrollY = window.scrollY;

    // Animation startet erst nach 100vh Scroll
    const start = window.innerHeight;
    const end = start + 300; // wie weit die Animation gehen soll

    if (scrollY < start) {
        // Reset Zustand
        image.style.transform = `scale(1) translateX(0px)`;
    } else if (scrollY >= start && scrollY <= end) {
        const progress = (scrollY - start) / (end - start); // 0 bis 1
        const scale = 1 - (0.7 * progress); // von 1 bis 0.3
        const translateX = 200 * progress; // von 0 bis 200px

        image.style.transform = `scale(${scale}) translateX(${translateX}px)`;
    } else {
        // Endzustand
        image.style.transform = `scale(0.3) translateX(200px)`;
    }
});