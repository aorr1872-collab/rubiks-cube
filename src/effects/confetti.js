// Lightweight confetti on a full-page canvas. The animation loop only runs while pieces are alive.

const PIECES_PER_BURST = 160;
const LIFETIME = 3600; // ms
const GRAVITY = 1400; // px/s²
const DRAG = 1.1; // per second

const rand = (a, b) => a + Math.random() * (b - a);

export function createConfetti(canvas, colours) {
  const ctx = canvas.getContext('2d');
  let pieces = [];
  let running = false;
  let last = 0;
  let width = 0;
  let height = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /** Fire confetti from each origin { x, y, angle } (viewport px; angle in radians, -π/2 = straight up). */
  function burst(origins) {
    const now = performance.now();
    for (let i = 0; i < PIECES_PER_BURST; i++) {
      const o = origins[i % origins.length];
      const angle = o.angle + rand(-0.45, 0.45);
      const speed = rand(900, 1700);
      pieces.push({
        x: o.x,
        y: o.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: rand(6, 11),
        h: rand(9, 16),
        rot: rand(0, Math.PI * 2),
        vr: rand(-12, 12),
        flip: rand(0, Math.PI * 2),
        vflip: rand(6, 14),
        colour: colours[Math.floor(Math.random() * colours.length)],
        born: now + rand(0, 180), // slight stagger so it doesn't look like one block
      });
    }
    if (!running) {
      running = true;
      last = now;
      requestAnimationFrame(step);
    }
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, width, height);

    pieces = pieces.filter((p) => now - p.born < LIFETIME && p.y < height + 60);
    for (const p of pieces) {
      if (now < p.born) continue;
      const drag = Math.max(0, 1 - DRAG * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * dt;
      p.vy = Math.min(p.vy, 420); // flutter down rather than drop
      p.flip += p.vflip * dt;
      p.rot += p.vr * dt;
      p.x += (p.vx + Math.sin(p.flip) * 60) * dt;
      p.y += p.vy * dt;

      const age = now - p.born;
      ctx.globalAlpha = Math.min(1, Math.max(0, (LIFETIME - age) / (LIFETIME * 0.3)));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip)); // paper-like flipping
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (pieces.length) {
      requestAnimationFrame(step);
    } else {
      running = false;
      ctx.clearRect(0, 0, width, height);
    }
  }

  return {
    burst,
    get active() {
      return pieces.length;
    },
  };
}
