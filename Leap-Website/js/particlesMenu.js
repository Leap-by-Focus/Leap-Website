// particlesMenu.js
(() => {
  const canvas = document.getElementById("particleCanvas");
  if (!canvas) return; // Seite ohne Canvas -> leise raus

  const ctx = canvas.getContext("2d", { alpha: true });

  // ---- Canvas Setup (sichtbar machen) ----
  function sizeCanvas() {
    // Höhe an die Gradient-Leiste koppeln, fallback 120px
    const grad = document.querySelector(".gradient-transition");
    const targetH = Math.max(80, (grad?.offsetHeight || 120));
    canvas.width  = window.innerWidth;
    canvas.height = targetH;
  }
  sizeCanvas();

  // ---- Partikel-Config ----
  let particleColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--particle-color")
    .trim() || "#00e3b6";

  const baseParticles = [];
  const drawnParticles = [];
  let lastDrawTime = 1;
  let interval = 120; // ms

  function setParticleInterval(seconds) {
    interval = Math.max(30, seconds * 300);
  }

  class Particle {
    constructor(x, y, size, speedX, speedY, lifespan = null) {
      this.x = x; this.y = y;
      this.size = size;
      this.speedX = speedX; this.speedY = speedY;
      this.lifespan = lifespan;
      this.initialLifespan = lifespan;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      if (this.x > canvas.width || this.x < 1) this.speedX *= -1;
      if (this.y > canvas.height || this.y < 1) this.speedY *= -1;

      if (this.lifespan !== null && this.lifespan > 0) {
        this.lifespan -= 1;
        this.size *= 0.995;
      }
    }
    draw() {
      if (this.lifespan !== null && this.lifespan <= 0) return;

      const alpha = this.lifespan !== null
        ? Math.max(0, this.lifespan / (this.initialLifespan || 1))
        : 0.9;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = hexOrCssToRgba(particleColor, alpha);
      ctx.fill();
    }
    isAlive() {
      return this.lifespan === null || (this.lifespan > 0 && this.size >= 0.4);
    }
  }

  function initBaseParticles() {
    baseParticles.length = 0;
    const count = Math.round(canvas.width / 30); // responsiv
    for (let i = 0; i < count; i++) {
      const size = Math.random() * 1.2 + 0.4;
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const speedX = (Math.random() - 0.5) * 0.8;
      const speedY = (Math.random() - 0.5) * 0.4;
      baseParticles.push(new Particle(x, y, size, speedX, speedY, null));
    }
  }

  function connectParticles(all) {
    ctx.lineWidth = 0.35;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dx = all[i].x - all[j].x;
        const dy = all[i].y - all[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < 100) {
          const alpha = (1 - dist / 100) * 0.6;
          ctx.strokeStyle = hexOrCssToRgba(particleColor, alpha);
          ctx.beginPath();
          ctx.moveTo(all[i].x, all[i].y);
          ctx.lineTo(all[j].x, all[j].y);
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of baseParticles) { p.update(); p.draw(); }

    for (let i = drawnParticles.length - 1; i >= 0; i--) {
      const p = drawnParticles[i];
      p.update(); p.draw();
      if (!p.isAlive()) drawnParticles.splice(i, 1);
    }

    connectParticles([...baseParticles, ...drawnParticles]);

    requestAnimationFrame(animate);
  }

  // ---- Utilities ----
  function hexOrCssToRgba(color, a = 1) {
    // bereits rgba/hsla?
    if (/rgba?\(/i.test(color) || /hsla?\(/i.test(color)) {
      return color.replace(/\)\s*$/, `, ${a})`).replace(/(rgb|hsl)\(/i, '$1a(');
    }
    // hex -> rgba
    let c = color.replace('#', '').trim();
    if (c.length === 3) {
      c = c.split('').map(ch => ch + ch).join('');
    }
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // ---- Public API, damit forumButtonSettings.js die Farbe ändern kann ----
  window.updateParticles = (opts = {}) => {
    if (opts.color) particleColor = opts.color;
    if (typeof opts.interval === "number") setParticleInterval(opts.interval);
  };

  // ---- Events ----
  window.addEventListener("resize", () => {
    sizeCanvas();
    initBaseParticles();
  });

  // ---- Start ----
  setParticleInterval(0.4);
  initBaseParticles();
  animate();
})();