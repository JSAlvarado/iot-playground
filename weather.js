// ============ IOT PLAYGROUND WEATHER: rain, clouds and sunshine drawn over any game's scene ============
// A transparent canvas sits on top of the scene. Each frame the game says what the sky is doing
// ({ sky: "sunny" | "cloudy" | "rainy", night, rain: 0–1 }) and this draws it, so every outdoor game feels its weather:
//  - rainy: slanted rain streaks, splashes on the ground, a darker sky and, now and then, lightning (with thunder)
//  - cloudy: big soft cloud shadows drifting across, and a greyer light
//  - sunny: warm light and slowly turning sun rays by day, a few twinkling stars on clear nights
// The weather fades in and out instead of switching at once. With "reduce motion" turned on it draws a still frame.
(function (root) {
  "use strict";
  const reduced = () => root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function attach(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, last = 0;
    const mix = { rainy: 0, cloudy: 0, sunny: 0 }; // how much of each weather is showing, 0–1 (fades)
    let night = 0, flash = 0, nextBolt = 0;
    const drops = [], splashes = [], shadows = [], stars = [], motes = [];

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops.length = 0; stars.length = 0; shadows.length = 0; motes.length = 0;
      const n = Math.round(W * H / 900);
      for (let i = 0; i < n; i++) drops.push(newDrop(true));
      for (let i = 0; i < 40; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.4, r: rand(0.6, 1.6), p: Math.random() * 6 });
      for (let i = 0; i < 4; i++) shadows.push({ x: rand(-0.3, 1.1) * W, y: rand(0.1, 0.9) * H, r: rand(0.35, 0.6) * Math.max(W, H), v: rand(6, 14) });
      for (let i = 0; i < 14; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, v: rand(4, 10), p: Math.random() * 6 });
    }
    function newDrop(anywhere) {
      const z = Math.random(); // depth: near drops are longer, faster and brighter
      return { x: rand(-0.2, 1.1) * W, y: anywhere ? Math.random() * H : rand(-40, -5), z, len: 8 + z * 14, v: 420 + z * 520 };
    }
    if (root.ResizeObserver) new ResizeObserver(resize).observe(canvas);

    function draw(w, now, rate = 1) {
      resize();
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      const still = reduced();
      // Fade toward the weather the game asked for
      for (const k of Object.keys(mix)) {
        const target = w && w.sky === k ? (k === "rainy" ? (w.rain ?? 1) : 1) : 0;
        mix[k] += (target - mix[k]) * (still ? 1 : Math.min(1, dt * 1.5));
      }
      night += ((w && w.night ? 1 : 0) - night) * (still ? 1 : Math.min(1, dt * 1.5));
      ctx.clearRect(0, 0, W, H);
      if (!w && mix.rainy < 0.01 && mix.cloudy < 0.01 && mix.sunny < 0.01) return;
      const t = now / 1000;

      // ---- Sunny: warm light from the top corner and slow rays (daytime), stars at night ----
      if (mix.sunny > 0.01) {
        const day = mix.sunny * (1 - night);
        if (day > 0.01) {
          const g = ctx.createRadialGradient(W * 0.85, -H * 0.1, 0, W * 0.85, -H * 0.1, Math.max(W, H) * 0.9);
          g.addColorStop(0, `rgba(255, 214, 120, ${0.34 * day})`);
          g.addColorStop(0.5, `rgba(255, 220, 150, ${0.10 * day})`);
          g.addColorStop(1, "rgba(255, 230, 170, 0)");
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.save();
          ctx.translate(W * 0.85, -H * 0.1);
          ctx.rotate(still ? 0 : t * 0.03);
          ctx.fillStyle = `rgba(255, 240, 200, ${0.07 * day})`;
          for (let i = 0; i < 9; i++) {
            ctx.rotate((Math.PI * 2) / 9);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(W, H) * 1.3, -26); ctx.lineTo(Math.max(W, H) * 1.3, 26); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          // floating specks of dust and pollen catching the light
          ctx.fillStyle = `rgba(255, 250, 225, ${0.55 * day})`;
          for (const m of motes) {
            if (!still) { m.y -= m.v * dt * 0.3; m.x += Math.sin(t + m.p) * 0.15; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } }
            ctx.beginPath(); ctx.arc(m.x, m.y, 1.2, 0, Math.PI * 2); ctx.fill();
          }
        }
        const clear = mix.sunny * night;
        if (clear > 0.01) for (const s of stars) {
          const a = clear * (0.5 + 0.5 * Math.sin(t * 2 + s.p * 3));
          ctx.fillStyle = `rgba(255, 255, 240, ${0.8 * a})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
      }

      // ---- Cloudy (and rainy): grey light and big soft shadows drifting across ----
      const overcast = Math.max(mix.cloudy, mix.rainy);
      if (overcast > 0.01) {
        ctx.fillStyle = `rgba(70, 82, 96, ${0.12 * mix.cloudy + 0.26 * mix.rainy})`;
        ctx.fillRect(0, 0, W, H);
        for (const s of shadows) {
          if (!still) { s.x += s.v * dt * (rate ? 1.5 : 0.6); if (s.x - s.r > W) { s.x = -s.r; s.y = rand(0.1, 0.9) * H; } }
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
          g.addColorStop(0, `rgba(30, 40, 52, ${0.16 * overcast})`);
          g.addColorStop(1, "rgba(30, 40, 52, 0)");
          ctx.fillStyle = g; ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        }
      }

      // ---- Rainy: streaks, splashes and lightning ----
      if (mix.rainy > 0.01) {
        const shown = Math.round(drops.length * mix.rainy);
        const wind = 0.22; // the rain leans with the wind
        ctx.lineCap = "round";
        for (let i = 0; i < shown; i++) {
          const d = drops[i];
          if (!still) {
            d.y += d.v * dt; d.x += d.v * wind * dt;
            if (d.y > H * (0.62 + d.z * 0.38)) { // it lands: nearer drops land lower on the screen
              if (splashes.length < 60 && Math.random() < 0.5) splashes.push({ x: d.x, y: d.y, r: 0, life: 1, z: d.z });
              Object.assign(d, newDrop(false));
            }
          }
          ctx.strokeStyle = `rgba(220, 232, 245, ${0.25 + d.z * 0.45})`;
          ctx.lineWidth = 0.8 + d.z * 1.1;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * wind, d.y - d.len); ctx.stroke();
        }
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          s.r += dt * (14 + s.z * 16); s.life -= dt * 2.4;
          if (s.life <= 0) { splashes.splice(i, 1); continue; }
          ctx.strokeStyle = `rgba(230, 240, 250, ${0.5 * s.life})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // Lightning: only in heavy rain, every 20–50 seconds, with thunder a moment later
        if (!still && mix.rainy > 0.8) {
          if (!nextBolt) nextBolt = now + rand(8000, 20000);
          if (now > nextBolt) { flash = 1; nextBolt = now + rand(20000, 50000); if (opts.onThunder) opts.onThunder(rand(0.6, 2)); }
        }
        if (flash > 0) { ctx.fillStyle = `rgba(235, 240, 255, ${0.55 * flash * flash})`; ctx.fillRect(0, 0, W, H); flash -= dt * 4; }
      }
    }
    return { draw };
  }

  root.IoTWeather = { attach };
})(window);
