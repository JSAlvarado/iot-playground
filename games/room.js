// ============ GAME 3: MY KOREAN ROOM MONITOR ============
// A one-room studio (원룸) in a Korean winter with temperature, humidity, fine dust (미세먼지) and CO2 sensors, floor
// heating, a humidifier, an air purifier and a motorised window. Each mission adds one problem and one device.
(function () {
  "use strict";
  const { IoT, RoomModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };

  // ---- Missions: each keeps the room's comfort score above a level ----
  function track(sim) { return sim._track || (sim._track = { min: 100, maxPm: 0 }); }
  const starsFor = (min) => (min >= 95 ? 3 : min >= 85 ? 2 : 1);
  function stay(hours, failAt, hint) {
    return (sim, h) => {
      const t = track(sim), s = sim.state;
      t.min = Math.min(t.min, s.comfort); t.maxPm = Math.max(t.maxPm, s.pm);
      if (s.comfort < failAt) return { state: "lost", message: `Comfort fell to ${Math.round(s.comfort)}%. ${hint} Check the Graph tab, change your rules and try again.` };
      if (h >= hours) {
        const stars = starsFor(t.min);
        return { state: "won", stars, message: `Mission complete! Lowest comfort ${Math.round(t.min)}%: ${"★".repeat(stars)}${stars < 3 ? " (keep comfort above 95% for 3 stars: is anything else making the room uncomfortable?)" : ""}` };
      }
      return { state: "running", progress: h / hours, message: `${Math.floor(h)} of ${hours} hours · comfort ${Math.round(s.comfort)}%` };
    };
  }
  const evening = { startMinutes: 18 * 60 };
  const missions = [
    { id: "cold", title: "1. Cold night", goal: "It's 0 °C outside and you get home at 18:00 to a 15 °C room. Keep comfort above 60% until morning (12 hours). The example rule runs the floor heating.",
      options: { ...evening, outHigh: 0, tempStart: 15 }, check: stay(12, 60, "Is the heating rule there, and does it switch on early enough?") },
    { id: "dry", title: "2. Dry winter air", goal: "Heating cold winter air makes it very dry. Keep comfort above 70% for 24 hours. Tip: a humidifier rule, with UNTIL so it stops before the room gets damp.",
      options: { ...evening, outHigh: -2 }, check: stay(24, 70, "Look at the humidity graph: below 30% the air is very dry.") },
    { id: "stuffy", title: "3. Stuffy room", goal: "You breathe out CO2 all night, and a closed room fills up. Keep comfort above 85% for 24 hours. Tip: open the window when CO2 is above 1000 ppm, or air out on a schedule.",
      options: { ...evening, outHigh: 2 }, check: stay(24, 85, "Look at the CO2 graph: a closed room keeps climbing.") },
    { id: "dust", title: "4. Fine dust day (미세먼지)", goal: "Outdoor PM2.5 is 90 µg/m³: Very bad. Keep comfort above 70% for 24 hours. Opening the window lets dust in, but you still need fresh air.",
      options: { ...evening, outHigh: 4, outPm: 90 }, check: stay(24, 70, "Fine dust came in. An air purifier rule cleans the air while the window is open.") },
    { id: "dinner", title: "5. Grilled fish dinner", goal: "At 19:00 you grill fish for 30 minutes, and cooking makes a lot of fine dust. Keep comfort above 80% for 12 hours.",
      options: { ...evening, outHigh: 2, cookAt: 19 * 60 }, check: stay(12, 80, "The cooking smoke stayed in the room. Clear fine dust with the purifier or the window.") }
  ];
  window.RoomMissions = missions; // for the automated mission tests

  // ---- The scene: a studio room with a window onto an apartment complex ----
  let svg, sky, haze, blocks, sash, fog, drops = [], floorGlow, mist = [], fanG, purLed, dust = [], person, personBody, shiver = 0, zzz, lamp, stoveSmoke = [], outBoard, wallTemp, wallRh;
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      mk("rect", { width: 800, height: 500, fill: "#efe6d8" }, svg);                       // wall
      // A hanging lamp whose warm glow comes on in the evening
      const defs = mk("defs", {}, svg), rg = mk("radialGradient", { id: "lampGlow" }, defs);
      mk("stop", { offset: "0", "stop-color": "#ffe2a0", "stop-opacity": "0.9" }, rg); mk("stop", { offset: "1", "stop-color": "#ffe2a0", "stop-opacity": "0" }, rg);
      lamp = mk("ellipse", { cx: 600, cy: 120, rx: 210, ry: 150, fill: "url(#lampGlow)", opacity: 0 }, svg);
      mk("path", { d: "M600 0 V70", stroke: "#4b5156", "stroke-width": 2 }, svg);
      mk("path", { d: "M574 96 L586 70 H614 L626 96 Z", fill: "#3d4248" }, svg);
      // Window: the view outside, the apartment blocks, haze for fine dust, then the frame and the sliding pane
      const win = mk("g", { transform: "translate(60 70)" }, svg);
      sky = mk("rect", { width: 270, height: 230, fill: "#bcd7e8" }, win);
      blocks = mk("g", {}, win);
      for (const [x, w, hgt] of [[10, 60, 150], [80, 70, 190], [160, 50, 130], [215, 55, 170]]) {
        mk("rect", { x, y: 230 - hgt, width: w, height: hgt, fill: "#8d97a3" }, blocks);
        for (let yy = 230 - hgt + 12; yy < 222; yy += 18) for (let xx = x + 8; xx < x + w - 8; xx += 14) mk("rect", { x: xx, y: yy, width: 7, height: 8, fill: "#c5ccd4", class: "lit" }, blocks);
      }
      haze = mk("rect", { width: 270, height: 230, fill: "#c9b98f", opacity: 0 }, win);
      fog = mk("rect", { width: 270, height: 230, fill: "#ffffff", opacity: 0 }, win);
      for (let i = 0; i < 14; i++) drops.push(mk("circle", { cx: 12 + (i * 47) % 250, cy: 20 + (i * 71) % 200, r: 3, fill: "#9fc3d8", opacity: 0 }, win));
      mk("rect", { width: 270, height: 230, fill: "none", stroke: "#f7f3ec", "stroke-width": 12 }, win);
      mk("path", { d: "M135 0 V230", stroke: "#f7f3ec", "stroke-width": 8 }, win);
      sash = mk("g", {}, win);
      mk("rect", { x: 135, width: 135, height: 230, fill: "#dfeaf2", opacity: 0.25, stroke: "#e6e0d5", "stroke-width": 8 }, sash);
      mk("rect", { x: -10, y: 230, width: 290, height: 14, fill: "#d9cfc0" }, win);         // sill
      // Outdoor fine-dust board, like the AirKorea number on a phone
      const board = mk("g", { transform: "translate(360 80)" }, svg);
      mk("rect", { width: 150, height: 66, rx: 10, fill: "#22313f" }, board);
      mk("text", { x: 12, y: 22, "font-size": 12, fill: "#c9d4de", "font-family": "Outfit, sans-serif" }, board).textContent = "Outside PM2.5";
      outBoard = mk("text", { x: 12, y: 52, "font-size": 22, "font-weight": 700, fill: "#ffffff", "font-family": "Outfit, sans-serif" }, board);
      // Wall thermo-hygrometer (the room's sensor)
      const sens = mk("g", { transform: "translate(360 170)" }, svg);
      mk("rect", { width: 110, height: 58, rx: 8, fill: "#ffffff", stroke: "#4b5156", "stroke-width": 2 }, sens);
      wallTemp = mk("text", { x: 10, y: 26, "font-size": 18, "font-weight": 700, fill: "#23415a", "font-family": "Outfit, sans-serif" }, sens);
      wallRh = mk("text", { x: 10, y: 48, "font-size": 14, fill: "#4b5156", "font-family": "Outfit, sans-serif" }, sens);
      // Ondol floor: wood planks with heat that glows when the floor heating runs
      mk("rect", { y: 400, width: 800, height: 100, fill: "#c99b62" }, svg);
      for (let x = 0; x < 800; x += 100) mk("path", { d: `M${x} 400 V500`, stroke: "#b5874f", "stroke-width": 2 }, svg);
      floorGlow = mk("g", { opacity: 0 }, svg);
      for (let y = 420; y < 500; y += 22) mk("path", { d: `M0 ${y} Q100 ${y - 6} 200 ${y} T400 ${y} T600 ${y} T800 ${y}`, stroke: "#ff8a3d", "stroke-width": 5, fill: "none", opacity: 0.7 }, floorGlow);
      // Low table, a portable stove with a pan, and the person sitting on a cushion
      mk("rect", { x: 470, y: 352, width: 190, height: 12, rx: 4, fill: "#8a5a35" }, svg);
      mk("rect", { x: 482, y: 364, width: 10, height: 36, fill: "#7a4e2e" }, svg); mk("rect", { x: 640, y: 364, width: 10, height: 36, fill: "#7a4e2e" }, svg);
      mk("rect", { x: 590, y: 336, width: 56, height: 16, rx: 4, fill: "#5d6066" }, svg);
      mk("ellipse", { cx: 618, cy: 334, rx: 30, ry: 6, fill: "#2b2d31" }, svg);
      for (let i = 0; i < 6; i++) stoveSmoke.push(mk("circle", { r: 10, fill: "#9a9a9a", opacity: 0 }, svg));
      person = mk("g", { transform: "translate(540 300)" }, svg);
      mk("ellipse", { cx: 0, cy: 98, rx: 46, ry: 10, fill: "#b9614a" }, person);              // cushion
      personBody = mk("path", { d: "M-30 96 Q-34 40 0 34 Q34 40 30 96 Z", fill: "#3d6e9e" }, person);
      mk("circle", { cx: 0, cy: 18, r: 20, fill: "#e8b98f" }, person);
      mk("path", { d: "M-20 12 Q0 -12 20 12 Q10 0 -20 12 Z", fill: "#2b2420" }, person);
      zzz = mk("text", { x: 22, y: -8, "font-size": 18, "font-weight": 700, fill: "#6b7280", "font-family": "Outfit, sans-serif", opacity: 0 }, person);
      zzz.textContent = "…";
      // Humidifier with mist
      mk("rect", { x: 380, y: 330, width: 60, height: 70, rx: 18, fill: "#f7f7f5", stroke: "#4b5156", "stroke-width": 2 }, svg);
      mk("rect", { x: 398, y: 322, width: 24, height: 10, rx: 4, fill: "#cfd8dc" }, svg);
      for (let i = 0; i < 6; i++) mist.push({ c: mk("circle", { r: 9, fill: "#ffffff", opacity: 0 }, svg), p: i / 6 });
      // Air purifier: grille, a spinning fan and a coloured air-quality light
      mk("rect", { x: 690, y: 240, width: 80, height: 160, rx: 10, fill: "#f4f4f0", stroke: "#4b5156", "stroke-width": 2 }, svg);
      for (let y = 300; y < 390; y += 10) mk("path", { d: `M700 ${y} H760`, stroke: "#d0d0ca", "stroke-width": 3 }, svg);
      fanG = mk("g", { transform: "translate(730 270)" }, svg);
      mk("circle", { r: 18, fill: "#e4e4df" }, fanG);
      for (let i = 0; i < 4; i++) mk("path", { d: "M0 0 L0 -15", stroke: "#4b5156", "stroke-width": 4, "stroke-linecap": "round", transform: `rotate(${i * 90})` }, fanG);
      purLed = mk("circle", { cx: 730, cy: 252, r: 4, fill: "#2f7de1" }, svg);
      // Fine dust in the room
      for (let i = 0; i < 46; i++) dust.push({ c: mk("circle", { r: 2.4, fill: "#7d756a", opacity: 0 }, svg), x: 40 + (i * 157) % 720, y: 40 + (i * 89) % 350, k: i });
      box.replaceChildren(svg);
    },
    reset() {},
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour, night = hour < 7 || hour >= 18;
      const r = RoomModel.readings(s);
      sky.setAttribute("fill", night ? "#1f2a44" : "#bcd7e8");
      blocks.querySelectorAll(".lit").forEach((w, i) => w.setAttribute("fill", night ? (i % 3 ? "#ffd98a" : "#4a5262") : "#c5ccd4"));
      haze.setAttribute("opacity", Math.min(0.75, s.outPm / 130).toFixed(2));
      lamp.setAttribute("opacity", night ? 0.8 : 0);
      sash.setAttribute("transform", s.windowOpen ? "translate(-118 0)" : "");
      const damp = IoT.clamp((r.humidity - 60) / 30, 0, 1);
      fog.setAttribute("opacity", (damp * 0.55).toFixed(2));
      drops.forEach((d, i) => d.setAttribute("opacity", damp > i / 14 ? 0.9 : 0));
      outBoard.textContent = `${Math.round(s.outPm)} · ${RoomModel.pmGrade(s.outPm)}`;
      wallTemp.textContent = `${r.temp.toFixed(1)} °C`;
      wallRh.textContent = `${Math.round(r.humidity)}% humidity`;
      floorGlow.setAttribute("opacity", s.heaterOn ? (0.6 + 0.2 * Math.sin(now / 600)).toFixed(2) : 0);
      // Humidifier mist rises while it runs
      mist.forEach((m) => {
        const p = ((now / 1800) + m.p) % 1;
        m.c.setAttribute("cx", 410 + Math.sin(p * 6 + m.p * 9) * 8); m.c.setAttribute("cy", 318 - p * 90);
        m.c.setAttribute("r", 6 + p * 12); m.c.setAttribute("opacity", s.humidifierOn ? (0.8 * (1 - p)).toFixed(2) : 0);
      });
      fanG.setAttribute("transform", `translate(730 270) rotate(${s.purifierOn ? (now / 3) % 360 : 0})`);
      purLed.setAttribute("fill", s.pm <= 15 ? "#2f7de1" : s.pm <= 35 ? "#2e9d4f" : s.pm <= 75 ? "#e0a21b" : "#d64f4f");
      // Dust drifts in the air; more dots for more fine dust
      const shown = Math.min(dust.length, Math.round(s.pm / 4));
      dust.forEach((d, i) => {
        const x = d.x + Math.sin(now / 2000 + d.k) * 14, y = d.y + Math.cos(now / 2600 + d.k * 1.3) * 10;
        d.c.setAttribute("cx", x.toFixed(1)); d.c.setAttribute("cy", y.toFixed(1)); d.c.setAttribute("opacity", i < shown ? 0.55 : 0);
      });
      // Cooking smoke from the pan
      stoveSmoke.forEach((c, i) => {
        const p = ((now / 1400) + i / 6) % 1;
        c.setAttribute("cx", 618 + Math.sin(p * 5 + i) * 10); c.setAttribute("cy", 326 - p * 110); c.setAttribute("r", 8 + p * 16);
        c.setAttribute("opacity", s.cookLeft > 0 ? (0.6 * (1 - p)).toFixed(2) : 0);
      });
      // The person: shivers when cold, sweaty-red when hot, sleepy "…" when the air is stuffy
      const mood = RoomModel.mood(s).id;
      shiver = mood === "cold" ? Math.sin(now / 40) * 2 : 0;
      person.setAttribute("transform", `translate(${540 + shiver} 300)`);
      personBody.setAttribute("fill", mood === "cold" || mood === "cool" ? "#4f6fa8" : mood === "hot" ? "#c4573e" : "#3d6e9e");
      zzz.setAttribute("opacity", mood === "stuffy" ? (0.5 + 0.5 * Math.sin(now / 500)).toFixed(2) : 0);
      zzz.textContent = mood === "stuffy" ? "zzz" : "…";
    }
  };

  const LEVEL = { cozy: "good", ok: "warn", cool: "warn", dry: "warn", dusty: "warn", stuffy: "warn", damp: "bad", cold: "bad", hot: "bad", smoky: "bad" };
  window.IoTGame = IoTUI.start({
    id: "room", title: "My Korean Room Monitor", short: "Room", model: RoomModel, options: { startMinutes: 18 * 60, outHigh: 2 },
    sceneLabel: "A small studio room in winter with a window onto apartment blocks, floor heating, a humidifier and an air purifier",
    sensors: [
      { id: "temp", label: "Temperature", short: "Temp", icon: "🌡️", unit: "°C", decimals: 1, min: 0, max: 35, good: [18, 26], warn: [16, 28],
        learn: { title: "Temperature (°C)", text: "The World Health Organization recommends keeping homes at 18 °C or warmer in cold seasons. Most Korean homes heat the floor (ondol): it was once warmed by fire under stone, and today hot water from a boiler runs in pipes under the floor. A sensor such as the SHT31 or DHT22 measures temperature and humidity together." } },
      { id: "humidity", label: "Humidity", icon: "💧", unit: "%", decimals: 0, min: 0, max: 100, good: [30, 60], warn: [25, 70],
        learn: { title: "Relative humidity (%)", text: "Relative humidity is how much water the air holds compared with the most it could hold at that temperature. Warm air can hold more, so heating cold winter air makes the room very dry, and opening the window in winter dries it further. The US EPA advises keeping indoor humidity below 60%, ideally between 30% and 50%: very dry air feels harsh on skin and eyes, while damp air condenses on cold windows and helps mould grow." } },
      { id: "pm", label: "Fine dust PM2.5", short: "PM2.5", icon: "🌫️", unit: "µg/m³", decimals: 0, min: 0, max: 150, good: [0, 35], warn: [35, 75],
        learn: { title: "Fine dust, PM2.5 (µg/m³)", text: "PM2.5 means particles 2.5 micrometres across or smaller, small enough to reach deep into the lungs. Korea's forecasts (AirKorea) grade PM2.5 as Good up to 15 µg/m³, Moderate 16–35, Bad 36–75 and Very bad from 76. Low-cost indoor sensors such as the Plantower PMS5003 count particles by how they scatter a laser beam. An air purifier with a HEPA filter pulls particles out of the room's air." } },
      { id: "co2", label: "CO2", icon: "😮‍💨", unit: "ppm", decimals: 0, min: 400, max: 2500, good: [400, 1000], warn: [1000, 1500],
        learn: { title: "Carbon dioxide (ppm)", text: "Outdoor air has about 420 ppm (parts per million) of CO2. Every breath adds more, so a small closed room with one person keeps climbing; high CO2 is a sign the air needs freshening and can make you feel sleepy. Korea's Indoor Air Quality Control Act requires multi-use facilities (subway stations, hospitals, daycare centres, large stores and so on) to keep CO2 at 1,000 ppm or below. Real CO2 sensors such as the MH-Z19 or SCD30 measure it with infrared light (NDIR); cheap \"eCO2\" sensors only estimate it from other gases." } }
    ],
    switches: [{ id: "heater", label: "Heating" }, { id: "humidifier", label: "Humidifier" }, { id: "purifier", label: "Purifier" }, { id: "window", label: "Window" }],
    events: [{ id: "vent", label: "Air out (window open 10 min)", button: "Air out 10 min" }, { id: "cook", label: "Grill fish", button: "Cook dinner" }],
    ruleSensors: ["temp", "humidity", "pm", "co2"], ruleSwitches: ["heater", "humidifier", "purifier", "window"], ruleEvents: ["vent"],
    defaultRules: [{ kind: "if", sensor: "temp", op: "<", value: 20, until: 22, actuator: "heater" }],
    env: [
      { type: "range", label: "Outdoor PM2.5", min: 5, max: 150, step: 5, unit: " µg/m³", get: (sim) => sim.state.outPm, set: (sim, v) => { sim.state.outPm = v; } },
      { type: "range", label: "Day's high", min: -10, max: 15, step: 1, unit: " °C", get: (sim) => sim.state.outHigh, set: (sim, v) => { sim.state.outHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission is a winter day in a small studio room. Your rule cards run the heating, humidifier, purifier and window. Change rules any time, even mid-mission.",
    eventSounds: { vent: "splash", cook: "pop" },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour; return { ambience: s.windowOpen ? ["roomtone", "city"] : ["roomtone"], night: h < 7 || h >= 18, devices: { heat: s.heaterOn, hiss: s.humidifierOn, fan: s.purifierOn } }; },
    status: (sim) => { const m = RoomModel.mood(sim.state); return { level: LEVEL[m.id], text: `${m.text} · comfort ${Math.round(sim.state.comfort)}%` }; },
    rulesIntro: "This is how a smart home hub decides what to do. An IF rule keeps a device on while the condition is true; UNTIL keeps it on until the reading passes a second level. A time rule runs an action once a day.",
    rulesTip: "Try: IF CO2 is above 1000 THEN Window ON UNTIL 700. Then add a humidifier rule (IF Humidity is below 40 THEN Humidifier ON UNTIL 50) and a purifier rule for fine dust.",
    codeIntro: "Your rule cards as an Arduino sketch for a smart room. The read...() functions stand in for each sensor's real library code, and the pins depend on your wiring.",
    codeSpec: {
      title: "Smart room controller",
      sensors: { temp: { fn: "readTemperature", unit: "°C", label: "Temperature (SHT31)" }, humidity: { fn: "readHumidity", unit: "%", label: "Relative humidity (SHT31)" },
        pm: { fn: "readPM25", unit: "µg/m³", label: "Fine dust PM2.5 (PMS5003)" }, co2: { fn: "readCO2", unit: "ppm", label: "CO2 (NDIR sensor, e.g. SCD30)" } },
      actuators: { heater: { pin: 5, label: "Floor heating, through a relay on the boiler's external on/off (thermostat) input, if it has one", kind: "switch" },
        humidifier: { pin: 6, label: "Humidifier, through a relay", kind: "switch" }, purifier: { pin: 7, label: "Air purifier, through a relay", kind: "switch" },
        window: { pin: 8, label: "Window opener motor, through a relay", kind: "switch" },
        vent: { label: "Air out for 10 minutes", kind: "event", drives: "window", durationMin: 10 } }
    },
    learnIntro: "What each sensor measures and why it matters in a Korean winter. The simulation is simplified, but its directions and guide values follow the published sources below.",
    learnMore: [
      { title: "Air out even on fine dust days", text: "Closing up completely lets CO2 and other indoor pollution build up, so in 2019 Korea's National Council on Climate and Air Quality advised airing out for about 10 minutes, three times a day, even when outdoor dust is bad. The trade-off is real: a newspaper test that year found a 10-minute airing on a Very bad day raised indoor PM2.5 from 53 to 136 µg/m³, and Korea's disease-control agency said there was no national airing standard yet. Short airings plus an air purifier are the balance this game rewards." },
      { title: "Cooking makes fine dust", text: "Frying and grilling release a lot of fine particles. In a Korean Ministry of Environment test, grilling mackerel in a closed kitchen raised PM2.5 to about 2,290 µg/m³, so run the range hood and open a window while you cook." },
      { title: "Why heated rooms feel dry", text: "Cold winter air holds very little water. Warm it up and the same water becomes a much lower relative humidity, which is why heated rooms in winter often drop below 30%." },
      { title: "A simplified model", text: "Real rooms also depend on their size, insulation, how many people are home and much more. Use this to understand the ideas; real sensor readings tell you about your own room." }
    ],
    sources: [
      { label: "PM2.5 forecast grades (2018)", url: "https://www.jjan.kr/article/20180326635951" },
      { label: "Airing out on fine dust days (Newsis fact check, 2019)", url: "https://www.newsis.com/view/NISX20191213_0000860198" },
      { label: "Grilling fish and fine dust (Ministry of Environment test)", url: "https://www.etoday.co.kr/news/view/1332784" },
      { label: "US EPA: Mold, moisture and your home", url: "https://www.epa.gov/mold/brief-guide-mold-moisture-and-your-home" },
      { label: "US EPA: Indoor particulate matter", url: "https://www.epa.gov/indoor-air-quality-iaq/indoor-particulate-matter" },
      { label: "WHO Housing and health guidelines", url: "https://www.who.int/publications/i/item/9789241550376" }
    ]
  });
})();
