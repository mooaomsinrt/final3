'use strict';

// =========================================================================
// เอนจินอนิเมชันอุโมงค์ใต้ทะเล SEA LIFE สำหรับหน้า Dashboard
// ใช้ร่วมกับ localStorage key 'pharmacy_home_theme' เพื่อให้ทุกหน้าซิงก์โหมดเดียวกัน
// =========================================================================
(function initOceanDashboard() {
  const THEME_KEY = 'pharmacy_home_theme';
  const toggleBtn = document.getElementById('theme-toggle');
  const themeMeta = document.getElementById('theme-color');
  let isLightOcean = false;

  function applyTheme(mode) {
    isLightOcean = mode === 'light';
    document.documentElement.setAttribute('data-theme', isLightOcean ? 'light' : 'dark');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(isLightOcean));
      toggleBtn.textContent = isLightOcean ? '🌊 น้ำลึก' : '☀️ ทะเลตื้น';
    }
    if (themeMeta) {
      themeMeta.setAttribute('content', isLightOcean ? '#0b6e99' : '#021526');
    }
    window.dispatchEvent(new CustomEvent('ocean-theme-change', { detail: { isLight: isLightOcean } }));
  }

  function loadSavedTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const next = isLightOcean ? 'dark' : 'light';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch {}
    });
  }

  applyTheme(loadSavedTheme());

  const canvas = document.getElementById('ocean-canvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1;
  let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const rand = (min, max) => min + Math.random() * (max - min);

  const rays = Array.from({ length: 8 }, (_, i) => ({
    baseX: 0.08 + i * 0.125 + rand(-0.03, 0.03),
    width: rand(55, 135),
    speed: rand(0.22, 0.52),
    phase: rand(0, Math.PI * 2),
    alpha: rand(0.05, 0.12),
  }));

  const plankton = Array.from({ length: 48 }, () => ({
    x: Math.random(), y: Math.random(), r: rand(0.8, 2.2),
    vx: rand(-0.004, 0.007), vy: rand(-0.008, -0.002), phase: rand(0, Math.PI * 2),
  }));

  const bubbles = Array.from({ length: 30 }, () => ({
    x: Math.random(), y: Math.random(), r: rand(2, 7.5),
    speed: rand(22, 62), wobble: rand(0.6, 1.8), phase: rand(0, Math.PI * 2),
  }));

  function spawnBurst(clientX, clientY) {
    if (!W || !H) return;
    for (let i = 0; i < 7; i++) {
      bubbles.push({
        x: (clientX + rand(-24, 24)) / W,
        y: (clientY + rand(-14, 14)) / H,
        r: rand(2.5, 8), speed: rand(45, 92), wobble: rand(1.1, 2.4), phase: rand(0, Math.PI * 2), temp: true,
      });
    }
    if (bubbles.length > 85) bubbles.splice(0, bubbles.length - 85);
  }

  const fishPalettes = [
    { body: '#ff8a3d', stripe: '#fff6e8', fin: '#ffb870' },
    { body: '#38bdf8', stripe: '#fde047', fin: '#0284c7' },
    { body: '#facc15', stripe: '#ffffff', fin: '#f59e0b' },
    { body: '#5eead4', stripe: '#cffafe', fin: '#14b8a6' },
    { body: '#fb7185', stripe: '#ffe4e6', fin: '#f43f5e' },
  ];

  const schoolFish = Array.from({ length: 24 }, (_, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const depth = rand(0.45, 1.12);
    return {
      x: Math.random() * 1400 - 150, yFrac: rand(0.14, 0.82), dir,
      speed: rand(24, 64) * depth, size: rand(10, 20) * depth, depth,
      phase: rand(0, Math.PI * 2), amp: rand(8, 24),
      palette: fishPalettes[i % fishPalettes.length],
    };
  });

  const mantas = [
    { x: -180, yFrac: 0.22, dir: 1, speed: 44, scale: 1.05, phase: 0.4 },
    { x: 1200, yFrac: 0.35, dir: -1, speed: 32, scale: 0.72, phase: 2.3 },
  ];
  const shark = { x: 960, yFrac: 0.48, dir: -1, speed: 50, scale: 1.0, phase: 1.1 };
  const turtle = { x: -120, yFrac: 0.65, dir: 1, speed: 28, scale: 0.9, phase: 0.8 };
  const jellies = [
    { xFrac: 0.1, yFrac: 0.3, scale: 0.92, phase: 0.0, hue: '#67e8f9', glow: 'rgba(103, 232, 249, 0.42)' },
    { xFrac: 0.88, yFrac: 0.25, scale: 1.08, phase: 2.1, hue: '#c084fc', glow: 'rgba(192, 132, 252, 0.42)' },
    { xFrac: 0.84, yFrac: 0.74, scale: 0.72, phase: 4.0, hue: '#f472b6', glow: 'rgba(244, 114, 182, 0.38)' },
  ];
  const kelps = Array.from({ length: 12 }, (_, i) => ({
    xFrac: i < 6 ? 0.02 + i * 0.046 : 0.73 + (i - 6) * 0.048,
    height: rand(90, 210), segments: 7, phase: rand(0, Math.PI * 2), width: rand(7, 13),
  }));

  function drawOceanBackdrop(t, px, py) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    if (isLightOcean) {
      bg.addColorStop(0, '#1ab6d9'); bg.addColorStop(0.32, '#0e8cb5');
      bg.addColorStop(0.7, '#085d87'); bg.addColorStop(1, '#043554');
    } else {
      bg.addColorStop(0, '#042c54'); bg.addColorStop(0.35, '#031f3d');
      bg.addColorStop(0.72, '#02152b'); bg.addColorStop(1, '#010c1a');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const surfaceGlow = ctx.createRadialGradient(W * 0.5 + px * 26, -H * 0.05, 10, W * 0.5 + px * 26, H * 0.12, Math.max(W, H) * 0.75);
    surfaceGlow.addColorStop(0, isLightOcean ? 'rgba(220, 255, 255, 0.42)' : 'rgba(56, 210, 255, 0.22)');
    surfaceGlow.addColorStop(0.5, isLightOcean ? 'rgba(100, 230, 255, 0.13)' : 'rgba(14, 116, 184, 0.08)');
    surfaceGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = surfaceGlow;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    for (const r of rays) {
      const sway = Math.sin(t * r.speed + r.phase) * 36;
      const xTop = r.baseX * W + sway + px * 16;
      const spread = r.width * 1.9;
      const grad = ctx.createLinearGradient(xTop, 0, xTop + 70, H * 0.88);
      const alpha = r.alpha * (isLightOcean ? 1.65 : 0.95) * (0.75 + 0.25 * Math.sin(t * 0.7 + r.phase));
      grad.addColorStop(0, 'rgba(195, 248, 255, ' + alpha.toFixed(3) + ')');
      grad.addColorStop(0.6, 'rgba(90, 215, 255, ' + (alpha * 0.35).toFixed(3) + ')');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xTop - r.width * 0.45, -10);
      ctx.lineTo(xTop + r.width * 0.45, -10);
      ctx.lineTo(xTop + spread, H * 0.95);
      ctx.lineTo(xTop - spread * 0.55, H * 0.95);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    const cx = W * 0.5 + px * 20;
    const floorY = H * 0.96 + py * 10;
    for (let i = 1; i <= 5; i++) {
      const k = i / 5;
      ctx.beginPath();
      ctx.ellipse(cx, floorY, W * (0.28 + k * 0.44), H * (0.34 + k * 0.54), 0, Math.PI, 0, false);
      ctx.strokeStyle = isLightOcean
        ? 'rgba(255, 255, 255, ' + (0.08 + k * 0.13).toFixed(3) + ')'
        : 'rgba(120, 225, 255, ' + (0.05 + k * 0.1).toFixed(3) + ')';
      ctx.lineWidth = 1.2 + k * 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKelp(t, px) {
    ctx.save();
    for (const k of kelps) {
      const baseX = k.xFrac * W + px * 15;
      const baseY = H + 12;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      let prevX = baseX, prevY = baseY;
      for (let s = 1; s <= k.segments; s++) {
        const ratio = s / k.segments;
        const nx = baseX + Math.sin(t * 1.15 + k.phase + ratio * 2.2) * (18 * ratio);
        const ny = baseY - k.height * ratio;
        ctx.quadraticCurveTo(prevX, (prevY + ny) * 0.5, nx, ny);
        prevX = nx; prevY = ny;
      }
      ctx.strokeStyle = isLightOcean ? 'rgba(8, 86, 102, 0.3)' : 'rgba(12, 92, 106, 0.4)';
      ctx.lineWidth = k.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawManta(m, t, px, py) {
    const y = m.yFrac * H + Math.sin(t * 0.7 + m.phase) * 24 + py * 14;
    const flap = Math.sin(t * 2.1 + m.phase) * 22;
    ctx.save();
    ctx.translate(m.x + px * 14, y);
    ctx.scale(m.dir * m.scale, m.scale);
    ctx.globalAlpha = isLightOcean ? 0.52 : 0.66;
    const bodyGrad = ctx.createLinearGradient(-50, -30, 60, 30);
    bodyGrad.addColorStop(0, isLightOcean ? '#0c4a6e' : '#0f3f66');
    bodyGrad.addColorStop(0.55, isLightOcean ? '#0369a1' : '#1d6fa3');
    bodyGrad.addColorStop(1, isLightOcean ? '#7dd3fc' : '#67d4f6');
    ctx.beginPath();
    ctx.moveTo(-42, 0);
    ctx.quadraticCurveTo(-92, Math.sin(t * 2.6 + m.phase) * 14, -142, Math.sin(t * 2.6 + m.phase + 1) * 10);
    ctx.strokeStyle = isLightOcean ? '#0c4a6e' : '#2f8cc4';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(56, 0);
    ctx.quadraticCurveTo(22, -16, -6, -54 + flap);
    ctx.quadraticCurveTo(-30, -24 + flap * 0.4, -46, 0);
    ctx.quadraticCurveTo(-30, 24 - flap * 0.4, -6, 54 - flap);
    ctx.quadraticCurveTo(22, 16, 56, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(48, -8); ctx.lineTo(66, -13); ctx.lineTo(54, -2);
    ctx.moveTo(48, 8); ctx.lineTo(66, 13); ctx.lineTo(54, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShark(s, t, px, py) {
    const y = s.yFrac * H + Math.sin(t * 0.55 + s.phase) * 20 + py * 10;
    const wag = Math.sin(t * 3.1 + s.phase) * 14;
    ctx.save();
    ctx.translate(s.x + px * 10, y);
    ctx.scale(s.dir * s.scale, s.scale);
    ctx.globalAlpha = isLightOcean ? 0.46 : 0.6;
    const grad = ctx.createLinearGradient(0, -28, 0, 26);
    grad.addColorStop(0, isLightOcean ? '#0e3c5a' : '#184b73');
    grad.addColorStop(0.6, isLightOcean ? '#1e6088' : '#2d729e');
    grad.addColorStop(1, isLightOcean ? '#bae6fd' : '#8ecae6');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(-4, -14); ctx.quadraticCurveTo(6, -42, 22, -13); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(86, 2); ctx.quadraticCurveTo(44, -22, -26, -11);
    ctx.quadraticCurveTo(-68, -4 + wag * 0.4, -96, -2 + wag);
    ctx.lineTo(-124, -26 + wag); ctx.quadraticCurveTo(-112, -2 + wag, -118, 22 + wag);
    ctx.lineTo(-96, 6 + wag); ctx.quadraticCurveTo(-64, 10 + wag * 0.4, -22, 13);
    ctx.quadraticCurveTo(40, 20, 86, 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(22, 9); ctx.quadraticCurveTo(4, 34, -12, 25); ctx.quadraticCurveTo(2, 14, 6, 10); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawTurtle(tr, t, px, py) {
    const y = tr.yFrac * H + Math.sin(t * 0.8 + tr.phase) * 20 + py * 16;
    const row = Math.sin(t * 2.2 + tr.phase);
    ctx.save();
    ctx.translate(tr.x + px * 18, y);
    ctx.scale(tr.dir * tr.scale, tr.scale);
    ctx.rotate(Math.cos(t * 0.8 + tr.phase) * 0.08);
    ctx.globalAlpha = isLightOcean ? 0.74 : 0.82;
    ctx.fillStyle = '#2c7a6b';
    ctx.save(); ctx.translate(10, 8); ctx.rotate(row * 0.48); ctx.beginPath(); ctx.ellipse(-4, 18, 8, 22, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(-26, 6); ctx.rotate(-row * 0.25); ctx.beginPath(); ctx.ellipse(-6, 9, 6, 12, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#389683'; ctx.beginPath(); ctx.ellipse(36, 0, 12, 8.5, 0.1, 0, Math.PI * 2); ctx.fill();
    const shell = ctx.createRadialGradient(0, -6, 4, 0, 0, 32);
    shell.addColorStop(0, '#4fd1a5'); shell.addColorStop(0.55, '#1f6e5c'); shell.addColorStop(1, '#12423a');
    ctx.fillStyle = shell; ctx.beginPath(); ctx.ellipse(0, -2, 30, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawJellyfish(j, t, px, py) {
    const pulse = Math.sin(t * 2.0 + j.phase);
    const x = j.xFrac * W + Math.sin(t * 0.45 + j.phase) * 26 + px * 22;
    const y = j.yFrac * H + Math.cos(t * 0.6 + j.phase) * 22 + py * 16;
    const sc = j.scale, bellW = (24 + pulse * 3.5) * sc, bellH = (20 - pulse * 2.5) * sc;
    ctx.save();
    ctx.translate(x, y);
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 4, 46 * sc);
    halo.addColorStop(0, j.glow); halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 4, 46 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = j.hue; ctx.lineWidth = 1.6 * sc; ctx.globalAlpha = isLightOcean ? 0.52 : 0.7;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      const sx = k * 7 * sc;
      ctx.moveTo(sx, 4 * sc);
      const w1 = Math.sin(t * 2.6 + j.phase + k) * 9 * sc;
      const w2 = Math.cos(t * 2.2 + j.phase + k) * 12 * sc;
      ctx.bezierCurveTo(sx + w1, 22 * sc, sx - w2, 42 * sc, sx + w1 * 0.7, (54 + Math.abs(k) * 5) * sc);
      ctx.stroke();
    }
    const bell = ctx.createRadialGradient(0, -bellH * 0.4, 2, 0, 0, bellW);
    bell.addColorStop(0, 'rgba(255, 255, 255, 0.85)'); bell.addColorStop(0.55, j.hue); bell.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
    ctx.fillStyle = bell; ctx.globalAlpha = isLightOcean ? 0.62 : 0.8;
    ctx.beginPath(); ctx.arc(0, 4 * sc, bellW, Math.PI, 0, false);
    ctx.quadraticCurveTo(bellW * 0.5, 10 * sc, 0, 5 * sc);
    ctx.quadraticCurveTo(-bellW * 0.5, 10 * sc, -bellW, 4 * sc);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawFish(f, t, px, py) {
    const y = f.yFrac * H + Math.sin(t * 1.6 + f.phase) * f.amp + py * (14 * f.depth);
    const wag = Math.sin(t * 7.5 + f.phase) * (f.size * 0.24);
    ctx.save();
    ctx.translate(f.x + px * (18 * f.depth), y);
    ctx.scale(f.dir, 1);
    ctx.globalAlpha = Math.min(0.9, 0.42 + f.depth * 0.45);
    ctx.fillStyle = f.palette.fin;
    ctx.beginPath(); ctx.moveTo(-f.size * 0.75, 0); ctx.lineTo(-f.size * 1.45, -f.size * 0.52 + wag); ctx.lineTo(-f.size * 1.45, f.size * 0.52 + wag); ctx.closePath(); ctx.fill();
    ctx.fillStyle = f.palette.body;
    ctx.beginPath(); ctx.ellipse(0, 0, f.size, f.size * 0.54, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.palette.stripe; ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.ellipse(-f.size * 0.1, 0, f.size * 0.17, f.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#041422'; ctx.beginPath(); ctx.arc(f.size * 0.52, -f.size * 0.12, Math.max(1.4, f.size * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPlanktonAndBubbles(t, dt, px, py) {
    for (const p of plankton) {
      if (!reduceMotion) { p.x = (p.x + p.vx * dt + 1) % 1; p.y = (p.y + p.vy * dt + 1) % 1; }
      const glow = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.1 + p.phase));
      ctx.fillStyle = isLightOcean ? 'rgba(255,255,255,' + (glow * 0.5).toFixed(3) + ')' : 'rgba(125,240,255,' + glow.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x * W + px * 12, p.y * H + py * 12, p.r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (!reduceMotion) {
        b.y -= (b.speed * dt) / Math.max(H, 1);
        if (b.y < -0.05) { if (b.temp) { bubbles.splice(i, 1); continue; } b.y = 1.05; b.x = Math.random(); }
      }
      const bx = b.x * W + Math.sin(t * b.wobble + b.phase) * 14 + px * 20;
      const by = b.y * H + py * 10;
      ctx.strokeStyle = isLightOcean ? 'rgba(255,255,255,0.52)' : 'rgba(175,242,255,0.42)';
      ctx.fillStyle = isLightOcean ? 'rgba(255,255,255,0.14)' : 'rgba(140,232,255,0.1)';
      ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(bx - b.r * 0.32, by - b.r * 0.32, Math.max(0.8, b.r * 0.26), 0, Math.PI * 2); ctx.fill();
    }
  }

  let lastTs = 0;
  function frame(ts) {
    const t = ts * 0.001;
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) * 0.001 : 0.016);
    lastTs = ts;
    smoothX += (pointerX - smoothX) * 0.06;
    smoothY += (pointerY - smoothY) * 0.06;

    if (!reduceMotion) {
      for (const m of mantas) { m.x += m.dir * m.speed * dt; if (m.dir === 1 && m.x > W + 220) m.x = -220; if (m.dir === -1 && m.x < -220) m.x = W + 220; }
      shark.x += shark.dir * shark.speed * dt;
      if (shark.x < -220) { shark.x = W + 220; shark.yFrac = rand(0.32, 0.58); }
      turtle.x += turtle.dir * turtle.speed * dt;
      if (turtle.x > W + 160) { turtle.x = -160; turtle.yFrac = rand(0.52, 0.76); }
      for (const f of schoolFish) { f.x += f.dir * f.speed * dt; if (f.dir === 1 && f.x > W + 90) f.x = -90; if (f.dir === -1 && f.x < -90) f.x = W + 90; }
    }

    drawOceanBackdrop(t, smoothX, smoothY);
    drawKelp(t, smoothX);
    for (const m of mantas) drawManta(m, t, smoothX, smoothY);
    drawShark(shark, t, smoothX, smoothY);
    for (const f of schoolFish) if (f.depth < 0.8) drawFish(f, t, smoothX, smoothY);
    drawTurtle(turtle, t, smoothX, smoothY);
    for (const j of jellies) drawJellyfish(j, t, smoothX, smoothY);
    for (const f of schoolFish) if (f.depth >= 0.8) drawFish(f, t, smoothX, smoothY);
    drawPlanktonAndBubbles(t, dt, smoothX, smoothY);

    if (!reduceMotion) requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    if (!W || !H) return;
    pointerX = (e.clientX / W - 0.5) * 2;
    pointerY = (e.clientY / H - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, select, summary, table')) return;
    spawnBurst(e.clientX, e.clientY);
  }, { passive: true });

  resize();
  requestAnimationFrame(frame);
})();
