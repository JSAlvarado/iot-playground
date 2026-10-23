// ============ IOT PLAYGROUND SOUND: effects, ambience and soft music, all made in the browser ============
// Everything is synthesised with the Web Audio API, so there are no audio files to download. Browsers only allow
// sound after the player touches the page, so nothing plays until the first tap or key press. The speaker button
// in the top bar turns effects and music on or off (saved on this device), and sound pauses when the tab is hidden.
// Weather has its own sound bed: rain (a soft roar, patter and drops, with distant thunder), cloudy (gusty wind,
// fewer birds) and sunny (birds, a light breeze and cicadas in the hot afternoon), plus crickets and frogs at night.
(function (root) {
  "use strict";
  const KEY = "iotpg:sound";
  const load = () => { try { return Object.assign({ fx: true, music: true }, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return { fx: true, music: true }; } };
  const prefs = load();
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* not saved */ } };

  let ac = null, master, fxBus, ambBus, musicBus, noiseBuf, brownBuf, theme = "pond", started = false;
  const layers = {};    // looping ambience and device sounds: name → { gain, ... }
  const want = {};      // name → target level (0 = silent)
  let scene = { night: false, rain: false, weather: null, water: false };
  let customMusic = null;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- Setup on the first touch ----
  function boot() {
    if (ac || !(root.AudioContext || root.webkitAudioContext)) return;
    // On iPhone, Web Audio is muted by the ring/silent switch unless the page asks to be treated as media playback
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* older Safari */ }
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
    star: () => bell(mtof(96), 0),
    // Distant thunder: a low rumble that swells and rolls away; delay = seconds after the lightning
    thunder: (delay = 1) => {
      if (!ac) return;
      const at = ac.currentTime + delay, s = ac.createBufferSource(), f = filt("lowpass", 160), g = ac.createGain();
      s.buffer = brownBuf; f.frequency.setValueAtTime(220, at); f.frequency.exponentialRampToValueAtTime(70, at + 4);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.9, at + 0.35);
      g.gain.setTargetAtTime(0.45, at + 0.5, 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + 4.5);
      s.connect(f); f.connect(g); g.connect(ambBus); s.start(at, Math.random()); s.stop(at + 4.6);
      burst({ t: delay, dur: 0.6, vol: 0.06, type: "lowpass", f: 900, f2: 200 });
    },
    beep: () => { tone({ f: 1760, dur: 0.08, vol: 0.08, type: "square", lp: 3000 }); },
    click: () => { burst({ dur: 0.03, vol: 0.18, type: "bandpass", f: 1800, q: 2 }); },
    shutter: () => { burst({ dur: 0.04, vol: 0.2, type: "highpass", f: 3000 }); burst({ t: 0.07, dur: 0.05, vol: 0.14, type: "highpass", f: 2500 }); },
    siren: () => { for (let i = 0; i < 4; i++) tone({ f: 900, f2: 1500, t: i * 0.5, dur: 0.45, vol: 0.06, type: "sawtooth", lp: 2500 }); },
    chime: () => { bell(mtof(84), 0, 0.12); bell(mtof(88), 0.18, 0.1); },
    whoosh: () => burst({ dur: 0.6, vol: 0.12, type: "bandpass", f: 400, f2: 2400, q: 0.8 }),
    pour: () => { burst({ dur: 0.8, vol: 0.08, type: "bandpass", f: 900, q: 1.5 }); for (let i = 0; i < 5; i++) tone({ f: rand(500, 900), f2: rand(250, 400), t: i * 0.12, dur: 0.08, vol: 0.05 }); },
    zap: () => { tone({ f: 2400, f2: 600, dur: 0.12, vol: 0.06, type: "square", lp: 3500 }); }
  };

  // ---- Looping layers: ambience and devices that run while they're on ----
  function layer(name) {
    if (layers[name] || !ac) return layers[name];
    const g = gainNode(0); let L = { gain: g };
    const lfo = (rate, depth, target) => { const o = ac.createOscillator(), d = gainNode(depth); o.frequency.value = rate; o.connect(d); d.connect(target); o.start(); };
    if (name === "water") { const n = noiseSrc(true), f = filt("lowpass", 420); n.connect(f); f.connect(g); lfo(0.12, 120, f.frequency); }
    // Wind is a low rumble that swells and fades in gusts. (A steady white-noise band sounds like rain, so none of
    // the dry-weather layers use one.)
    else if (name === "wind") { const n = noiseSrc(true), f = filt("lowpass", 320), gg = gainNode(0.5); n.connect(f); f.connect(gg); gg.connect(g); lfo(0.06, 0.45, gg.gain); lfo(0.045, 120, f.frequency); }
    else if (name === "rain") {
      // Rain = a soft low roar (the whole shower) + a gentler patter band, not harsh static
      const n = noiseSrc(true), f = filt("lowpass", 900); n.connect(f); const fg = gainNode(0.9); f.connect(fg); fg.connect(g);
      const n2 = noiseSrc(false), b = filt("bandpass", 2600, 0.6), l = filt("lowpass", 5200), bg = gainNode(0.22); n2.connect(b); b.connect(l); l.connect(bg); bg.connect(g);
      lfo(0.09, 0.08, bg.gain);
    }
    else if (name === "gusts") { const n = noiseSrc(true), f = filt("lowpass", 520); n.connect(f); const gg = gainNode(0.5); f.connect(gg); gg.connect(g); lfo(0.09, 0.48, gg.gain); lfo(0.05, 220, f.frequency); }
    else if (name === "breeze") { const n = noiseSrc(true), f = filt("lowpass", 260), gg = gainNode(0.5); n.connect(f); f.connect(gg); gg.connect(g); lfo(0.05, 0.48, gg.gain); }
    else if (name === "cicada") {
      // A hot-afternoon insect buzz: a high noise band pulsing very fast, slowly swelling and fading
      // (a high tone pulsed fast, not noise, so it never sounds like rain)
      const c = ac.createOscillator(), am = gainNode(0.5); c.type = "triangle"; c.frequency.value = 4700; c.connect(am); am.connect(g); c.start(); lfo(6, 300, c.frequency);
      const o = ac.createOscillator(), d = gainNode(0.5); o.type = "square"; o.frequency.value = 38; o.connect(d); d.connect(am.gain); o.start(); lfo(0.07, 0.4, g.gain);
    }
    else if (name === "motor") { const o = ac.createOscillator(), f = filt("lowpass", 520), og = gainNode(0.5); o.type = "sawtooth"; o.frequency.value = 72; o.connect(f); f.connect(og); og.connect(g); o.start(); lfo(3, 6, o.frequency); }
    else if (name === "fire") { const n = noiseSrc(true), f = filt("lowpass", 420); n.connect(f); f.connect(g); }
    else if (name === "steam") { const n = noiseSrc(false), f = filt("bandpass", 3400, 1.2); n.connect(f); f.connect(g); lfo(0.4, 0.3, g.gain); }
    else if (name === "traffic") { const n = noiseSrc(true), f = filt("lowpass", 300); n.connect(f); f.connect(g); lfo(0.06, 120, f.frequency); }
    else if (name === "market") { const n = noiseSrc(true), f = filt("bandpass", 600, 0.6); n.connect(f); f.connect(g); lfo(0.13, 180, f.frequency); }
    else if (name === "hum") { const o = ac.createOscillator(), og = gainNode(0.4); o.frequency.value = 120; o.connect(og); og.connect(g); o.start(); const o2 = ac.createOscillator(), og2 = gainNode(0.15); o2.frequency.value = 240; o2.connect(og2); og2.connect(g); o2.start(); }
    else if (name === "uv") { const o = ac.createOscillator(), og = gainNode(0.3); o.type = "triangle"; o.frequency.value = 100; o.connect(og); og.connect(g); o.start(); const n = noiseSrc(false), f = filt("highpass", 7000), ng = gainNode(0.3); n.connect(f); f.connect(ng); ng.connect(g); }
    else if (name === "roomtone") { const n = noiseSrc(true), f = filt("lowpass", 160); n.connect(f); f.connect(g); const o = ac.createOscillator(), og = gainNode(0.05); o.frequency.value = 60; o.connect(og); og.connect(g); o.start(); }
    else if (name === "city") { const n = noiseSrc(true), f = filt("bandpass", 260, 0.5); n.connect(f); f.connect(g); lfo(0.05, 60, f.frequency); }
    else if (name === "pump") { const o = ac.createOscillator(), f = filt("lowpass", 380), og = gainNode(0.5); o.type = "sawtooth"; o.frequency.value = 110; o.connect(f); f.connect(og); og.connect(g); o.start(); const n = noiseSrc(false), nf = filt("bandpass", 2600, 2); n.connect(nf); nf.connect(g); }
    else if (name === "hiss") { const n = noiseSrc(false), f = filt("bandpass", 4200, 3); n.connect(f); f.connect(g); } // a narrow hiss, unlike rain's broad patter
    // A fan: its motor's low hum plus soft moving air (low-passed, so it doesn't hiss like rain)
    else if (name === "fan") { const o = ac.createOscillator(), f = filt("lowpass", 260), og = gainNode(0.35); o.type = "sawtooth"; o.frequency.value = 96; o.connect(f); f.connect(og); og.connect(g); o.start();
      const n = noiseSrc(true), nf = filt("lowpass", 600), ng = gainNode(0.7); n.connect(nf); nf.connect(ng); ng.connect(g); lfo(8, 0.08, ng.gain); }
    else if (name === "heat") { const n = noiseSrc(true), f = filt("lowpass", 90); n.connect(f); f.connect(g); }
    else if (name === "buzzer") { const o = ac.createOscillator(), f = filt("lowpass", 3200); o.type = "square"; o.frequency.value = 2300; o.connect(f); f.connect(g); o.start(); }
    else if (name === "bubbles") { L.bubbles = true; }
    g.connect(name === "buzzer" ? fxBus : ambBus);
    layers[name] = L;
    return L;
  }
  const LEVELS = { water: 0.4, wind: 0.3, rain: 0.55, gusts: 0.45, breeze: 0.16, cicada: 0.025, roomtone: 0.5, city: 0.4, pump: 0.12, hiss: 0.035, fan: 0.12,
    heat: 0.3, buzzer: 0.05, bubbles: 1, motor: 0.1, fire: 0.35, steam: 0.06, traffic: 0.35, market: 0.3, hum: 0.06, uv: 0.05 };
  const DEVICE = ["pump", "hiss", "fan", "heat", "bubbles", "buzzer", "motor", "fire", "steam", "hum", "uv"]; // these chirp on/off when they change
  const applied = {};
  let lastChirp = 0;
  // on: true/false, or a number 0–1 to play the layer quieter (a light drizzle, a far-away road)
  function setLayer(name, on) {
    const lv = on === true ? 1 : on ? +on : 0;
    const was = !!want[name];
    want[name] = lv > 0;
    if (!ac || applied[name] === lv || !(name in LEVELS)) return;
    applied[name] = lv;
    const L = layer(name);
    L.gain.gain.setTargetAtTime(LEVELS[name] * lv, ac.currentTime, name === "buzzer" ? 0.01 : 0.6);
    // a short chirp when a device switches, at most one every 0.4 s so a busy rule doesn't chatter
    if (was !== lv > 0 && DEVICE.includes(name) && name !== "buzzer" && ac.currentTime - lastChirp > 0.4) { lastChirp = ac.currentTime; FX[lv > 0 ? "on" : "off"](); }
  }

  // Three kinds of bird call, so a sunny morning sounds like several birds rather than one
  function birdCall(vol) {
    const kind = Math.floor(Math.random() * 3), base = rand(2400, 3800);
    if (kind === 0) { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) tone({ f: base, f2: base * rand(1.2, 1.5), t: i * 0.11, dur: 0.07, vol, bus: ambBus }); }
    else if (kind === 1) { for (let i = 0; i < 6; i++) tone({ f: base * (1 + (i % 2) * 0.12), t: i * 0.045, dur: 0.04, vol: vol * 0.8, bus: ambBus }); }  // a quick trill
    else { tone({ f: base * 0.6, f2: base * 0.75, dur: 0.18, vol, bus: ambBus }); tone({ f: base * 0.75, f2: base * 0.55, t: 0.24, dur: 0.22, vol, bus: ambBus }); } // a two-note whistle
  }
  // Random sounds on top of the loops: bubbles, birds by day, crickets and frogs at night, rain drops, a clock in the room
  let lastBird = 0, lastCricket = 0, lastDrop = 0, lastTick = 0, lastFrog = 0, lastCar = 0, lastCrackle = 0;
  function tickAmbience() {
    if (!ac) return;
    setTimeout(tickAmbience, 90);
    if (ac.state !== "running" || !prefs.fx) return;
    const now = ac.currentTime, wx = scene.weather;
    if (want.bubbles && Math.random() < 0.6) tone({ f: rand(500, 1400), f2: rand(1500, 2600), dur: rand(0.03, 0.07), vol: rand(0.02, 0.05), bus: ambBus });
    const outdoors = !!wx || theme === "pond" || theme === "plant";
    // Birds: often on sunny days, now and then when cloudy, never in rain or at night
    const birdGap = wx === "cloudy" ? rand(7, 15) : rand(2.5, 6);
    if (outdoors && !scene.night && !scene.rain && now - lastBird > birdGap) { lastBird = now; birdCall(wx === "cloudy" ? 0.025 : 0.035); }
    if (outdoors && scene.night && !scene.rain && now - lastCricket > rand(0.8, 1.6)) {
      lastCricket = now;
      for (let i = 0; i < 3; i++) tone({ f: 4400, t: i * 0.05, dur: 0.03, vol: 0.018, bus: ambBus });
    }
    // Frogs croak near water at night, and love the rain
    if ((theme === "pond" || scene.water) && scene.night && now - lastFrog > rand(scene.rain ? 1.5 : 3, scene.rain ? 4 : 8)) {
      lastFrog = now;
      const f = rand(90, 140), n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) tone({ f, f2: f * 0.85, t: i * 0.22, dur: 0.16, vol: 0.06, type: "sawtooth", lp: 700, bus: ambBus });
    }
    // Rain drops: little ticks on leaves and roofs, and the odd fat drop, on top of the rain's roar
    if (scene.rain) {
      const n = Math.random() < 0.8 ? 2 + Math.floor(Math.random() * 3) : 0;
      for (let i = 0; i < n; i++) tone({ f: rand(1800, 5200), t: rand(0, 0.09), dur: 0.015, vol: rand(0.006, 0.02), type: "triangle", bus: ambBus });
      if (Math.random() < 0.08) tone({ f: rand(600, 1100), f2: rand(250, 380), t: rand(0, 0.09), dur: 0.09, vol: 0.03, bus: ambBus });
    } else if (theme === "pond" && now - lastDrop > rand(3, 9)) { lastDrop = now; tone({ f: rand(800, 1200), f2: rand(250, 400), dur: 0.12, vol: 0.03, bus: ambBus }); }
    if (theme === "room" && now - lastTick > 1) { lastTick = now; tone({ f: 3000, dur: 0.012, vol: 0.012, type: "triangle", bus: ambBus }); }
    // A fire crackles, and cars pass on a road
    if (want.fire && now - lastCrackle > rand(0.05, 0.4)) { lastCrackle = now; burst({ dur: rand(0.01, 0.03), vol: rand(0.04, 0.12), type: "bandpass", f: rand(1500, 4000), q: 3 }); }
    if (want.traffic && now - lastCar > rand(4, 10)) {
      lastCar = now;
      const at = ac.currentTime, src = ac.createBufferSource(), f = filt("bandpass", 300, 0.8), g = ac.createGain();
      src.buffer = brownBuf; f.frequency.setValueAtTime(220, at); f.frequency.linearRampToValueAtTime(520, at + 1.4); f.frequency.linearRampToValueAtTime(180, at + 3);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, at + 3);
      src.connect(f); f.connect(g); g.connect(ambBus); src.start(at, Math.random()); src.stop(at + 3.1);
    }
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
    const th = customMusic || THEMES[theme] || THEMES.pond, spb = 60 / th.bpm * (scene.rain ? 1.15 : 1); // rain slows the tune a little
    while (nextBeat < ac.currentTime + 0.4) {
      const t = nextBeat - ac.currentTime, chord = th.chords[Math.floor(beat / 8) % th.chords.length];
      const lp = (th.wave === "square" ? 1400 : 2400) * (scene.rain ? 0.6 : 1); // and makes it softer
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
  // update({ ambience: ["water", "wind"], weather: "sunny" | "cloudy" | "rainy", hour, night, rain, water,
  //          devices: { bubbles: true, pump: false } }) — called a few times a second. Devices may also be a level 0–1.
  function update(state) {
    scene = { night: !!state.night, rain: !!state.rain, weather: state.weather || null, water: !!state.water };
    const ambience = new Set(state.ambience || []);
    if (state.rain) ambience.add("rain");
    // The weather bed: gusty wind under clouds and rain, a light breeze and afternoon cicadas in the sun
    const wx = scene.weather;
    if (wx) {
      const h = state.hour ?? 12;
      // the weather owns the outdoor bed: a game's general "wind" layer is replaced by the weather's own
      ambience.delete("wind");
      if (wx === "cloudy" || wx === "rainy") ambience.add("gusts"); else if (!scene.night) ambience.add("breeze");
      if (wx === "sunny" && !scene.night && h >= 10 && h < 16) ambience.add("cicada");
    }
    for (const n of ["water", "wind", "rain", "gusts", "breeze", "cicada", "roomtone", "city", "traffic", "market"]) setLayer(n, ambience.has(n));
    for (const [n, on] of Object.entries(state.devices || {})) setLayer(n, on);
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
    customMusic = opts.music || null;
    // iPhone Safari only unlocks audio on touchend/click, not pointerdown, so listen for all of them
    const go = () => { boot(); if (ac && ac.state !== "running" && !document.hidden) ac.resume(); };
    ["pointerdown", "touchend", "click", "keydown"].forEach((ev) => document.addEventListener(ev, go, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
    // A quiet tick for every button press, so the controls feel physical
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button, .btn"); if (b && !b.closest(".sound")) fx("tap"); }, true);
  }

  root.IoTSound = { init, fx, update, button, get started() { return started; } };
})(window);
