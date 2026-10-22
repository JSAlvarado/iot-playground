// ============ IOT PLAYGROUND SOUND: effects, ambience and soft music, all made in the browser ============
// Everything is synthesised with the Web Audio API, so there are no audio files to download. Browsers only allow
// sound after the player touches the page, so nothing plays until the first tap or key press. The speaker button
// in the top bar turns effects and music on or off (saved on this device), and sound pauses when the tab is hidden.
(function (root) {
  "use strict";
  const KEY = "iotpg:sound";
  const load = () => { try { return Object.assign({ fx: true, music: true }, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return { fx: true, music: true }; } };
  const prefs = load();
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* not saved */ } };

  let ac = null, master, fxBus, ambBus, musicBus, noiseBuf, brownBuf, theme = "pond", started = false;
  const layers = {};    // looping ambience and device sounds: name → { gain, ... }
  const want = {};      // name → target level (0 = silent)
  let scene = { night: false, rain: false };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- Setup on the first touch ----
  function boot() {
    if (ac || !(root.AudioContext || root.webkitAudioContext)) return;
    ac = new (root.AudioContext || root.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    master = gainNode(0.9); master.connect(comp); comp.connect(ac.destination);
    fxBus = gainNode(prefs.fx ? 0.7 : 0); fxBus.connect(master);
    ambBus = gainNode(prefs.fx ? 0.5 : 0); ambBus.connect(master);
    musicBus = gainNode(prefs.music ? 0.16 : 0); musicBus.connect(master);
    noiseBuf = makeNoise(false); brownBuf = makeNoise(true);
    started = true;
    startMusic();
    tickAmbience();
  }
  function gainNode(v) { const g = ac.createGain(); g.gain.value = v; return g; }
  function makeNoise(brown) {
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  function noiseSrc(brown) { const s = ac.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf; s.loop = true; s.start(); return s; }
  function filt(type, freq, q = 0.7) { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }

  // ---- One-shot notes ----
  // tone: a short note with an attack/decay envelope; sweep: glide from f to f2
  function tone({ f, f2, type = "sine", t = 0, dur = 0.12, vol = 0.3, attack = 0.005, bus = fxBus, lp }) {
    if (!ac) return;
    const at = ac.currentTime + t, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let out = o;
    if (lp) { const fl = filt("lowpass", lp); o.connect(fl); out = fl; }
    out.connect(g); g.connect(bus);
    o.start(at); o.stop(at + dur + 0.05);
  }
  function burst({ t = 0, dur = 0.15, vol = 0.2, type = "bandpass", f = 2000, f2, q = 1 }) {
    if (!ac) return;
    const at = ac.currentTime + t, s = ac.createBufferSource(), fl = filt(type, f, q), g = ac.createGain();
    s.buffer = noiseBuf;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(fl); fl.connect(g); g.connect(fxBus);
    s.start(at, Math.random()); s.stop(at + dur + 0.05);
  }
  const bell = (f, t, vol = 0.18) => { tone({ f, t, dur: 1.2, vol, type: "sine" }); tone({ f: f * 2.76, t, dur: 0.5, vol: vol * 0.25 }); };

  const FX = {
    tap: () => tone({ f: 1500, dur: 0.035, vol: 0.08, type: "triangle" }),
    on: () => { tone({ f: 660, dur: 0.07, vol: 0.14 }); tone({ f: 990, t: 0.06, dur: 0.1, vol: 0.14 }); },
    off: () => { tone({ f: 880, dur: 0.07, vol: 0.12 }); tone({ f: 587, t: 0.06, dur: 0.12, vol: 0.12 }); },
    pop: () => tone({ f: 320, f2: 900, dur: 0.09, vol: 0.2 }),
    remove: () => burst({ dur: 0.18, vol: 0.12, type: "lowpass", f: 3000, f2: 300 }),
    plop: () => { tone({ f: 700, f2: 140, dur: 0.18, vol: 0.28 }); burst({ t: 0.03, dur: 0.12, vol: 0.06, f: 3500 }); },
    splash: () => { burst({ dur: 0.35, vol: 0.12, type: "lowpass", f: 4000, f2: 500 }); },
    start: () => [60, 64, 67, 72].forEach((m, i) => tone({ f: mtof(m + 12), t: i * 0.07, dur: 0.25, vol: 0.14, type: "triangle" })),
    win: (stars = 3) => {
      [72, 76, 79, 84].forEach((m, i) => tone({ f: mtof(m), t: i * 0.1, dur: 0.5, vol: 0.18, type: "triangle" }));
      for (let i = 0; i < stars; i++) bell(mtof(91 + i * 4), 0.55 + i * 0.28);
    },
    lose: () => { tone({ f: mtof(67), dur: 0.35, vol: 0.14, type: "triangle" }); tone({ f: mtof(63), t: 0.3, dur: 0.4, vol: 0.13, type: "triangle" }); tone({ f: mtof(60), t: 0.65, dur: 0.7, vol: 0.12, type: "triangle" }); },
    alert: () => { tone({ f: 988, dur: 0.12, vol: 0.1 }); tone({ f: 988, t: 0.18, dur: 0.12, vol: 0.1 }); },
    correct: () => { tone({ f: mtof(76), dur: 0.3, vol: 0.16, type: "triangle" }); tone({ f: mtof(83), t: 0.12, dur: 0.5, vol: 0.16, type: "triangle" }); bell(mtof(88), 0.3, 0.12); },
    wrong: () => { tone({ f: 220, f2: 180, dur: 0.3, vol: 0.14, type: "triangle", lp: 900 }); },
    clue: () => { tone({ f: mtof(81), dur: 0.2, vol: 0.1 }); tone({ f: mtof(86), t: 0.1, dur: 0.3, vol: 0.08 }); },
    wire: () => { burst({ dur: 0.02, vol: 0.2, type: "highpass", f: 4000 }); tone({ f: 2200, dur: 0.04, vol: 0.08 }); },
    unwire: () => tone({ f: 1200, f2: 500, dur: 0.08, vol: 0.1 }),
    select: () => tone({ f: 1800, dur: 0.04, vol: 0.07 }),
    led: () => tone({ f: 2637, dur: 0.15, vol: 0.05 }),
    burn: () => { burst({ dur: 0.5, vol: 0.25, f: 2500, f2: 400, q: 0.6 }); tone({ f: 120, dur: 0.15, vol: 0.2, type: "square", lp: 600 }); },
    star: () => bell(mtof(96), 0)
  };

  // ---- Looping layers: ambience and devices that run while they're on ----
  function layer(name) {
    if (layers[name] || !ac) return layers[name];
    const g = gainNode(0); let L = { gain: g };
    const lfo = (rate, depth, target) => { const o = ac.createOscillator(), d = gainNode(depth); o.frequency.value = rate; o.connect(d); d.connect(target); o.start(); };
    if (name === "water") { const n = noiseSrc(true), f = filt("lowpass", 420); n.connect(f); f.connect(g); lfo(0.12, 120, f.frequency); }
    else if (name === "wind") { const n = noiseSrc(false), f = filt("bandpass", 380, 0.6); n.connect(f); f.connect(g); lfo(0.07, 160, f.frequency); }
    else if (name === "rain") { const n = noiseSrc(false), f = filt("highpass", 1200), f2 = filt("lowpass", 7000); n.connect(f); f.connect(f2); f2.connect(g); }
    else if (name === "roomtone") { const n = noiseSrc(true), f = filt("lowpass", 160); n.connect(f); f.connect(g); const o = ac.createOscillator(), og = gainNode(0.05); o.frequency.value = 60; o.connect(og); og.connect(g); o.start(); }
    else if (name === "city") { const n = noiseSrc(true), f = filt("bandpass", 260, 0.5); n.connect(f); f.connect(g); lfo(0.05, 60, f.frequency); }
    else if (name === "pump") { const o = ac.createOscillator(), f = filt("lowpass", 380), og = gainNode(0.5); o.type = "sawtooth"; o.frequency.value = 110; o.connect(f); f.connect(og); og.connect(g); o.start(); const n = noiseSrc(false), nf = filt("bandpass", 2600, 2); n.connect(nf); nf.connect(g); }
    else if (name === "hiss") { const n = noiseSrc(false), f = filt("highpass", 3500); n.connect(f); f.connect(g); }
    else if (name === "fan") { const n = noiseSrc(false), f = filt("bandpass", 650, 0.5); n.connect(f); f.connect(g); }
    else if (name === "heat") { const n = noiseSrc(true), f = filt("lowpass", 90); n.connect(f); f.connect(g); }
    else if (name === "buzzer") { const o = ac.createOscillator(), f = filt("lowpass", 3200); o.type = "square"; o.frequency.value = 2300; o.connect(f); f.connect(g); o.start(); }
    else if (name === "bubbles") { L.bubbles = true; }
    g.connect(name === "buzzer" ? fxBus : ambBus);
    layers[name] = L;
    return L;
  }
  const LEVELS = { water: 0.5, wind: 0.35, rain: 0.45, roomtone: 0.5, city: 0.4, pump: 0.12, hiss: 0.05, fan: 0.14, heat: 0.3, buzzer: 0.05, bubbles: 1 };
  const DEVICE = ["pump", "hiss", "fan", "heat", "bubbles", "buzzer"]; // these chirp on/off when they change
  const applied = {};
  function setLayer(name, on) {
    const was = !!want[name];
    want[name] = on;
    if (!ac || applied[name] === on) return;
    applied[name] = on;
    const L = layer(name);
    L.gain.gain.setTargetAtTime(on ? LEVELS[name] : 0, ac.currentTime, name === "buzzer" ? 0.01 : 0.25);
    if (was !== on && DEVICE.includes(name) && name !== "buzzer") FX[on ? "on" : "off"]();
  }

  // Random sounds on top of the loops: bubbles, birds by day, crickets at night, drops on the pond, a clock in the room
  let lastBird = 0, lastCricket = 0, lastDrop = 0, lastTick = 0;
  function tickAmbience() {
    if (!ac) return;
    setTimeout(tickAmbience, 90);
    if (ac.state !== "running" || !prefs.fx) return;
    const now = ac.currentTime;
    if (want.bubbles && Math.random() < 0.6) tone({ f: rand(500, 1400), f2: rand(1500, 2600), dur: rand(0.03, 0.07), vol: rand(0.02, 0.05), bus: ambBus });
    const outdoors = theme === "pond" || theme === "plant";
    if (outdoors && !scene.night && !scene.rain && now - lastBird > rand(2.5, 7)) {
      lastBird = now;
      const base = rand(2600, 3800), n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone({ f: base, f2: base * rand(1.2, 1.5), t: i * 0.11, dur: 0.07, vol: 0.035, bus: ambBus });
    }
    if (outdoors && scene.night && now - lastCricket > rand(0.8, 1.6)) {
      lastCricket = now;
      for (let i = 0; i < 3; i++) tone({ f: 4400, t: i * 0.05, dur: 0.03, vol: 0.018, bus: ambBus });
    }
    if (theme === "pond" && now - lastDrop > rand(3, 9)) { lastDrop = now; tone({ f: rand(800, 1200), f2: rand(250, 400), dur: 0.12, vol: 0.03, bus: ambBus }); }
    if (theme === "room" && now - lastTick > 1) { lastTick = now; tone({ f: 3000, dur: 0.012, vol: 0.012, type: "triangle", bus: ambBus }); }
  }

  // ---- Music: a slow generative tune for each game, very quiet under the ambience ----
  const THEMES = {
    pond: { bpm: 80, wave: "triangle", chords: [[48, 60, 64, 67, 71], [45, 57, 60, 64, 67], [41, 53, 57, 60, 64], [43, 55, 59, 62, 67]], scale: [72, 74, 76, 79, 81, 84] },
    plant: { bpm: 92, wave: "triangle", chords: [[43, 55, 59, 62], [40, 52, 55, 59], [36, 48, 52, 55], [38, 50, 54, 57]], scale: [74, 76, 79, 81, 83, 86] },
    room: { bpm: 68, wave: "sine", chords: [[39, 51, 55, 58, 62], [36, 48, 51, 55, 58], [44, 56, 60, 63, 67], [46, 58, 62, 65, 68]], scale: [75, 77, 79, 82, 84, 87] },
    detective: { bpm: 74, wave: "triangle", chords: [[45, 57, 60, 64], [41, 53, 57, 60], [38, 50, 53, 57], [40, 52, 56, 59]], scale: [69, 72, 74, 76, 79, 81] },
    circuit: { bpm: 108, wave: "square", chords: [[48, 60, 64, 67], [41, 53, 57, 60], [45, 57, 60, 64], [43, 55, 59, 62]], scale: [72, 74, 76, 79, 81, 84] }
  };
  let nextBeat = 0, beat = 0, musicTimer = null;
  function startMusic() {
    if (musicTimer) return;
    nextBeat = ac.currentTime + 0.2;
    musicTimer = setInterval(scheduleMusic, 100);
  }
  function scheduleMusic() {
    if (!ac || ac.state !== "running" || !prefs.music) { if (ac) nextBeat = ac.currentTime + 0.2; return; }
    const th = THEMES[theme] || THEMES.pond, spb = 60 / th.bpm;
    while (nextBeat < ac.currentTime + 0.4) {
      const t = nextBeat - ac.currentTime, chord = th.chords[Math.floor(beat / 8) % th.chords.length];
      const lp = th.wave === "square" ? 1400 : 2400;
      if (beat % 8 === 0) {
        tone({ f: mtof(chord[0]), t, dur: spb * 7.5, vol: 0.22, attack: 0.05, bus: musicBus });                    // bass
        chord.slice(1).forEach((m) => tone({ f: mtof(m), t, dur: spb * 7.5, vol: 0.05, attack: 1.2, type: "sine", bus: musicBus })); // pad
      }
      // the melody: a note on most beats, chosen near the last one so it sings instead of jumping around
      if (Math.random() < (beat % 2 ? 0.35 : 0.7)) {
        const m = th.scale[Math.floor(Math.random() * th.scale.length)];
        tone({ f: mtof(m), t, dur: spb * 1.8, vol: th.wave === "square" ? 0.05 : 0.12, type: th.wave, lp, bus: musicBus });
        if (Math.random() < 0.25) tone({ f: mtof(m + 12), t: t + spb / 2, dur: spb, vol: 0.04, type: "sine", bus: musicBus });
      }
      nextBeat += spb; beat++;
    }
  }

  // ---- What a game tells the sound engine ----
  // update({ ambience: ["water", "wind"], night, rain, devices: { bubbles: true, pump: false } }) — called a few times a second
  function update(state) {
    scene = { night: !!state.night, rain: !!state.rain };
    const ambience = new Set(state.ambience || []);
    if (state.rain) ambience.add("rain");
    for (const n of ["water", "wind", "rain", "roomtone", "city"]) setLayer(n, ambience.has(n));
    for (const [n, on] of Object.entries(state.devices || {})) setLayer(n, !!on);
  }
  function fx(name, arg) { if (ac && prefs.fx && FX[name] && ac.state === "running") FX[name](arg); }

  // ---- The speaker button and its little menu ----
  const ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function button() {
    const wrap = document.createElement("div");
    wrap.className = "sound";
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sound-btn"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "sound-menu"; menu.hidden = true;
    const row = (key, label) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "switch");
      b.innerHTML = `<span>${label}</span><i aria-hidden="true"></i>`;
      const sync = () => b.setAttribute("aria-checked", String(prefs[key]));
      b.addEventListener("click", () => { prefs[key] = !prefs[key]; savePrefs(); sync(); apply(); });
      sync(); return b;
    };
    menu.append(row("fx", "Sound effects"), row("music", "Music"));
    const icon = () => { const on = prefs.fx || prefs.music; btn.innerHTML = on ? ICON_ON : ICON_OFF; btn.setAttribute("aria-label", "Sound: " + (on ? "on" : "off")); };
    function apply() {
      icon();
      if (!ac) return;
      fxBus.gain.setTargetAtTime(prefs.fx ? 0.7 : 0, ac.currentTime, 0.05);
      ambBus.gain.setTargetAtTime(prefs.fx ? 0.5 : 0, ac.currentTime, 0.05);
      musicBus.gain.setTargetAtTime(prefs.music ? 0.16 : 0, ac.currentTime, 0.3);
    }
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", () => { menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
    icon();
    wrap.append(btn, menu);
    return wrap;
  }

  // ---- Start on the first touch, pause in background tabs ----
  function init(opts = {}) {
    theme = opts.theme || theme;
    const go = () => { boot(); if (ac && ac.state === "suspended") ac.resume(); };
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, go, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
    // A quiet tick for every button press, so the controls feel physical
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button, .btn"); if (b && !b.closest(".sound")) fx("tap"); }, true);
  }

  root.IoTSound = { init, fx, update, button, get started() { return started; } };
})(window);
