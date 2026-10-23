// ============ GAME: TUBA MASTER (AUTUBA) ============
// A solar-powered stainless steel barrel on a coconut farm in Davao turns fresh coconut sap into coconut wine (tuba).
// Based on the AuTuba student design project (a proposal): sensors watch the pH, alcohol vapour and sap level, a servo
// drops in tongog bark, a motor stirs, and a peristaltic pump moves the finished tuba into a jug.
(function () {
  "use strict";
  const { IoT, TubaModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const L = TubaModel.limits;

  const missions = TubaModel.missions; // defined with the model so the tests can play them

  // ---- The scene: a coconut farm with the AuTuba barrel, its solar panel, controller and collection jug ----
  let svg, sky, sunEl, cloudG, hills, liquid, liquidTop, blade, shaft, bubbles = [], chips = [], lcdText, lcdBg, leds = [], buzzRings = [],
    battFill, rotor, tubePath, jugFill, panelGlow, stirLabel, lastTongog = 0, dropStart = -1e9, liquidColor = "#efe7d2";
  const BARREL = { x: 335, w: 130, top: 182, bottom: 366 };
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 330, fill: "#bfe3f0" }, svg);
      sunEl = mk("circle", { r: 26, fill: "#ffd25a" }, svg);
      cloudG = mk("g", { fill: "#ffffff", opacity: "0" }, svg);
      for (const [x, y, s] of [[300, 70, 1.1], [560, 60, 1.3], [700, 120, 0.8]]) {
        const g = mk("g", { transform: `translate(${x} ${y}) scale(${s})` }, cloudG);
        mk("ellipse", { cx: 0, cy: 10, rx: 60, ry: 22 }, g); mk("ellipse", { cx: -25, cy: 0, rx: 30, ry: 24 }, g); mk("ellipse", { cx: 20, cy: -8, rx: 34, ry: 28 }, g);
      }
      hills = mk("path", { d: "M0 300 Q120 250 260 290 T520 280 T800 285 V340 H0 Z", fill: "#6f9f58" }, svg);
      mk("rect", { x: 0, y: 330, width: 800, height: 170, fill: "#9c7b52" }, svg);
      mk("rect", { x: 0, y: 330, width: 800, height: 14, fill: "#7da35b" }, svg);
      // Coconut palms on both sides
      for (const [x, lean, sc] of [[70, 26, 1], [745, -24, 1], [640, -10, 0.6]]) {
        const g = mk("g", { transform: `translate(${x} 340) scale(${sc})` }, svg);
        mk("path", { d: `M-9 0 Q${lean * 0.4} -150 ${lean} -280 L${lean + 12} -280 Q${lean * 0.4 + 14} -150 9 0 Z`, fill: "#8a6a43" }, g);
        for (const a of [-160, -120, -60, -20, 200, 10]) {
          const r = (a * Math.PI) / 180, ex = lean + 6 + Math.cos(r) * 110, ey = -282 + Math.sin(r) * 60 + 40;
          mk("path", { d: `M${lean + 6} -282 Q${(lean + 6 + ex) / 2} ${-330 + Math.sin(r) * 20} ${ex.toFixed(0)} ${ey.toFixed(0)}`, stroke: "#3f7d3a", "stroke-width": 14, fill: "none", "stroke-linecap": "round" }, g);
        }
        for (const dx of [-6, 8, 2]) mk("circle", { cx: lean + 6 + dx, cy: -270 + Math.abs(dx), r: 9, fill: "#6b4b22" }, g);
      }
      // Solar panel on a pole, with the battery box and the controller below
      mk("rect", { x: 189, y: 150, width: 10, height: 190, fill: "#5e666c" }, svg);
      mk("path", { d: "M110 150 L130 96 H272 L282 150 Z", fill: "#1f3b5c" }, svg);
      for (const x of [146, 182, 218, 254]) mk("path", { d: `M${x - 6} 150 L${x + 2} 96`, stroke: "#4f78a3", "stroke-width": 2 }, svg);
      mk("path", { d: "M120 123 H277", stroke: "#4f78a3", "stroke-width": 2 }, svg);
      panelGlow = mk("path", { d: "M110 150 L130 96 H272 L282 150 Z", fill: "#ffffff", opacity: 0 }, svg);
      // Controller: the LCD status, the three LEDs and the buzzer
      mk("rect", { x: 110, y: 186, width: 170, height: 112, rx: 8, fill: "#2d3b45" }, svg);
      lcdBg = mk("rect", { x: 122, y: 198, width: 146, height: 44, rx: 4, fill: "#9fd18a" }, svg);
      lcdText = mk("text", { x: 195, y: 229, "text-anchor": "middle", "font-size": 22, "font-weight": 700, fill: "#1d3a1c", "font-family": "ui-monospace, Menlo, monospace" }, svg);
      [["#3fbf5f", 140], ["#f2c230", 175], ["#e2483d", 210]].forEach(([c, x]) => leds.push({ on: c, el: mk("circle", { cx: x, cy: 270, r: 11, fill: c, opacity: 0.25 }, svg) }));
      mk("circle", { cx: 252, cy: 270, r: 11, fill: "#14191d" }, svg);
      for (let i = 0; i < 2; i++) buzzRings.push(mk("circle", { cx: 252, cy: 270, r: 16 + i * 9, fill: "none", stroke: "#e2483d", "stroke-width": 3, opacity: 0 }, svg));
      // Battery box with its charge bar
      mk("rect", { x: 128, y: 304, width: 134, height: 30, rx: 6, fill: "#3a4148" }, svg);
      mk("rect", { x: 136, y: 312, width: 104, height: 14, rx: 3, fill: "#1b2025" }, svg);
      battFill = mk("rect", { x: 136, y: 312, width: 104, height: 14, rx: 3, fill: "#3aa35b" }, svg);
      mk("rect", { x: 242, y: 315, width: 6, height: 8, fill: "#1b2025" }, svg);
      // The frame of slotted angle bars and the stainless steel barrel
      for (const x of [318, 474]) mk("rect", { x, y: 340, width: 8, height: 64, fill: "#6d757b" }, svg);
      mk("rect", { x: 306, y: 372, width: 188, height: 8, fill: "#6d757b" }, svg);
      mk("rect", { x: 310, y: 150, width: 180, height: 230, rx: 18, fill: "#c9d0d4" }, svg);
      for (const y of [176, 352]) mk("rect", { x: 310, y, width: 180, height: 8, fill: "#a9b2b8" }, svg);
      mk("rect", { x: BARREL.x, y: BARREL.top, width: BARREL.w, height: BARREL.bottom - BARREL.top, rx: 10, fill: "#33403f" }, svg); // the cutaway window
      liquid = mk("rect", { x: BARREL.x, width: BARREL.w, rx: 8, fill: liquidColor }, svg);
      liquidTop = mk("rect", { x: BARREL.x, width: BARREL.w, height: 4, fill: "#ffffff", opacity: 0.35 }, svg);
      for (let i = 0; i < 10; i++) bubbles.push({ c: mk("circle", { r: 3 + (i % 3), fill: "#fff8e8", opacity: 0 }, svg), x: 0, y: 0, life: 0 });
      shaft = mk("rect", { x: 397, y: 150, width: 6, height: 196, fill: "#7c868c" }, svg);
      blade = mk("rect", { x: 370, y: 334, width: 60, height: 14, rx: 3, fill: "#7c868c" }, svg);
      for (let i = 0; i < 8; i++) chips.push(mk("rect", { width: 7, height: 5, rx: 1, fill: "#8a3b1e", opacity: 0 }, svg));
      // Lid, stirrer motor and the tongog hopper on its servo
      mk("rect", { x: 300, y: 140, width: 200, height: 14, rx: 5, fill: "#9aa4aa" }, svg);
      mk("rect", { x: 376, y: 104, width: 48, height: 38, rx: 5, fill: "#3a3f44" }, svg);
      stirLabel = mk("text", { x: 400, y: 129, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: "#9aa4aa", "font-family": "Outfit, sans-serif" }, svg);
      stirLabel.textContent = "M";
      mk("path", { d: "M444 92 H492 L476 132 H460 Z", fill: "#d9c9a8", stroke: "#6b5532", "stroke-width": 3 }, svg);
      for (const [x, y] of [[456, 102], [466, 108], [476, 101], [462, 116], [472, 118]]) mk("rect", { x, y, width: 8, height: 6, rx: 1, fill: "#8a3b1e" }, svg);
      mk("rect", { x: 456, y: 132, width: 24, height: 10, fill: "#3a3f44" }, svg);
      // Peristaltic pump, its tube and the collection jug
      tubePath = mk("path", { d: "M490 360 C520 360 520 352 540 352 M580 340 C610 330 630 280 652 286", fill: "none", stroke: "#d9e2e6", "stroke-width": 8, "stroke-linecap": "round" }, svg);
      mk("rect", { x: 530, y: 326, width: 56, height: 44, rx: 8, fill: "#3a3f44" }, svg);
      mk("circle", { cx: 558, cy: 348, r: 15, fill: "#c9d0d4" }, svg);
      rotor = mk("g", {}, svg);
      for (const a of [0, 120, 240]) mk("circle", { cx: 558 + 9 * Math.cos(a * Math.PI / 180), cy: 348 + 9 * Math.sin(a * Math.PI / 180), r: 4, fill: "#3a3f44" }, rotor);
      mk("path", { d: "M606 300 H700 V392 Q700 404 688 404 H618 Q606 404 606 392 Z", fill: "#eef3f5", opacity: 0.85 }, svg);
      jugFill = mk("rect", { x: 610, width: 86, fill: liquidColor }, svg);
      mk("path", { d: "M606 300 H700 V392 Q700 404 688 404 H618 Q606 404 606 392 Z", fill: "none", stroke: "#7c868c", "stroke-width": 4 }, svg);
      mk("rect", { x: 630, y: 284, width: 46, height: 16, rx: 3, fill: "#7c868c" }, svg);
      box.replaceChildren(svg);
    },
    reset(sim) { lastTongog = sim ? sim.state.tongog : 0; dropStart = -1e9; bubbles.forEach((b) => (b.life = 0)); },
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour, ph = TubaModel.ph(s);
      // Sky, sun and clouds follow the time and the weather
      const day = hour >= 6 && hour <= 18 ? Math.min(1, Math.sin(Math.PI * (hour - 6) / 12) * 2 + 0.15) : hour > 5 && hour < 19 ? 0.25 : 0;
      sky.setAttribute("fill", mix("#1c2742", s.weather === "sunny" ? "#bfe3f0" : "#b7c3cc", day));
      hills.setAttribute("fill", mix("#24402a", "#6f9f58", day));
      const visible = hour >= 6 && hour <= 18;
      const sh = visible ? (hour - 6) / 12 : ((hour + 6) % 24) / 12;
      sunEl.setAttribute("cx", 300 + 520 * Math.min(1, sh)); // rises behind the solar panel, sets behind the palms
      sunEl.setAttribute("cy", 250 - Math.sin(Math.PI * Math.min(1, sh)) * 140);
      sunEl.setAttribute("fill", visible ? "#ffd25a" : "#e8ecf2");
      sunEl.setAttribute("opacity", visible ? (s.weather === "rainy" ? 0 : s.weather === "cloudy" ? 0.45 : 1) : 1);
      cloudG.setAttribute("opacity", s.weather === "sunny" ? "0" : "0.92");
      panelGlow.setAttribute("opacity", (s.sun * 0.35).toFixed(2)); // the panel shines while it charges
      // The sap: creamy white when fresh, orange-red as the tongog soaks in, duller brown as it sours
      const has = s.level > 0.2;
      let c = mix("#efe7d2", "#c75a2f", Math.min(1, s.dissolved));
      if (ph < 4.2) c = mix(c, "#a98a55", Math.min(1, (4.2 - ph) / 0.5));
      liquidColor = c;
      const hgt = (BARREL.bottom - BARREL.top) * Math.min(1, s.level / L.barrel);
      const wave = s.stirring ? Math.sin(now / 160) * 2 : 0;
      liquid.setAttribute("y", (BARREL.bottom - hgt + wave).toFixed(1)); liquid.setAttribute("height", Math.max(0, hgt - wave).toFixed(1)); liquid.setAttribute("fill", c);
      liquidTop.setAttribute("y", (BARREL.bottom - hgt + wave).toFixed(1)); liquidTop.setAttribute("opacity", has ? 0.35 : 0);
      // The stirrer paddle turns (its blade looks narrower as it spins edge-on)
      const ang = s.stirring ? now / 220 : 0;
      const bw = 8 + 52 * Math.abs(Math.cos(ang));
      blade.setAttribute("x", (400 - bw / 2).toFixed(1)); blade.setAttribute("width", bw.toFixed(1));
      stirLabel.setAttribute("fill", s.stirring ? "#ffd25a" : "#9aa4aa");
      // Fermentation bubbles: busy yeasts make more bubbles
      const act = has ? Math.min(1, s.activity) : 0;
      bubbles.forEach((b, i) => {
        if (b.life <= 0 && act > 0.05 && Math.random() < act * 0.05) { b.life = 1; b.x = BARREL.x + 12 + ((i * 29) % (BARREL.w - 24)); b.y = BARREL.bottom - 8; }
        const surface = BARREL.bottom - hgt + 6;
        if (b.life > 0) { b.y -= 0.8 + (i % 3) * 0.3; if (b.y < surface) b.life = 0; }
        b.c.setAttribute("cx", (b.x + Math.sin(now / 300 + i) * 2).toFixed(1)); b.c.setAttribute("cy", b.y.toFixed(1)); b.c.setAttribute("opacity", b.life > 0 ? 0.75 : 0);
      });
      // Tongog chips fall from the hopper for a moment after each dispense
      if (s.tongog > lastTongog) dropStart = now;
      lastTongog = s.tongog;
      const dt = (now - dropStart) / 1400;
      chips.forEach((ch, i) => {
        const p = dt - i * 0.08;
        const shown = p > 0 && p < 1;
        const y = 142 + (BARREL.bottom - hgt - 142) * Math.min(1, Math.max(0, p));
        ch.setAttribute("x", 462 + ((i * 7) % 14) - (p > 0.4 ? (p - 0.4) * 40 : 0)); ch.setAttribute("y", y.toFixed(1)); ch.setAttribute("opacity", shown ? 1 : 0);
      });
      // Controller: LCD word, LEDs (green ready, yellow fermenting, red spoiled) and the buzzer rings
      const mood = TubaModel.mood(s).id;
      const word = !s.power ? "" : { empty: "EMPTY", spoiled: "SOUR!", ready: "READY", fresh: "START", fermenting: "FERMENT" }[mood] || "";
      lcdText.textContent = word;
      lcdBg.setAttribute("fill", s.power ? "#9fd18a" : "#3c4a3c");
      const lit = !s.power ? -1 : mood === "spoiled" ? 2 : mood === "ready" ? 0 : mood === "empty" ? -1 : 1;
      leds.forEach((l, i) => l.el.setAttribute("opacity", i === lit ? 1 : 0.22));
      buzzRings.forEach((r, i) => r.setAttribute("opacity", s.alarm ? (0.35 + 0.35 * Math.sin(now / 250 - i)).toFixed(2) : 0));
      battFill.setAttribute("width", (104 * s.battery / 100).toFixed(1));
      battFill.setAttribute("fill", s.battery < 10 ? "#e2483d" : s.battery < 30 ? "#e0a32a" : "#3aa35b");
      // Pump: the rotor turns and the tube fills with tuba while it runs; the jug shows this batch
      rotor.setAttribute("transform", `rotate(${s.pumping ? (now / 4) % 360 : 0} 558 348)`);
      tubePath.setAttribute("stroke", s.pumping ? c : "#d9e2e6");
      const jh = 96 * Math.min(1, s.jug / L.barrel);
      jugFill.setAttribute("y", (400 - jh).toFixed(1)); jugFill.setAttribute("height", jh.toFixed(1));
      if (s.pumping) jugFill.setAttribute("fill", c);
    }
  };

  window.TubaMissions = missions; // for the automated mission tests

  const LEVEL = { ready: "good", fermenting: "good", fresh: "good", empty: "warn", off: "bad", spoiled: "bad" };
  window.IoTGame = IoTUI.start({
    id: "tuba", title: "Tuba Master", short: "Tuba", model: TubaModel, options: { weather: "sunny", airHigh: 31 },
    accent: ["#9a3b22", "#f6e4d8"],
    music: { bpm: 76, wave: "triangle", chords: [[41, 53, 57, 60, 64], [46, 58, 62, 65, 69], [43, 55, 58, 62, 65], [48, 60, 64, 67, 70]], scale: [72, 74, 77, 79, 81, 84] },
    credit: { text: "Based on the AuTuba student design project (Holy Cross of Davao College, 2025). It's a proposed design; this game simulates how it is meant to work." },
    sceneLabel: "A coconut farm with a solar-powered stainless steel barrel of fermenting coconut sap, a controller with lights, and a jug for the finished coconut wine",
    howTo: ["Fresh coconut sap goes in the barrel. Tiny yeasts slowly turn it into coconut wine (tuba), a drink for adults only. This game is about the science.", "Watch pH: it falls as the sap ferments. Tuba is ready at about pH 4.8 or lower; below 3.8 it's sour vinegar.",
      "In the Rules tab, the pump rule moves the tuba into the jug at the right time. Tap a gauge to learn more.", "Open Missions and press Play. Use ☀️ ☁️ 🌧️ to change the weather: the solar battery needs sun."],
    sensors: [
      { id: "ph", label: "pH", icon: "🧪", unit: "", decimals: 2, min: 3, max: 7.5, good: [4, 7.5], warn: [3.8, 4],
        learn: { title: "pH: how sour it is", text: "pH measures how acidic a liquid is: 7 is neutral, lower is more sour. Fresh coconut sap is sweet and close to neutral (about pH 6.8–7.4 in one guide; some sap starts lower). As it ferments, bacteria make acids and the pH falls. Philippine tuba measured right after gathering averaged about pH 4.7. If it's left too long the alcohol turns into acid, and the drink becomes coconut vinegar. In this game tuba is ready at pH 4.8 or lower (with at least 4% alcohol), and below pH 3.8 counts as spoiled: these two numbers are game values, because the AuTuba manuscript only says \"abnormal pH\" means spoilage. AuTuba uses an analog pH probe, which needs calibrating with buffer solutions." } },
      { id: "alcohol", label: "Alcohol", short: "Alcohol", icon: "🍶", unit: "%", decimals: 1, min: 0, max: 8, good: [4, 8], warn: [0, 4],
        learn: { title: "Alcohol (estimated %)", text: "Yeasts eat the sap's sugar and make alcohol and carbon dioxide (the bubbles). AuTuba's alcohol sensor smells the alcohol vapour in the barrel to check the sap really is fermenting. The manuscript gives no units, so the game turns the vapour into an estimated alcohol %. Published numbers: about 1.5–2% after a day of slow natural fermentation and 4.5–5% by three days in a palm-wine guide, and 7.3% in freshly gathered Philippine tuba. Coconut wine is an alcoholic drink for adults; this game is about the food science, not drinking." } },
      { id: "level", label: "Sap level", short: "Sap", icon: "🥥", unit: "L", decimals: 1, min: 0, max: 24, good: [0, 24],
        learn: { title: "Sap level (litres)", text: "An ultrasonic sensor on the lid sends a click of sound down to the sap and times the echo: the closer the surface, the fuller the barrel. AuTuba uses the level to decide how much tongog to dispense. In the game the barrel holds 24 L, and the farmer brings 20 L of fresh sap at 07:00 each morning, but only pours it into an empty barrel." } },
      { id: "battery", label: "Battery", icon: "🔋", unit: "%", decimals: 0, min: 0, max: 100, good: [30, 100], warn: [10, 30],
        learn: { title: "Solar battery (%)", text: "AuTuba runs off-grid: a 100 W solar panel charges a LiFePO4 battery through a charge controller. The controller always uses a little power; the stirrer motor uses the most, and the pump some. Clouds and rain cut the charging a lot. If the battery runs empty the controller stops, so nothing gets stirred or pumped until the sun charges it again. The manuscript doesn't give the battery's size; the game's usage numbers are game values." } }
    ],
    switches: [{ id: "stirrer", label: "Stirrer" }, { id: "pump", label: "Pump" }],
    events: [{ id: "tongog", label: "Tongog dispenser", button: "Add tongog" }],
    ruleSensors: ["ph", "alcohol", "level", "battery"], ruleSwitches: ["stirrer", "pump"], ruleEvents: ["tongog"], ruleIfEvents: ["tongog"],
    defaultRules: [{ kind: "if", sensor: "level", op: ">", value: 5, actuator: "tongog" }, { kind: "if", sensor: "ph", op: "<", value: 4.7, actuator: "pump" }],
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weather, set: (sim, v) => { sim.state.weather = v; sim.state.weatherDays = null; } },
      { type: "range", label: "Day's high", min: 24, max: 36, step: 1, unit: " °C", get: (sim) => sim.state.airHigh, set: (sim, v) => { sim.state.airHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets up the farm: the weather, the battery and the sap. Your rule cards run AuTuba. Change rules any time, even mid-mission.",
    eventSounds: { tongog: "pour" },
    weather: (sim) => { const h = IoT.timeOfDay(sim.minutes).hour; return { sky: sim.state.weather, night: h < 5.5 || h > 18.75 }; },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour; return { ambience: ["wind"], night: h < 5.5 || h > 19, rain: s.weather === "rainy",
      devices: { motor: s.stirring, pump: s.pumping, buzzer: s.alarm, bubbles: s.level > 0.2 ? Math.min(1, s.activity) * 0.08 : 0 } }; },
    status: (sim) => { const s = sim.state, m = TubaModel.mood(s); const ph = TubaModel.ph(s);
      const level = m.id === "ready" && ph < 4.1 ? "warn" : LEVEL[m.id];
      return { level, text: s.good > 0 ? `${m.text} · ${Math.round(s.good)} L collected` : m.text }; },
    rulesIntro: "This is how AuTuba's Arduino decides what to do. An IF rule keeps a switch on while it's true, or STARTs the tongog dispenser once each time it becomes true. A time rule runs the dispenser once a day.",
    rulesTip: "Try adding: IF Alcohol is below 2 THEN Stirrer ON. It stirs the tongog in while the batch is young, so the tuba is ready sooner. The stirrer motor uses a lot of battery, so don't stir all the time.",
    codeIntro: "Your rule cards as an Arduino Mega 2560 sketch, the controller AuTuba's design uses. The read...() functions stand in for each sensor's real code, and the pins are an example wiring. The buzzer and red, yellow and green LEDs (spoilage alert), the clock, the 20x4 LCD and the push buttons would be fixed code that isn't shown.",
    codeSpec: {
      title: "AuTuba fermentation controller (Arduino Mega 2560)",
      sensors: { ph: { fn: "readPH", unit: "pH", label: "Analog pH sensor on A0" },
        alcohol: { fn: "readAlcoholPercent", unit: "% (estimated)", label: "Alcohol vapour sensor on A1, calibrated to an estimated alcohol %" },
        level: { fn: "readSapLevel", unit: "L", label: "Sap level from the ultrasonic sensor (trigger pin 22, echo pin 23)" },
        battery: { fn: "readBatteryPercent", unit: "%", label: "LiFePO4 battery level (voltage divider on A2)" } },
      actuators: { stirrer: { pin: 8, label: "12V DC geared stirrer motor, through motor driver 1", kind: "switch", onlyIf: "level > 2" },
        pump: { pin: 9, label: "Peristaltic pump, through motor driver 2", kind: "switch", onlyIf: "level > 0" },
        tongog: { pin: 10, label: "Tongog dispenser (metal-gear servo; a real sketch would turn it with the Servo library)", kind: "event", pulseMs: 800 } }
    },
    learnIntro: "What AuTuba's sensors measure, and how sweet coconut sap becomes coconut wine (tuba). The simulation is simplified so it runs in a browser; its directions follow the published sources below.",
    learnMore: [
      { title: "From sweet sap to tuba to vinegar", text: "Farmers collect sap from the cut flower stalk of the coconut palm. Wild yeasts in the sap turn its sugar into alcohol within hours, and bacteria make acids, so the pH falls. After a day or two, other bacteria start turning the alcohol into acetic acid: the tuba becomes coconut vinegar (sukang tuba), a useful product but no longer wine. A Philippine study advised selling tuba no later than two days after gathering. Warm weather speeds all of this up." },
      { title: "What tongog is", text: "Tongog (also called tangal) is the dried bark of a mangrove tree, Ceriops tagal. It gives Visayan coconut wine its orange-red colour and a bitter taste, and is used as a bittering and fermenting agent. The AuTuba manuscript calls it \"yeast\" and uses the sap level to set the dose. In this game one portion per 5 L of sap is a game value; adding it twice makes the tuba too bitter." },
      { title: "How this matches AuTuba", text: "AuTuba is a proposed design for a coconut farm in Davao City: a stainless steel barrel on a frame of slotted angle bars, an Arduino Mega 2560, a pH sensor, an alcohol vapour sensor, an ultrasonic level sensor, a servo tongog dispenser, a geared stirrer motor, a peristaltic pump, a buzzer and LEDs for spoilage alerts, a 20x4 LCD, push buttons for emergency stop and duration, and a 100 W solar panel with a LiFePO4 battery. The manuscript gives no set points. From the manuscript: the parts and that abnormal pH means spoilage. Game values: pH 4.8 ready, 4% alcohol, pH 3.8 spoiled, the 24 L barrel, 20 L of sap a day, the tongog dose and the battery numbers. The manuscript also raises the risk of methanol in badly made coconut spirits; this game doesn't simulate that." },
      { title: "A simplified model", text: "Real tuba depends on the trees, the season, how clean the containers are, the microbes in the sap and much more, and real sensors need calibrating. Use this to understand the ideas; real fermentation needs real measurements and experienced tuba makers." }
    ],
    sources: [
      { label: "Fernandez et al. 1980: tuba stored at four temperatures (AGRIS)", url: "https://agris.fao.org/search/fr/records/6471241dbc0c9c2643dfc73d" },
      { label: "Practical Action: Toddy and palm wine", url: "https://kolibri.teacherinabox.org.au/modules/en-practical_action/Food%20processing/Juices%20and%20drinks/KnO-100306_Toddy%20palm%20wine.pdf" },
      { label: "Yeast and fermentation time in coconut sap tuak (Canrea Journal, 2022)", url: "https://agritech.unhas.ac.id/ojs/index.php/canrea/article/view/599" },
      { label: "Tangal (Ceriops tagal), Philippine Medicinal Plants", url: "https://stuartxchange.com/Tangal" }
    ]
  });
})();
