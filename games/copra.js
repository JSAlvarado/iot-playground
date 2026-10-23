// ============ GAME: COPRA POWER (COPRAWATT) ============
// A coconut farm with a biomass burner: one fire dries copra, boils water for a steam generator and, with a small
// solar panel, charges the family's battery. Based on the CopraWatt student design proposal.
(function () {
  "use strict";
  const { IoT, CopraModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const FONT = "Outfit, sans-serif";

  // ---- Missions: the checks live in the model so the tests can run them ----
  const missions = CopraModel.missions;

  // ---- The scene: an original flat drawing of the farm, the dryer shed, the boiler and the house ----
  let svg, sky, sunEl, cloudG, ground, copra = [], shimmer, flames = [], fireGlow, fuelPile = [], steamPuffs = [], smokePuffs = [], haze,
    fanBlades, pulley, battFill, houseWin, warnSign, solarPanel, wireGen, wireSun;
  let fanAngle = 0, pulleyAngle = 0, lastNow = 0;
  function palm(x, y, s, parent) {
    const g = mk("g", { transform: `translate(${x} ${y}) scale(${s})` }, parent);
    mk("path", { d: "M0 0 C6 -60 -4 -120 10 -180", stroke: "#7a5a3a", "stroke-width": 12, fill: "none", "stroke-linecap": "round" }, g);
    for (const a of [-70, -35, 0, 35, 70, 110, -110]) mk("path", { d: "M10 -180 q40 -20 80 10 q-40 -6 -80 -10 z", fill: "#3f7d3a", transform: `rotate(${a} 10 -180)` }, g);
    for (const [cx, cy] of [[4, -172], [16, -170], [10, -164]]) mk("circle", { cx, cy, r: 7, fill: "#6b4a2a" }, g);
    return g;
  }
  const scene = {
    mount(box) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 320, fill: "#bfe3f0" }, svg);
      sunEl = mk("circle", { r: 24, fill: "#ffd25a" }, svg);
      cloudG = mk("g", { fill: "#ffffff" }, svg);
      for (const [x, y, s] of [[200, 90, 1], [470, 70, 1.2], [650, 110, 0.9]]) {
        const g = mk("g", { transform: `translate(${x} ${y}) scale(${s})` }, cloudG);
        mk("ellipse", { cx: 0, cy: 10, rx: 56, ry: 20 }, g); mk("ellipse", { cx: -22, cy: 0, rx: 28, ry: 22 }, g); mk("ellipse", { cx: 18, cy: -6, rx: 32, ry: 26 }, g);
      }
      // Background palms and the farm ground; everything on the ground sits 30 units higher, clear of the status line
      ground = mk("rect", { x: 0, y: 270, width: 800, height: 230, fill: "#7aa451" }, svg);
      svg = mk("g", { transform: "translate(0 -30)" }, svg);
      palm(250, 300, 0.55, svg); palm(600, 300, 0.6, svg);
      mk("ellipse", { cx: 420, cy: 400, rx: 330, ry: 46, fill: "#b89a6a" }, svg);
      palm(95, 420, 1.1, svg); palm(735, 430, 1.05, svg);

      // Wires to the battery: from the generator and from the solar panel (they glow while power flows)
      wireGen = mk("path", { d: "M255 382 C330 410 520 410 612 378", stroke: "#444", "stroke-width": 3, fill: "none" }, svg);
      wireSun = mk("path", { d: "M520 190 C580 200 590 300 640 352", stroke: "#444", "stroke-width": 3, fill: "none" }, svg);

      // Boiler with a pressure valve, and the steam generator (alternator) with its belt pulley
      mk("path", { d: "M262 330 H340", stroke: "#5b5f63", "stroke-width": 10 }, svg);
      mk("rect", { x: 160, y: 250, width: 104, height: 84, rx: 22, fill: "#8c949a", stroke: "#4b5156", "stroke-width": 3 }, svg);
      mk("rect", { x: 222, y: 236, width: 12, height: 16, fill: "#4b5156" }, svg);
      const bl = mk("text", { x: 212, y: 297, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: "#24292d", "font-family": FONT }, svg); bl.textContent = "BOILER";
      for (let i = 0; i < 4; i++) steamPuffs.push(mk("circle", { r: 10, fill: "#ffffff", opacity: 0 }, svg));
      mk("rect", { x: 165, y: 345, width: 92, height: 52, rx: 8, fill: "#2f5d7c" }, svg);
      pulley = mk("g", {}, svg);
      mk("circle", { cx: 0, cy: 0, r: 17, fill: "#d7dde2", stroke: "#24292d", "stroke-width": 3 }, pulley);
      for (const a of [0, 60, 120]) mk("path", { d: "M-15 0 H15", stroke: "#24292d", "stroke-width": 3, transform: `rotate(${a})` }, pulley);
      const gl = mk("text", { x: 236, y: 376, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#ffffff", "font-family": FONT }, svg); gl.textContent = "GEN";

      // The dryer shed: roof with the solar panel, the copra rack and the burner underneath
      mk("path", { d: "M282 202 L312 166 H512 L542 202 Z", fill: "#5a3a22" }, svg);
      solarPanel = mk("path", { d: "M405 170 H506 L528 198 H422 Z", fill: "#23415a", stroke: "#9fb6c8", "stroke-width": 2 }, svg);
      for (const t of [0.33, 0.66]) mk("path", { d: `M${405 + 101 * t + 0} 170 L${422 + 106 * t} 198`, stroke: "#9fb6c8", "stroke-width": 1.5 }, svg);
      mk("rect", { x: 300, y: 200, width: 222, height: 122, fill: "#c08a55" }, svg);
      mk("rect", { x: 318, y: 214, width: 186, height: 76, rx: 4, fill: "#3b2a1f" }, svg);
      shimmer = mk("path", { d: "M340 236 q8 -8 16 0 t16 0 t16 0 M400 230 q8 -8 16 0 t16 0 t16 0 M450 240 q8 -8 16 0 t16 0", stroke: "#ffb070", "stroke-width": 2.5, fill: "none", opacity: 0 }, svg);
      mk("path", { d: "M322 276 H500", stroke: "#8a6a4a", "stroke-width": 5 }, svg);
      for (let i = 0; i < 6; i++) copra.push(mk("path", { d: `M${332 + i * 29} 274 a13 11 0 0 1 26 0 Z`, fill: "#f4ecd8", stroke: "#6b4a2a", "stroke-width": 2 }, svg));
      const dl = mk("text", { x: 411, y: 310, "text-anchor": "middle", "font-size": 15, "font-weight": 700, fill: "#3b2a1f", "font-family": FONT }, svg); dl.textContent = "COPRA DRYER";
      mk("rect", { x: 340, y: 322, width: 142, height: 60, fill: "#4a4a4a" }, svg);
      fireGlow = mk("rect", { x: 374, y: 334, width: 74, height: 38, rx: 6, fill: "#1d1d1d" }, svg);
      for (const [x, c, w] of [[388, "#e2531f", 15], [411, "#f08a24", 18], [434, "#e2531f", 15]]) flames.push({ el: mk("path", { d: `M${-w / 2} 0 Q0 -40 ${w / 2} 0 Z`, fill: c }, svg), x });
      flames.push({ el: mk("path", { d: "M-7 0 Q0 -24 7 0 Z", fill: "#ffd25a" }, svg), x: 411 });
      for (let i = 0; i < 4; i++) fuelPile.push(mk("ellipse", { cx: 498 + (i % 2) * 18, cy: 378 - Math.floor(i / 2) * 11, rx: 10, ry: 7, fill: "#6b4a2a", stroke: "#3b2a1f", "stroke-width": 2, opacity: 0 }, svg));

      // Exhaust: a duct to the fan, then up through the cyclone and the carbon filter to the chimney
      mk("rect", { x: 522, y: 228, width: 20, height: 16, fill: "#5c6670" }, svg);
      mk("rect", { x: 551, y: 120, width: 18, height: 96, fill: "#5c6670" }, svg);
      mk("path", { d: "M542 160 H578 L566 196 H554 Z", fill: "#7a848c" }, svg); // cyclone cone
      mk("rect", { x: 546, y: 138, width: 28, height: 18, fill: "#2e5b3f" }, svg); // carbon filter
      mk("circle", { cx: 560, cy: 236, r: 26, fill: "#5c6670", stroke: "#2c3338", "stroke-width": 3 }, svg);
      fanBlades = mk("g", {}, svg);
      for (const a of [0, 120, 240]) mk("path", { d: "M0 0 Q8 -10 0 -21 Q-8 -10 0 0 Z", fill: "#dfe4e8", transform: `rotate(${a})` }, fanBlades);
      mk("circle", { cx: 0, cy: 0, r: 4, fill: "#2c3338" }, fanBlades);
      for (let i = 0; i < 5; i++) smokePuffs.push(mk("circle", { r: 9, fill: "#8d8d8d", opacity: 0 }, svg));
      haze = mk("ellipse", { cx: 420, cy: 270, rx: 150, ry: 70, fill: "#7d7468", opacity: 0 }, svg);

      // The family's house and the 12 V battery
      mk("path", { d: "M592 262 L652 214 L716 262 Z", fill: "#7a5a32" }, svg);
      mk("rect", { x: 602, y: 262, width: 104, height: 78, fill: "#d9b98a" }, svg);
      houseWin = mk("rect", { x: 616, y: 278, width: 30, height: 26, fill: "#3b4a55" }, svg);
      mk("rect", { x: 666, y: 286, width: 26, height: 54, fill: "#8a6a4a" }, svg);
      mk("rect", { x: 612, y: 352, width: 86, height: 44, rx: 6, fill: "#2c3338" }, svg);
      mk("rect", { x: 698, y: 366, width: 6, height: 14, fill: "#2c3338" }, svg);
      mk("rect", { x: 620, y: 372, width: 70, height: 16, rx: 3, fill: "#555d63" }, svg);
      battFill = mk("rect", { x: 620, y: 372, width: 70, height: 16, rx: 3, fill: "#3aa35b" }, svg);
      const bt = mk("text", { x: 655, y: 367, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: "#ffffff", "font-family": FONT }, svg); bt.textContent = "12 V";

      // A warning sign over the shed when carbon monoxide is high
      warnSign = mk("g", { opacity: 0 }, svg);
      mk("path", { d: "M411 92 L441 144 H381 Z", fill: "#ffd25a", stroke: "#24292d", "stroke-width": 4, "stroke-linejoin": "round" }, warnSign);
      const ws = mk("text", { x: 411, y: 138, "text-anchor": "middle", "font-size": 20, "font-weight": 800, fill: "#24292d", "font-family": FONT }, warnSign); ws.textContent = "CO";
      svg = svg.ownerSVGElement;
      box.replaceChildren(svg);
    },
    reset() { fanAngle = 0; pulleyAngle = 0; },
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour;
      const dt = Math.min(100, Math.max(0, now - lastNow)); lastNow = now;
      const daylight = hour > 5.5 && hour < 18.5 ? Math.min(1, Math.sin(Math.PI * (hour - 5.5) / 13) * 2.5) : 0;
      const grey = s.weather === "sunny" ? 0 : s.weather === "cloudy" ? 0.45 : 0.75;
      sky.setAttribute("fill", mix("#1c2742", mix("#bfe3f0", "#9aa6ae", grey), daylight));
      ground.setAttribute("fill", mix("#2f4a2c", mix("#7aa451", "#5f8546", grey), Math.max(0.15, daylight)));
      const visible = hour >= 6 && hour <= 18;
      const t = visible ? (hour - 6) / 12 : ((hour + 6) % 24) / 12;
      sunEl.setAttribute("cx", 100 + 600 * t); sunEl.setAttribute("cy", 260 - Math.sin(Math.PI * t) * 190);
      sunEl.setAttribute("fill", visible ? "#ffd25a" : "#e8ecf2");
      sunEl.setAttribute("opacity", visible ? (s.weather === "sunny" ? 1 : s.weather === "cloudy" ? 0.4 : 0) : 0.9);
      cloudG.setAttribute("opacity", s.weather === "sunny" ? 0 : s.weather === "cloudy" ? 0.85 : 0.6);
      cloudG.setAttribute("fill", s.weather === "rainy" ? "#c9ced2" : "#ffffff");
      // Copra colour: white and wet when fresh, tan when dry, dark brown where it scorched
      const dryness = IoT.clamp((45 - s.moisture) / 38, 0, 1), burnt = IoT.clamp((100 - s.quality) / 40, 0, 1);
      const copraFill = mix(mix("#f4ecd8", "#d9b77c", dryness), "#5e3418", burnt);
      copra.forEach((c) => c.setAttribute("fill", copraFill));
      shimmer.setAttribute("opacity", IoT.clamp((s.dryer - 40) / 30, 0, 0.9).toFixed(2));
      shimmer.setAttribute("transform", `translate(0 ${(-Math.abs(Math.sin(now / 700)) * 6).toFixed(1)})`);
      // Flames grow with the heat; the burner mouth glows
      const fire = IoT.clamp(s.heat / 2, 0, 1.5);
      fireGlow.setAttribute("fill", mix("#1d1d1d", "#7a2a10", Math.min(1, fire)));
      flames.forEach((f, i) => {
        const flick = 1 + Math.sin(now / 120 + i * 1.7) * 0.15;
        f.el.setAttribute("transform", `translate(${f.x} 372) scale(${(0.8 + fire * 0.3).toFixed(2)} ${(fire * flick).toFixed(2)})`);
        f.el.setAttribute("opacity", fire > 0.02 ? 1 : 0);
      });
      fuelPile.forEach((p, i) => p.setAttribute("opacity", i < s.loads.length - 1 ? 1 : 0)); // fuel waiting in the hopper
      // Steam from the boiler valve while the generator runs; the pulley spins
      steamPuffs.forEach((p, i) => {
        const ph = ((now / 1600) + i / 4) % 1;
        p.setAttribute("cx", 228 + Math.sin(ph * 6 + i) * 6); p.setAttribute("cy", 232 - ph * 70); p.setAttribute("r", 8 + ph * 12);
        p.setAttribute("opacity", s.steam ? ((1 - ph) * 0.85).toFixed(2) : 0);
      });
      if (s.steam) pulleyAngle = (pulleyAngle + dt * 0.9) % 360;
      pulley.setAttribute("transform", `translate(196 371) rotate(${pulleyAngle.toFixed(1)})`);
      if (s.fanOn) fanAngle = (fanAngle + dt * 0.7) % 360;
      fanBlades.setAttribute("transform", `translate(560 236) rotate(${fanAngle.toFixed(1)})`);
      // Smoke: out of the chimney when the fan pulls it, hanging around the shed as haze when it doesn't
      smokePuffs.forEach((p, i) => {
        const ph = ((now / 2200) + i / 5) % 1;
        p.setAttribute("cx", 560 + ph * 40 + Math.sin(ph * 5 + i) * 5); p.setAttribute("cy", 116 - ph * 60); p.setAttribute("r", 7 + ph * 14);
        p.setAttribute("opacity", (fire > 0.05 ? (1 - ph) * (s.fanOn ? 0.55 : 0.2) : 0).toFixed(2));
      });
      haze.setAttribute("opacity", IoT.clamp((s.co - 20) / 160, 0, 0.6).toFixed(2));
      warnSign.setAttribute("opacity", s.co >= CopraModel.limits.co.osha ? 1 : 0);
      // Battery, wires and the house lights
      battFill.setAttribute("width", (70 * s.battery / 100).toFixed(1));
      battFill.setAttribute("fill", s.battery < 20 ? "#d64f4f" : s.battery < 30 ? "#e0a030" : "#3aa35b");
      wireGen.setAttribute("stroke", s.genW > 0 ? "#f0b429" : "#444");
      wireSun.setAttribute("stroke", s.solarW > 5 ? "#f0b429" : "#444");
      solarPanel.setAttribute("fill", mix("#1a2f40", "#3d6f96", IoT.clamp(s.sun, 0, 1)));
      const lightsOn = s.powered && (hour >= 18 || hour < 6);
      houseWin.setAttribute("fill", lightsOn ? "#ffd25a" : s.powered ? "#7f9aaa" : "#2a3238");
    }
  };

  window.CopraMissions = missions; // for the automated mission tests

  const LEVEL = { smoke: "bad", scorch: "bad", dark: "bad", cool: "warn", smoky: "warn", warm: "warn", done: "good", graded: "good", drying: "good" };
  window.IoTGame = IoTUI.start({
    id: "copra", title: "Copra Power (CopraWatt)", short: "Copra", model: CopraModel, options: { weather: "sunny", airHigh: 31, fuelType: "shells" },
    accent: ["#8a4b1f", "#f6e7d8"],
    music: { bpm: 88, wave: "triangle", chords: [[43, 55, 59, 62], [41, 53, 57, 60], [48, 60, 64, 67], [43, 55, 59, 62]], scale: [67, 69, 71, 74, 76, 79] },
    sceneLabel: "A coconut farm: a copra dryer with a burner underneath, a boiler and generator, an exhaust fan and chimney, and a house with a battery",
    howTo: ["Coconut shells burn under the dryer. The heat dries the copra and makes steam that charges the battery.",
      "Keep the dryer between 50 and 70 °C. Too cool won't dry it. Too hot burns it.",
      "Smoke has a poison gas called CO. The exhaust fan blows it away. The example rules add fuel and run the fan.",
      "Open Missions and press Play. Use the ☀️ ☁️ 🌧️ buttons to change the weather, and the World tab to change the fuel."],
    credit: { text: "Based on the CopraWatt student design project (Holy Cross of Davao College, 2025). It's a proposed design; this game simulates how it is meant to work. Its burn times, generator watts and charging times are the design's projections, not measurements." },
    sensors: [
      { id: "dryer", label: "Dryer temp", short: "Dryer", icon: "🌡️", unit: "°C", decimals: 0, min: 20, max: 100, good: [50, 70], warn: [45, 72],
        learn: { title: "Dryer temperature (°C)", text: "The CopraWatt design says copra drying needs a steady 50–70 °C. Too cool and the water stays in. Too hot and the outside of the copra scorches, which lowers its quality and price (in this game, scorching starts above 72 °C). A drying study found about 60 °C works well. The fan cools the dryer a little, and in this game hotter fuels like husks or wood make it hotter (a game value: the design only projects burn hours and energy per kilogram). The design uses temperature sensors read by an ESP32." } },
      { id: "moisture", label: "Copra moisture", short: "Copra", icon: "🥥", unit: "%", decimals: 1, min: 0, max: 50, good: [0, 10.9], warn: [10.9, 13.9],
        learn: { title: "Copra moisture (%)", text: "Copra is dried coconut meat, sold to make coconut oil. Fresh meat holds a lot of water. In this game a fresh batch starts at 45% (a game value). A Philippine Department of Agriculture guide grades copra by moisture: Grade 1 is 6–7.9%, Grade 2 is 8–10.9%, Grade 3 is 11–13.9%, and wetter copra isn't graded. Wet copra left cool goes mouldy. The design doesn't list a copra moisture sensor, so think of this as a moisture meter reading." } },
      { id: "co", label: "Carbon monoxide", short: "CO", icon: "💨", unit: "ppm", decimals: 0, min: 0, max: 250, good: [0, 35], warn: [35, 50],
        learn: { title: "Carbon monoxide (ppm)", text: "Carbon monoxide (CO) is a poison gas from fires that don't burn fully. You can't see or smell it. In the US, OSHA's work limit is 50 ppm averaged over 8 hours. NIOSH recommends 35 ppm and says never go above 200 ppm. The game uses these as its warning lines. The design plans a CO sensor, and a cyclone separator and activated carbon filter to clean the smoke. Here the exhaust fan pulls the smoke through them and up the chimney." } },
      { id: "battery", label: "Battery", short: "Battery", icon: "🔋", unit: "%", decimals: 0, min: 0, max: 100, good: [30, 100], warn: [20, 30],
        learn: { title: "Battery (%)", text: "A 12 V 100 Ah LiFePO₄ battery stores the power. The design plans to use only 80% of it (960 Wh) to make it last longer. The steam generator charges it fast while the fire burns. The 100 W solar panel helps in the daytime. The family uses about 85 W in the evening (fan, lights, radio, phones) and 40 W for a fan at night. These are the design's numbers." } }
    ],
    switches: [{ id: "fan", label: "Exhaust fan" }],
    events: [{ id: "fuel", label: "Add fuel (1 kg)", button: "Add fuel" }],
    ruleSensors: ["dryer", "moisture", "co", "battery"], ruleSwitches: ["fan"], ruleEvents: ["fuel"], ruleIfEvents: ["fuel"],
    defaultRules: [{ kind: "if", sensor: "dryer", op: "<", value: 50, actuator: "fuel" }, { kind: "if", sensor: "co", op: ">", value: 35, actuator: "fan" }],
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weather, set: (sim, v) => { sim.state.weather = v; } },
      { type: "choice", label: "Fuel", options: Object.entries(CopraModel.fuels).map(([value, f]) => ({ value, label: `${f.short} ${f.hours} h` })),
        get: (sim) => sim.state.fuelType, set: (sim, v) => { sim.state.fuelType = v; } },
      { type: "range", label: "Day's high", min: 24, max: 36, step: 1, unit: " °C", get: (sim) => sim.state.airHigh, set: (sim, v) => { sim.state.airHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets the weather, the fuel and the battery. Your rule cards run the farm. Change rules any time, even mid-mission.",
    eventSounds: { fuel: "burn" },
    // The sky for the weather layer and its sounds: the chosen weather all day, darkness from dusk to dawn
    weather: (sim) => { const h = IoT.timeOfDay(sim.minutes).hour; return { sky: sim.state.weather, night: h < 5.5 || h > 18.5 }; },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour;
      return { ambience: ["wind"], night: h < 5.5 || h > 19, rain: s.weather === "rainy", devices: { fire: IoT.clamp(s.heat / 2, 0, 1), fan: s.fanOn, steam: s.steam, hum: s.genW > 0 } }; },
    status: (sim) => { const m = CopraModel.mood(sim.state); return { level: LEVEL[m.id], text: m.text }; },
    rulesIntro: "This is how CopraWatt's ESP32 controller decides what to do. An IF rule keeps the fan on while it's true. An IF rule on Add fuel starts once each time it turns true. A time rule runs once a day.",
    rulesTip: "Try: IF Dryer temp is above 66 THEN Exhaust fan ON. The fan clears the smoke and cools the dryer a little, so the copra doesn't scorch. Saving fuel? Try the design's own idea: IF Battery is below 30 THEN Add fuel.",
    codeIntro: "Your rule cards as an Arduino sketch for the ESP32 in the CopraWatt design. A person feeds the burner, so Add fuel sounds a buzzer and shows a message on the OLED screen. The read...() functions stand in for each sensor's real code, and the pins depend on your wiring.",
    codeSpec: {
      title: "CopraWatt dryer and power controller (ESP32)",
      sensors: { dryer: { fn: "readDryerTemperature", unit: "°C", label: "Dryer temperature sensor" }, moisture: { fn: "readCopraMoisture", unit: "%", label: "Copra moisture meter (not in the design's parts list)" },
        co: { fn: "readCarbonMonoxide", unit: "ppm", label: "CO sensor (the design names no model; an MQ-7 is common)" }, battery: { fn: "readBatteryPercent", unit: "%", label: "Battery level from the power monitoring module" } },
      actuators: { fan: { pin: 26, label: "Exhaust fan, through a relay", kind: "switch" }, fuel: { pin: 27, label: "Buzzer and OLED message: add 1 kg of fuel", kind: "event", pulseMs: 2000 } }
    },
    learnIntro: "What the sensors measure and how one fire does three jobs. The numbers from the CopraWatt manuscript are projections from a proposal. The safety and grading lines come from published sources.",
    learnMore: [
      { title: "One fire, three jobs", text: "Coconut farms make piles of shells and husks that are often burned in the open. CopraWatt burns them on purpose: the heat dries copra, boils water for a steam engine, and the engine turns a car alternator that charges a battery. The design projects that 1 kg of dry shells burns about 2.5 hours, husks 1.8, wood 2.2 and leaves only 0.7, so shells last longest." },
      { title: "Steam and sun together", text: "The design projects about 720 W from the generator (612 W reaching the battery), charging 960 Wh in about 1.6 hours. Adding the 100 W solar panel cuts that to about 1.4 hours. Solar alone would take about 10 hours. On rainy days there's no sun-drying and little solar power, which is exactly when the burner matters most. These are projections, not test results." },
      { title: "Clean, safe smoke", text: "Small fires make carbon monoxide and soot. The design adds a cyclone separator (spins out ash) and an activated carbon filter (soaks up gases) on the exhaust, plus gas sensors. The MQ-135 it lists reacts to many gases at once, so it is not made to measure CO by itself. A real CO sensor and good airflow help keep the family safe." },
      { title: "A simplified model", text: "Real dryers depend on airflow, how the copra is cut and stacked, the fuel's dryness, boiler water and more. This game refills the boiler for you and invents its own heating and smoke rates. Use it to understand the ideas, and real measurements and expert advice to run a real dryer." }
    ],
    sources: [
      { label: "OSHA: carbon monoxide limits", url: "https://www.osha.gov/chemicaldata/462" },
      { label: "NIOSH Pocket Guide: carbon monoxide", url: "https://www.cdc.gov/niosh/npg/npgd0105.html" },
      { label: "Department of Agriculture (BAFS): copra technical brief", url: "https://bafs.da.gov.ph/wp-content/uploads/2025/04/TB-Copra_final.pdf" },
      { label: "University of Moratuwa: copra drying study", url: "https://dl.lib.uom.lk/items/66aa639f-d59b-485d-a6ef-ea168e0f3c13" }
    ]
  });
})();
