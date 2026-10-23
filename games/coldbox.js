// ============ GAME: COLD CART, A SOLAR COLD BOX FOR FISH AT THE MARKET ============
// A vendor's fish stall at an off-grid street market in Davao del Norte, with a solar-powered thermoelectric cold box
// like the SPARC student design (a proposal): Peltier modules, heatsink fans, gas sensors and a solar battery.
(function () {
  "use strict";
  const { IoT, ColdboxModel, IoTUI } = window;
  const M = ColdboxModel;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); t = Math.min(1, Math.max(0, t)); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };

  // ---- Missions: defined with the model (pure logic, so the tests can run them) ----
  const missions = M.missions;

  // ---- The scene: an original flat drawing of a fish stall with the solar cold box ----
  let svg, sky, sunEl, panel, panelGlint, boxBody, frost, screenTxt, gasTxt, led, lid, mist, coolIcon, fins = [], fans = [], heatWaves = [], stink = [], battFill, lamp;
  let lidAngle = 0, fanAngle = 0, lastNow = 0;
  const FONT = "Outfit, sans-serif";
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 330, fill: "#bfe0ee" }, svg);
      sunEl = mk("circle", { r: 24, fill: "#ffd25a" }, svg);
      // Other stalls in the distance, and the street
      for (const [x, w, h, c] of [[0, 120, 90, "#9fb4bf"], [110, 90, 70, "#b3c3cb"], [640, 160, 95, "#9fb4bf"], [560, 90, 60, "#b3c3cb"]]) mk("rect", { x, y: 330 - h, width: w, height: h, fill: c }, svg);
      mk("rect", { x: 0, y: 330, width: 800, height: 170, fill: "#a7a29a" }, svg);
      mk("rect", { x: 0, y: 420, width: 800, height: 80, fill: "#8f8a82" }, svg);
      // The stall: two posts, a striped awning and the solar panel on its roof
      for (const x of [112, 676]) mk("rect", { x, y: 120, width: 12, height: 300, fill: "#6b5a48" }, svg);
      for (let i = 0; i < 8; i++) mk("rect", { x: 96 + i * 76, y: 112, width: 76, height: 36, fill: i % 2 ? "#f4f7f8" : "#3a6f8f" }, svg);
      for (let i = 0; i < 8; i++) mk("path", { d: `M${96 + i * 76} 148 q38 20 76 0 z`, fill: i % 2 ? "#f4f7f8" : "#3a6f8f" }, svg);
      panel = mk("path", { d: "M440 110 L700 110 L676 74 L462 74 Z", fill: "#1f3550", stroke: "#c9d3da", "stroke-width": 3 }, svg);
      for (let i = 1; i < 6; i++) { const x1 = 440 + i * 260 / 6, x2 = 462 + i * 214 / 6; mk("path", { d: `M${x1} 110 L${x2} 74`, stroke: "#5f86a8", "stroke-width": 1.5 }, svg); }
      mk("path", { d: "M451 92 H688", stroke: "#5f86a8", "stroke-width": 1.5 }, svg);
      panelGlint = mk("path", { d: "M600 108 L640 76 L656 76 L616 108 Z", fill: "#ffffff", opacity: 0 }, svg);
      lamp = mk("circle", { cx: 400, cy: 168, r: 9, fill: "#fff2b0", opacity: 0 }, svg);
      mk("path", { d: "M400 148 V160", stroke: "#4b5156", "stroke-width": 2 }, svg);
      // The table, the battery under it and the wire from the panel
      mk("rect", { x: 96, y: 360, width: 600, height: 18, rx: 3, fill: "#8a6a4a" }, svg);
      for (const x of [116, 660]) mk("rect", { x, y: 378, width: 14, height: 44, fill: "#6b5a48" }, svg);
      mk("path", { d: "M690 110 V300 Q690 330 660 330 H650 V384", stroke: "#2b2f33", "stroke-width": 3, fill: "none" }, svg);
      mk("rect", { x: 560, y: 384, width: 90, height: 34, rx: 5, fill: "#2b2f33" }, svg);
      mk("rect", { x: 568, y: 394, width: 66, height: 14, rx: 3, fill: "#555c62" }, svg);
      battFill = mk("rect", { x: 568, y: 394, width: 66, height: 14, rx: 3, fill: "#3aa35b" }, svg);
      mk("rect", { x: 634, y: 398, width: 6, height: 6, fill: "#555c62" }, svg);
      // The cold box: EPS inside a metal case, a screen, a fingerprint pad and the clamp to the table
      boxBody = mk("rect", { x: 280, y: 236, width: 230, height: 124, rx: 10, fill: "#eef3f6", stroke: "#7c8a94", "stroke-width": 4 }, svg);
      frost = mk("rect", { x: 288, y: 244, width: 214, height: 108, rx: 7, fill: "#bfe4f5", opacity: 0 }, svg);
      mk("rect", { x: 300, y: 258, width: 112, height: 70, rx: 6, fill: "#14232f" }, svg);
      screenTxt = mk("text", { x: 356, y: 298, "text-anchor": "middle", "font-size": 30, "font-weight": 700, fill: "#9fe3ff", "font-family": FONT }, svg);
      gasTxt = mk("text", { x: 356, y: 318, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: "#9fe3ff", "font-family": FONT }, svg);
      led = mk("circle", { cx: 428, cy: 268, r: 6, fill: "#3aa35b" }, svg);
      mk("rect", { x: 436, y: 284, width: 40, height: 44, rx: 8, fill: "#cfd6db", stroke: "#7c8a94", "stroke-width": 2 }, svg);
      for (const r of [6, 10, 14]) mk("path", { d: `M${456 - r} 312 a${r} ${r} 0 0 1 ${2 * r} 0`, stroke: "#6c7a84", "stroke-width": 2, fill: "none" }, svg);
      mk("rect", { x: 300, y: 356, width: 22, height: 16, fill: "#aab4ba" }, svg);
      mk("rect", { x: 468, y: 356, width: 22, height: 16, fill: "#aab4ba" }, svg);
      coolIcon = mk("text", { x: 395, y: 352, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#2a6f97", "font-family": FONT }, svg);
      coolIcon.textContent = "❄ COOLING";
      // Cold mist that spills out while the lid is open
      mist = mk("g", { fill: "#ffffff", opacity: 0 }, svg);
      for (const [x, y, r] of [[330, 226, 18], [370, 220, 22], [420, 224, 20], [460, 228, 16]]) mk("ellipse", { cx: x, cy: y, rx: r * 1.6, ry: r * 0.7 }, mist);
      // The lid, hinged at the back left corner
      lid = mk("g", {}, svg);
      mk("rect", { x: 0, y: -18, width: 242, height: 20, rx: 6, fill: "#dfe7ec", stroke: "#7c8a94", "stroke-width": 4 }, lid);
      mk("rect", { x: 100, y: -26, width: 42, height: 9, rx: 4, fill: "#7c8a94" }, lid);
      // The heatsink (fins) and its two fans on the right side
      for (let i = 0; i < 6; i++) fins.push(mk("rect", { x: 514 + i * 9, y: 246, width: 6, height: 104, fill: "#9aa3a9" }, svg));
      for (const cy of [272, 326]) {
        mk("circle", { cx: 598, cy, r: 24, fill: "#2b2f33" }, svg);
        const g = mk("g", {}, svg);
        for (let k = 0; k < 4; k++) mk("path", { d: "M0 0 C6 -8 6 -18 0 -20 C-4 -14 -4 -6 0 0 Z", fill: "#c9d3da", transform: `rotate(${k * 90})` }, g);
        mk("circle", { cx: 0, cy: 0, r: 4, fill: "#7c8a94" }, g);
        fans.push({ g, cx: 598, cy });
      }
      // Heat shimmer above the hot side, and spoilage "smell" lines above the box
      for (let i = 0; i < 3; i++) heatWaves.push(mk("path", { d: "M0 0 q6 -10 0 -20 q-6 -10 0 -20", stroke: "#e2553c", "stroke-width": 3, fill: "none", "stroke-linecap": "round", opacity: 0 }, svg));
      for (let i = 0; i < 3; i++) stink.push(mk("path", { d: "M0 0 q8 -10 0 -20 q-8 -10 0 -20 q8 -10 0 -20", stroke: "#7a9a2e", "stroke-width": 4, fill: "none", "stroke-linecap": "round", opacity: 0 }, svg));
      box.replaceChildren(svg);
    },
    reset() { lidAngle = 0; },
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour, dtf = Math.min(4, Math.max(0, (now - lastNow) / 16.7)); lastNow = now;
      const day = s.sun > 0 ? Math.min(1, s.sun / Math.max(0.2, M.weather[s.weather].sun) + 0.2) : (hour > 5 && hour < 19 ? 0.35 : 0);
      sky.setAttribute("fill", mix("#1c2742", s.weather === "sunny" ? "#bfe0ee" : "#b7c3cc", day));
      const visible = hour >= 6 && hour <= 18;
      const sx = visible ? (hour - 6) / 12 : Math.min(1, ((hour + 6) % 24) / 12);
      sunEl.setAttribute("cx", 100 + 600 * sx); sunEl.setAttribute("cy", 250 - Math.sin(Math.PI * sx) * 170);
      sunEl.setAttribute("fill", visible ? "#ffd25a" : "#e8ecf2");
      sunEl.setAttribute("opacity", visible ? (s.weather === "rainy" ? 0 : s.weather === "cloudy" ? 0.45 : 1) : 1);
      panelGlint.setAttribute("opacity", (0.35 * s.sun).toFixed(2));
      panel.setAttribute("fill", mix("#152538", "#2a4a70", s.sun));
      lamp.setAttribute("opacity", day < 0.3 ? 0.9 : 0);
      // Battery level under the table
      const pct = 100 * s.battWh / M.parts.batteryWh;
      battFill.setAttribute("width", (66 * pct / 100).toFixed(1));
      battFill.setAttribute("fill", pct < 15 ? "#d64f4f" : pct < 30 ? "#e0a030" : "#3aa35b");
      // The box looks frosty when cold; the screen shows the temperature like the real TFT would
      const cold = Math.min(1, Math.max(0, (8 - s.box) / 8));
      frost.setAttribute("opacity", (0.75 * cold).toFixed(2));
      boxBody.setAttribute("fill", mix("#f3e6da", "#eef3f6", cold));
      const warmC = s.box > M.limits.warm ? "#ff8a7a" : s.box > M.limits.safe + 0.3 ? "#ffd27a" : "#9fe3ff";
      screenTxt.textContent = s.box.toFixed(1) + "°"; screenTxt.setAttribute("fill", warmC);
      const mood = M.mood(s).id;
      gasTxt.textContent = s.flat ? "NO POWER" : s.gas >= M.limits.gasWatch ? "CHECK FISH" : "FRESH";
      gasTxt.setAttribute("fill", s.gas >= M.limits.gasWatch ? "#ffd27a" : "#9fe3ff");
      const alarm = s.gas >= M.limits.gasWatch || mood === "overheat" || mood === "warm" || s.flat;
      led.setAttribute("fill", alarm ? "#e04848" : s.peltierOn ? "#4fb6e8" : "#3aa35b");
      coolIcon.setAttribute("opacity", s.peltierOn ? (0.75 + 0.25 * Math.sin(now / 500)).toFixed(2) : 0);
      // The lid swings open while the vendor sells or checks fish, and cold mist spills out
      const open = sim.minutes < s.lidUntil;
      lidAngle += ((open ? -38 : 0) - lidAngle) * Math.min(1, 0.15 * dtf);
      lid.setAttribute("transform", `translate(274 236) rotate(${lidAngle.toFixed(1)})`);
      mist.setAttribute("opacity", (Math.min(1, -lidAngle / 38) * 0.8 * cold).toFixed(2));
      // Heatsink fins glow from grey to red as the hot side heats; fans spin while on
      const heat = Math.min(1, Math.max(0, (s.sink - 32) / 38));
      fins.forEach((f) => f.setAttribute("fill", mix("#9aa3a9", "#e2553c", heat)));
      if (s.fansOn) fanAngle = (fanAngle + 18 * dtf) % 360;
      fans.forEach((f) => f.g.setAttribute("transform", `translate(${f.cx} ${f.cy}) rotate(${fanAngle.toFixed(0)})`));
      heatWaves.forEach((w, i) => {
        const y = 236 - ((now / 30 + i * 14) % 40);
        w.setAttribute("transform", `translate(${524 + i * 18} ${y.toFixed(1)})`);
        w.setAttribute("opacity", (heat > 0.35 ? (heat - 0.35) * 1.5 : 0).toFixed(2));
      });
      const g = Math.min(1, s.gas / 60);
      stink.forEach((w, i) => {
        const y = 226 - ((now / 40 + i * 20) % 50);
        w.setAttribute("transform", `translate(${330 + i * 60} ${y.toFixed(1)})`);
        w.setAttribute("opacity", (g > 0.3 ? g : 0).toFixed(2));
      });
    }
  };

  window.ColdboxMissions = missions; // for the automated mission tests

  const LEVEL = { cold: "good", cooling: "warn", low: "warn", smelly: "warn", flat: "bad", warm: "bad", overheat: "bad", spoiled: "bad" };
  window.IoTGame = IoTUI.start({
    id: "coldbox", title: "Cold Cart: SPARC Solar Cold Box", short: "Cooler", model: M, options: { weather: "sunny", airHigh: 33, battery: 80 },
    accent: ["#3a6f8f", "#e4f1f8"],
    music: { bpm: 84, wave: "sine", chords: [[40, 52, 59, 64, 66], [45, 57, 61, 64, 69], [38, 50, 57, 62, 66], [43, 55, 59, 62, 67]], scale: [76, 78, 79, 83, 85, 88] },
    sceneLabel: "A fish stall at a market with a solar panel on the roof and a cold box with a heatsink and fans on the table",
    howTo: ["Fish must stay at 4 °C or colder. The ❄️ Box gauge shows how cold they are. Tap a gauge to learn more.",
      "The Peltier cooler pushes heat out of the box into the heatsink. The fans blow that heat away.",
      "The cooler runs on a solar battery. Cool only when needed, or the battery goes flat.",
      "Open Missions and press Play. Use the ☀️ ☁️ 🌧️ buttons on the stall to change the weather in free play."],
    credit: { text: "Based on the SPARC student design project (Holy Cross of Davao College, 2025). It's a proposed design; this game simulates how it is meant to work." },
    sensors: [
      { id: "box", label: "Box temp", short: "Box", icon: "❄️", unit: "°C", decimals: 1, min: -2, max: 32, good: [-2, 4], warn: [4, 10],
        learn: { title: "Box temperature (°C)", text: "The DS18B20 is a small digital thermometer. In SPARC it measures the inside of the cold box. Bacteria grow fast on warm fish, so the U.S. FDA says to keep seafood at 4 °C (40 °F) or colder. The SPARC manuscript aims for −4 to 10 °C. In the game, green means 4 °C or colder. Fish hold a lot of heat, so the box cools down slowly, and it warms a little every time the lid opens." } },
      { id: "sink", label: "Heatsink", short: "Hot side", icon: "♨️", unit: "°C", decimals: 0, min: 20, max: 90, good: [20, 50], warn: [50, 70],
        learn: { title: "Heatsink temperature, the hot side (°C)", text: "A Peltier module has a cold side and a hot side. It moves heat from the cold side to the hot side, and its own electric power turns into heat there too. So the hot side gets very hot unless the heatsink and fans carry the heat away. The hotter the hot side, the less heat the module can pump, and if it gets too hot the module even warms the box. The game limit is 70 °C. SPARC's manuscript lists one DS18B20; this second sensor on the heatsink is added for the game." } },
      { id: "gas", label: "Spoilage gas", short: "Gas", icon: "💨", unit: "/100", decimals: 0, min: 0, max: 100, good: [0, 30], warn: [30, 60],
        learn: { title: "Spoilage gas index (0–100)", text: "As fish spoil, bacteria make smelly gases such as hydrogen sulfide (H₂S) and ammonia (NH₃). SPARC uses an MQ-136 sensor for H₂S and an MQ-137 for NH₃ to check freshness. The manuscript gives no gas levels in ppm, so the game shows a simple index from 0 to 100 (a game value): below 30 is fresh, 60 or more smells spoiled. Real MQ sensors need calibration." } },
      { id: "battery", label: "Battery", icon: "🔋", unit: "%", decimals: 0, min: 0, max: 100, good: [30, 100], warn: [10, 30],
        learn: { title: "Solar battery (%)", text: "SPARC runs off-grid: a 550 W solar panel charges a 12.8 V, 200 Ah LiFePO₄ battery through an MPPT charge controller. That battery stores about 2.56 kWh. Eight Peltier modules use around 330 W in this game, so running them nonstop would empty a full battery in about 8 hours with no sun. Sunny days charge fast; clouds and rain charge much less." } }
    ],
    switches: [{ id: "peltier", label: "Peltier" }, { id: "fans", label: "Fans" }],
    events: [{ id: "alert", label: "Freshness alert", button: "Check fish" }],
    ruleSensors: ["box", "sink", "gas", "battery"], ruleSwitches: ["peltier", "fans"], ruleEvents: ["alert"], ruleIfEvents: ["alert"],
    defaultRules: [{ kind: "if", sensor: "box", op: ">", value: 4, until: 2, actuator: "peltier" }, { kind: "if", sensor: "sink", op: ">", value: 55, actuator: "fans" }], // fans only when very hot: fine on a normal day, not in missions 2–4
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weather, set: (sim, v) => { sim.state.weather = v; sim.state.weatherDays = null; } },
      { type: "range", label: "Day's high", min: 26, max: 38, step: 1, unit: " °C", get: (sim) => sim.state.airHigh, set: (sim, v) => { sim.state.airHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets up the market day: the weather, the heat and the battery. Your rule cards run the cold box. Change rules any time, even mid-mission.",
    eventSounds: { alert: "alert" },
    // The sky for the weather layer and its sounds: the chosen weather all day, darkness from dusk to dawn
    weather: (sim) => { const h = IoT.timeOfDay(sim.minutes).hour; return { sky: sim.state.weather, night: h < 5.5 || h > 18.75 }; },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour, open = h >= 6 && h < 19;
      return { ambience: open ? ["market", "traffic"] : ["traffic"], night: h < 5.5 || h > 19, rain: s.weather === "rainy", devices: { fan: s.fansOn, hum: s.peltierOn ? 0.5 : 0 } }; },
    status: (sim) => { const m = M.mood(sim.state); return { level: LEVEL[m.id], text: `${m.text} · ${Math.round(M.fishKg(sim.state))} kg` }; },
    rulesIntro: "This is how the cold box's controller decides what to do. An IF rule keeps a device on while the condition is true; UNTIL keeps it on until a second level. An IF rule can also START the freshness alert once.",
    rulesTip: "The examples: IF Box temp is above 4 THEN Peltier ON UNTIL 2, and IF Heatsink is above 55 THEN Fans ON. That fan rule waits until the hot side is very hot, which is fine on a normal day. For missions 2–4, try running the fans sooner (above 35) and letting the box rest a little longer (UNTIL 3.5): a cooler hot side pumps heat with less power. For mission 5 add: IF Spoilage gas is above 40 THEN Freshness alert START. The buzzer calls the vendor, who unlocks the box with a fingerprint and takes out fish that smell off.",
    codeIntro: "Your rule cards written as an Arduino-style sketch. SPARC's controller is a Raspberry Pi Zero 2 W, which would usually run the same logic in Python; the pin numbers here are its GPIO numbers. The read...() functions stand in for each sensor's real code.",
    codeSpec: {
      title: "SPARC cold box controller (Raspberry Pi Zero 2 W)",
      sensors: { box: { fn: "readBoxTemperature", unit: "°C", label: "Box temperature (DS18B20, 1-Wire on GPIO 4)" },
        sink: { fn: "readHeatsinkTemperature", unit: "°C", label: "Heatsink temperature (a second DS18B20, added for the game)" },
        gas: { fn: "readSpoilageGasIndex", unit: "index 0-100", label: "Spoilage gas (MQ-136 H2S + MQ-137 NH3 through the ADS1115 ADC)" },
        battery: { fn: "readBatteryPercent", unit: "%", label: "12.8 V LiFePO4 battery level (voltage through the ADS1115 ADC)" } },
      actuators: { peltier: { pin: 18, label: "8 TEC Peltier modules, through 2 MOSFET driver boards", kind: "switch" },
        fans: { pin: 23, label: "8 heatsink fans, through a MOSFET", kind: "switch" },
        alert: { pin: 24, label: "Freshness alert: buzzer and red LED", kind: "event", pulseMs: 2000 } }
    },
    learnIntro: "What the sensors measure and how a Peltier cold box works. Numbers from the SPARC manuscript: 8 Peltier modules, 8 fans, a 550 W panel, a 12.8 V 200 Ah LiFePO₄ battery and 8–12 hours of running time. All other numbers are game values based on the sources below.",
    learnMore: [
      { title: "How a Peltier cooler works", text: "A Peltier (thermoelectric) module is a thin tile with no moving parts. When current flows through it, it pumps heat from one face to the other. The cold face sits inside the box, the hot face on the heatsink. The hot face must get rid of the heat from the box plus all the electric power the module uses. If the fans stop, the hot side heats up fast, the module can pump less and less, and cooling collapses." },
      { title: "Why the sun and the weather matter", text: "Peltier coolers are much less efficient than a normal fridge, so they need a lot of power. On a sunny day the panel can run the cooler and charge the battery, but the air is hotter, so more heat leaks into the box. Clouds and rain give far less charge. Cooling only when the box is above 4 °C, and keeping the heatsink cool, makes the battery last." },
      { title: "How this matches SPARC", text: "SPARC is a student design for a portable, solar-powered thermoelectric cold station that clamps onto a market stall and keeps fish cold instead of an ice box. It measures temperature, freshness (gas) and weight, shows them on a touchscreen, and has fingerprint unlock and an alarm if the box is unclamped. It's a proposal: this game shows how it is meant to work, not test results." },
      { title: "A simplified model", text: "Real boxes depend on the insulation, the lid seal, how often it opens, the fish and much more. A switched-off Peltier module also lets some heat leak back into the box, which the game leaves out. The power and cooling numbers are game values worked out from a common Peltier module's datasheet. Use this to understand the ideas, and real measurements to build a real cooler." }
    ],
    sources: [
      { label: "FDA: Selecting and serving fresh and frozen seafood safely", url: "https://www.fda.gov/food/buy-store-serve-safe-food/selecting-and-serving-fresh-and-frozen-seafood-safely" },
      { label: "FAO: Quality changes and shelf life of chilled fish", url: "https://www.fao.org/4/v7180e/V7180E0c.htm" },
      { label: "TEC1-12706 Peltier module datasheet", url: "https://digsys.upc.edu/csd/DEE/chamber/TEC1-12706.pdf" },
      { label: "Thermoelectric cooling (Wikipedia)", url: "https://en.wikipedia.org/wiki/Thermoelectric_cooling" },
      { label: "Specific heat of food (Engineering Toolbox)", url: "https://www.engineeringtoolbox.com/specific-heat-capacity-food-d_295.html" }
    ]
  });
})();
