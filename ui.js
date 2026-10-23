// ============ IOT PLAYGROUND UI: the game screen every game shares ============
// A game describes itself (sensors, actuators, rule choices, missions, scene) and IoTUI.start(game) builds the
// screen. On phones everything fits on one screen with no page scrolling: the scene (with the clock, weather
// buttons and status on top of it), a row of gauges, a row of controls, and a tab area that fills the rest and
// scrolls inside itself. Tabs: Rules, Missions, Graph, Code, Learn and World.
//
// Optional game fields: accent: [color, softColor], music: { bpm, wave, chords, scale } (see sound.js),
// weather(sim) → { sky: "sunny" | "cloudy" | "rainy", night, rain: 0–1 } for the weather layer and its sounds,
// sensors[].icon (an emoji shown on the gauge), howTo: [3–4 short steps], credit: { text, url? } and
// ruleIfEvents: [event ids an IF rule may start, like a UV cycle], slowMotion(sim) → true to slow time down while
// something short is happening, extraTabs: [{ id, label, after: "rules", render(sim, panel) }] for a game's own
// tab (redrawn about once a second while it's open).
(function (root) {
  "use strict";
  const { IoT } = root;
  const SND = root.IoTSound || { init() {}, fx() {}, update() {}, button: () => null }; // sound is optional
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined) n.append(kid);
    return n;
  };
  const SPEEDS = [{ id: "pause", label: "❚❚", aria: "Pause", rate: 0 }, { id: "slow", label: "1×", aria: "Slow: 5 minutes per second", rate: 5 },
    { id: "normal", label: "6×", aria: "Normal: 30 minutes per second", rate: 30 }, { id: "fast", label: "36×", aria: "Fast: 3 hours per second", rate: 180 }];
  const WEATHER_ICON = { sunny: "☀️", cloudy: "☁️", rainy: "🌧️" };
  const HOW_TO = [
    "Watch the gauges. Green means healthy; tap one to learn what it measures.",
    "Switch devices yourself with Auto / On / Off, or press the action buttons.",
    "Write rule cards in the Rules tab so the controller does it for you, like IF oxygen is below 4 THEN aerator ON.",
    "Open Missions and press Play. Your rules have to keep everything healthy until the time is up."
  ];

  function level(sensor, v) {
    if (v >= sensor.good[0] && v <= sensor.good[1]) return "good";
    if (sensor.warn && v >= sensor.warn[0] && v <= sensor.warn[1]) return "warn";
    return "bad";
  }
  const LEVEL_TEXT = { good: "Good", warn: "Watch", bad: "Problem" };

  function start(game) {
    document.body.dataset.game = game.id;
    if (game.accent) { document.body.style.setProperty("--accent", game.accent[0]); document.body.style.setProperty("--accent-soft", game.accent[1]); }
    SND.init({ theme: game.id, music: game.music });
    const KEY = "iotpg:" + game.id;
    const saved = IoT.store.get(KEY, {});
    let rules = Array.isArray(saved.rules) ? saved.rules : JSON.parse(JSON.stringify(game.defaultRules));
    let stars = saved.stars || {};
    let speed = SPEEDS[2];
    let sim, mission = null, tab = saved.tab || "rules", seenHelp = !!saved.seenHelp;
    const save = () => IoT.store.set(KEY, { rules, stars, tab, seenHelp });
    const ifEvents = game.ruleIfEvents || [];

    // Free play starts from the game's options; a mission starts from its own options only, exactly as the
    // tests play it, so free-play settings (like a week of sunny weather) can't leak into a mission
    function newSim(options = {}, forMission = false) {
      sim = IoT.createSim(game.model, forMission ? { ...options } : { ...game.options, ...options });
      sim.rules = rules;
      game.scene.reset && game.scene.reset(sim);
    }
    newSim();

    // ---- Top bar ----
    const speedBox = el("div", { class: "speed", role: "group", "aria-label": "Speed" },
      SPEEDS.map((s) => el("button", { type: "button", "aria-label": s.aria, "aria-pressed": String(s === speed), text: s.label,
        onclick: () => setSpeed(s) })));
    const helpBtn = el("button", { type: "button", class: "icon-btn", "aria-label": "How to play", text: "?", onclick: () => openHelp() });
    const bar = el("header", { class: "bar" },
      el("a", { class: "btn back", href: "./", "aria-label": "Back to all games" }, "←", el("span", { class: "wide-only", text: " Games" })),
      el("h1", { text: game.short || game.title, title: game.title }), helpBtn, SND.button(), speedBox);

    // ---- The stage: the scene with the clock, the weather buttons and the status line on top ----
    const sceneBox = el("div", { class: "scene", role: "img", "aria-label": game.sceneLabel });
    const sceneClock = el("span", { class: "scene-clock", "aria-hidden": "true" });
    const statusDot = el("span", { class: "dot" });
    const statusText = el("span");
    const status = el("p", { class: "status", "aria-live": "polite" }, statusDot, statusText);
    const toast = el("p", { class: "toast", "aria-hidden": "true" });
    const wxCanvas = el("canvas", { class: "wx", "aria-hidden": "true" });

    // World controls: a "Weather" choice becomes icon buttons on the scene; everything else lives in the World tab
    const envInputs = [];
    let wxButtons = null;
    const worldControls = el("div", { class: "env" });
    for (const c of game.env) {
      if (c.type === "choice") {
        const isWeather = /weather/i.test(c.label);
        const chips = el("div", { class: isWeather ? "wx-pick" : "chips", role: "group", "aria-label": c.label });
        for (const opt of c.options) chips.append(el("button", { type: "button", class: isWeather ? "wx-btn" : "chip", "data-v": opt.value, "aria-pressed": "false",
          "aria-label": isWeather ? opt.label : null, title: isWeather ? opt.label : null, text: isWeather ? (WEATHER_ICON[opt.value] || opt.label) : opt.label,
          onclick: () => { c.set(sim, opt.value); syncEnv(); SND.fx("tap"); } }));
        if (isWeather) wxButtons = chips; else worldControls.append(el("div", { class: "env-row" }, el("span", { text: c.label }), chips));
        envInputs.push(() => chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(c.get(sim))))));
      } else {
        const out = el("output");
        const input = el("input", { type: "range", min: c.min, max: c.max, step: c.step, "aria-label": c.label,
          oninput: (e) => { c.set(sim, +e.target.value); syncEnv(); } });
        worldControls.append(el("label", {}, el("span", { text: c.label }), input, out));
        envInputs.push(() => { input.value = c.get(sim); out.textContent = c.get(sim) + c.unit; });
      }
    }
    const syncEnv = () => envInputs.forEach((f) => f());
    const stage = el("div", { class: "stage" }, sceneBox, wxCanvas, sceneClock, wxButtons, el("div", { class: "stage-foot" }, toast, status));

    // ---- Gauges: compact on phones, one tap opens what the sensor means ----
    const gauges = el("div", { class: "gauges", "data-n": String(game.sensors.length) });
    const gaugeEls = game.sensors.map((s) => {
      const value = el("div", { class: "value" }), pill = el("span", { class: "pill" }), fill = el("i", { class: "fill" });
      const lo = (s.good[0] - s.min) / (s.max - s.min) * 100, hi = (s.good[1] - s.min) / (s.max - s.min) * 100;
      const box = el("button", { type: "button", class: "gauge", "aria-label": s.label + ": tap to learn more", onclick: () => openSheet(s.learn.title, s.learn.text) },
        el("div", { class: "label" }, el("span", { class: "name" }, s.icon ? el("b", { class: "ico", "aria-hidden": "true", text: s.icon }) : null, s.short || s.label), pill), value,
        el("div", { class: "track" }, el("i", { class: "band", style: `left:${lo}%;width:${hi - lo}%` }), fill));
      gauges.append(box);
      return { s, box, value, pill, fill };
    });

    // ---- Manual controls ----
    // On phones each switch shows only its current mode, and tapping it steps Auto → On → Off (one small button
    // instead of three); from 900px wide all three buttons show.
    const manual = el("div", { class: "manual" });
    const compact = () => root.matchMedia && root.matchMedia("(max-width: 899px)").matches;
    const MODES = ["auto", "on", "off"];
    for (const sw of game.switches) {
      const seg = el("div", { class: "seg", role: "group", "aria-label": sw.label }, el("span", { text: sw.label }));
      const setMode = (mode) => { sim.manual[sw.id] = mode; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode))); };
      for (const mode of MODES) {
        seg.append(el("button", { type: "button", "data-mode": mode, "aria-pressed": String(mode === "auto"), text: mode === "auto" ? "Auto" : mode === "on" ? "On" : "Off",
          "aria-label": sw.label + " " + mode,
          onclick: (e) => { const pressed = e.currentTarget.getAttribute("aria-pressed") === "true"; setMode(pressed && compact() ? MODES[(MODES.indexOf(mode) + 1) % 3] : mode); } }));
      }
      manual.append(seg);
    }
    for (const ev of game.events) manual.append(el("button", { type: "button", class: "btn btn--small", text: ev.button, onclick: () => sim.trigger(ev.id) }));
    const resetSwitches = () => manual.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === "auto")));

    // A strip that shows the running mission on every tab
    const stripText = el("span"), stripBar = el("i");
    const strip = el("div", { class: "strip", hidden: true, "aria-live": "polite" }, stripText, el("div", { class: "progress" }, stripBar));

    // ---- Tabs ----
    const TABS = [["rules", "Rules"], ["missions", "Missions"], ["graph", "Graph"], ["code", "Code"], ["learn", "Learn"], ["world", "World"]];
    for (const x of game.extraTabs || []) TABS.splice(TABS.findIndex(([id]) => id === (x.after || "rules")) + 1, 0, [x.id, x.label]);
    const extra = Object.fromEntries((game.extraTabs || []).map((x) => [x.id, x]));
    const tabBar = el("div", { class: "tabs", role: "tablist", "data-n": String(TABS.length) });
    const panels = {};
    for (const [id, label] of TABS) {
      tabBar.append(el("button", { type: "button", role: "tab", id: "tab-" + id, "aria-controls": "panel-" + id, "aria-selected": String(id === tab), text: label,
        onclick: () => showTab(id) }));
      panels[id] = el("section", { class: "panel " + id, role: "tabpanel", id: "panel-" + id, "aria-labelledby": "tab-" + id, hidden: id !== tab, tabindex: "0" });
    }
    if (!panels[tab]) tab = "rules";
    function showTab(id) {
      tab = id; save();
      tabBar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.id === "tab-" + id)));
      for (const [k, p] of Object.entries(panels)) p.hidden = k !== id;
      panels[id].scrollTop = 0;
      if (id === "code") renderCode();
      if (id === "graph") renderGraph();
      if (extra[id]) extra[id].render(sim, panels[id]);
    }

    // Rules
    const ruleList = el("div", { class: "rules" });
    const sensorById = Object.fromEntries(game.sensors.map((s) => [s.id, s]));
    const actName = (id) => (game.switches.concat(game.events).find((a) => a.id === id) || {}).label || id;
    const isEvent = (id) => game.events.some((e) => e.id === id);
    function renderRules() {
      ruleList.replaceChildren();
      if (!rules.length) ruleList.append(el("p", { class: "hint", text: "No rules yet: nothing happens automatically. Add one below." }));
      rules.forEach((r, i) => {
        const changed = () => { save(); renderCode(); };
        const del = el("button", { type: "button", class: "del", "aria-label": "Delete this rule", text: "×", onclick: () => { rules.splice(i, 1); SND.fx("remove"); save(); renderRules(); renderCode(); } });
        if (r.kind === "if") {
          const sSel = el("select", { "aria-label": "Sensor", onchange: (e) => { r.sensor = e.target.value; unit.textContent = sensorById[r.sensor].unit; changed(); } },
            game.ruleSensors.map((id) => el("option", { value: id, text: sensorById[id].label, selected: id === r.sensor })));
          const opSel = el("select", { "aria-label": "Comparison", onchange: (e) => { r.op = e.target.value; changed(); } },
            el("option", { value: "<", text: "is below", selected: r.op === "<" }), el("option", { value: ">", text: "is above", selected: r.op === ">" }));
          const num = el("input", { type: "number", step: "0.1", inputmode: "decimal", value: r.value, "aria-label": "Value",
            oninput: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { r.value = v; changed(); } } });
          const unit = el("span", { class: "muted", text: sensorById[r.sensor].unit });
          // An IF rule can switch a device ON, or START an action (like a timed UV cycle) once each time it turns true
          const verb = el("span", { text: isEvent(r.actuator) ? "START" : "ON" });
          const aSel = el("select", { "aria-label": "Device", onchange: (e) => { r.actuator = e.target.value; verb.textContent = isEvent(r.actuator) ? "START" : "ON"; changed(); } },
            game.ruleSwitches.concat(ifEvents).map((id) => el("option", { value: id, text: actName(id), selected: id === r.actuator })));
          // Optional "until": keep the device on until the reading passes this level the other way (hysteresis)
          const until = el("input", { type: "number", step: "0.1", inputmode: "decimal", value: typeof r.until === "number" ? r.until : "", placeholder: "optional", "aria-label": "Stay on until this value (optional)",
            oninput: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) r.until = v; else delete r.until; changed(); } });
          ruleList.append(el("div", { class: "rule" }, el("span", { class: "kw", text: "IF" }), sSel, opSel, num, unit,
            el("span", { class: "kw", text: "THEN" }), aSel, verb, el("span", { class: "kw", text: "UNTIL" }), until, del));
        } else {
          const t = el("input", { type: "time", value: r.time, "aria-label": "Time", oninput: (e) => { if (e.target.value) { r.time = e.target.value; changed(); } } });
          const aSel = el("select", { "aria-label": "Action", onchange: (e) => { r.actuator = e.target.value; changed(); } },
            game.ruleEvents.map((id) => el("option", { value: id, text: actName(id), selected: id === r.actuator })));
          ruleList.append(el("div", { class: "rule" }, el("span", { class: "kw", text: "EVERY DAY AT" }), t, el("span", { class: "kw", text: "DO" }), aSel, del));
        }
      });
    }
    const firstDevice = game.ruleSwitches[0] || ifEvents[0];
    const addIf = el("button", { type: "button", class: "btn", text: "+ IF rule",
      onclick: () => { rules.push({ kind: "if", sensor: game.ruleSensors[0], op: "<", value: sensorById[game.ruleSensors[0]].good[0], actuator: firstDevice }); SND.fx("pop"); save(); renderRules(); renderCode(); } });
    const addAt = game.ruleEvents.length ? el("button", { type: "button", class: "btn", text: "+ Time rule",
      onclick: () => { rules.push({ kind: "at", time: "12:00", actuator: game.ruleEvents[0] }); SND.fx("pop"); save(); renderRules(); renderCode(); } }) : null;
    const resetRules = el("button", { type: "button", class: "btn", text: "Reset to examples",
      onclick: () => { rules.splice(0, rules.length, ...JSON.parse(JSON.stringify(game.defaultRules))); save(); renderRules(); renderCode(); } });
    panels.rules.append(el("h2", { text: "Rule cards: the controller's brain" }), el("p", { text: game.rulesIntro }),
      ruleList, el("div", { class: "add" }, addIf, addAt, resetRules), el("p", { class: "hint", text: game.rulesTip }));

    // Missions
    const banner = el("div", { class: "banner", hidden: true, "aria-live": "polite" });
    const missionList = el("div", { class: "missions" });
    function renderMissions() {
      missionList.replaceChildren(...game.missions.map((m) => el("div", { class: "mission" },
        el("h3", { text: m.title }), el("p", { text: m.goal }),
        el("span", { class: "stars", "aria-label": (stars[m.id] || 0) + " of 3 stars", text: "★".repeat(stars[m.id] || 0) + "☆".repeat(3 - (stars[m.id] || 0)) }),
        el("button", { type: "button", class: "btn btn--accent", text: mission && mission.def === m ? "Restart" : "Play", onclick: () => startMission(m) }))));
    }
    function startMission(m) {
      newSim(m.options, true);
      resetSwitches();
      mission = { def: m, start: sim.minutes };
      banner.hidden = true; strip.hidden = false; strip.dataset.kind = "run";
      stripText.textContent = m.title + ": starting…"; stripBar.style.width = "0%";
      syncEnv(); renderMissions(); setSpeed(SPEEDS[2]);
      SND.fx("start");
    }
    const freePlay = el("button", { type: "button", class: "btn", text: "Free play (no mission)",
      onclick: () => { mission = null; banner.hidden = true; strip.hidden = true; newSim(); resetSwitches(); syncEnv(); renderMissions(); } });
    panels.missions.append(el("h2", { text: "Missions" }), el("p", { text: game.missionsIntro || "Each mission sets up the world; your rule cards do the work. Change rules any time, even mid-mission." }),
      banner, missionList, el("div", { class: "add" }, freePlay));

    // Graph
    const graphSel = el("select", { "aria-label": "Sensor to graph", onchange: renderGraph }, game.sensors.map((s) => el("option", { value: s.id, text: s.label })));
    const graphBox = el("div");
    panels.graph.append(el("h2", { text: "Graph: the last day" }), el("p", { text: "Sensor readings every 10 virtual minutes. The green band is the healthy range." }), graphSel, graphBox);
    function renderGraph() {
      const s = sensorById[graphSel.value];
      const pts = sim.history.slice(-144);
      const W = 600, H = 200, L = 44, B = 24;
      const x = (i) => L + (i / Math.max(1, pts.length - 1)) * (W - L - 8);
      const y = (v) => 8 + (1 - (v - s.min) / (s.max - s.min)) * (H - B - 8);
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `${s.label} over the last ${Math.round(pts.length / 6)} virtual hours`);
      const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); return n; };
      add("rect", { class: "band", x: L, width: W - L - 8, y: y(s.good[1]), height: Math.max(0, y(s.good[0]) - y(s.good[1])) });
      for (const v of [s.min, (s.min + s.max) / 2, s.max]) { add("line", { class: "axis", x1: L, x2: W - 8, y1: y(v), y2: y(v) }); add("text", { x: 2, y: y(v) + 4 }, String(+v.toFixed(1))); }
      if (pts.length > 1) add("polyline", { class: "line", points: pts.map((p, i) => `${x(i).toFixed(1)},${y(IoT.clamp(p[s.id], s.min, s.max)).toFixed(1)}`).join(" ") });
      else add("text", { x: L + 8, y: H / 2 }, "Press play: the graph fills as time passes.");
      if (pts.length > 1) { add("text", { x: L, y: H - 6 }, IoT.clockText(pts[0].minutes)); add("text", { x: W - 8, y: H - 6, "text-anchor": "end" }, IoT.clockText(pts[pts.length - 1].minutes)); }
      graphBox.replaceChildren(svg);
    }

    // Code
    const codePre = el("pre", { tabindex: "0", "aria-label": "Arduino code" });
    const copyBtn = el("button", { type: "button", class: "btn", text: "Copy code",
      onclick: async () => { try { await navigator.clipboard.writeText(codePre.textContent); copyBtn.textContent = "Copied"; } catch (e) { copyBtn.textContent = "Select the code to copy it"; } setTimeout(() => (copyBtn.textContent = "Copy code"), 1800); } });
    panels.code.append(el("h2", { text: "See the real code" }), el("p", { text: game.codeIntro }), codePre, el("div", { class: "add" }, copyBtn));
    const renderCode = () => { codePre.textContent = IoT.arduinoCode(rules, game.codeSpec); };

    // Learn
    panels.learn.append(el("h2", { text: "Learn" }), el("p", { text: game.learnIntro }),
      game.credit ? el("p", { class: "credit" }, game.credit.text, game.credit.url ? [" ", el("a", { href: game.credit.url, text: "More", target: "_blank", rel: "noopener" })] : null) : null,
      el("dl", {}, [...game.sensors.map((s) => [el("dt", { text: s.learn.title }), el("dd", { text: s.learn.text })]),
        ...game.learnMore.map((t) => [el("dt", { text: t.title }), el("dd", { text: t.text })])]),
      el("p", { class: "sources" }, "Sources: ", ...game.sources.flatMap((s, i) => [i ? " · " : "", el("a", { href: s.url, text: s.label, target: "_blank", rel: "noopener" })])));

    // World: weather and other settings for free play, and the log of what happened
    const logBox = el("div", { class: "log", "aria-label": "What happened" });
    panels.world.append(el("h2", { text: "World" }),
      el("p", { text: game.env.length ? "Change the world for free play. Missions set these for you." : "What happened, newest first." }),
      worldControls, el("h3", { class: "sub", text: "What happened" }), logBox);

    // ---- Sheets: one sensor explained, and How to play ----
    const sheetTitle = el("h2"), sheetBody = el("div"), sheetClose = el("button", { type: "button", class: "btn btn--primary", text: "Close", onclick: () => closeSheet() });
    const sheet = el("div", { class: "sheet", hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-title",
      onclick: (e) => { if (e.target === sheet) closeSheet(); } }, el("div", {}, sheetTitle, sheetBody, sheetClose));
    sheetTitle.id = "sheet-title";
    let sheetFrom = null, pausedFor = null;
    function openSheet(title, body) {
      sheetFrom = document.activeElement; sheetTitle.textContent = title;
      sheetBody.replaceChildren(...(Array.isArray(body) ? [el("ol", { class: "steps" }, body.map((t) => el("li", { text: t })))] : [el("p", { text: body })]));
      sheet.hidden = false; sheetClose.focus();
    }
    function closeSheet() {
      sheet.hidden = true;
      if (pausedFor) { setSpeed(pausedFor); pausedFor = null; }
      if (sheetFrom) sheetFrom.focus();
    }
    function openHelp() {
      if (speed.rate) { pausedFor = speed; setSpeed(SPEEDS[0]); }
      openSheet("How to play " + (game.short || game.title), game.howTo || HOW_TO);
      sheetClose.textContent = "Let's play";
      if (!seenHelp) { seenHelp = true; save(); }
    }
    sheetClose.addEventListener("click", () => { sheetClose.textContent = "Close"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

    const dock = el("div", { class: "dock" }, strip, tabBar, ...Object.values(panels));
    document.body.replaceChildren(bar, el("main", { class: "shell" }, stage, gauges, manual, dock), sheet);
    game.scene.mount(sceneBox, sim);
    game.scene.draw(sim, performance.now()); // draw once right away, before the first animation frame

    // ---- Weather layer: rain, drifting cloud shadows or warm sunlight drawn over the scene ----
    const wx = root.IoTWeather ? root.IoTWeather.attach(wxCanvas, { onThunder: (delay) => SND.fx("thunder", delay) }) : null;

    // ---- Running ----
    function setSpeed(s) { speed = s; speedBox.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === s))); }
    let last = performance.now(), carry = 0, lastUi = 0, lastGraph = 0, lastAlert = 0, toastUntil = 0, lastLog = 0;
    const now = () => performance.now();
    function frame(t) {
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      // A game can ask for slow motion while something short happens (a 3-minute UV-C cycle would otherwise
      // flash past in a tenth of a second): then time runs at most 1 virtual minute per real second
      const slow = !!(speed.rate && game.slowMotion && game.slowMotion(sim));
      sceneClock.dataset.slow = String(slow);
      carry += (slow ? Math.min(speed.rate, 1) : speed.rate) * dt;
      let n = Math.floor(carry);
      carry -= n;
      const heard = new Set();
      while (n-- > 0) {
        for (const ev of sim.tick().events) heard.add(ev);
        if (mission) {
          const r = mission.def.check(sim, (sim.minutes - mission.start) / 60);
          mission.result = r;
          if (r.state !== "running") { finishMission(r); break; }
        }
      }
      for (const ev of heard) SND.fx((game.eventSounds && game.eventSounds[ev]) || "pop");
      game.scene.draw(sim, t);
      if (wx) wx.draw(game.weather ? game.weather(sim) : null, t, speed.rate);
      if (t - lastUi > 200) { updateUi(); lastUi = t; }
      if (tab === "graph" && t - lastGraph > 1000) { renderGraph(); lastGraph = t; }
      if (extra[tab] && t - lastGraph > 1000) { extra[tab].render(sim, panels[tab]); lastGraph = t; }
      requestAnimationFrame(frame);
    }
    function finishMission(r) {
      setSpeed(SPEEDS[0]);
      if (r.state === "won") { stars[mission.def.id] = Math.max(stars[mission.def.id] || 0, r.stars || 1); save(); }
      SND.fx(r.state === "won" ? "win" : "lose", r.stars || 1);
      strip.dataset.kind = r.state;
      stripText.textContent = (r.state === "won" ? "🎉 " : "") + r.message;
      stripBar.style.width = r.state === "won" ? "100%" : "0%";
      banner.hidden = false; banner.dataset.kind = r.state;
      banner.replaceChildren(document.createTextNode(r.message));
      mission = { ...mission, done: true };
      renderMissions();
      mission = null;
    }
    function updateUi() {
      sceneClock.textContent = IoT.clockText(sim.minutes);
      const readings = game.model.readings(sim.state);
      for (const g of gaugeEls) {
        const v = readings[g.s.id];
        const lv = level(g.s, v);
        if (lv === "bad" && g.last && g.last !== "bad" && speed.rate && now() - lastAlert > 4000) { SND.fx("alert"); lastAlert = now(); }
        g.last = lv;
        g.box.dataset.level = lv === "good" ? "" : lv;
        g.pill.textContent = LEVEL_TEXT[lv];
        g.value.replaceChildren(document.createTextNode(v.toFixed(g.s.decimals)), el("small", { text: g.s.unit }));
        g.fill.style.left = IoT.clamp((v - g.s.min) / (g.s.max - g.s.min) * 100, 0, 99.5) + "%";
      }
      const snd = { hour: IoT.timeOfDay(sim.minutes).hour, ...(game.soundState ? game.soundState(sim) : {}) };
      const w = game.weather ? game.weather(sim) : null;
      SND.update(w ? { ...snd, weather: w.sky, night: snd.night ?? w.night, rain: w.sky === "rainy" && (w.rain ?? 1) > 0 } : snd);
      const st = game.status(sim);
      status.dataset.level = st.level;
      statusText.textContent = st.text;
      // The newest log line pops up over the scene for a few seconds
      const newest = sim.log[sim.log.length - 1];
      if (newest && newest.minutes !== lastLog && newest !== toast._last) { toast._last = newest; lastLog = newest.minutes; toast.textContent = newest.text; toastUntil = now() + 2600; }
      toast.dataset.show = String(now() < toastUntil);
      logBox.replaceChildren(...sim.log.slice(-12).reverse().map((l) => el("div", { text: IoT.clockText(l.minutes) + " · " + l.text })));
      if (mission && mission.result && mission.result.state === "running") {
        stripText.textContent = mission.def.title + ": " + mission.result.message;
        stripBar.style.width = Math.round(mission.result.progress * 100) + "%";
      }
    }

    renderRules(); renderMissions(); renderCode(); syncEnv(); showTab(tab); updateUi();
    requestAnimationFrame(frame);
    if (!seenHelp) setTimeout(openHelp, 400);
    // refresh() redraws the scene and the readings at once (the animation loop normally does this)
    return { get sim() { return sim; }, rules, startMission, showTab, setSpeed: (id) => setSpeed(SPEEDS.find((s) => s.id === id)),
      refresh(t = performance.now()) { game.scene.draw(sim, t); if (wx) wx.draw(game.weather ? game.weather(sim) : null, t, speed.rate); updateUi(); if (tab === "graph") renderGraph(); if (extra[tab]) extra[tab].render(sim, panels[tab]); } };
  }

  root.IoTUI = { start, level };
})(window);
