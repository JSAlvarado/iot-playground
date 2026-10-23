// ============ GAME 2: KEEP THE PLANT ALIVE ============
// A potted plant on a balcony with a soil-moisture sensor, a light sensor, a small pump with a water tank and
// a grow light. The easiest game: one good IF rule keeps it alive.
(function () {
  "use strict";
  const { IoT, PlantModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };

  // ---- Missions ----
  function track(sim) { return sim._track || (sim._track = { minHealth: 100, minTank: 99, startGrowth: sim.state.growth }); }
  const starsFor = (h) => (h >= 95 ? 3 : h >= 85 ? 2 : 1);
  function keep(days, failHealth, extra) {
    const hours = days * 24;
    return (sim, h) => {
      const t = track(sim), s = sim.state;
      t.minHealth = Math.min(t.minHealth, s.health); t.minTank = Math.min(t.minTank, s.tank);
      if (s.health < failHealth) return { state: "lost", message: `The plant got too weak (health ${Math.round(s.health)}%). Look at the moisture graph, change your rules and try again.` };
      const fail = extra && extra.fail && extra.fail(t, s);
      if (fail) return { state: "lost", message: fail };
      if (h >= hours) {
        const win = extra && extra.win ? extra.win(t, s) : { ok: true };
        if (!win.ok) return { state: "lost", message: win.message };
        const stars = starsFor(t.minHealth);
        return { state: "won", stars, message: `Mission complete! Lowest plant health ${Math.round(t.minHealth)}%: ${"★".repeat(stars)}${stars < 3 ? " (keep health above 95% for 3 stars)" : ""}` };
      }
      return { state: "running", progress: h / hours, message: `Day ${Math.min(days, Math.floor(h / 24) + 1)} of ${days} · plant health ${Math.round(s.health)}%` };
    };
  }
  const missions = [
    { id: "week", title: "1. One week", goal: "Keep the plant above 70% health for 7 days of mixed weather. Tip: add a rule that turns the pump on when the soil gets dry.",
      options: { weatherDays: ["sunny", "cloudy", "sunny", "rainy", "sunny", "sunny", "cloudy"] }, check: keep(7, 70) },
    { id: "heat", title: "2. Sunny week", goal: "Seven sunny days dry the soil fast. Keep the plant above 70% without letting the soil get waterlogged either.",
      options: { weatherDays: Array(7).fill("sunny") }, check: keep(7, 70) },
    { id: "tank", title: "3. Small tank", goal: "The water tank holds only 2.5 litres. Keep the plant healthy for 7 days without the tank running dry: water only when it's needed.",
      options: { weatherDays: ["sunny", "sunny", "cloudy", "rainy", "sunny", "cloudy", "sunny"], tank: 2.5 },
      check: keep(7, 70, { fail: (t) => (t.minTank <= 0 ? "The tank ran dry. Water a little later (a lower moisture number) so each refill lasts longer." : null) }) },
    { id: "dark", title: "4. Dark days", goal: "A week of clouds and rain: not enough light to grow. Grow at least 1 new leaf. Tip: a light sensor and the grow light.",
      options: { weatherDays: ["cloudy", "rainy", "cloudy", "cloudy", "rainy", "cloudy", "rainy"] },
      check: keep(7, 70, { win: (t, s) => (s.growth - t.startGrowth >= 1 ? { ok: true } : { ok: false, message: "No new leaf grew: there wasn't enough light. Plants need light to grow, so add a rule for the grow light." }) }) }
  ];
  window.PlantMissions = missions; // for the automated mission tests

  // ---- The scene: a pot on a balcony with a pump, a tank and a grow light ----
  let svg, sky, sun, cloudG, rainG, soil, stemG, leaves = [], drops = [], lamp, glow, tankFill, pumpLabel;
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 500, fill: "#cfe8f0" }, svg);
      sun = mk("circle", { r: 30, fill: "#ffd25a" }, svg);
      cloudG = mk("g", { fill: "#ffffff" }, svg);
      for (const [x, y, s] of [[150, 80, 1], [560, 60, 1.2]]) {
        const g = mk("g", { transform: `translate(${x} ${y}) scale(${s})` }, cloudG);
        mk("ellipse", { cx: 0, cy: 10, rx: 60, ry: 22 }, g); mk("ellipse", { cx: -25, cy: 0, rx: 30, ry: 24 }, g); mk("ellipse", { cx: 20, cy: -8, rx: 34, ry: 28 }, g);
      }
      rainG = mk("g", { stroke: "#7fa7c2", "stroke-width": 2, "stroke-linecap": "round" }, svg);
      for (let i = 0; i < 36; i++) mk("line", { x1: 0, y1: 0, x2: -6, y2: 16 }, rainG);
      mk("rect", { x: 0, y: 420, width: 800, height: 80, fill: "#b9a68a" }, svg);        // balcony floor
      mk("rect", { x: 0, y: 404, width: 800, height: 16, fill: "#8e7b62" }, svg);
      // Grow light on an arm
      mk("path", { d: "M600 404 V150 H470", stroke: "#4b5156", "stroke-width": 6, fill: "none" }, svg);
      glow = mk("path", { d: "M430 172 L330 330 H570 L490 172 Z", fill: "#ffd8f2", opacity: 0 }, svg);
      lamp = mk("rect", { x: 420, y: 150, width: 80, height: 22, rx: 6, fill: "#5d5f66" }, svg);
      // Stem and leaves
      stemG = mk("g", {}, svg);
      mk("path", { d: "M400 330 V196", stroke: "#3f7f3a", "stroke-width": 8, "stroke-linecap": "round" }, stemG);
      for (let i = 0; i < 12; i++) {
        const side = i % 2 ? 1 : -1, y = 304 - i * 9;
        const leaf = mk("path", { d: `M0 0 q${side * 44} -30 ${side * 82} -4 q${side * -34} 30 ${side * -82} 4 z`, fill: "#4f9a46" }, stemG);
        leaves.push({ leaf, x: 400, y, side });
      }
      // Pot and soil
      soil = mk("ellipse", { cx: 400, cy: 332, rx: 92, ry: 14, fill: "#6b4a2f" }, svg);
      mk("path", { d: "M300 330 H500 L480 410 H320 Z", fill: "#c4693d" }, svg);
      mk("rect", { x: 292, y: 322, width: 216, height: 18, rx: 6, fill: "#d07a4b" }, svg);
      // Sensor stick in the soil
      mk("rect", { x: 440, y: 300, width: 10, height: 44, rx: 3, fill: "#2f6a9c" }, svg);
      // Tank, pump and tube
      mk("rect", { x: 140, y: 300, width: 80, height: 110, rx: 10, fill: "#e7eef2", stroke: "#4b5156", "stroke-width": 3 }, svg);
      tankFill = mk("rect", { x: 144, y: 304, width: 72, height: 102, rx: 7, fill: "#5aa6d6" }, svg);
      mk("text", { x: 168, y: 292, "text-anchor": "middle", "font-size": 14, "font-weight": 600, fill: "#33383d", "font-family": "Outfit, sans-serif" }, svg).textContent = "Tank";
      mk("path", { d: "M208 300 V270 H360 V318", stroke: "#4b5156", "stroke-width": 5, fill: "none" }, svg);
      pumpLabel = mk("text", { x: 270, y: 262, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "#2f6a9c", "font-family": "Outfit, sans-serif" }, svg);
      for (let i = 0; i < 6; i++) drops.push({ c: mk("circle", { r: 4, fill: "#5aa6d6", opacity: 0 }, svg), y: 320, phase: i / 6 });
      box.replaceChildren(svg);
    },
    reset() {},
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour;
      const sunNow = PlantModel.sunlight(hour, s.weather);
      const day = hour >= 6 && hour <= 18 ? Math.max(0.35, sunNow + 0.25) : 0;
      sky.setAttribute("fill", mix("#1c2742", s.weather === "sunny" ? "#cfe8f0" : "#bcc6cd", Math.min(1, day)));
      const t = (hour - 6) / 12, up = hour >= 6 && hour <= 18;
      sun.setAttribute("cx", up ? 80 + 640 * t : 700); sun.setAttribute("cy", up ? 260 - Math.sin(Math.PI * t) * 210 : 70);
      sun.setAttribute("fill", up ? "#ffd25a" : "#e8ecf2");
      sun.setAttribute("opacity", up ? (s.weather === "rainy" ? 0 : s.weather === "cloudy" ? 0.45 : 1) : 1); // the sun hides behind rain clouds
      cloudG.setAttribute("opacity", s.weather === "sunny" ? "0" : "0.95");
      const raining = s.weather === "rainy" && hour >= 10 && hour < 16;
      rainG.setAttribute("opacity", raining ? "1" : "0");
      if (raining) [...rainG.children].forEach((l, i) => l.setAttribute("transform", `translate(${(i * 53 + now / 3) % 820} ${(i * 37 + now / 2) % 420})`));
      glow.setAttribute("opacity", s.growLightOn ? 0.55 : 0);
      lamp.setAttribute("fill", s.growLightOn ? "#d94fb0" : "#5d5f66");
      // Soil gets darker when wet; leaves droop when dry and yellow when the plant is weak
      soil.setAttribute("fill", mix("#a98a63", "#3f2a18", IoT.clamp(s.moisture / 90, 0, 1)));
      const droop = IoT.clamp((40 - s.moisture) / 30, 0, 1) * 35 + IoT.clamp((s.moisture - 85) / 15, 0, 1) * 15;
      const color = mix("#c9b84a", "#4f9a46", IoT.clamp(s.health / 100, 0, 1));
      const n = PlantModel.leaves(s);
      leaves.forEach((L, i) => {
        L.leaf.setAttribute("opacity", i < n ? 1 : 0);
        L.leaf.setAttribute("fill", color);
        const sway = Math.sin(now / 900 + i) * 2;
        L.leaf.setAttribute("transform", `translate(${L.x} ${L.y}) rotate(${L.side * (droop + sway)})`);
      });
      tankFill.setAttribute("height", (102 * IoT.clamp(s.tank / 10, 0, 1)).toFixed(1));
      tankFill.setAttribute("y", (304 + 102 * (1 - IoT.clamp(s.tank / 10, 0, 1))).toFixed(1));
      pumpLabel.textContent = s.pumpOn ? "pump ON" : "";
      drops.forEach((d) => {
        const p = ((now / 900) + d.phase) % 1;
        d.c.setAttribute("cx", 360); d.c.setAttribute("cy", 320 + p * 14);
        d.c.setAttribute("opacity", s.pumpOn ? 1 - p : 0);
      });
    }
  };

  const LEVEL = { happy: "good", ok: "warn", dry: "bad", soggy: "bad", danger: "bad" };
  window.IoTGame = IoTUI.start({
    id: "plant", title: "Keep the Plant Alive", short: "Plant Alive", model: PlantModel, options: { weatherDays: ["sunny"] },
    sceneLabel: "A potted plant on a balcony with a water tank, a small pump and a grow light",
    sensors: [
      { id: "moisture", label: "Soil moisture", short: "Soil", icon: "💧", unit: "%", decimals: 0, min: 0, max: 100, good: [40, 70], warn: [25, 85],
        learn: { title: "Soil moisture (%)", text: "A capacitive soil-moisture sensor is a stick you push into the soil; it measures how much water is around it. It gives a raw number, which you turn into a 0–100% scale by recording it in dry soil and in wet soil. This game uses a simple 0–100% scale where 40–70% is comfortable for this plant (real plants differ). Too dry and the leaves droop. Too wet for too long and the roots can't get air: waterlogged soil pushes out the oxygen roots need, and root rot can follow. Overwatering often looks like thirst, so check the soil before adding more water." } },
      { id: "light", label: "Light", icon: "☀️", unit: "%", decimals: 0, min: 0, max: 100, good: [20, 100], warn: [5, 20],
        learn: { title: "Light (% of full sun)", text: "A light sensor (for example a BH1750, which measures lux) tells the controller how bright it is. Plants use the energy in light to make their food (photosynthesis), so they only grow when there's enough of it. Clouds and rain cut the light a lot. A grow light can make up for dark days, which is how indoor farms grow plants all year." } },
      { id: "tank", label: "Water tank", short: "Tank", icon: "🪣", unit: "L", decimals: 1, min: 0, max: 10, good: [2, 10], warn: [0.5, 2],
        learn: { title: "Water tank (litres)", text: "The pump moves water from a small tank to the pot. In a real system a float switch or a level sensor tells the controller when the tank is getting low, so the pump never runs dry (running dry can damage a pump)." } }
    ],
    switches: [{ id: "pump", label: "Pump" }, { id: "growlight", label: "Grow light" }],
    events: [],
    ruleSensors: ["moisture", "light", "tank"], ruleSwitches: ["pump", "growlight"], ruleEvents: [],
    defaultRules: [],
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weatherDays.length === 1 ? sim.state.weatherDays[0] : sim.state.weather, set: (sim, v) => { sim.state.weatherDays = [v]; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets up a week of weather for the plant. Your rule cards do the work. Change rules any time, even mid-mission.",
    // Rainy days rain from 10:00 to 16:00 (as in the model); the rest of a rainy day is overcast
    weather: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour; return { sky: s.weather === "rainy" && !(h >= 10 && h < 16) ? "cloudy" : s.weather, night: h < 5.5 || h > 18.75 }; },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour; return { ambience: ["wind"], night: h < 5.5 || h > 19, rain: s.weather === "rainy" && h >= 10 && h < 16, devices: { pump: s.pumpOn } }; },
    status: (sim) => { const m = PlantModel.mood(sim.state); return { level: LEVEL[m.id], text: `${m.text} · health ${Math.round(sim.state.health)}% · ${PlantModel.leaves(sim.state)} leaves` }; },
    rulesIntro: "There are no rules yet, so nothing waters the plant. An IF rule keeps a device on while its condition is true.",
    rulesTip: "Try: IF Soil moisture is below 40 THEN Pump ON. The pump stops by itself once the soil is moist again. Add UNTIL 55 to water a little deeper each time: real controllers switch on at one level and off at another, so the pump doesn't keep clicking on and off.",
    codeIntro: "Your rule cards as an Arduino sketch for a self-watering pot. The read...() functions stand in for each sensor's real code, and the pins depend on your wiring.",
    codeSpec: {
      title: "Self-watering plant",
      sensors: { moisture: { fn: "readSoilMoisturePercent", unit: "%", label: "Capacitive soil-moisture sensor" }, light: { fn: "readLightPercent", unit: "%", label: "Light sensor" },
        tank: { fn: "readTankLitres", unit: "L", label: "Tank level sensor" } },
      actuators: { pump: { pin: 5, label: "Water pump, through a relay or MOSFET", kind: "switch" }, growlight: { pin: 6, label: "Grow light, through a relay", kind: "switch" } }
    },
    learnIntro: "What each sensor measures and why it matters. The simulation is simplified, but its directions follow real plant care.",
    learnMore: [
      { title: "Why the soil dries faster in the sun", text: "Water evaporates from the soil and plants release water through their leaves, both faster in sunshine and heat. A pot in the sun can need water every day; on cloudy days it lasts much longer." },
      { title: "Why IF rules are better than fixed watering times", text: "Watering at a fixed time ignores the weather: after a rainy day the soil may already be wet. Watering when the sensor says the soil is dry gives the plant what it needs, which is what plant-care guides recommend." },
      { title: "A simplified model", text: "Real plants differ in how much water and light they need, and soil type matters. Use this to understand how sensors and automation work together." }
    ],
    sources: [
      { label: "UConn: Watering Houseplants", url: "https://soiltesting.cahnr.uconn.edu/watering-houseplants" },
      { label: "Iowa State Extension: Root Rots of Houseplants", url: "https://yardandgarden.extension.iastate.edu/article/2014/02-14/rootrot.html" }
    ]
  });
})();
