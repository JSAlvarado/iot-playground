// ============ IOT PLAYGROUND UI: the game screen every game shares ============
// A game describes itself (sensors, actuators, rule choices, missions, scene) and IoTUI.start(game) builds the
// screen: clock and speed, the scene, gauges, manual controls, and tabs for Rules, Missions, Graph, Code and Learn.
(function (root) {
  "use strict";
  const { IoT } = root;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined) n.append(kid);
    return n;
  };
  const SPEEDS = [{ id: "pause", label: "❚❚", aria: "Pause", rate: 0 }, { id: "slow", label: "1×", aria: "Slow: 5 minutes per second", rate: 5 },
    { id: "normal", label: "6×", aria: "Normal: 30 minutes per second", rate: 30 }, { id: "fast", label: "36×", aria: "Fast: 3 hours per second", rate: 180 }];

  function level(sensor, v) {
    if (v >= sensor.good[0] && v <= sensor.good[1]) return "good";
    if (sensor.warn && v >= sensor.warn[0] && v <= sensor.warn[1]) return "warn";
    return "bad";
  }
  const LEVEL_TEXT = { good: "Good", warn: "Watch", bad: "Problem" };

  function start(game) {
    document.body.dataset.game = game.id;
    const KEY = "iotpg:" + game.id;
    const saved = IoT.store.get(KEY, {});
    let rules = Array.isArray(saved.rules) ? saved.rules : JSON.parse(JSON.stringify(game.defaultRules));
    let stars = saved.stars || {};
    let speed = SPEEDS[2];
    let sim, mission = null, tab = saved.tab || "rules";
    const save = () => IoT.store.set(KEY, { rules, stars, tab });

    function newSim(options = {}) {
      sim = IoT.createSim(game.model, { ...game.options, ...options });
      sim.rules = rules;
      game.scene.reset && game.scene.reset(sim);
    }
    newSim();

    // ---- Screen ----
    const clock = el("span", { class: "clock", "aria-live": "off" });
    const speedBox = el("div", { class: "speed", role: "group", "aria-label": "Speed" },
      SPEEDS.map((s) => el("button", { type: "button", "aria-label": s.aria, "aria-pressed": String(s === speed), text: s.label,
        onclick: () => setSpeed(s) })));
    const bar = el("header", { class: "bar" },
      el("a", { class: "btn back", href: "./", "aria-label": "Back to all games" }, "←", el("span", { class: "wide-only", text: " Games" })), el("h1", { text: game.short || game.title, title: game.title }), clock, speedBox);
    const sceneBox = el("div", { class: "scene", role: "img", "aria-label": game.sceneLabel });
    const sceneClock = el("span", { class: "scene-clock", "aria-hidden": "true" }); // the clock over the scene, on phones
    const statusDot = el("span", { class: "dot" });
    const statusText = el("span");
    const status = el("p", { class: "status", "aria-live": "polite" }, statusDot, statusText);
    const logBox = el("div", { class: "log", "aria-label": "What happened" });

    const manual = el("div", { class: "manual" });
    for (const sw of game.switches) {
      const seg = el("div", { class: "seg", role: "group", "aria-label": sw.label }, el("span", { text: sw.label }));
      for (const mode of ["auto", "on", "off"]) {
        seg.append(el("button", { type: "button", "data-mode": mode, "aria-pressed": String(mode === "auto"), text: mode === "auto" ? "Auto" : mode === "on" ? "On" : "Off",
          onclick: () => { sim.manual[sw.id] = mode; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode))); } }));
      }
      manual.append(seg);
    }
    for (const ev of game.events) manual.append(el("button", { type: "button", class: "btn", text: ev.button, onclick: () => sim.trigger(ev.id) }));

    // World controls (weather, temperature) for free play
    const env = el("div", { class: "env" });
    const envInputs = [];
    for (const c of game.env) {
      if (c.type === "choice") {
        const chips = el("div", { class: "chips", role: "group", "aria-label": c.label });
        for (const opt of c.options) chips.append(el("button", { type: "button", class: "chip", "data-v": opt.value, "aria-pressed": "false", text: opt.label,
          onclick: () => { c.set(sim, opt.value); syncEnv(); } }));
        env.append(chips);
        envInputs.push(() => chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(c.get(sim))))));
      } else {
        const out = el("output");
        const input = el("input", { type: "range", min: c.min, max: c.max, step: c.step, "aria-label": c.label,
          oninput: (e) => { c.set(sim, +e.target.value); syncEnv(); } });
        env.append(el("label", {}, el("span", { text: c.label }), input, out));
        envInputs.push(() => { input.value = c.get(sim); out.textContent = c.get(sim) + c.unit; });
      }
    }
    const syncEnv = () => envInputs.forEach((f) => f());

    const gauges = el("div", { class: "gauges" });
    const gaugeEls = game.sensors.map((s) => {
      const value = el("div", { class: "value" }), pill = el("span", { class: "pill" }), fill = el("i", { class: "fill" });
      const lo = (s.good[0] - s.min) / (s.max - s.min) * 100, hi = (s.good[1] - s.min) / (s.max - s.min) * 100;
      const box = el("button", { type: "button", class: "gauge", "aria-label": s.label + ": tap to learn more", onclick: () => openSheet(s) },
        el("div", { class: "label" }, el("span", { text: s.label }), pill), value,
        el("div", { class: "track" }, el("i", { class: "band", style: `left:${lo}%;width:${hi - lo}%` }), fill));
      gauges.append(box);
      return { s, box, value, pill, fill };
    });

    // ---- Tabs ----
    const TABS = [["rules", "Rules"], ["missions", "Missions"], ["graph", "Graph"], ["code", "Code"], ["learn", "Learn"]];
    const tabBar = el("div", { class: "tabs", role: "tablist" });
    const panels = {};
    for (const [id, label] of TABS) {
      tabBar.append(el("button", { type: "button", role: "tab", id: "tab-" + id, "aria-controls": "panel-" + id, "aria-selected": String(id === tab), text: label,
        onclick: () => showTab(id) }));
      panels[id] = el("section", { class: "panel " + id, role: "tabpanel", id: "panel-" + id, "aria-labelledby": "tab-" + id, hidden: id !== tab });
    }
    function showTab(id) {
      tab = id; save();
      tabBar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.id === "tab-" + id)));
      for (const [k, p] of Object.entries(panels)) p.hidden = k !== id;
      if (id === "code") renderCode();
      if (id === "graph") renderGraph();
    }

    // Rules
    const ruleList = el("div", { class: "rules" });
    const sensorById = Object.fromEntries(game.sensors.map((s) => [s.id, s]));
    const actName = (id) => (game.switches.concat(game.events).find((a) => a.id === id) || {}).label || id;
    function renderRules() {
      ruleList.replaceChildren();
      if (!rules.length) ruleList.append(el("p", { class: "hint", text: "No rules yet: nothing happens automatically. Add one below." }));
      rules.forEach((r, i) => {
        const changed = () => { save(); renderCode(); };
        const del = el("button", { type: "button", class: "del", "aria-label": "Delete this rule", text: "×", onclick: () => { rules.splice(i, 1); save(); renderRules(); renderCode(); } });
        if (r.kind === "if") {
          const sSel = el("select", { "aria-label": "Sensor", onchange: (e) => { r.sensor = e.target.value; unit.textContent = sensorById[r.sensor].unit; changed(); } },
            game.ruleSensors.map((id) => el("option", { value: id, text: sensorById[id].label, selected: id === r.sensor })));
          const opSel = el("select", { "aria-label": "Comparison", onchange: (e) => { r.op = e.target.value; changed(); } },
            el("option", { value: "<", text: "is below", selected: r.op === "<" }), el("option", { value: ">", text: "is above", selected: r.op === ">" }));
          const num = el("input", { type: "number", step: "0.1", value: r.value, "aria-label": "Value",
            oninput: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { r.value = v; changed(); } } });
          const unit = el("span", { class: "muted", text: sensorById[r.sensor].unit });
          const aSel = el("select", { "aria-label": "Device", onchange: (e) => { r.actuator = e.target.value; changed(); } },
            game.ruleSwitches.map((id) => el("option", { value: id, text: actName(id), selected: id === r.actuator })));
          ruleList.append(el("div", { class: "rule" }, el("span", { class: "kw", text: "IF" }), sSel, opSel, num, unit,
            el("span", { class: "kw", text: "THEN" }), aSel, el("span", { text: "ON" }), del));
        } else {
          const t = el("input", { type: "time", value: r.time, "aria-label": "Time", oninput: (e) => { if (e.target.value) { r.time = e.target.value; changed(); } } });
          const aSel = el("select", { "aria-label": "Action", onchange: (e) => { r.actuator = e.target.value; changed(); } },
            game.ruleEvents.map((id) => el("option", { value: id, text: actName(id), selected: id === r.actuator })));
          ruleList.append(el("div", { class: "rule" }, el("span", { class: "kw", text: "EVERY DAY AT" }), t, el("span", { class: "kw", text: "DO" }), aSel, del));
        }
      });
    }
    const addIf = el("button", { type: "button", class: "btn", text: "+ IF rule",
      onclick: () => { rules.push({ kind: "if", sensor: game.ruleSensors[0], op: "<", value: sensorById[game.ruleSensors[0]].good[0], actuator: game.ruleSwitches[0] }); save(); renderRules(); renderCode(); } });
    const addAt = game.ruleEvents.length ? el("button", { type: "button", class: "btn", text: "+ Time rule",
      onclick: () => { rules.push({ kind: "at", time: "12:00", actuator: game.ruleEvents[0] }); save(); renderRules(); renderCode(); } }) : null;
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
      newSim(m.options);
      mission = { def: m, start: sim.minutes };
      banner.hidden = false; banner.dataset.kind = "run";
      syncEnv(); renderMissions(); setSpeed(SPEEDS[2]);
    }
    const freePlay = el("button", { type: "button", class: "btn", text: "Free play (no mission)",
      onclick: () => { mission = null; banner.hidden = true; newSim(); syncEnv(); renderMissions(); } });
    panels.missions.append(el("h2", { text: "Missions" }), el("p", { text: "Each mission sets up the pond or garden; your rule cards do the work. Change rules any time, even mid-mission." }),
      banner, missionList, el("div", { class: "add" }, freePlay));

    // Graph
    const graphSel = el("select", { "aria-label": "Sensor to graph", onchange: renderGraph }, game.sensors.map((s) => el("option", { value: s.id, text: s.label })));
    const graphBox = el("div");
    panels.graph.append(el("h2", { text: "Graph: the last day" }), el("p", { text: "Sensor readings every 10 virtual minutes. The green band is the healthy range." }), graphSel, graphBox);
    function renderGraph() {
      const s = sensorById[graphSel.value];
      const pts = sim.history.slice(-144);
      const W = 600, H = 200, L = 36, B = 22;
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
      el("dl", {}, [...game.sensors.map((s) => [el("dt", { text: s.learn.title }), el("dd", { text: s.learn.text })]),
        ...game.learnMore.map((t) => [el("dt", { text: t.title }), el("dd", { text: t.text })])]),
      el("p", { class: "sources" }, "Sources: ", ...game.sources.flatMap((s, i) => [i ? " · " : "", el("a", { href: s.url, text: s.label, target: "_blank", rel: "noopener" })])));

    // Sensor sheet
    const sheetTitle = el("h2"), sheetText = el("p"), sheetClose = el("button", { type: "button", class: "btn btn--primary", text: "Close", onclick: () => closeSheet() });
    const sheet = el("div", { class: "sheet", hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "sheet-title",
      onclick: (e) => { if (e.target === sheet) closeSheet(); } }, el("div", {}, sheetTitle, sheetText, sheetClose));
    sheetTitle.id = "sheet-title";
    let sheetFrom = null;
    function openSheet(s) { sheetFrom = document.activeElement; sheetTitle.textContent = s.learn.title; sheetText.textContent = s.learn.text; sheet.hidden = false; sheetClose.focus(); }
    function closeSheet() { sheet.hidden = true; if (sheetFrom) sheetFrom.focus(); }
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

    const sceneCol = el("div", { class: "scene-col" }, sceneBox, status, manual, env, logBox);
    const side = el("div", {}, gauges, el("div", { style: "height:14px" }), tabBar, ...Object.values(panels));
    document.body.replaceChildren(bar, el("main", { class: "wrap" }, el("div", { class: "layout" }, sceneCol, side)), sheet);
    game.scene.mount(sceneBox, sim);
    sceneBox.append(sceneClock);
    game.scene.draw(sim, performance.now()); // draw once right away, before the first animation frame

    // ---- Running ----
    function setSpeed(s) { speed = s; speedBox.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === s))); }
    let last = performance.now(), carry = 0, lastUi = 0, lastGraph = 0;
    function frame(now) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      carry += speed.rate * dt;
      let n = Math.floor(carry);
      carry -= n;
      while (n-- > 0) {
        sim.tick();
        if (mission) {
          const r = mission.def.check(sim, (sim.minutes - mission.start) / 60);
          mission.result = r;
          if (r.state !== "running") { finishMission(r); break; }
        }
      }
      game.scene.draw(sim, now);
      if (now - lastUi > 200) { updateUi(); lastUi = now; }
      if (tab === "graph" && now - lastGraph > 1000) { renderGraph(); lastGraph = now; }
      requestAnimationFrame(frame);
    }
    function finishMission(r) {
      setSpeed(SPEEDS[0]);
      banner.dataset.kind = r.state;
      if (r.state === "won") { stars[mission.def.id] = Math.max(stars[mission.def.id] || 0, r.stars || 1); save(); }
      banner.replaceChildren(document.createTextNode(r.message));
      mission = { ...mission, done: true };
      renderMissions();
      mission = null;
    }
    function updateUi() {
      clock.textContent = IoT.clockText(sim.minutes);
      sceneClock.textContent = clock.textContent;
      const readings = game.model.readings(sim.state);
      for (const g of gaugeEls) {
        const v = readings[g.s.id];
        const lv = level(g.s, v);
        g.box.dataset.level = lv === "good" ? "" : lv;
        g.pill.textContent = LEVEL_TEXT[lv];
        g.value.replaceChildren(document.createTextNode(v.toFixed(g.s.decimals)), el("small", { text: g.s.unit }));
        g.fill.style.left = IoT.clamp((v - g.s.min) / (g.s.max - g.s.min) * 100, 0, 99.5) + "%";
      }
      const st = game.status(sim);
      status.dataset.level = st.level;
      statusText.textContent = st.text;
      logBox.replaceChildren(...sim.log.slice(-4).reverse().map((l) => el("div", { text: IoT.clockText(l.minutes) + " · " + l.text })));
      if (mission && mission.result && mission.result.state === "running") {
        banner.replaceChildren(document.createTextNode(mission.def.title + ": " + mission.result.message),
          el("div", { class: "progress" }, el("i", { style: `width:${Math.round(mission.result.progress * 100)}%` })));
      }
    }

    renderRules(); renderMissions(); renderCode(); syncEnv(); showTab(tab); updateUi();
    requestAnimationFrame(frame);
    // refresh() redraws the scene and the readings at once (the animation loop normally does this)
    return { get sim() { return sim; }, rules, startMission, setSpeed: (id) => setSpeed(SPEEDS.find((s) => s.id === id)),
      refresh(now = performance.now()) { game.scene.draw(sim, now); updateUi(); if (tab === "graph") renderGraph(); } };
  }

  root.IoTUI = { start, level };
})(window);
