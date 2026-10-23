// ============ GAME: UV TOMATO GUARD (TOMATRIX) ============
// A TOMATRIX box on a vegetable stall in a Davao market: gas, temperature and humidity sensors decide when to run a
// fixed 182 s UV-C cycle, a fan keeps the air in the box right, and the lamp only works with the lid closed.
(function () {
  "use strict";
  const { IoT, TomatoModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };

  // ---- Missions: defined with the model (pure logic, so the Node tests can play them) ----
  const missions = TomatoModel.missions;
  const fresh = (s) => TomatoModel.freshness(s.treated);

  // ---- The scene: an original flat drawing of the stall, the TOMATRIX box and the untreated crate ----
  let svg, wall, beam, bulbGlow, lid, lidAngle = 0, tubes = [], uvGlow, shutter, fanBlades, fanAngle = 0, lcd1, lcd2, lcdBg, ledRed, ledGreen;
  const toms = [], ctl = [];
  function tomato(parent, x, y, r) {
    const g = mk("g", { transform: `translate(${x} ${y})` }, parent);
    const body = mk("circle", { r, fill: "#e0452c" }, g);
    const blotch = mk("ellipse", { cx: -r * 0.3, cy: r * 0.2, rx: r * 0.45, ry: r * 0.3, fill: "#f2c7a0", opacity: 0 }, g);
    const spots = [mk("circle", { cx: r * 0.35, cy: r * 0.15, r: r * 0.22, fill: "#d9e3c4", opacity: 0 }, g), mk("circle", { cx: -r * 0.1, cy: r * 0.5, r: r * 0.16, fill: "#d9e3c4", opacity: 0 }, g)];
    mk("ellipse", { cx: -r * 0.38, cy: -r * 0.38, rx: r * 0.22, ry: r * 0.13, fill: "#ffffff", opacity: 0.45 }, g);
    mk("path", { d: `M0 ${-r * 0.95} l${-r * 0.5} ${-r * 0.18} l${r * 0.35} ${r * 0.05} l${-r * 0.1} ${-r * 0.4} l${r * 0.25} ${r * 0.33} l${r * 0.25} ${-r * 0.33} l${-r * 0.1} ${r * 0.4} l${r * 0.35} ${-r * 0.05} z`, fill: "#3f8a3a" }, g);
    return { g, body, blotch, spots, x, y };
  }
  function paintTomato(t, b) {
    const ripe = IoT.clamp(b.ripe, 0, 1.6);
    let c = ripe < 1 ? mix("#f29a3e", "#d9281c", IoT.clamp((ripe - 0.3) / 0.7, 0, 1)) : mix("#d9281c", "#8f1a12", (ripe - 1) / 0.6);
    const f = TomatoModel.freshness(b);
    c = mix(c, "#7a4f33", IoT.clamp((60 - f) / 60, 0, 0.7));
    t.body.setAttribute("fill", c);
    t.blotch.setAttribute("opacity", IoT.clamp(b.injury / 40, 0, 0.8).toFixed(2));
    const mould = IoT.clamp((b.microbes - 2.6) / 0.8, 0, 1);
    t.spots[0].setAttribute("opacity", mould.toFixed(2)); t.spots[1].setAttribute("opacity", IoT.clamp(mould * 2 - 1, 0, 1).toFixed(2));
    const k = 1 - IoT.clamp(b.massLoss, 0, 12) / 40; // tomatoes shrink a little as they lose water
    t.g.setAttribute("transform", `translate(${t.x} ${t.y + (1 - k) * 20}) scale(${k.toFixed(3)})`);
  }
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      wall = mk("rect", { x: 0, y: 0, width: 800, height: 500, fill: "#f3e3c3" }, svg);
      // The stall's striped awning
      const aw = mk("g", {}, svg);
      for (let i = 0; i < 10; i++) mk("rect", { x: i * 80, y: 0, width: 80, height: 70, fill: i % 2 ? "#fff4e0" : "#c8321f" }, aw);
      for (let i = 0; i < 20; i++) mk("circle", { cx: 20 + i * 40, cy: 70, r: 20, fill: Math.floor(i / 2) % 2 ? "#fff4e0" : "#c8321f" }, aw);
      // A hanging bulb for evenings
      mk("path", { d: "M660 70 V118", stroke: "#3b2f28", "stroke-width": 3 }, svg);
      bulbGlow = mk("circle", { cx: 660, cy: 130, r: 60, fill: "#ffe7a3", opacity: 0 }, svg);
      mk("circle", { cx: 660, cy: 130, r: 12, fill: "#fff2c4", stroke: "#3b2f28", "stroke-width": 2 }, svg);
      // Afternoon sunshine on the front counter (only when the box sits in the sun)
      beam = mk("path", { d: "M800 60 L800 200 L470 386 L170 386 Z", fill: "#ffd25a", opacity: 0 }, svg);
      // Everything on the table sits in one group, raised so the status line never covers the LCD
      const st = mk("g", { transform: "translate(0 -34)" }, svg);
      // The vegetables behind: eggplants and cabbages in a crate
      mk("rect", { x: 60, y: 330, width: 120, height: 74, fill: "#a8743f" }, st);
      for (const y of [348, 372]) mk("rect", { x: 60, y, width: 120, height: 5, fill: "#7d5228" }, st);
      for (const [x, c] of [[85, "#5b2a6e"], [120, "#6b3380"], [155, "#5b2a6e"]]) mk("ellipse", { cx: x, cy: 322, rx: 16, ry: 26, fill: c, transform: `rotate(-20 ${x} 322)` }, st);
      // The table
      mk("rect", { x: 0, y: 402, width: 800, height: 22, fill: "#8a5a35" }, st);
      mk("rect", { x: 0, y: 424, width: 800, height: 110, fill: "#6e4528" }, st);
      // ---- The TOMATRIX box: aluminium-lined chamber, a single layer of tomatoes, front panel with the LCD ----
      mk("rect", { x: 232, y: 186, width: 296, height: 216, fill: "#4b5560" }, st);
      mk("rect", { x: 244, y: 196, width: 272, height: 130, fill: "#d3dae0" }, st);
      for (const x of [290, 350, 410, 470]) mk("path", { d: `M${x} 196 V326`, stroke: "#c2cad1", "stroke-width": 2 }, st);
      // The sensor window on the back wall, with the servo shutter that covers it during UV-C
      mk("rect", { x: 430, y: 206, width: 72, height: 30, rx: 4, fill: "#2f3a44" }, st);
      mk("rect", { x: 437, y: 212, width: 58, height: 18, fill: "#6ad3a8" }, st);
      shutter = mk("rect", { x: 437, y: 212, width: 0, height: 18, fill: "#8d969e" }, st);
      for (let i = 0; i < 5; i++) toms.push(tomato(st, 284 + i * 48, 300, 23));
      uvGlow = mk("rect", { x: 244, y: 196, width: 272, height: 130, fill: "#8b5cf6", opacity: 0 }, st);
      // Front panel
      mk("rect", { x: 232, y: 322, width: 296, height: 80, fill: "#e7ecef", stroke: "#4b5560", "stroke-width": 3 }, st);
      lcdBg = mk("rect", { x: 244, y: 332, width: 236, height: 60, rx: 4, fill: "#a5d66f", stroke: "#2c3a2a", "stroke-width": 3 }, st);
      const font = { "font-family": "ui-monospace, Menlo, Consolas, monospace", "font-weight": 700, fill: "#173018", "font-size": 18 };
      lcd1 = mk("text", { x: 252, y: 357, ...font }, st);
      lcd2 = mk("text", { x: 252, y: 382, ...font }, st);
      ledRed = mk("circle", { cx: 504, cy: 348, r: 9, fill: "#5a2a2a" }, st);
      ledGreen = mk("circle", { cx: 504, cy: 376, r: 9, fill: "#2c4a2c" }, st);
      // The 12 V fan on the side
      mk("rect", { x: 178, y: 226, width: 56, height: 56, rx: 8, fill: "#39424a" }, st);
      fanBlades = mk("g", {}, st);
      for (const a of [0, 120, 240]) mk("ellipse", { cx: 0, cy: -12, rx: 7, ry: 13, fill: "#c9d1d8", transform: `rotate(${a})` }, fanBlades);
      mk("circle", { cx: 206, cy: 254, r: 5, fill: "#20262b" }, st);
      // The lid, with the two UV-C tubes under it: it swings up on its hinge when opened
      lid = mk("g", {}, st);
      mk("rect", { x: 222, y: 172, width: 316, height: 22, rx: 4, fill: "#9aa5ae", stroke: "#4b5560", "stroke-width": 3 }, lid);
      mk("rect", { x: 500, y: 162, width: 26, height: 10, rx: 3, fill: "#4b5560" }, lid);
      const lt = mk("text", { x: 380, y: 189, "text-anchor": "middle", "font-size": 15, "font-weight": 700, fill: "#23303a", "font-family": "Outfit, sans-serif" }, lid);
      lt.textContent = "TOMATRIX";
      for (const y of [198, 210]) tubes.push(mk("rect", { x: 262, y, width: 236, height: 7, rx: 3.5, fill: "#cfd3e6" }, lid));
      // The untreated batch, for comparison
      mk("rect", { x: 580, y: 344, width: 128, height: 58, fill: "#b07b45" }, st);
      for (const y of [360, 380]) mk("rect", { x: 580, y, width: 128, height: 5, fill: "#7d5228" }, st);
      for (let i = 0; i < 3; i++) ctl.push(tomato(st, 606 + i * 38, 328, 18));
      mk("rect", { x: 590, y: 270, width: 108, height: 30, rx: 4, fill: "#ffffff", stroke: "#6e4528", "stroke-width": 2 }, st);
      const ct = mk("text", { x: 644, y: 291, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: "#5a2a1a", "font-family": "Outfit, sans-serif" }, st);
      ct.textContent = "NO UV-C";
      box.replaceChildren(svg);
    },
    reset() { lidAngle = 0; },
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour;
      const day = hour < 5 || hour > 19.5 ? 0 : hour < 6.5 ? (hour - 5) / 1.5 : hour > 18 ? (19.5 - hour) / 1.5 : 1;
      wall.setAttribute("fill", mix("#3a302b", "#f3e3c3", day));
      bulbGlow.setAttribute("opacity", (0.55 * (1 - day)).toFixed(2));
      beam.setAttribute("opacity", (0.3 * s.sun).toFixed(2));
      // The lid swings toward open or closed
      const target = s.lidOpen ? -72 : 0;
      lidAngle += (target - lidAngle) * 0.15;
      lid.setAttribute("transform", `rotate(${lidAngle.toFixed(1)} 228 186)`); // inside the raised group
      // The UV-C lamps glow violet; a slow, gentle shimmer, never a flash
      const uv = s.lampOn && s.lampLeft > 0;
      tubes.forEach((t) => t.setAttribute("fill", uv ? "#efe6ff" : "#cfd3e6"));
      uvGlow.setAttribute("opacity", uv ? (0.32 + 0.04 * Math.sin(now / 700)).toFixed(3) : "0");
      shutter.setAttribute("width", uv ? 58 : 0);
      ledRed.setAttribute("fill", uv ? "#ff4b3e" : "#5a2a2a");
      ledGreen.setAttribute("fill", uv ? "#2c4a2c" : "#4fd463");
      // The fan spins while it runs
      if (s.fanOn) fanAngle = (fanAngle + 14) % 360;
      fanBlades.setAttribute("transform", `translate(206 254) rotate(${fanAngle})`);
      // The LCD shows the controller's state
      const [a, b] = TomatoModel.lcd(s, sim.minutes);
      if (lcd1.textContent !== a) lcd1.textContent = a;
      if (lcd2.textContent !== b) lcd2.textContent = b;
      lcdBg.setAttribute("fill", a.startsWith("HIGH") ? "#f2c35b" : a === "LID OPEN" ? "#f0a35b" : "#a5d66f");
      toms.forEach((t) => paintTomato(t, s.treated));
      ctl.forEach((t) => paintTomato(t, s.control));
    }
  };

  window.TomatoMissions = missions; // for the automated mission tests

  const LEVEL = { fresh: "good", ok: "warn", hot: "warn", dry: "warn", damp: "warn", soft: "bad", spoiled: "bad", cold: "bad" };
  window.IoTGame = IoTUI.start({
    id: "tomato", title: "UV Tomato Guard", short: "Tomato", model: TomatoModel, options: { ripe: 0.4 },
    accent: ["#b3261e", "#fde4df"],
    music: { bpm: 96, wave: "triangle", chords: [[41, 53, 57, 60], [46, 58, 62, 65], [48, 60, 64, 67], [45, 57, 60, 64]], scale: [72, 74, 77, 79, 81, 84] },
    credit: { text: "Based on the TOMATRIX student design project (Holy Cross of Davao College, 2026). It's a proposed design; this game simulates how it is meant to work." },
    sceneLabel: "A market stall with the TOMATRIX box: a lid with UV-C lamps, a single layer of tomatoes, a fan, an LCD, and a crate of untreated tomatoes beside it",
    howTo: ["Watch the four gauges. Green is good. Tap one to learn what it measures.", "Ripening and rotting tomatoes give off gases. When the gases get high, a short UV-C light cycle helps the tomatoes last longer.",
      "In the Rules tab, add: IF VOC is above 450 THEN UV-C cycle START. (Add UNTIL 300 so it waits for the gas to drop before starting again.) The lamp only works with the lid closed.", "Open Missions and press Play. Try to keep your tomatoes fresher than the untreated crate."],
    sensors: [
      { id: "co2", label: "CO2", short: "CO2", icon: "💨", unit: "ppm", decimals: 0, min: 400, max: 1500, good: [400, 800], warn: [400, 1000],
        learn: { title: "Carbon dioxide, CO2 (ppm)", text: "Tomatoes are alive after harvest: they breathe, using up their sugars and giving off CO2. They breathe faster when they're warm, ripe or starting to rot, so CO2 builds up in a closed box. TOMATRIX reads it with a Sensirion SCD41 sensor (±40 ppm + 5%), which also measures temperature and humidity. From the manuscript: about 800 ppm marks a high spoilage risk. Outdoor air is about 420 ppm." } },
      { id: "voc", label: "VOC", short: "VOC", icon: "🍅", unit: "ppm", decimals: 0, min: 0, max: 1000, good: [0, 400], warn: [0, 500],
        learn: { title: "VOC: ripening gases (ppm)", text: "Ripening tomatoes give off ethylene, a gas that makes them (and their neighbours) ripen faster, plus other volatile organic compounds (VOCs) as they spoil. TOMATRIX uses an MQ-135 gas sensor (10–1000 ppm range) as a cheap stand-in for ethylene; it reacts to many gases, so its reading is an estimate, not an exact ethylene level. From the manuscript: VOC above 400–500 ppm means high spoilage risk. This game uses 450." } },
      { id: "temp", label: "Box temperature", short: "Temp", icon: "🌡️", unit: "°C", decimals: 1, min: 5, max: 40, good: [10, 25], warn: [10, 30],
        learn: { title: "Temperature in the box (°C)", text: "From the manuscript: tomatoes keep best at about 20 °C; above 25 °C they breathe, ripen and spoil faster, and below 10 °C they get chilling injury (they ripen badly and get pitted). TOMATRIX has no cooler, so the box can't get colder than the market air. In Davao afternoons that's often near 30 °C. A closed box in the sun gets even hotter; the fan and a shady spot help. In this game, above 30 °C also damages the fruit (a game value)." } },
      { id: "rh", label: "Humidity", short: "Humid", icon: "💧", unit: "%", decimals: 0, min: 50, max: 100, good: [85, 95], warn: [80, 97],
        learn: { title: "Relative humidity (%)", text: "Tomatoes lose water through their skin. From the manuscript: keep the air at 85–95% humidity. Drier air makes them lose water and weight; air near 100% helps mould grow. A closed box with tomatoes gets damper and damper, so the fan brings in drier market air. Run it too much and the tomatoes dry out." } }
    ],
    switches: [{ id: "fan", label: "Fan" }],
    events: [{ id: "uv", label: "UV-C cycle (182 s)", button: "Start UV-C" }, { id: "lid", label: "Open or close the lid", button: "Lid" }],
    ruleSensors: ["voc", "co2", "temp", "rh"], ruleSwitches: ["fan"], ruleEvents: ["uv"], ruleIfEvents: ["uv"],
    defaultRules: [{ kind: "if", sensor: "rh", op: ">", value: 95, actuator: "fan", until: 90 }],
    env: [
      { type: "choice", label: "Box spot", options: [{ value: "shade", label: "Shade" }, { value: "sun", label: "Sunny counter" }],
        get: (sim) => sim.state.spot, set: (sim, v) => { sim.state.spot = v; } },
      { type: "range", label: "Market's high", min: 24, max: 35, step: 1, unit: " °C", get: (sim) => sim.state.airHigh, set: (sim, v) => { sim.state.airHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission loads a batch of tomatoes and sets up the stall. Your rule cards do the work. Change rules any time, even mid-mission.",
    eventSounds: { uv: "zap", lid: "click" },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour, open = h >= 5 && h < 19.5; return { ambience: [open ? "market" : "roomtone"], night: !open, devices: { fan: s.fanOn, uv: !!(s.lampOn && s.lampLeft > 0) } }; },
    status: (sim) => {
      const s = sim.state, m = TomatoModel.mood(s), f = Math.round(fresh(s));
      if (s.lampOn && s.lampLeft > 0) return { level: "warn", text: `UV-C on: keep the lid shut · fresh ${f}%` };
      if (s.lidOpen) return { level: "warn", text: `Lid open: UV-C locked off · fresh ${f}%` };
      return { level: LEVEL[m.id], text: `${m.text} · fresh ${f}%` };
    },
    rulesIntro: "This is how the TOMATRIX controller decides. An IF rule keeps the fan on while it's true, or STARTs a UV-C cycle once each time it becomes true. A time rule runs a UV-C cycle once a day.",
    rulesTip: "Try: IF VOC is above 450 THEN UV-C cycle START UNTIL 300. UNTIL stops the rule from firing again until VOC falls back below 300, so the tomatoes don't get too much UV-C. Customers keep opening the lid? A time rule after the market closes (like 19:00) works too.",
    codeIntro: "Your rule cards written as an Arduino sketch for the ESP32 (ESP-WROOM-32D) in TOMATRIX. The UV-C lamp can only switch on while the reed switch says the lid is closed; in the real box the NC reed switch also cuts the lamp power directly. The read...() functions stand in for each sensor's library code, and the pins depend on your wiring.",
    codeSpec: {
      title: "TOMATRIX UV-C tomato box",
      sensors: {
        co2: { fn: "readCO2", unit: "ppm", label: "CO2 from the Sensirion SCD41 (I2C: SDA 21, SCL 22)" },
        voc: { fn: "readVOC", unit: "ppm", label: "VOC / ethylene estimate from the MQ-135, through the ADS1115 16-bit ADC" },
        temp: { fn: "readTemperature", unit: "°C", label: "Temperature from the SCD41" },
        rh: { fn: "readHumidity", unit: "%", label: "Relative humidity from the SCD41" },
        nh3: { fn: "readAmmonia", unit: "ppm", label: "NH3 from the MQ-137, through the ADS1115" },
        lid: { fn: "lidClosed", unit: "1 = closed, 0 = open", label: "NC magnetic reed switch on the lid (GPIO 27)" }
      },
      actuators: {
        fan: { pin: 26, label: "12 V fan, through a relay", kind: "switch" },
        lamp: { pin: 25, label: "2 × UV-C lamps (254 nm), through the 5 V 10 A relay", kind: "switch", onlyIf: "lidClosed()" },
        uv: { label: "UV-C cycle: 182 s for a 0.97 kJ/m² dose", kind: "event", drives: "lamp", durationMs: 182000 }
      }
    },
    learnIntro: "What the sensors measure and why it matters. Numbers marked \"from the manuscript\" come from the TOMATRIX design; the rates in the simulation are game values, simplified so it runs in a browser.",
    learnMore: [
      { title: "Monitor, decide, treat", text: "From the manuscript: TOMATRIX watches the gases for a 10-minute window (gas sensors need 30–120 s to settle). If CO2, VOC or ammonia (NH3, above 10–15 ppm, read by an MQ-137) passes its threshold, the LCD shows HIGH SPOILAGE RISK, UV NEEDED and a fixed UV-C cycle runs. The cycle is 182 s because 0.533 mW/cm² × 182 s ≈ 97 mJ/cm², which is 0.97 kJ/m²: the dose a published study found worked best. Then the LCD shows TREATMENT COMPLETE." },
      { title: "UV-C is dangerous: the lid interlock", text: "UV-C light (254 nm) kills microbes, and it can also burn your eyes and skin within seconds. Never look at a UV-C lamp. That's why TOMATRIX's lamp only works with the lid closed: a normally closed magnetic reed switch cuts the lamp the moment the lid opens, and a small servo slides a shutter over the sensors while the lamp is on. In this game the lamp can't run with the lid open, either." },
      { title: "Treated vs untreated tomatoes", text: "TOMATRIX is a proposal: its planned 5-day test (one UV-C batch, one untreated batch) has no results yet. The study it builds on, Pinheiro et al. (2015), stored tomatoes at 10 °C for 15 days: fruit given 0.32 or 0.97 kJ/m² of UV-C were about 8–9% firmer than untreated fruit by day 15, reddened more slowly and carried fewer microbes. How much one cycle helps here, and the skin damage from more than 4 cycles a day, are game values." },
      { title: "A simplified model", text: "Real tomatoes differ by variety, ripeness, bruises and how they're handled, and a real box leaks air in its own way. The ripening, rotting and drying rates in this game are invented to show the ideas: heat speeds everything up, damp air helps mould, dry air shrinks the fruit, and UV-C helps only in the right dose. Use real measurements to judge real tomatoes." }
    ],
    sources: [
      { label: "Pinheiro et al. 2015: UV-C treatment of whole tomatoes (J. Food Sci. Technol.)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4519460" },
      { label: "FDA: UV wands can injure skin and eyes", url: "https://www.fda.gov/medical-devices/safety-communications/do-not-use-ultraviolet-uv-wands-give-unsafe-levels-radiation-fda-safety-communication" },
      { label: "Sensirion SCD4x datasheet", url: "https://sensirion.com/media/documents/48C4B7FB/64C134E7/Sensirion_SCD4x_Datasheet.pdf" },
      { label: "Winsen MQ-135 datasheet", url: "https://www.winsen-sensor.com/d/files/semiconductor/mq135.pdf" }
    ]
  });
})();
