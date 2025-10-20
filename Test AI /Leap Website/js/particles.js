const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const baseParticles = [];     // Permanente Hintergrundpartikel
const drawnParticles = [];    // Vergängliche Mauspartikel
const mouse = { x: null, y: null };
let lastDrawTime = 1;
let interval = 1;

function setParticleInterval(seconds) {
    interval = seconds * 300;
}

class Particle {
    constructor(x, y, size, speedX, speedY, lifespan = null) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.speedX = speedX;
        this.speedY = speedY;
        this.lifespan = lifespan; // null = unendlich
        this.initialLifespan = lifespan;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvas.width || this.x < 1) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 1) this.speedY *= -1;

        if (this.lifespan !== null && this.lifespan > 0) {
            this.lifespan -= 1;
            this.size *= 0.99;
        }
    }

    draw() {
        if (this.lifespan !== null && this.lifespan <= 0) return;

        const alpha = this.lifespan !== null
            ? this.lifespan / this.initialLifespan
            : 1;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
    }

    isAlive() {
        return this.lifespan === null || this.lifespan > 0 && this.size >= 0.5;
    }
}

function initBaseParticles() {
    baseParticles.length = 0;
    for (let i = 0; i < 200; i++) {
        let size = Math.random() * 3 + 2;
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        let speedX = (Math.random() - 0.5) * 1;
        let speedY = (Math.random() - 0.5) * 1;
        baseParticles.push(new Particle(x, y, size, speedX, speedY, null));
    }
}

function connectParticles(allParticles) {
    for (let i = 0; i < allParticles.length; i++) {
        for (let j = i + 1; j < allParticles.length; j++) {
            let dx = allParticles[i].x - allParticles[j].x;
            let dy = allParticles[i].y - allParticles[j].y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 100) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${1 - distance / 100})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(allParticles[i].x, allParticles[i].y);
                ctx.lineTo(allParticles[j].x, allParticles[j].y);
                ctx.stroke();
            }
        }
    }
}

function isAreaTooCrowded(x, y, radius = 30, limit = 10) {
    let count = 0;
    for (let p of [...baseParticles, ...drawnParticles]) {
        let dx = p.x - x;
        let dy = p.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < radius) {
            count++;
            if (count > limit) return true;
        }
    }
    return false;
}

canvas.addEventListener("mousemove", (event) => {
    const now = Date.now();
    if (now - lastDrawTime >= interval) {
        mouse.x = event.x;
        mouse.y = event.y;

        if (!isAreaTooCrowded(mouse.x, mouse.y)) {
            drawnParticles.push(new Particle(mouse.x, mouse.y, 4, 0, 0, 150));
            lastDrawTime = now;
        }
    }
});

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update und Zeichne alle Base Particles
    for (let p of baseParticles) {
        p.update();
        p.draw();
    }

    // Update und Zeichne alle gezeichneten Partikel
    for (let i = drawnParticles.length - 1; i >= 0; i--) {
        let p = drawnParticles[i];
        p.update();
        p.draw();
        if (!p.isAlive()) {
            drawnParticles.splice(i, 1);
        }
    }

    // Linienverbindung zwischen allen Partikeln
    connectParticles([...baseParticles, ...drawnParticles]);

    requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initBaseParticles();
});

setParticleInterval(0.4);
initBaseParticles();
animate();