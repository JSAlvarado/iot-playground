// ============ GAME: CURB-E SMART SIGN PATROL ============
// A solar-powered AI smart sign at a No Parking / No Loading zone on a busy street in Davao City, like the proposed
// Curb-E design. Vehicles pull in and out; the player's rule cards decide when to warn and when to upload evidence.
(function () {
  "use strict";
  const { IoT, CurbeModel, IoTUI } = window;
  const SVGNS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };
  const mix = (a, b, t) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FONT = "Outfit, sans-serif";

  // ---- Missions live in the model (pure logic, so the tests can run them) ----
  const missions = CurbeModel.missions;

  // ---- The scene: an original flat drawing of a city street, the curb zone and the Curb-E sign ----
  const CAR_COLORS = ["#2f6db5", "#e0e0dc", "#3c8c5a", "#e3a32b", "#7a4fa3", "#5c636b"];
  let svg, sky, moon, buildings = [], windows, lampGlow, sidewalk, road, wetSheen, cone, box, label, labelBg, labelText, labelSub;
  let cars = [], traffic = [], sirenGlow, sirenDome, rays, fanBlades, battFill, encl, enclText, led, arcs, panel;
  let lastSirens = 0, sirenAt = -1e9, lastUploads = 0, uploadAt = -1e9, fanAngle = 0, lastNow = 0;

  // A flat car, facing right, 180 px long; returns the parts that change colour
  function carShape(parent) {
    const g = mk("g", {}, parent);
    const body = mk("path", { d: "M8 28 Q10 14 30 12 L52 12 L70 -6 Q78 -12 92 -12 L128 -12 Q140 -12 148 -2 L160 12 Q178 14 180 30 L180 46 Q180 52 172 52 L8 52 Q0 52 0 44 Z" }, g);
    mk("path", { d: "M76 -2 L92 -6 L112 -6 L112 12 L64 12 Z", fill: "#cfe3ee" }, g);
    mk("path", { d: "M120 -6 L136 -6 Q144 -4 150 10 L120 12 Z", fill: "#cfe3ee" }, g);
    mk("rect", { x: 2, y: 30, width: 8, height: 8, rx: 2, fill: "#d64f4f" }, g);      // tail light
    const head = mk("rect", { x: 170, y: 26, width: 10, height: 9, rx: 2, fill: "#fff3c4" }, g); // headlight
    mk("rect", { x: 14, y: 36, width: 30, height: 11, rx: 2, fill: "#ffffff", stroke: "#1d2328", "stroke-width": 1.5 }, g); // plate
    for (const x of [42, 142]) { mk("circle", { cx: x, cy: 52, r: 17, fill: "#1d2328" }, g); mk("circle", { cx: x, cy: 52, r: 7, fill: "#9aa3aa" }, g); }
    return { g, body, head };
  }

  const scene = {
    mount(box0) {
      svg = mk("svg", { viewBox: "0 0 800 500", preserveAspectRatio: "xMidYMid slice" });
      sky = mk("rect", { x: 0, y: 0, width: 800, height: 270, fill: "#bfe3f0" }, svg);
      moon = mk("circle", { cx: 400, cy: 70, r: 18, fill: "#eef1f6", opacity: 0 }, svg);
      // City skyline (made-up buildings) with windows that light up at night
      windows = mk("g", { fill: "#ffd77a", opacity: 0 }, svg);
      for (const [x, w, h, c] of [[0, 110, 150, "#8fa3b3"], [100, 90, 200, "#7d93a6"], [200, 120, 120, "#99adbb"], [330, 80, 175, "#8399ab"],
        [420, 130, 140, "#94a8b7"], [560, 100, 210, "#7e94a7"], [670, 130, 160, "#8ea2b2"]]) {
        buildings.push(mk("rect", { x, y: 260 - h, width: w, height: h, fill: c }, svg));
        for (let yy = 260 - h + 18; yy < 245; yy += 30) for (let xx = x + 14; xx < x + w - 16; xx += 26) mk("rect", { x: xx, y: yy, width: 12, height: 14 }, windows);
      }
      svg.append(windows);
      // Street lamp, glowing at night
      lampGlow = mk("path", { d: "M150 150 L95 300 L215 300 Z", fill: "#ffe7a0", opacity: 0 }, svg);
      mk("rect", { x: 146, y: 140, width: 7, height: 160, fill: "#3c434a" }, svg);
      mk("path", { d: "M150 142 h28 v8 h-28 z", fill: "#3c434a" }, svg);
      sidewalk = mk("rect", { x: 0, y: 258, width: 800, height: 42, fill: "#cfc8bb" }, svg);
      // The curb, painted to show the No Parking zone
      mk("rect", { x: 0, y: 296, width: 800, height: 10, fill: "#f4f1ea" }, svg);
      for (let x = 0; x < 800; x += 60) mk("rect", { x, y: 296, width: 30, height: 10, fill: "#c62828" }, svg);
      road = mk("rect", { x: 0, y: 306, width: 800, height: 194, fill: "#4c5359" }, svg);
      wetSheen = mk("rect", { x: 0, y: 306, width: 800, height: 194, fill: "#a9c6d8", opacity: 0 }, svg);
      // The curb zone box and a lane line
      mk("rect", { x: 186, y: 312, width: 270, height: 78, fill: "none", stroke: "#f2c94c", "stroke-width": 4, "stroke-dasharray": "18 10" }, svg);
      for (let x = 0; x < 800; x += 80) mk("rect", { x, y: 404, width: 44, height: 6, fill: "#e8e8e2" }, svg);
      // Passing traffic in the far lane (decoration: these don't stop)
      for (let i = 0; i < 3; i++) { const c = carShape(svg); c.body.setAttribute("fill", CAR_COLORS[(i * 2 + 1) % 6]); traffic.push({ ...c, off: i * 420 }); }
      // Two curb cars that take turns: one pulls in while the other drives off
      for (let i = 0; i < 2; i++) { const c = carShape(svg); cars.push({ ...c, id: 0, x: -300, target: -300 }); }
      // The camera's view of the curb, and the AI's detection box with its label
      cone = mk("path", { d: "M452 159 L200 300 L440 300 Z", fill: "#ffffff", opacity: 0.12 }, svg);
      box = mk("rect", { x: 196, y: 288, width: 236, height: 96, rx: 6, fill: "none", "stroke-width": 5 }, svg);
      label = mk("g", {}, svg);
      labelBg = mk("rect", { x: 196, y: 222, width: 236, height: 62, rx: 8 }, label);
      labelText = mk("text", { x: 208, y: 248, "font-size": 22, "font-weight": 700, fill: "#ffffff", "font-family": FONT }, label);
      labelSub = mk("text", { x: 208, y: 274, "font-size": 19, "font-weight": 600, fill: "#ffffff", "font-family": FONT }, label);
      // The Curb-E sign: solar panel, siren strobe, camera, the No Parking sign and the enclosure with fans
      const signG = mk("g", { transform: "translate(63.2 66) scale(0.78)" }, svg); // the whole sign, sized to stay clear of the weather buttons
      mk("rect", { x: 556, y: 92, width: 9, height: 208, fill: "#5b6268" }, signG);
      panel = mk("path", { d: "M498 98 L622 98 L608 72 L512 72 Z", fill: "#23415a", stroke: "#dfe7ee", "stroke-width": 2 }, signG);
      for (const x of [536, 560, 584]) mk("path", { d: `M${x} 73 L${x + (x - 560) * 0.12} 97`, stroke: "#5e86a3", "stroke-width": 2 }, signG);
      mk("path", { d: "M565 110 h30", stroke: "#5b6268", "stroke-width": 6 }, signG);
      sirenGlow = mk("circle", { cx: 604, cy: 106, r: 40, fill: "#ff5a4f", opacity: 0 }, signG);
      rays = mk("g", { stroke: "#ff7a6e", "stroke-width": 5, "stroke-linecap": "round", opacity: 0 }, signG);
      for (let a = -150; a <= -30; a += 30) { const r = (a * Math.PI) / 180; mk("line", { x1: 604 + Math.cos(r) * 26, y1: 106 + Math.sin(r) * 26, x2: 604 + Math.cos(r) * 44, y2: 106 + Math.sin(r) * 44 }, rays); }
      sirenDome = mk("path", { d: "M590 112 Q590 92 604 92 Q618 92 618 112 Z", fill: "#a32a22" }, signG);
      mk("path", { d: "M556 118 h-40", stroke: "#5b6268", "stroke-width": 6 }, signG);
      mk("rect", { x: 492, y: 108, width: 34, height: 22, rx: 4, fill: "#e9ecef", stroke: "#3c434a", "stroke-width": 2 }, signG);
      mk("circle", { cx: 498, cy: 119, r: 7, fill: "#1d2328" }, signG);
      led = mk("circle", { cx: 518, cy: 114, r: 3, fill: "#3aa35b" }, signG);
      mk("circle", { cx: 560, cy: 172, r: 46, fill: "#c62828" }, signG);
      mk("circle", { cx: 560, cy: 172, r: 34, fill: "#1f5fa8" }, signG);
      mk("path", { d: "M536 148 L584 196", stroke: "#c62828", "stroke-width": 9 }, signG);
      const sub = mk("rect", { x: 512, y: 222, width: 96, height: 18, rx: 3, fill: "#ffffff", stroke: "#c62828", "stroke-width": 2 }, signG);
      sub.setAttribute("aria-hidden", "true");
      const st = mk("text", { x: 560, y: 235, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: "#c62828", "font-family": FONT }, signG);
      st.textContent = "NO LOADING";
      encl = mk("rect", { x: 522, y: 246, width: 78, height: 44, rx: 5, fill: "#d9dde1", stroke: "#3c434a", "stroke-width": 2 }, signG);
      mk("circle", { cx: 541, cy: 268, r: 14, fill: "#3c434a" }, signG);
      fanBlades = mk("g", {}, signG);
      for (const a of [0, 120, 240]) mk("path", { d: "M0 0 L4 -11 Q0 -14 -4 -11 Z", fill: "#e9ecef", transform: `rotate(${a})` }, fanBlades);
      mk("rect", { x: 560, y: 256, width: 32, height: 10, rx: 2, fill: "#ffffff", stroke: "#3c434a", "stroke-width": 1.5 }, signG);
      battFill = mk("rect", { x: 561, y: 257, width: 30, height: 8, fill: "#3aa35b" }, signG);
      arcs = mk("g", { fill: "none", stroke: "#2f6db5", "stroke-width": 3, "stroke-linecap": "round", opacity: 0 }, signG);
      for (const r of [8, 15, 22]) mk("path", { d: `M${576 - r} ${282 - r * 0.2} Q576 ${282 - r * 1.3} ${576 + r} ${282 - r * 0.2}`, transform: "translate(0 -6)" }, arcs);
      enclText = mk("text", { x: 561, y: 286, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: "#c62828", "font-family": FONT }, signG);
      box0.replaceChildren(svg);
    },
    reset(sim) { lastSirens = sim ? sim.state.sirens : 0; lastUploads = sim ? sim.state.uploads : 0; sirenAt = uploadAt = -1e9; cars.forEach((c) => { c.id = 0; c.x = c.target = -300; }); },
    draw(sim, now) {
      if (!svg) return;
      const s = sim.state, hour = IoT.timeOfDay(sim.minutes).hour;
      const dt = Math.min(100, Math.max(0, now - lastNow)); lastNow = now;
      const night = hour < 5.75 || hour > 18.25;
      const dusk = night ? 0 : IoT.clamp(Math.min(hour - 5.75, 18.25 - hour) / 1.2, 0, 1);
      const grey = s.weather === "sunny" ? 0 : s.weather === "cloudy" ? 0.35 : 0.6;
      sky.setAttribute("fill", mix("#121c33", mix("#bfe3f0", "#9aa7b1", grey), dusk));
      moon.setAttribute("opacity", night && s.weather !== "rainy" ? 1 : 0);
      buildings.forEach((b, i) => b.setAttribute("opacity", String(0.55 + 0.45 * dusk)));
      windows.setAttribute("opacity", String(0.9 * (1 - dusk)));
      lampGlow.setAttribute("opacity", String(0.28 * (1 - dusk)));
      sidewalk.setAttribute("fill", mix("#5e5a54", "#cfc8bb", 0.35 + 0.65 * dusk));
      road.setAttribute("fill", mix("#262b30", s.weather === "rainy" ? "#3c4247" : "#4c5359", 0.4 + 0.6 * dusk));
      wetSheen.setAttribute("opacity", s.weather === "rainy" ? 0.12 : 0);
      const slow = reduced() ? 0.25 : 1;

      // Passing traffic: fewer cars at night, headlights on
      traffic.forEach((c, i) => {
        const x = ((now * 0.16 * slow + c.off) % 1260) - 230;
        c.g.setAttribute("transform", `translate(${x.toFixed(1)} 424) scale(0.9)`);
        c.g.setAttribute("opacity", night && i === 2 ? 0 : 1);
        c.head.setAttribute("fill", night ? "#fff7b0" : "#fff3c4");
      });
      // Curb cars: the current vehicle pulls in, the last one drives off to the right
      const v = s.vehicle;
      if (v && !cars.some((c) => c.id === v.id)) {
        const c = cars.find((k) => k.x > 820 || k.x < -250 || k.id !== (s.last && s.last.id)) || cars[0];
        c.id = v.id; c.x = -260; c.body.setAttribute("fill", CAR_COLORS[v.color]);
      }
      cars.forEach((c) => {
        c.target = v && c.id === v.id ? 224 : c.x < -250 ? -300 : 1000;
        const step = (reduced() ? 0.6 : 1.4) * dt;
        c.x += IoT.clamp(c.target - c.x, -step, step);
        c.g.setAttribute("transform", `translate(${c.x.toFixed(1)} 320)`);
        c.head.setAttribute("fill", night ? "#fff7b0" : "#fff3c4");
      });

      // The AI's detection box: amber while a vehicle is stopped, red once warned, green once evidence is uploaded
      const seen = !s.down && v && cars.some((c) => c.id === v.id && Math.abs(c.x - 224) < 4);
      const color = !seen ? "#ffffff" : v.recorded ? "#3aa35b" : v.warned ? "#d6372b" : "#e8a317";
      for (const n of [box, label, cone]) n.setAttribute("display", seen ? "inline" : "none");
      if (seen) {
        box.setAttribute("stroke", color);
        labelBg.setAttribute("fill", v.recorded ? "#24733d" : v.warned ? "#a8231a" : "#8a5d00");
        labelText.textContent = `${v.plate} · ${v.t} min`;
        labelSub.textContent = v.recorded ? "✓ Evidence sent (4G)" : v.warned ? `Plate read ${Math.round(v.conf)}%` : "Stopped at the curb";
        cone.setAttribute("fill", color);
      }

      // Siren strobe: a soft red glow that fades over about two seconds (the real one sounds for 10 seconds)
      if (s.sirens !== lastSirens) { if (s.sirens > lastSirens) sirenAt = now; lastSirens = s.sirens; }
      const k = (now - sirenAt) / 2200;
      const glow = k >= 0 && k < 1 ? (1 - k) * (0.65 + 0.35 * Math.cos(2 * Math.PI * k * 2)) : 0;
      sirenGlow.setAttribute("opacity", (glow * 0.55).toFixed(2));
      rays.setAttribute("opacity", glow.toFixed(2));
      sirenDome.setAttribute("fill", glow > 0.05 ? "#ff5a4f" : "#a32a22");
      // 4G upload: signal arcs over the enclosure
      if (s.uploads !== lastUploads) { if (s.uploads > lastUploads) uploadAt = now; lastUploads = s.uploads; }
      const u = (now - uploadAt) / 1800;
      arcs.setAttribute("opacity", u >= 0 && u < 1 ? (1 - u).toFixed(2) : 0);
      // Enclosure: turns warmer in colour as it heats, the fans spin, the battery bar shows the charge
      encl.setAttribute("fill", mix("#d9dde1", "#f0a070", IoT.clamp((s.temp - 40) / 20, 0, 1)));
      if (s.fanOn) fanAngle = (fanAngle + dt * 0.9 * slow) % 360;
      fanBlades.setAttribute("transform", `translate(541 268) rotate(${fanAngle.toFixed(1)})`);
      battFill.setAttribute("width", (30 * s.battery / 100).toFixed(1));
      battFill.setAttribute("fill", s.battery < 15 ? "#d64f4f" : s.battery < 30 ? "#e8a317" : "#3aa35b");
      led.setAttribute("fill", s.down ? "#5b6268" : "#3aa35b");
      enclText.textContent = s.down === "heat" ? "TOO HOT" : s.down === "power" ? "NO POWER" : "";
      panel.setAttribute("fill", s.sun > 0.2 ? "#2b5576" : "#1c3247");
    }
  };

  // ---- The Evidence tab: what Curb-E sent to its website, newest first ----
  const VERDICT = {
    recorded: ["good", "Uploaded: clear record"], moved: ["good", "Warned: the driver moved on"],
    unclear: ["warn", "Unclear photo: plate not sure enough"], brief: ["bad", "False alarm: only a brief stop"],
    siren: ["bad", "False alarm: siren on a brief stop"], missed: ["bad", "Missed: parked and left with no record"]
  };
  const dom = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function photo(r) { // a little camera snapshot: the car and its plate, darker at night, streaked in rain
    const g = mk("svg", { viewBox: "0 0 120 72", class: "ev-photo", "aria-hidden": "true" });
    mk("rect", { width: 120, height: 72, fill: r.night ? "#26303d" : "#9fb3c2" }, g);
    mk("rect", { y: 48, width: 120, height: 24, fill: r.night ? "#2b2f33" : "#5b6168" }, g);
    mk("rect", { x: 22, y: 30, width: 76, height: 24, rx: 7, fill: CAR_COLORS[r.color] }, g);
    mk("path", { d: "M34 30 L44 18 H76 L86 30 Z", fill: CAR_COLORS[r.color] }, g);
    mk("rect", { x: 44, y: 40, width: 32, height: 11, rx: 2, fill: "#ffffff", stroke: "#222", "stroke-width": 1 }, g);
    const t = mk("text", { x: 60, y: 48.5, "text-anchor": "middle", "font-size": 7.5, "font-weight": 700, fill: "#111", "font-family": FONT }, g); t.textContent = r.plate;
    for (const x of [30, 90]) mk("circle", { cx: x, cy: 55, r: 6, fill: "#1d2328" }, g);
    if (r.rain) for (let i = 0; i < 9; i++) mk("path", { d: `M${8 + i * 13} ${4 + (i % 3) * 9} l-3 9`, stroke: "#dfe8f0", "stroke-width": 1.2 }, g);
    return g;
  }
  function renderEvidence(sim, panel) {
    const s = sim.state;
    const list = s.evidence.slice().reverse();
    const key = s.evidence.length + ":" + s.caught + ":" + s.missed + ":" + s.falseAlarms;
    if (panel.dataset.key === key) return; // nothing new since the last redraw
    panel.dataset.key = key;
    const head = [dom("h2", null, "Evidence: Curb-E's website"),
      dom("p", null, "Every record the sign sent over 4G, newest first, as the traffic office would review it. Caught = recorded, or warned and moved on. False alarms include unclear photos and flagged brief stops.")];
    const tally = dom("div", "ev-tally");
    for (const [cls, n, label] of [["good", s.caught, "caught"], ["bad", s.missed, "missed"], ["warn", s.falseAlarms, "false alarms"]]) {
      const c = dom("div", "ev-count " + cls); c.append(dom("b", null, String(n)), dom("span", null, label)); tally.append(c);
    }
    const items = dom("ol", "ev-list");
    if (!list.length) items.append(dom("li", "hint", "No records yet. Press play: when your rules send the siren or an upload, it appears here."));
    for (const r of list) {
      const [lv, text] = VERDICT[r.verdict] || ["warn", r.verdict];
      const li = dom("li", "ev " + lv);
      const info = dom("div", "ev-info");
      info.append(dom("b", null, r.plate), dom("span", "ev-meta", `${IoT.clockText(r.minutes)} · stopped ${r.stopped} min${r.conf ? ` · plate read ${r.conf}%` : ""}`), dom("span", "ev-verdict", text));
      li.append(photo(r), info);
      items.append(li);
    }
    panel.replaceChildren(...head, tally, items);
  }

  window.CurbeMissions = missions; // for the automated mission tests

  const LEVEL = { clear: "good", stopped: "good", warned: "warn", recorded: "good", low: "warn", warm: "warn", hot: "bad", off: "bad" };
  window.IoTGame = IoTUI.start({
    id: "curbe", title: "Curb-E Smart Sign Patrol", short: "Curb-E", model: CurbeModel, options: { weather: "sunny", airHigh: 31 },
    accent: ["#b3261e", "#fbe9e7"],
    music: { bpm: 100, wave: "triangle", chords: [[38, 50, 53, 57, 60], [43, 55, 59, 62, 65], [36, 48, 52, 55, 59], [45, 57, 60, 64, 67]], scale: [74, 76, 77, 79, 81, 84] },
    credit: { text: "Based on the Curb-E student design project (Holy Cross of Davao College). It's a proposed design; this game simulates how it is meant to work. All vehicles and plates in the game are made up." },
    sceneLabel: "A city street with a No Parking zone. A solar-powered smart sign with a camera, a siren and a solar panel watches the curb.",
    howTo: ["Cars stop at the red curb. Most stop for a minute or two. Some park, and that blocks the road.",
      "Curb-E's camera counts how long a car has been Stopped. Tap a gauge to learn more.",
      "The example rules sound the siren after 3 minutes, then upload a photo once the camera is more than 80% sure of the number plate.",
      "Open the Evidence tab to see every photo Curb-E uploaded, like the traffic office's website: green is a good record, orange an unclear photo, red a false alarm or a missed car.",
      "Open Missions and press Play. Catch parked cars, but don't flag drivers who only stopped briefly!"],
    sensors: [
      { id: "stopped", label: "Stopped", short: "Stop", icon: "⏱️", unit: "min", decimals: 0, min: 0, max: 30, good: [0, 3], warn: [3, 10000],
        learn: { title: "Stopped time (minutes)", text: "Curb-E's cameras feed an AI model (YOLO) that finds vehicles in each picture and follows them. If a vehicle stays in the zone, the sign counts how long it has been stopped. Cars often stop for a moment: stuck in traffic, giving way, a quick stop. A good rule waits longer than those brief stops before it flags anyone. The manuscript gives no time limit, so in this game you choose it. That's the big idea: a threshold." } },
      { id: "plate", label: "Plate read", short: "Plate", icon: "🔍", unit: "%", decimals: 0, min: 0, max: 100, good: [75, 100], warn: [0, 75],
        learn: { title: "Plate-read confidence (%)", text: "In this game, after the warning, the camera zooms in and OCR software reads the number plate. It also says how sure it is. Sure reads come fast on a bright day. At night (street lights only) and in rain they take longer and stay lower. This shows 0 when no warned vehicle is in view. In this game a read below 75% counts as unclear, because it might name the wrong car. These numbers are game values, not figures from the manuscript." } },
      { id: "battery", label: "Battery", icon: "🔋", unit: "%", decimals: 0, min: 0, max: 100, good: [30, 100], warn: [10, 30],
        learn: { title: "Solar battery (%)", text: "Curb-E is off-grid. A solar panel charges a LiFePO4 battery through an MPPT charge controller, which gets the most power from the panel as the light changes. The battery runs the sign at night and on cloudy days. A UPS HAT keeps the Raspberry Pi going for a short while if the main power drops. In the game the cameras, computer and 4G modem use power all the time, and the fans add a little more." } },
      { id: "temp", label: "Box temp", short: "Box", icon: "🌡️", unit: "°C", decimals: 0, min: 20, max: 70, good: [20, 50], warn: [50, 60],
        learn: { title: "Enclosure temperature (°C)", text: "The electronics sit in a sealed metal box in the sun. On hot afternoons it gets much hotter inside than the air outside. The Raspberry Pi slows itself down when its chip passes 80 °C, which would make the AI slow. Curb-E has two cooling fans for this. In the game the sign shuts down if the air in the box passes 60 °C (a game value), so run the fans before it gets there." } }
    ],
    switches: [{ id: "fan", label: "Cooling fans" }],
    events: [{ id: "siren", label: "Siren strobe (10 s)", button: "Siren" }, { id: "upload", label: "Capture and upload evidence", button: "Upload" }],
    ruleSensors: ["stopped", "plate", "temp", "battery"], ruleSwitches: ["fan"], ruleEvents: [], ruleIfEvents: ["siren", "upload"],
    defaultRules: [{ kind: "if", sensor: "stopped", op: ">", value: 3, actuator: "siren" }, { kind: "if", sensor: "plate", op: ">", value: 80, actuator: "upload" }],
    env: [
      { type: "choice", label: "Weather", options: [{ value: "sunny", label: "Sunny" }, { value: "cloudy", label: "Cloudy" }, { value: "rainy", label: "Rainy" }],
        get: (sim) => sim.state.weather, set: (sim, v) => { sim.state.weather = v; } },
      { type: "range", label: "Day's high", min: 26, max: 38, step: 1, unit: " °C", get: (sim) => sim.state.airHigh, set: (sim, v) => { sim.state.airHigh = v; } }
    ],
    missions, scene,
    missionsIntro: "Each mission sets the street, the weather and the battery. Your rule cards do the patrol. The score is fair: caught violators, missed ones, and false alarms on drivers who did nothing wrong.",
    eventSounds: { siren: "siren", upload: "shutter" },
    // The sky for the weather layer and its sounds: the chosen weather all day, darkness from dusk to dawn
    weather: (sim) => { const h = IoT.timeOfDay(sim.minutes).hour; return { sky: sim.state.weather, night: h < 5.75 || h > 18.25 }; },
    soundState: (sim) => { const s = sim.state, h = IoT.timeOfDay(sim.minutes).hour; return { ambience: ["traffic", "city"], night: h < 5.75 || h > 18.25, rain: s.weather === "rainy", devices: { fan: s.fanOn } }; },
    status: (sim) => { const s = sim.state, m = CurbeModel.mood(s); return { level: LEVEL[m.id], text: `${m.text} · caught ${s.caught} · missed ${s.missed} · false alarms ${s.falseAlarms}` }; },
    // The Evidence tab: Curb-E's website, where the traffic office checks every record the sign sent
    extraTabs: [{ id: "evidence", label: "Evidence", after: "rules", render: renderEvidence }],
    rulesIntro: "This is how Curb-E's computer decides what to do. An IF rule on the siren or the upload starts it once, each time the condition becomes true. An IF rule on the fans keeps them on while it's true.",
    rulesTip: "Try changing the limit: IF Stopped is above 4 THEN Siren strobe START. Too low and you flag drivers who only paused (false alarms). Too high and parked cars drive off before you catch them. Keep the upload rule on Plate read, not on Stopped, so only clear photos are sent. For hot days: IF Box temp is above 45 THEN Cooling fans ON UNTIL 40.",
    codeIntro: "Your rule cards written as an Arduino-style sketch. Curb-E's real computer is a Raspberry Pi 5, which would usually run this logic in Python next to the YOLO and OCR code, but the decisions are the same. The read...() functions stand in for the AI and sensor code, and the pin numbers are Raspberry Pi GPIO pins.",
    codeSpec: {
      title: "Curb-E smart sign controller (Raspberry Pi 5)",
      sensors: { stopped: { fn: "readStoppedMinutes", unit: "min", label: "Minutes the vehicle has been stopped (YOLO tracking on the Arducam 64MP Hawkeye cameras)" },
        plate: { fn: "readPlateConfidence", unit: "%", label: "Plate-read confidence from the OCR" },
        temp: { fn: "readEnclosureTemperature", unit: "°C", label: "Enclosure temperature" },
        battery: { fn: "readBatteryPercent", unit: "%", label: "LiFePO4 battery level (solar panel + MPPT charge controller)" } },
      actuators: { siren: { pin: 17, label: "12 V alarm siren strobe through a relay (GPIO 17), 10 seconds", kind: "event", pulseMs: 10000 },
        upload: { pin: 27, label: "Evidence task (GPIO 27 signal): photo, plate, time and place sent over the 4G LTE USB modem", kind: "event", pulseMs: 100 },
        fan: { pin: 22, label: "Two cooling fans through a relay (GPIO 22)", kind: "switch" } }
    },
    learnIntro: "What Curb-E's sensors measure and why it matters. The game is simplified so it runs in a browser. The 10-second siren and the list of parts come from the manuscript; the time limits, plate-read numbers, power and temperature numbers are game values.",
    learnMore: [
      { title: "Thresholds and false alarms", text: "Every smart sensor needs a limit: when is a stop long enough to count? Set it too low and the sign flags innocent drivers. That's a false alarm, and people stop trusting the sign. Set it too high and real violators get away (a miss). Good engineers test their limits and count both kinds of mistakes, just like this game's tally." },
      { title: "Fair evidence", text: "In the manuscript, Curb-E records a picture, the plate number, the time and the location, and sends them to a secure database. A website shows violations to the traffic office, and drivers can check for themselves. Evidence is only useful if it is right, so a careful system sends only clear plate reads and lets a person review them. The goal is road safety, not catching people out. In this game the siren warns first, and many drivers simply move on." },
      { title: "Why it matters", text: "The World Health Organization says road crashes kill more than a million people a year. Vehicles parked or loading in the wrong place block lanes and force others to swerve. Curb-E is proposed to help in a busy city like Davao, where enforcers can't watch every corner." },
      { title: "A simplified model", text: "Real traffic, cameras and AI are far messier: vehicles hide each other, plates get dirty, the law sets the rules, and real systems are tested for a long time. The vehicles here are random and made up. Use this to understand the ideas, not as a measure of how well a real sign would work." }
    ],
    sources: [
      { label: "Raspberry Pi documentation (thermal throttling at 80–85 °C)", url: "https://www.raspberrypi.com/documentation/computers/raspberry-pi.html" },
      { label: "Raspberry Pi 5", url: "https://www.raspberrypi.com/products/raspberry-pi-5/" },
      { label: "Ultralytics YOLO docs", url: "https://docs.ultralytics.com/" },
      { label: "Battery University: lithium iron phosphate", url: "https://batteryuniversity.com/article/bu-205-types-of-lithium-ion" },
      { label: "WHO: road traffic injuries", url: "https://www.who.int/news-room/fact-sheets/detail/road-traffic-injuries" }
    ]
  });
})();
