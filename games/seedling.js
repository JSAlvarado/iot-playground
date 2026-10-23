// ============ GAME: SEEDLING CHAMBER ============
// A solar-powered microclimate chamber raising tomato, eggplant and pepper seedlings on a small farm near Davao,
// based on the SeedSpark student design (a proposal). Sun, clouds and irregular rain all change the chamber.
(function () {
  "use strict";
  const { IoT, SeedlingModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const M = SeedlingModel;

  // ---- The scene: an original flat drawing of the chamber, its solar panel and the rain barrel ----
  let svg, sky, sunEl, hills, chamberTint, heatTint, soilCells = [], plants = [], drops = [], fog = [], fanBlades, fanAir, valveEl, waterFill, oled, hoseFlow;
  const CELL_X = (i) => 275 + i * 50;
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 500, fill: "#bfe3f0" }, svg);
      sunEl = mk("circle", { r: 26, fill: "#ffd25a" }, svg);
      hills = mk("path", { d: "M0 330 Q120 260 240 310 T480 300 T800 290 V420 H0 Z", fill: "#6fa36a" }, svg);
      mk("rect", { x: 0, y: 398, width: 800, height: 102, fill: "#8a6a45" }, svg);
      mk("rect", { x: 0, y: 392, width: 800, height: 10, fill: "#5f8f4e" }, svg);

      // Solar panel on a post, with the controller box (ESP32 and its OLED screen)
      mk("rect", { x: 141, y: 200, width: 8, height: 200, fill: "#5a5f63" }, svg);
      mk("path", { d: "M84 196 L120 150 H206 L174 196 Z", fill: "#23415a", stroke: "#cfd6db", "stroke-width": 3 }, svg);
      for (const f of [0.33, 0.66]) mk("path", { d: `M${84 + 36 * f} ${196 - 46 * f} H${174 + 32 * f}`, stroke: "#5e86a3", "stroke-width": 2 }, svg);
      mk("path", { d: "M106 196 L148 150 M130 196 L172 150 M152 196 L192 150", stroke: "#5e86a3", "stroke-width": 2 }, svg);
      mk("rect", { x: 96, y: 250, width: 98, height: 62, rx: 6, fill: "#eef0ea", stroke: "#4b5156", "stroke-width": 3 }, svg);
      mk("rect", { x: 103, y: 257, width: 84, height: 32, rx: 3, fill: "#10202a" }, svg);
      oled = mk("text", { x: 145, y: 280, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: "#7ff0b0", "font-family": "Outfit, sans-serif" }, svg);
      mk("circle", { cx: 120, cy: 300, r: 4, fill: "#3aa35b" }, svg);
      mk("path", { d: "M194 290 H232", stroke: "#33373a", "stroke-width": 3 }, svg);

      // The chamber: metal frame, acrylic walls (tinted by heat), a tray of six soil cells
      mk("rect", { x: 230, y: 150, width: 340, height: 248, fill: "#e6f2f6" }, svg);
      chamberTint = mk("rect", { x: 230, y: 150, width: 340, height: 248, fill: "#9fd3e6", opacity: 0.35 }, svg);
      heatTint = mk("rect", { x: 230, y: 150, width: 340, height: 248, fill: "#ff7a3a", opacity: 0 }, svg);
      mk("rect", { x: 248, y: 352, width: 304, height: 40, rx: 4, fill: "#3b3f42" }, svg);
      for (let i = 0; i < 6; i++) soilCells.push(mk("rect", { x: CELL_X(i) - 21, y: 348, width: 42, height: 22, rx: 3, fill: "#6b4a2e" }, svg));
      // Seedlings: a seed, a stem, two seed leaves (cotyledons) and up to four true leaves
      for (let i = 0; i < 6; i++) {
        const g = mk("g", { transform: `translate(${CELL_X(i)} 350) scale(1.5)` }, svg);
        const seed = mk("ellipse", { cx: 0, cy: -2, rx: 6, ry: 4, fill: "#d9c08a", stroke: "#8a6a3a", "stroke-width": 1.5 }, g);
        const stem = mk("path", { d: "M0 0 V-1", stroke: "#3f8f3a", "stroke-width": 4, "stroke-linecap": "round", fill: "none" }, g);
        const top = mk("g", {}, g);
        const coty = [mk("ellipse", { cx: -10, cy: 0, rx: 10, ry: 5, fill: "#7cc46a" }, top), mk("ellipse", { cx: 10, cy: 0, rx: 10, ry: 5, fill: "#7cc46a" }, top)];
        const leaves = [];
        for (let k = 0; k < 4; k++) leaves.push(mk("path", { d: "M0 0 q14 -12 30 -4 q-14 12 -30 4 z", fill: "#3f9a45" }, g));
        plants.push({ g, seed, stem, top, coty, leaves, phase: i * 1.3, offset: (i % 3) * 0.03 });
      }
      // Drip line along the top inside, with drops that fall while the valve is open
      mk("path", { d: "M252 222 H548", stroke: "#2c5d7a", "stroke-width": 5, "stroke-linecap": "round" }, svg);
      for (let i = 0; i < 6; i++) drops.push(mk("ellipse", { cx: CELL_X(i), cy: 230, rx: 3, ry: 5, fill: "#4aa3df", opacity: 0 }, svg));
      // Condensation on the acrylic when the air is very humid
      for (let i = 0; i < 22; i++) fog.push(mk("circle", { cx: 242 + (i * 71) % 316, cy: 166 + (i * 43) % 160, r: 3 + (i % 3), fill: "#ffffff", opacity: 0 }, svg));
      // Frame
      mk("rect", { x: 230, y: 150, width: 340, height: 248, fill: "none", stroke: "#4b5156", "stroke-width": 8 }, svg);
      mk("rect", { x: 222, y: 138, width: 356, height: 16, rx: 4, fill: "#4b5156" }, svg);
      const t = mk("text", { x: 330, y: 151, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#eef0ea", "font-family": "Outfit, sans-serif" }, svg);
      t.textContent = "SeedSpark";
      // Exhaust fan in the right wall, with air puffs when it runs
      const fan = mk("g", { transform: "translate(520 190)" }, svg);
      mk("circle", { r: 27, fill: "#33373a" }, fan);
      fanBlades = mk("g", {}, fan);
      for (const a of [0, 120, 240]) mk("path", { d: "M0 0 Q6 -12 0 -22 Q-8 -12 0 0 Z", fill: "#cfd6db", transform: `rotate(${a})` }, fanBlades);
      mk("circle", { r: 5, fill: "#7a8288" }, fan);
      fanAir = mk("g", { stroke: "#ffffff", "stroke-width": 4, "stroke-linecap": "round", opacity: 0 }, svg);
      for (const y of [176, 190, 204]) mk("path", { d: `M582 ${y} h22`, fill: "none" }, fanAir);
      // Rain barrel with a funnel, its water level, the hose and the solenoid valve
      mk("path", { d: "M622 250 H718 L700 272 H640 Z", fill: "#5a5f63" }, svg);
      mk("rect", { x: 632, y: 272, width: 76, height: 126, rx: 10, fill: "#2f4f63" }, svg);
      waterFill = mk("rect", { x: 640, y: 280, width: 60, height: 110, rx: 6, fill: "#4aa3df" }, svg);
      for (const y of [300, 345]) mk("rect", { x: 630, y, width: 80, height: 6, fill: "#22394a" }, svg);
      mk("path", { d: "M640 384 H600 V222 H560", stroke: "#2c5d7a", "stroke-width": 6, fill: "none" }, svg);
      hoseFlow = mk("path", { d: "M640 384 H600 V222 H560", stroke: "#8fd0f5", "stroke-width": 3, fill: "none", "stroke-dasharray": "8 10", opacity: 0 }, svg);
      valveEl = mk("rect", { x: 586, y: 270, width: 28, height: 30, rx: 4, fill: "#8a9298", stroke: "#33373a", "stroke-width": 2 }, svg);
      box.replaceChildren(svg);
    },
    reset() {},
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour;
      const wsun = M.weather[s.weather].sun;
      const day = s.sun > 0 ? Math.min(1, s.sun / Math.max(0.2, wsun) + 0.2) : (hour > 5 && hour < 19 ? 0.35 : 0);
      sky.setAttribute("fill", mix("#1c2742", s.weather === "sunny" ? "#bfe3f0" : "#b7c3cc", Math.min(1, day)));
      hills.setAttribute("fill", mix("#2c4630", "#6fa36a", Math.min(1, day)));
      // The sun crosses the sky by day; the moon by night; clouds and rain hide the sun
      const visible = hour >= 6 && hour <= 18;
      const f = visible ? (hour - 6) / 12 : Math.min(1, ((hour + 6) % 24) / 12);
      sunEl.setAttribute("cx", 120 + 560 * f);
      sunEl.setAttribute("cy", 230 - Math.sin(Math.PI * f) * 150);
      sunEl.setAttribute("fill", visible ? "#ffd25a" : "#e8ecf2");
      sunEl.setAttribute("opacity", visible ? (s.rain > 0 ? 0 : s.weather === "sunny" ? 1 : 0.4) : 1);

      // Heat glows orange through the walls above 30 °C; humid air fogs the acrylic with drops
      heatTint.setAttribute("opacity", IoT.clamp((s.temp - 30) / 14, 0, 0.45).toFixed(2));
      chamberTint.setAttribute("opacity", (0.2 + 0.25 * day).toFixed(2));
      const fogLevel = IoT.clamp((s.humidity - 88) / 8, 0, 1);
      fog.forEach((d, i) => d.setAttribute("opacity", (fogLevel * (i % 4 === 0 ? 0.95 : 0.7) * (i / fog.length < fogLevel + 0.2 ? 1 : 0)).toFixed(2)));
      // Soil darkens as it gets wetter
      const soil = mix("#d2ad74", "#3e2814", IoT.clamp(s.moisture / 90, 0, 1));
      soilCells.forEach((c) => c.setAttribute("fill", soil));

      // Seedlings: seeds swell, sprout, open seed leaves, then true leaves; they droop when dry or sick
      const sick = IoT.clamp((100 - s.health) / 70, 0, 1);
      const droop = s.moisture < 25 ? IoT.clamp((25 - s.moisture) / 15, 0, 1) : sick * 0.6;
      const leafColor = mix("#22702b", "#8a7030", sick), cotyColor = mix("#7cc46a", "#b9a45a", sick);
      plants.forEach((p, i) => {
        const up = s.sprouted || s.germ >= 0.86 + p.offset * 4; // a few seeds pop up a little before the rest
        p.seed.setAttribute("rx", (5 + s.germ * 2).toFixed(1));
        p.seed.setAttribute("opacity", up ? 0 : 1);
        const g = s.sprouted ? s.growth : 0;
        const hgt = up ? 18 + g * 14 + (s.sprouted ? 0 : (s.germ - 0.86) * 60) : 0;
        const sway = Math.sin(now / 1400 + p.phase) * (s.fanOn ? 4 : 1.2);
        const tipX = sway + droop * 10, tipY = -Math.max(1, hgt) * (1 - droop * 0.25);
        p.stem.setAttribute("d", `M0 0 Q${(sway / 2).toFixed(1)} ${(tipY / 2).toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}`);
        p.stem.setAttribute("opacity", up ? 1 : 0);
        p.stem.setAttribute("stroke", mix("#3f8f3a", "#8a7a3a", sick));
        // Seed leaves stay low on the stem once true leaves grow above them
        const cf = s.sprouted && hgt > 18 ? 18 / hgt : 1;
        p.top.setAttribute("transform", `translate(${(tipX * cf * cf).toFixed(1)} ${(tipY * cf).toFixed(1)}) rotate(${(droop * 35).toFixed(1)})`);
        p.top.setAttribute("opacity", up ? 1 : 0);
        p.coty.forEach((c) => c.setAttribute("fill", cotyColor));
        // True leaves open along the stem, alternating sides, and grow from small to full size
        p.leaves.forEach((l, k) => {
          const size = IoT.clamp(g - k, 0, 1);
          const side = k % 2 ? -1 : 1;
          // The newest leaf sits at the tip; older ones lower down the stem
          const f = IoT.clamp(1 - (Math.ceil(g) - 1 - k) * 0.3, 0.35, 1);
          l.setAttribute("transform", `translate(${(tipX * f * f).toFixed(1)} ${(tipY * f).toFixed(1)}) scale(${(side * (0.3 + 0.8 * size)).toFixed(2)} ${(0.3 + 0.8 * size).toFixed(2)}) rotate(${(-25 + droop * 50).toFixed(1)})`);
          l.setAttribute("opacity", size > 0 ? 1 : 0);
          l.setAttribute("fill", leafColor);
        });
      });

      // Devices: the fan spins and blows, water runs down the hose and drips from the line
      const spin = s.fanOn ? (now / 4) % 360 : 0;
      fanBlades.setAttribute("transform", `rotate(${spin.toFixed(1)})`);
      fanAir.setAttribute("opacity", s.fanOn ? (0.5 + 0.4 * Math.sin(now / 200)).toFixed(2) : 0);
      fanAir.setAttribute("transform", s.fanOn ? `translate(${((now / 25) % 18).toFixed(1)} 0)` : "");
      valveEl.setAttribute("fill", s.valveOn ? "#2f8fd6" : "#8a9298");
      hoseFlow.setAttribute("opacity", s.valveOn ? 1 : 0);
      hoseFlow.setAttribute("stroke-dashoffset", s.valveOn ? (-(now / 20) % 18).toFixed(1) : 0);
      drops.forEach((d, i) => {
        const t = ((now / 700 + i * 0.37) % 1);
        d.setAttribute("cy", (232 + t * 110).toFixed(1));
        d.setAttribute("opacity", s.valveOn ? (1 - t * 0.5).toFixed(2) : 0);
      });
      const lvl = IoT.clamp(s.tank / M.limits.barrel, 0, 1);
      waterFill.setAttribute("height", (110 * lvl).toFixed(1));
      waterFill.setAttribute("y", (390 - 110 * lvl).toFixed(1));
      waterFill.setAttribute("fill", lvl < 0.15 ? "#d64f4f" : "#4aa3df");
      oled.textContent = `${s.temp.toFixed(0)}°C ${Math.round(s.moisture)}%`;
    }
  };

  const missions = M.missions;
  window.SeedlingMissions = missions; // for the automated mission tests

  const LEVEL = { happy: "good", ok: "warn", dry: "warn", soggy: "warn", damp: "bad", hot: "bad", danger: "bad" };
  const isNight = (sim) => { const h = IoT.timeOfDay(sim.minutes).hour; return h < 5.75 || h > 18.5; };
  window.IoTGame = IoTUI.start({
    id: "seedling", title: "Seedling Chamber", short: "Sprouts", model: SeedlingModel,
    options: { weatherDays: ["sunny", "cloudy", "rainy", "sunny", "cloudy", "rainy", "sunny"], crop: "tomato" },
    accent: ["#1d6f52", "#d8efe4"],
    music: { bpm: 96, wave: "triangle", chords: [[50, 62, 66, 69], [47, 59, 62, 66], [43, 55, 59, 62], [45, 57, 61, 64]], scale: [74, 76, 78, 81, 83, 86] },
    sceneLabel: "A solar-powered seedling chamber on a farm, with a tray of seedlings, an exhaust fan and a rain barrel",
    howTo: ["Watch the four gauges. Green is good. Tap one to learn what it measures.",
      "Tomato seeds sprout best at 18–29 °C. Above 35 °C the heat harms them, and the sun heats the closed chamber fast.",
      "In the Rules tab, add: IF Air temp is above 30 THEN Fan ON. The fan lets the hot air out.",
      "Open Missions and press Play. Use the ☀️ ☁️ 🌧️ buttons on the scene to change the weather in free play."],
    credit: { text: "Based on the SeedSpark student design project (Holy Cross of Davao College, 2025). It's a proposed design; this game simulates how it is meant to work." },
    sensors: [
      { id: "moisture", label: "Soil moisture", short: "Soil", icon: "💧", unit: "%", decimals: 0, min: 0, max: 100, good: [40, 70], warn: [25, 90],
        learn: { title: "Soil moisture (%)", text: "A capacitive soil moisture sensor measures how much water is in the soil without bare metal touching it, so it doesn't rust like the cheap two-prong kind. The game shows it as 0–100%, and 40–70% is the comfortable range (a game value: real sensors need calibrating in your own soil). Seeds can't wake up in dry soil, and soil that stays soaked keeps air from the roots and helps damping-off mould (UConn). Sun, heat and the fan dry the soil fast; rainy, humid days dry it slowly. That's why watering by the sensor beats watering by the clock." } },
      { id: "temp", label: "Air temp", short: "Temp", icon: "🌡️", unit: "°C", decimals: 1, min: 15, max: 50, good: [18, 29], warn: [15, 35],
        learn: { title: "Air temperature (°C)", text: "A DHT22 sensor measures the air temperature (and humidity) inside the chamber. Tomato seeds sprout well at about 18–29 °C (65–85 °F) and fastest, in about 6 days, at 25–30 °C (UC Master Gardener chart). Germination drops sharply above 35 °C (University of Arizona study); in this game it stops at about 40 °C (a game value). In the sun, a closed box with clear walls traps heat and gets much hotter than the outdoor air, so the exhaust fan has to let it out. The game uses the air temperature for the soil too, which is a simplification." } },
      { id: "humidity", label: "Humidity", short: "Humid", icon: "🌫️", unit: "%", decimals: 0, min: 30, max: 100, good: [50, 85], warn: [35, 95],
        learn: { title: "Relative humidity (%)", text: "The DHT22 also measures relative humidity: how full of water vapour the air is. Wet soil fills a closed chamber with vapour, and on cool, rainy nights it reaches 100% and water drips from the walls. Drips, wet soil and still air help damping-off, a mould that kills young seedlings (UConn IPM). In this game, humidity above 95% on wet soil counts as dripping (a game value). The fan swaps in outdoor air, which is drier than the air in a closed, wet box." } },
      { id: "light", label: "Light", short: "Light", icon: "☀️", unit: "klux", decimals: 1, min: 0, max: 70, good: [10, 70], warn: [0, 10],
        learn: { title: "Light (klux = 1,000 lux)", text: "A BH1750 light sensor reports light in lux, up to about 65,000 lux. The gauge shows thousands of lux (klux), so 25 klux means 25,000 lux. Direct sun is about 32,000–100,000 lux, and daylight without direct sun about 10,000–25,000 lux. Seeds don't need light to sprout, but seedlings do: in low light they grow slowly and stretch tall and weak (Purdue Extension). In this game, growth is fastest from 25,000 lux and up, and below 10,000 lux counts as dim (game values). Clouds and rain cut the light, and sun brings heat with it." } }
    ],
    switches: [{ id: "valve", label: "Valve" }, { id: "fan", label: "Fan" }],
    events: [{ id: "water", label: "Water for 10 minutes", button: "Water now" }, { id: "refill", label: "Fill the rain barrel", button: "Fill barrel" }],
    ruleSensors: ["moisture", "temp", "humidity", "light"], ruleSwitches: ["valve", "fan"], ruleEvents: ["water"],
    defaultRules: [{ kind: "if", sensor: "moisture", op: "<", value: 40, actuator: "valve", until: 60 }],
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weather, set: (sim, v) => { sim.state.weatherDays = [v]; sim.state.weather = v; } },
      { type: "choice", label: "Crop", options: [{ value: "tomato", label: "Tomato" }, { value: "eggplant", label: "Eggplant" }, { value: "pepper", label: "Pepper" }],
        get: (sim) => sim.state.crop, set: (sim, v) => { sim.state.crop = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets up the chamber: the weather, the crop and the water in the barrel. Your rule cards do the work. Change rules any time, even mid-mission. Seedlings grow 6 times faster than real life here.",
    eventSounds: { water: "pour", refill: "splash" },
    // The sky for the weather layer: rainy days rain in irregular showers, with grey cloud in between
    weather: (sim) => { const s = sim.state; return { sky: s.rain > 0 ? "rainy" : s.weather === "rainy" ? "cloudy" : s.weather, night: isNight(sim), rain: s.rain }; },
    soundState: (sim) => { const s = sim.state; return { ambience: ["wind"], night: isNight(sim), rain: s.rain > 0, devices: { fan: s.fanOn, hiss: s.valveOn } }; },
    status: (sim) => { const s = sim.state, m = M.mood(s); return { level: LEVEL[m.id], text: `${m.text} · ${M.crops[s.crop].label} ${M.stage(s)}` }; },
    rulesIntro: "This is how SeedSpark's controller decides what to do. An IF rule keeps a device on while the condition is true. A time rule runs an action once a day.",
    rulesTip: "Try: IF Air temp is above 30 THEN Fan ON. Then try IF Humidity is above 90 THEN Fan ON for rainy nights. The example watering rule uses UNTIL: the valve opens below 40% and stays open until the soil reaches 60%, so it doesn't click on and off.",
    codeIntro: "Your rule cards written as an Arduino sketch for the ESP-WROOM-32 that SeedSpark proposes. The read...() functions stand in for each sensor's library code, and the pins are examples.",
    codeSpec: {
      title: "SeedSpark chamber controller (ESP-WROOM-32)",
      sensors: { moisture: { fn: "readSoilMoisture", unit: "%", label: "Capacitive soil moisture sensor (analog, GPIO34)" },
        temp: { fn: "readAirTemperature", unit: "°C", label: "DHT22 temperature (data on GPIO4)" },
        humidity: { fn: "readHumidity", unit: "%", label: "DHT22 relative humidity (data on GPIO4)" },
        light: { fn: "readKiloLux", unit: "klux", label: "BH1750 light sensor (I2C on GPIO21/22)" } },
      actuators: { valve: { pin: 26, label: "Solenoid valve, 2-channel relay channel 1", kind: "switch" },
        fan: { pin: 27, label: "12V exhaust fan, 2-channel relay channel 2", kind: "switch" },
        water: { kind: "event", drives: "valve", durationMin: 10, label: "Water for 10 minutes" } }
    },
    learnIntro: "What the sensors measure and why it matters for seedlings. The SeedSpark manuscript lists the parts but no set points, so every number here is a game value taken from the published sources below.",
    learnMore: [
      { title: "Seed, sprout, true leaves", text: "A seed first soaks up water and swells. Then a root and a shoot push out, and two seed leaves (cotyledons) open. The next leaves are the first true leaves, and seedlings with a few true leaves are ready to move to the field. Germination speed follows the UC chart for each crop: tomato is fastest at about 25–30 °C, eggplant likes it warmer (24–29 °C) and is slow at 20 °C, and pepper is slower overall. Where the chart has no number (eggplant above 30 °C or below 20 °C), the game guesses. Seedlings grow 6 times faster than real life so a mission fits in a few virtual days." },
      { title: "Vent the heat, and the damp", text: "A clear, closed chamber works like a parked car in the sun: it traps heat and gets much hotter than the air outside (up to about 12 °C hotter in this game). The exhaust fan swaps the hot air for outdoor air. At night the problem flips: the fan isn't needed for heat, but on rainy nights it keeps the wet air moving so water doesn't drip on the seedlings. Running the fan also dries the soil faster, so watch the soil gauge too." },
      { title: "What SeedSpark proposes", text: "From the manuscript: an ESP-WROOM-32 controller with three capacitive soil moisture sensors, three DHT22s, three MQ135 gas sensors for CO₂, a BH1750 light sensor, a soil pH or NPK sensor and an ESP32-CAM to watch seedling height; a solenoid valve on silicone tubes and a 12 V exhaust fan through a 2-channel relay; solar power with an MPPT charger and LiFePO4 batteries; and a chamber about 2.5 ft tall, 2 ft wide and 3 ft long for tomato, eggplant, bell pepper and pechay. It also proposes stimulating roots with low-voltage pulses (3–5 V) through stainless steel probes. The manuscript gives no numbers for that, and its benefit isn't established by research, so it has no effect in this game. The rain barrel is a game addition: the manuscript doesn't say where the water comes from." },
      { title: "A simplified model", text: "Real seedlings also depend on the seed batch, the potting mix, soil temperature, nutrients, pests and much more, and real chambers differ in size and airflow. Use this to understand the ideas, and real measurements and local agriculture advice to raise real seedlings." }
    ],
    sources: [
      { label: "UC Master Gardeners: Soil temperature for vegetable seed germination", url: "https://ucanr.edu/program/uc-master-gardener-program/seed-germination-temperature-and-timing" },
      { label: "University of Arizona: High temperature and tomato germination (thesis, 1990)", url: "https://repository.arizona.edu/items/68ec6813-2442-4047-ba31-b4c45235715b" },
      { label: "Tomato seed thermo-inhibition (BMC Plant Biology, 2018)", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6182833/" },
      { label: "UConn IPM: Damping-off of seedlings", url: "https://ipm.cahnr.uconn.edu/damping-off-of-ornamental-and-vegetable-seedlings/" },
      { label: "Purdue Extension: Leggy tomatoes", url: "https://www.purdue.edu/hla/sites/yardandgarden/leggy-tomatoes/" },
      { label: "Lux: typical light levels", url: "https://en.wikipedia.org/wiki/Lux" },
      { label: "Adafruit: BH1750 light sensor", url: "https://learn.adafruit.com/adafruit-bh1750-ambient-light-sensor" }
    ]
  });
})();
