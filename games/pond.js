// ============ GAME 1: FLOATECH POND SIMULATOR ============
// A tilapia pond with a solar-powered floating unit (sensors, a feeder and an aerator), like John's FLOATech.
(function () {
  "use strict";
  const { IoT, PondModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };

  // ---- Missions: each checks the pond every virtual minute ----
  function track(sim) { return sim._track || (sim._track = { minHealth: 100, minBattery: 100, minOxygen: 99 }); }
  const starsFor = (minHealth) => (minHealth >= 95 ? 3 : minHealth >= 85 ? 2 : 1);
  function survive(hours, failHealth, extra) {
    return (sim, h) => {
      const t = track(sim), s = sim.state;
      t.minHealth = Math.min(t.minHealth, s.health); t.minBattery = Math.min(t.minBattery, s.battery); t.minOxygen = Math.min(t.minOxygen, s.oxygen);
      if (s.health < failHealth) return { state: "lost", message: `The fish got too stressed (health ${Math.round(s.health)}%). Check the Graph tab to see what went wrong, change your rules and try again.` };
      const fail = extra && extra.fail(t, s);
      if (fail) return { state: "lost", message: fail };
      if (h >= hours) {
        const win = extra && extra.win ? extra.win(t, s) : null;
        if (win && !win.ok) return { state: "lost", message: win.message };
        const stars = Math.min(starsFor(t.minHealth), win && win.stars ? win.stars : 3);
        return { state: "won", stars, message: `Mission complete! Lowest fish health ${Math.round(t.minHealth)}%: ${"★".repeat(stars)}${stars < 3 ? " (keep health above 95% for 3 stars)" : ""}` };
      }
      return { state: "running", progress: h / hours, message: `${Math.floor(h)} of ${hours} hours · fish health ${Math.round(s.health)}%` };
    };
  }
  const missions = [
    { id: "first-day", title: "1. First sunny day", goal: "Keep the fish healthy (above 70%) for 24 hours of sunny weather. The example rules feed them twice a day.",
      options: { weather: "sunny", airHigh: 31 }, check: survive(24, 70) },
    { id: "cloudy", title: "2. Two cloudy days", goal: "Clouds mean less sunlight, so the algae make less oxygen. Keep the fish above 70% for 48 hours. Tip: add an aerator rule.",
      options: { weather: "cloudy", airHigh: 31 }, check: survive(48, 70) },
    { id: "battery", title: "3. Save the battery", goal: "Cloudy again, and the battery starts at 40%. Keep the fish healthy for 48 hours without the battery running empty.",
      options: { weather: "cloudy", airHigh: 31, battery: 40 },
      check: survive(48, 70, { fail: (t) => (t.minBattery <= 0 ? "The solar battery ran empty, so the aerator stopped. Run the aerator only when oxygen is low, not all the time." : null) }) },
    { id: "feeding", title: "4. Feed wisely", goal: "Two sunny days. Don't let the fish go hungry, and waste less than 150 g of feed: leftover feed rots and uses up oxygen.",
      options: { weather: "sunny", airHigh: 31 },
      check: survive(48, 70, { fail: (t, s) => (s.wasted >= 150 ? `${Math.round(s.wasted)} g of feed rotted in the pond. Feed less often or smaller amounts.` : null),
        win: (t, s) => (s.hunger > 0.75 ? { ok: false, message: "The fish ended up hungry. Feed them at least twice a day." } : { ok: true }) }) },
    { id: "heat", title: "5. Heat wave", goal: "Afternoons reach 36 °C. Warm water holds less oxygen and fish breathe faster. Keep them above 70% for 48 hours.",
      options: { weather: "sunny", airHigh: 36 }, check: survive(48, 70) }
  ];

  // ---- The scene: an original flat drawing of the pond and the floating unit ----
  let svg, sky, sunEl, water, unit, bubbles = [], fish = [], pellets = [], rainG, cloudG, battFill, aerLabel;
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 240, fill: "#bfe3f0" }, svg);
      sunEl = mk("circle", { r: 26, fill: "#ffd25a" }, svg);
      cloudG = mk("g", { fill: "#ffffff", opacity: "0.95" }, svg);
      for (const [x, y, s] of [[160, 70, 1], [520, 55, 1.3], [680, 110, 0.9]]) {
        const g = mk("g", { transform: `translate(${x} ${y}) scale(${s})` }, cloudG);
        mk("ellipse", { cx: 0, cy: 10, rx: 60, ry: 22 }, g); mk("ellipse", { cx: -25, cy: 0, rx: 30, ry: 24 }, g); mk("ellipse", { cx: 20, cy: -8, rx: 34, ry: 28 }, g);
      }
      rainG = mk("g", { stroke: "#7fa7c2", "stroke-width": 2, "stroke-linecap": "round" }, svg);
      for (let i = 0; i < 40; i++) mk("line", { x1: 0, y1: 0, x2: -6, y2: 16 }, rainG);
      water = mk("rect", { x: 0, y: 240, width: 800, height: 260, fill: "#2e7f95" }, svg);
      mk("rect", { x: 0, y: 470, width: 800, height: 30, fill: "#5b4a36", opacity: "0.6" }, svg);
      for (let i = 0; i < 18; i++) pellets.push(mk("circle", { r: 4, fill: "#c98b3a", opacity: 0 }, svg));
      for (let i = 0; i < 6; i++) {
        const g = mk("g", {}, svg);
        mk("path", { d: "M0 0 q24 -14 48 0 q-24 14 -48 0 z", fill: "#9aa7ab" }, g);
        mk("path", { d: "M46 0 l16 -11 v22 z", fill: "#7f8d92" }, g);
        mk("circle", { cx: 9, cy: -2, r: 2.4, fill: "#1d2a30" }, g);
        for (const sx of [18, 26, 34]) mk("path", { d: `M${sx} -7 v14`, stroke: "#7f8d92", "stroke-width": 2 }, g);
        fish.push({ g, x: 80 + i * 110, y: 330 + (i % 3) * 40, dir: i % 2 ? 1 : -1, speed: 0.5 + (i % 3) * 0.25, phase: i });
      }
      for (let i = 0; i < 14; i++) bubbles.push({ c: mk("circle", { r: 3 + (i % 3), fill: "#e8f7fb", opacity: 0 }, svg), y: 0, x: 0, life: 0 });
      // The floating unit: two barrels, a frame, the control box with a solar roof, an antenna, the feeder
      unit = mk("g", {}, svg);
      mk("rect", { x: -150, y: 0, width: 120, height: 38, rx: 19, fill: "#e9e2cf" }, unit);
      mk("rect", { x: 30, y: 0, width: 120, height: 38, rx: 19, fill: "#e9e2cf" }, unit);
      mk("rect", { x: -160, y: -6, width: 320, height: 8, fill: "#4b5156" }, unit);
      mk("rect", { x: -60, y: -76, width: 120, height: 70, fill: "#f4f4f0", stroke: "#4b5156", "stroke-width": 3 }, unit);
      mk("path", { d: "M-72 -76 L-58 -98 H58 L72 -76 Z", fill: "#23415a" }, unit);
      for (const x of [-30, 0, 30]) mk("path", { d: `M${x} -98 L${x * 1.2} -76`, stroke: "#5e86a3", "stroke-width": 2 }, unit);
      mk("path", { d: "M48 -98 V-124", stroke: "#4b5156", "stroke-width": 3 }, unit);
      mk("circle", { cx: 48, cy: -127, r: 4, fill: "#d64f4f" }, unit);
      const t = mk("text", { x: 0, y: -46, "text-anchor": "middle", "font-size": 15, "font-weight": 700, fill: "#23415a", "font-family": "Outfit, sans-serif" }, unit);
      t.textContent = "FLOATech";
      mk("rect", { x: -40, y: -32, width: 80, height: 10, rx: 5, fill: "#dcdcd6" }, unit);
      battFill = mk("rect", { x: -40, y: -32, width: 80, height: 10, rx: 5, fill: "#3aa35b" }, unit);
      aerLabel = mk("text", { x: 0, y: 60, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "#e8f7fb", "font-family": "Outfit, sans-serif" }, unit);
      mk("path", { d: "M0 38 V70", stroke: "#4b5156", "stroke-width": 2 }, unit);
      mk("rect", { x: -14, y: 70, width: 28, height: 8, rx: 4, fill: "#b9c2c6" }, unit);
      box.replaceChildren(svg);
    },
    reset() { bubbles.forEach((b) => (b.life = 0)); },
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour;
      const day = s.sun > 0 ? Math.min(1, s.sun / Math.max(0.3, PondModel.weather[s.weather].sun) + 0.2) : (hour > 5 && hour < 19 ? 0.35 : 0);
      sky.setAttribute("fill", mix("#1c2742", s.weather === "sunny" ? "#bfe3f0" : "#b7c3cc", Math.min(1, day)));
      const ang = Math.PI * ((hour - 6) / 12);
      const visible = hour >= 6 && hour <= 18;
      sunEl.setAttribute("cx", 80 + 640 * ((hour - 6) / 12));
      sunEl.setAttribute("cy", 220 - Math.sin(ang) * 180);
      sunEl.setAttribute("fill", visible ? "#ffd25a" : "#e8ecf2");
      sunEl.setAttribute("opacity", visible ? (s.weather === "rainy" ? 0 : s.weather === "cloudy" ? 0.45 : 1) : 1); // the sun hides behind rain clouds
      if (!visible) { const nh = ((hour + 6) % 24) / 12; sunEl.setAttribute("cx", 80 + 640 * Math.min(1, nh)); sunEl.setAttribute("cy", 220 - Math.sin(Math.PI * Math.min(1, nh)) * 160); }
      cloudG.setAttribute("opacity", s.weather === "sunny" ? "0" : "0.95");
      rainG.setAttribute("opacity", s.weather === "rainy" ? "1" : "0");
      if (s.weather === "rainy") [...rainG.children].forEach((l, i) => { const x = (i * 53 + now / 3) % 820, y = (i * 37 + now / 2) % 240; l.setAttribute("transform", `translate(${x} ${y})`); });
      // Low oxygen makes the water look murky and green
      const murk = IoT.clamp(1 - s.oxygen / 5, 0, 1);
      water.setAttribute("fill", mix(mix("#163f52", "#2e7f95", Math.min(1, day + 0.2)), "#4f6a3e", murk * 0.7));
      // The unit bobs on the water
      const bob = Math.sin(now / 900) * 4;
      unit.setAttribute("transform", `translate(400 ${232 + bob})`);
      battFill.setAttribute("width", (80 * s.battery / 100).toFixed(1));
      battFill.setAttribute("fill", s.battery < 20 ? "#d64f4f" : "#3aa35b");
      aerLabel.textContent = s.aeratorOn ? "aerator ON" : "";
      // Microbubbles rise from the diffuser while the aerator runs
      bubbles.forEach((b, i) => {
        if (b.life <= 0 && s.aeratorOn) { b.life = 1; b.x = 390 + (i * 7) % 24; b.y = 315; }
        if (b.life > 0) { b.y -= 1.4 + (i % 3) * 0.4; b.life -= 0.012; if (b.y < 245) b.life = 0; }
        b.c.setAttribute("cx", b.x + Math.sin((now / 300) + i) * 2); b.c.setAttribute("cy", b.y); b.c.setAttribute("opacity", b.life > 0 ? 0.8 : 0);
      });
      // Feed pellets float on the surface until eaten
      const shown = Math.min(pellets.length, Math.ceil(s.food / 12));
      pellets.forEach((p, i) => { p.setAttribute("cx", 300 + ((i * 37) % 220)); p.setAttribute("cy", 244 + (i % 3) * 3); p.setAttribute("opacity", i < shown ? 1 : 0); });
      // Fish: gasping at the surface when oxygen is low, still when cold, rising to feed
      const mood = PondModel.mood(s).id;
      fish.forEach((f, i) => {
        const gasp = mood === "stressed" || mood === "danger";
        const targetY = gasp ? 258 + (i % 2) * 8 : s.food > 0 ? 270 + (i % 3) * 18 : 320 + (i % 3) * 45;
        const activity = mood === "cold" ? 0.15 : gasp ? 0.35 : mood === "danger" ? 0.1 : 1;
        f.y += (targetY - f.y) * 0.02;
        f.x += f.dir * f.speed * activity * 1.4;
        if (f.x > 760) f.dir = -1; if (f.x < 20) f.dir = 1;
        const wiggle = Math.sin(now / 200 + f.phase) * 2 * activity;
        const rot = s.health < 20 ? 160 : 0;
        f.g.setAttribute("transform", `translate(${f.x.toFixed(1)} ${(f.y + wiggle).toFixed(1)}) scale(${f.dir > 0 ? -1 : 1} 1) rotate(${rot})`);
        f.g.setAttribute("opacity", s.health < 10 ? 0.5 : 1);
      });
    }
  };

  window.PondMissions = missions; // for the automated mission tests

  const LEVEL = { happy: "good", ok: "warn", hungry: "warn", cold: "warn", hot: "bad", stressed: "bad", danger: "bad" };
  window.IoTGame = IoTUI.start({
    id: "pond", title: "FLOATech Pond", short: "Pond", model: PondModel, options: { weather: "sunny", airHigh: 31 },
    sceneLabel: "A tilapia pond with a floating solar-powered unit, fish swimming below",
    howTo: ["Watch the four gauges. Green is healthy. Tap one to learn what it measures.", "Fish need oxygen. Algae make it in sunlight, so it drops at night and on cloudy days.",
      "In the Rules tab, add: IF Oxygen is below 4 THEN Aerator ON. The bubbles start by themselves.", "Open Missions and press Play. Use the ☀️ ☁️ 🌧️ buttons on the pond to change the weather in free play."],
    sensors: [
      { id: "temp", label: "Water temp", short: "Water", icon: "🌡️", unit: "°C", decimals: 1, min: 10, max: 40, good: [25, 30], warn: [17, 35],
        learn: { title: "Water temperature (°C)", text: "Tilapia are tropical fish: they grow best in water of about 25–30 °C. Below about 17 °C they stop eating, and most can't survive more than a few days at 10–11 °C. Water warms and cools much more slowly than air, so the pond's temperature lags behind the weather. A waterproof DS18B20 probe is a common, cheap sensor for this." } },
      { id: "oxygen", label: "Oxygen", icon: "🫧", unit: "mg/L", decimals: 1, min: 0, max: 12, good: [5, 12], warn: [3, 5],
        learn: { title: "Dissolved oxygen (mg/L)", text: "Fish breathe oxygen dissolved in the water. Tilapia are unusually tough: they can survive brief dawn lows below 1 mg/L, but they eat and grow poorly when oxygen stays low, and farm guides say to keep ponds above 1 mg/L. This game treats 5 mg/L and above as healthy, below 3 as stressful and below 1 as dangerous. Algae make oxygen in sunlight, while fish, algae and rotting feed use it all the time, so oxygen is highest in the afternoon and lowest around dawn. An aerator mixes air into the water when it runs low. Real DO probes need regular calibration." } },
      { id: "ph", label: "pH", icon: "🧪", unit: "", decimals: 2, min: 5, max: 10, good: [6.5, 8.5], warn: [6, 9],
        learn: { title: "pH", text: "pH measures how acidic (below 7) or alkaline (above 7) the water is. Tilapia do best between about 6.5 and 8.5, and can survive a wider range (5 to 10). When algae photosynthesise they remove carbon dioxide, so pH rises in sunny afternoons and falls again at night." } },
      { id: "battery", label: "Battery", icon: "🔋", unit: "%", decimals: 0, min: 0, max: 100, good: [30, 100], warn: [10, 30],
        learn: { title: "Solar battery (%)", text: "FLOATech runs off-grid: a solar panel charges a battery during the day, and the battery powers the controller and the aerator. The aerator uses the most power, so running it all night can empty the battery before sunrise, exactly when oxygen is lowest." } }
    ],
    switches: [{ id: "aerator", label: "Aerator" }],
    events: [{ id: "feeder", label: "Feed fish (100 g)", button: "Feed now" }],
    ruleSensors: ["oxygen", "temp", "ph", "battery"], ruleSwitches: ["aerator"], ruleEvents: ["feeder"],
    defaultRules: [{ kind: "at", time: "07:00", actuator: "feeder" }, { kind: "at", time: "17:00", actuator: "feeder" }],
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weather, set: (sim, v) => { sim.state.weather = v; } },
      { type: "range", label: "Day's high", min: 12, max: 38, step: 1, unit: " °C", get: (sim) => sim.state.airHigh, set: (sim, v) => { sim.state.airHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets up the pond: the weather, the heat and the battery. Your rule cards do the work. Change rules any time, even mid-mission.",
    eventSounds: { feeder: "plop" },
    // The sky for the weather layer and its sounds: the chosen weather all day, darkness from dusk to dawn
    weather: (sim) => { const h = IoT.timeOfDay(sim.minutes).hour; return { sky: sim.state.weather, night: h < 5.5 || h > 18.75 }; },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour; return { ambience: ["water", "wind"], night: h < 5.5 || h > 19, rain: s.weather === "rainy", devices: { bubbles: s.aeratorOn } }; },
    status: (sim) => { const m = PondModel.mood(sim.state); return { level: LEVEL[m.id], text: `${m.text} · health ${Math.round(sim.state.health)}%` }; },
    rulesIntro: "This is how FLOATech's controller decides what to do. An IF rule keeps a device on while the condition is true. A time rule runs an action once a day.",
    rulesTip: "Try: IF Oxygen is below 4 THEN Aerator ON UNTIL 5. Watch the bubbles start at night. UNTIL is optional: it keeps the aerator running until oxygen climbs back above 5, the way real controllers switch on at one level and off at another so a pump doesn't keep clicking on and off.",
    codeIntro: "Your rule cards written as an Arduino sketch, the kind of code that runs on FLOATech's controller. The read...() functions stand in for each sensor's real library code, and the pins depend on your wiring.",
    codeSpec: {
      title: "FLOATech pond controller",
      sensors: { temp: { fn: "readWaterTemperature", unit: "°C", label: "Water temperature (DS18B20 probe)" }, oxygen: { fn: "readDissolvedOxygen", unit: "mg/L", label: "Dissolved oxygen probe" },
        ph: { fn: "readPH", unit: "pH", label: "pH probe" }, battery: { fn: "readBatteryPercent", unit: "%", label: "Battery level (voltage divider)" } },
      actuators: { aerator: { pin: 5, label: "Aerator pump, through a relay", kind: "switch" }, feeder: { pin: 6, label: "Feeder motor, through a relay", kind: "event", pulseMs: 3000 } }
    },
    learnIntro: "What the sensors measure and why it matters. The simulation is simplified so it runs in a browser, but the directions and healthy ranges follow real pond science.",
    learnMore: [
      { title: "Why oxygen drops at night", text: "In daylight, algae photosynthesise and release oxygen. At night photosynthesis stops, but fish, algae and bacteria keep using oxygen, so it falls until sunrise. Cloudy days make less oxygen, so the next night starts lower. That's why fish farmers check oxygen before dawn." },
      { title: "Why overfeeding is dangerous", text: "Feed the fish don't eat drifts or sinks, then rots. The bacteria breaking it down use oxygen, so overfeeding can crash the oxygen and harm the fish. Fish also eat less when the water is cold or the oxygen is low." },
      { title: "How this matches FLOATech", text: "FLOATech is an Arduino-based, solar-powered floating unit for tilapia farms. It monitors water parameters in real time, feeds the fish on schedule and runs aeration through a microbubble diffuser, the same jobs your rule cards do here." },
      { title: "A simplified model", text: "Real ponds also depend on stocking density, algae, depth, wind and much more. Use this to understand the ideas, and real measurements and expert advice to run a real farm." }
    ],
    sources: [
      { label: "SRAC 283: Tilapia life history and biology", url: "https://thefishsite.com/articles/tilapia-life-history-and-biology" },
      { label: "FAO tilapia workshop handout", url: "https://www.fao.org/fi/static-media/MeetingDocuments/TiLV/dec2018/p5.pdf" },
      { label: "WorldFish", url: "https://digitalarchive.worldfishcenter.org/bitstream/handle/20.500.12348/5471/97996e83be62f70ef25ae7af4e00f572.pdf" },
      { label: "Oxygen saturation table (California Water Boards)", url: "https://www.waterboards.ca.gov/water_issues/programs/swamp/docs/cwt/guidance/3110en.pdf" }
    ]
  });
})();
