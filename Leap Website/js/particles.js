const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = [];
const mouse = { x: null, y: null };
let lastDrawTime = 0;
let interval = 1; // Standardmäßig 1 Sekunde (1000 Millisekunden)

// Funktion zum Setzen der Zeichen-Geschwindigkeit
function setParticleInterval(seconds) {
    interval = seconds * 300; // Umrechnung in Millisekunden
}

// Partikel-Klasse
class Particle {
    constructor(x, y, size, speedX, speedY) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.speedX = speedX;
        this.speedY = speedY;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 0) this.speedY *= -1;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fill();
    }
}

// Initialisiere Partikel
function initParticles() {
    particles.length = 0;
    for (let i = 0; i < 200; i++) {
        let size = Math.random() * 3 + 2;
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        let speedX = (Math.random() - 0.5) * 1;
        let speedY = (Math.random() - 0.5) * 1;
        particles.push(new Particle(x, y, size, speedX, speedY));
    }
}

// Verbindet Partikel mit Linien
function connectParticles() {
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            let dx = particles[i].x - particles[j].x;
            let dy = particles[i].y - particles[j].y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 100) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${1 - distance / 100})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
}

// 🖱️ Partikel nur in festen Zeitabständen zeichnen
canvas.addEventListener("mousemove", (event) => {
    const now = Date.now();
    if (now - lastDrawTime >= interval) {
        mouse.x = event.x;
        mouse.y = event.y;
        particles.push(new Particle(mouse.x, mouse.y, 4, 0, 0));
        lastDrawTime = now;
    }
});

// 🎞️ Animation Loop
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let particle of particles) {
        particle.update();
        particle.draw();
    }
    connectParticles();
    requestAnimationFrame(animate);
}

// 📏 Fenstergröße anpassen
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
});

// 💡 Beispiel: Ändere die Zeichenrate auf 0.5 Sekunden (500ms)
setParticleInterval(0.5); // Du kannst die Zahl ändern!

// 🚀 Start
initParticles();
animate();