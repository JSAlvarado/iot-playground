// ============ GAME 5: CIRCUIT PLAYGROUND ============
// Tap a part's leg, then a board pin (or another leg), to add a jumper wire. The circuit runs live: LEDs light,
// the buzzer sounds, and the problems list explains anything a real board wouldn't like. The rules live in
// models/circuit.js; this file draws the board and handles taps.
(function () {
  "use strict";
  const { IoT, CircuitModel: CM } = window;
  const SND = window.IoTSound || { init() {}, fx() {}, update() {}, button: () => null };
  const KEY = "iotpg:circuit";
  const saved = IoT.store.get(KEY, {});
  const stars = saved.stars || {}, allWires = saved.wires || {};
  let ci = Math.max(0, CM.CHALLENGES.findIndex((c) => !stars[c.id])), wires = [], selected = null, analysis = null, burnt = {}, fails = 0, hinted = false, pressed = false;
  const save = () => { allWires[CM.CHALLENGES[ci].id] = wires; IoT.store.set(KEY, { stars, wires: allWires }); };
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined) n.append(kid);
    return n;
  };
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (parent) parent.append(n); return n; };

  // ---- Where every terminal sits ----
  const PIN_POS = {};
  ["D2", "D3", "D4", "D5", "D6", "D7"].forEach((p, i) => (PIN_POS[p] = [50 + i * 60, 72]));
  ["D8", "D9", "D10", "D11", "D12", "D13"].forEach((p, i) => (PIN_POS[p] = [50 + i * 60, 130]));
  ["5V", "GND1", "GND2", "A0", "A1", "A2"].forEach((p, i) => (PIN_POS[p] = [50 + i * 60, 208]));
  const LEGS = {
    led: { a: [-25, 40], k: [25, 30] }, res: { r1: [-55, 0], r2: [55, 0] }, button: { p1: [-40, 40], p2: [40, 40] },
    ldr: { p1: [-25, 40], p2: [25, 40] }, tmp36: { vs: [-35, 40], out: [0, 48], gnd: [35, 40] }, buzzer: { plus: [-25, 40], minus: [25, 40] }
  };
  const LED_COLOR = { red: "#e5383b", yellow: "#f2c230", green: "#2fbf5b" };
  const BANDS = { 220: ["#d33", "#d33", "#7a4a20", "#c9a227"], 10000: ["#7a4a20", "#111", "#f08a1c", "#c9a227"] };
  function termPos(ch, t) {
    if (PIN_POS[t]) return PIN_POS[t];
    const [id, leg] = t.split("."), p = ch.parts.find((q) => q.id === id), o = LEGS[p.type][leg];
    return [p.x + o[0], p.y + o[1]];
  }
  function termName(ch, t) {
    if (PIN_POS[t]) return t.startsWith("GND") ? "GND pin" : `${t} pin`;
    const [id, leg] = t.split("."), p = ch.parts.find((q) => q.id === id);
    return `${p.label}, ${CM.LEG_NAMES[leg]}`;
  }

  // ---- Screen ----
  SND.init({ theme: "circuit" });
  document.body.dataset.game = "circuit";
  const bar = el("header", { class: "bar" },
    el("a", { class: "btn back", href: "./", "aria-label": "Back to all games" }, "←", el("span", { class: "wide-only", text: " Games" })),
    el("h1", { text: "Circuits", title: "Circuit Playground" }), SND.button());
  const svg = mk("svg", { viewBox: "0 0 400 650", class: "board", role: "group", "aria-label": "The board and the parts. Tap a leg, then a pin, to add a wire." });
  const chips = el("nav", { class: "case-list", "aria-label": "Challenges" });
  const goal = el("p", { class: "goal" }), title = el("h2", { class: "case-title", tabindex: "-1" });
  const probs = el("ul", { class: "problems", "aria-live": "polite" });
  const monitor = el("pre", { class: "monitor", "aria-label": "Serial monitor" });
  const controls = el("div", { class: "controls" });
  const feedback = el("div", { class: "feedback", hidden: true, "aria-live": "polite" });
  const wireList = el("ul", { class: "wire-list" });
  const codePre = el("pre", { class: "code-box", tabindex: "0", "aria-label": "Arduino code" });
  const hintBox = el("p", { class: "hint", hidden: true });
  const tools = el("div", { class: "add" },
    el("button", { type: "button", class: "btn btn--accent", text: "Check my circuit", onclick: () => checkNow() }),
    el("button", { type: "button", class: "btn", text: "Hint", onclick: () => { hinted = true; hintBox.hidden = false; hintBox.textContent = CM.CHALLENGES[ci].hint; SND.fx("clue"); } }),
    el("button", { type: "button", class: "btn", text: "Undo", onclick: () => { if (wires.length) { wires.pop(); changed(); SND.fx("unwire"); } } }),
    el("button", { type: "button", class: "btn", text: "Clear wires", onclick: () => { wires = []; changed(); SND.fx("remove"); } }));
  const panel = el("div", { class: "circuit-side" }, title, goal, probs, controls, el("p", { class: "monitor-label", text: "Serial monitor" }), monitor, tools, hintBox, feedback,
    el("h3", { class: "sub", text: "Wires" }), wireList,
    el("h3", { class: "sub", text: "The program on the board" }), el("p", { class: "muted small", text: "The pins in this sketch follow your wiring." }), codePre);
  document.body.replaceChildren(bar, el("main", { class: "wrap circuit" }, chips, el("div", { class: "circuit-layout" }, el("div", { class: "board-col" }, svg), panel)));

  // ---- Draw the board, the parts and the wires ----
  let ledEls = {}, buzEl = null, btnCap = null, wireG, termEls = {};
  function drawStatic() {
    const ch = CM.CHALLENGES[ci];
    svg.replaceChildren();
    ledEls = {}; termEls = {}; buzEl = null; btnCap = null;
    mk("rect", { x: 0, y: 268, width: 400, height: 382, fill: "#e9e4d8" }, svg);
    for (let x = 20; x < 400; x += 20) for (let y = 290; y < 650; y += 20) mk("circle", { cx: x, cy: y, r: 1.6, fill: "#cfc8b8" }, svg);
    mk("rect", { x: 10, y: 22, width: 380, height: 226, rx: 14, fill: "#17647a" }, svg);
    mk("rect", { x: 150, y: 152, width: 100, height: 30, rx: 3, fill: "#0e3d4a" }, svg);
    mk("text", { x: 200, y: 172, "text-anchor": "middle", "font-size": 11, fill: "#bfe0ea", "font-family": "Outfit, sans-serif" }, svg).textContent = "Uno-style · 5 V";
    for (const [p, [x, y]] of Object.entries(PIN_POS)) {
      mk("text", { x, y: y - 16, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#ffffff", "font-family": "Outfit, sans-serif" }, svg).textContent = p.startsWith("GND") ? "GND" : p;
      mk("rect", { x: x - 9, y: y - 9, width: 18, height: 18, rx: 2, fill: "#0b2b34" }, svg);
    }
    // Parts
    for (const p of ch.parts) {
      const g = mk("g", { transform: `translate(${p.x} ${p.y})` }, svg);
      const leg = (dx, dy, fromX, fromY) => mk("path", { d: `M${fromX} ${fromY} L${dx} ${dy}`, stroke: "#9aa1a6", "stroke-width": 3, "stroke-linecap": "round" }, g);
      if (p.type === "led") {
        leg(-25, 40, -6, -12); leg(25, 30, 6, -12);
        const glow = mk("circle", { cx: 0, cy: -30, r: 34, fill: LED_COLOR[p.color], opacity: 0 }, g);
        const dome = mk("path", { d: "M-15 -12 V-30 A15 15 0 0 1 15 -30 V-12 Z", fill: LED_COLOR[p.color], opacity: 0.45, stroke: "#555", "stroke-width": 1 }, g);
        const smoke = mk("circle", { cx: 0, cy: -58, r: 10, fill: "#777", opacity: 0 }, g);
        mk("text", { x: -36, y: 32, "font-size": 15, "font-weight": 700, fill: "#333", "font-family": "Outfit, sans-serif" }, g).textContent = "+";
        mk("text", { x: 33, y: 22, "font-size": 15, "font-weight": 700, fill: "#333", "font-family": "Outfit, sans-serif" }, g).textContent = "−";
        ledEls[p.id] = { glow, dome, smoke, color: LED_COLOR[p.color] };
      } else if (p.type === "res") {
        leg(-55, 0, -28, 0); leg(55, 0, 28, 0);
        mk("rect", { x: -28, y: -8, width: 56, height: 16, rx: 7, fill: "#e8d3a4", stroke: "#a68b5b" }, g);
        BANDS[p.ohms].forEach((c, i) => mk("rect", { x: -18 + i * 10 + (i === 3 ? 6 : 0), y: -8, width: 5, height: 16, fill: c }, g));
        mk("text", { x: 0, y: -14, "text-anchor": "middle", "font-size": 12, fill: "#333", "font-family": "Outfit, sans-serif" }, g).textContent = p.ohms === 220 ? "220 Ω" : "10 kΩ";
      } else if (p.type === "button") {
        leg(-40, 40, -18, 18); leg(40, 40, 18, 18);
        mk("rect", { x: -22, y: -22, width: 44, height: 44, rx: 4, fill: "#2b2d31" }, g);
        btnCap = mk("circle", { cx: 0, cy: 0, r: 13, fill: "#d64f4f" }, g);
      } else if (p.type === "ldr") {
        leg(-25, 40, -7, 4); leg(25, 40, 7, 4);
        mk("circle", { cx: 0, cy: -10, r: 18, fill: "#e7c46a", stroke: "#8a6d2c" }, g);
        mk("path", { d: "M-10 -16 h6 v6 h-6 v6 h14 v-6 h6 v-6 h-6", fill: "none", stroke: "#a3462b", "stroke-width": 2 }, g);
      } else if (p.type === "tmp36") {
        leg(-35, 40, -9, 2); leg(0, 48, 0, 2); leg(35, 40, 9, 2);
        mk("path", { d: "M-18 2 V-24 A18 18 0 0 1 18 -24 V2 Z", fill: "#1d1f22" }, g);
        mk("text", { x: 0, y: -8, "text-anchor": "middle", "font-size": 9, fill: "#ddd", "font-family": "Outfit, sans-serif" }, g).textContent = "TMP36";
        ["+Vs", "Vout", "GND"].forEach((t, i) => (mk("text", { x: -35 + i * 35, y: i === 1 ? 72 : 64, "text-anchor": "middle", "font-size": 11, fill: "#333", "font-family": "Outfit, sans-serif" }, g).textContent = t));
      } else if (p.type === "buzzer") {
        leg(-25, 40, -8, 8); leg(25, 40, 8, 8);
        buzEl = mk("circle", { cx: 0, cy: -10, r: 22, fill: "#1d1f22" }, g);
        mk("circle", { cx: 0, cy: -10, r: 4, fill: "#555" }, g);
        mk("text", { x: -38, y: 32, "font-size": 15, "font-weight": 700, fill: "#333", "font-family": "Outfit, sans-serif" }, g).textContent = "+";
      }
      mk("text", { x: p.type === "res" ? 0 : 0, y: p.type === "led" ? -72 : -60, "text-anchor": "middle", "font-size": 12, fill: "#555", "font-family": "Outfit, sans-serif" }, g).textContent = p.type === "res" ? "" : p.label;
    }
    wireG = mk("g", {}, svg);
    // Terminals on top, each a real control
    const all = [...CM.PINS, ...ch.parts.flatMap((p) => CM.PART_LEGS[p.type].map((l) => `${p.id}.${l}`))];
    for (const t of all) {
      const [x, y] = termPos(ch, t);
      const g = mk("g", { class: "term", tabindex: "0", role: "button", "aria-label": termName(ch, t), "data-t": t }, svg);
      mk("circle", { cx: x, cy: y, r: 18, fill: "transparent" }, g);
      mk("circle", { class: "ring", cx: x, cy: y, r: 11, fill: "none", stroke: "#ffd25a", "stroke-width": 3, opacity: 0 }, g);
      mk("circle", { cx: x, cy: y, r: PIN_POS[t] ? 5 : 6, fill: PIN_POS[t] ? "#c8ccd0" : "#6b7075" }, g);
      g.addEventListener("click", () => tapTerm(t));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapTerm(t); } });
      termEls[t] = g;
    }
  }
  const wireColor = (a, b) => ([a, b].some((t) => t.startsWith("GND")) ? "#1d1f22" : [a, b].includes("5V") ? "#d64f4f" : ["#2f6a9c", "#e0a21b", "#2e9d4f", "#7b4fb0", "#d9762b"][(a.length + b.length) % 5]);
  function drawWires() {
    const ch = CM.CHALLENGES[ci];
    wireG.replaceChildren();
    wires.forEach(([a, b], i) => {
      const [x1, y1] = termPos(ch, a), [x2, y2] = termPos(ch, b);
      const sag = 40 + Math.abs(x2 - x1) * 0.1;
      const d = `M${x1} ${y1} C${x1} ${y1 + (y1 < 260 ? sag : -sag)} ${x2} ${y2 + (y2 < 260 ? sag : -sag)} ${x2} ${y2}`;
      mk("path", { d, stroke: "#000", "stroke-opacity": 0.15, "stroke-width": 7, fill: "none", "stroke-linecap": "round" }, wireG);
      mk("path", { d, stroke: wireColor(a, b), "stroke-width": 4.5, fill: "none", "stroke-linecap": "round" }, wireG);
      const hit = mk("path", { d, stroke: "transparent", "stroke-width": 16, fill: "none", class: "wire-hit" }, wireG);
      hit.addEventListener("click", () => removeWire(i));
    });
    wireList.replaceChildren(...(wires.length ? wires.map(([a, b], i) => el("li", {}, el("span", { text: `${termName(ch, a)} → ${termName(ch, b)}` }),
      el("button", { type: "button", class: "del", "aria-label": "Remove this wire", text: "×", onclick: () => removeWire(i) }))) : [el("li", { class: "muted", text: "No wires yet. Tap a leg, then a pin." })]));
  }

  // ---- Wiring ----
  function tapTerm(t) {
    if (selected === t) { selected = null; markSelected(); return; }
    if (!selected) { selected = t; markSelected(); SND.fx("select"); return; }
    const a = selected, b = t;
    selected = null;
    if (!wires.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) { wires.push([a, b]); SND.fx("wire"); }
    changed();
  }
  function removeWire(i) { wires.splice(i, 1); SND.fx("unwire"); changed(); }
  function markSelected() { for (const [t, g] of Object.entries(termEls)) g.querySelector(".ring").setAttribute("opacity", t === selected ? 1 : 0); }
  function changed() {
    const ch = CM.CHALLENGES[ci];
    analysis = CM.analyze(ch, wires);
    burnt = Object.fromEntries(Object.entries(burnt).filter(([id]) => analysis.parts[id] && (analysis.parts[id].state === "noResistor" || analysis.parts[id].state === "lowResistor")));
    markSelected(); drawWires(); save();
    probs.replaceChildren(...(analysis.problems.length ? analysis.problems.slice(0, 3).map((p) => el("li", { "data-level": p.level, text: p.text }))
      : [el("li", { "data-level": analysis.ok ? "good" : "info", text: analysis.ok ? "Everything is wired correctly. Try it out, then press Check my circuit." : "Keep wiring." })]));
    codePre.textContent = ch.code(CM.chosenPins(analysis)).join("\n");
  }

  // ---- Challenges ----
  function renderChips() {
    chips.replaceChildren(...CM.CHALLENGES.map((c, i) => el("button", { type: "button", class: "case-chip", "aria-current": i === ci ? "true" : false, onclick: () => openChallenge(i) },
      el("span", { class: "num", text: String(i + 1).padStart(2, "0") }), el("span", { class: "t", text: c.title.replace(/^\d+\. /, "") }),
      el("span", { class: "stars", "aria-label": (stars[c.id] || 0) + " of 3 stars", text: "★".repeat(stars[c.id] || 0) + "☆".repeat(3 - (stars[c.id] || 0)) }))));
  }
  let lux = 300, tempC = 24;
  function openChallenge(i, focus = true) {
    ci = i;
    const ch = CM.CHALLENGES[i];
    wires = (allWires[ch.id] || []).filter(([a, b]) => [a, b].every((t) => PIN_POS[t] || ch.parts.some((p) => t.startsWith(p.id + "."))));
    selected = null; burnt = {}; fails = 0; hinted = false; feedback.hidden = true; hintBox.hidden = true;
    title.textContent = ch.title; goal.textContent = ch.goal;
    controls.replaceChildren();
    if (ch.parts.some((p) => p.type === "button")) {
      const hold = el("button", { type: "button", class: "btn hold", text: "Hold to press the button" });
      const down = (e) => { e.preventDefault(); pressed = true; hold.dataset.on = "1"; }, up = () => { pressed = false; delete hold.dataset.on; };
      hold.addEventListener("pointerdown", down); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => hold.addEventListener(ev, up));
      hold.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") down(e); }); hold.addEventListener("keyup", up);
      controls.append(hold);
    }
    if (ch.parts.some((p) => p.type === "ldr")) {
      const out = el("output");
      const input = el("input", { type: "range", min: 0, max: 100, value: 75, "aria-label": "Light level", oninput: (e) => { lux = Math.pow(10, e.target.value / 25 - 1); out.textContent = lux < 10 ? lux.toFixed(1) + " lux" : Math.round(lux) + " lux"; } });
      lux = Math.pow(10, 75 / 25 - 1); out.textContent = Math.round(lux) + " lux";
      controls.append(el("label", { class: "slider" }, el("span", { text: "Light (dark → bright)" }), input, out));
    }
    if (ch.parts.some((p) => p.type === "tmp36")) {
      const out = el("output", { text: "24 °C" });
      const input = el("input", { type: "range", min: 10, max: 45, value: 24, "aria-label": "Room temperature", oninput: (e) => { tempC = +e.target.value; out.textContent = tempC + " °C"; } });
      tempC = 24;
      controls.append(el("label", { class: "slider" }, el("span", { text: "Temperature" }), input, out));
    }
    drawStatic(); changed(); renderChips();
    if (focus) title.focus();
  }
  function checkNow() {
    const ch = CM.CHALLENGES[ci];
    const ok = CM.verify(ch, analysis);
    feedback.hidden = false;
    if (ok) {
      const got = fails === 0 && !hinted ? 3 : fails <= 1 ? 2 : 1;
      stars[ch.id] = Math.max(stars[ch.id] || 0, got); save();
      feedback.dataset.kind = "won";
      const led = Object.values(analysis.parts).find((r) => r.mA);
      feedback.replaceChildren(el("h3", { text: "It works! " + "★".repeat(got) }),
        el("p", { text: led ? `About ${Math.round(led.mA)} mA flows through each LED: (5 V − ~2 V) ÷ ${led.ohms} Ω, safely under the 20 mA an Uno pin is rated for.` : "Your circuit and the program work together." }),
        ci + 1 < CM.CHALLENGES.length ? el("button", { type: "button", class: "btn btn--accent", text: "Next challenge →", onclick: () => openChallenge(ci + 1) }) : el("p", { class: "muted", text: "That's every challenge. You've wired your first real circuits!" }));
      SND.fx("win", got); renderChips();
    } else {
      fails++;
      feedback.dataset.kind = "lost";
      const first = analysis.problems.find((p) => p.level !== "good");
      feedback.replaceChildren(el("h3", { text: "Not yet" }), el("p", { text: first ? first.text : "The wiring looks complete, but the program doesn't behave as the goal says. Test it with the controls and look again." }));
      SND.fx("wrong");
    }
  }

  // ---- Running: the program on the board, many times a second ----
  const lastLed = {};
  const t0 = performance.now();
  function frame(now) {
    const ch = CM.CHALLENGES[ci], t = (now - t0) / 1000;
    const out = CM.run(ch, analysis, { t, pressed, lux, tempC });
    for (const [id, e] of Object.entries(ledEls)) {
      let st = out.leds[id];
      if (st === "burn" && !burnt[id]) { burnt[id] = true; SND.fx("burn"); }
      if (burnt[id]) st = "burnt";
      e.glow.setAttribute("opacity", st === "on" ? 0.35 : 0);
      e.dome.setAttribute("opacity", st === "on" ? 1 : st === "burnt" ? 0.9 : 0.45);
      e.dome.setAttribute("fill", st === "burnt" ? "#3a3a3a" : e.color);
      e.smoke.setAttribute("opacity", st === "burnt" ? (0.4 + 0.3 * Math.sin(now / 300)).toFixed(2) : 0);
      if (st === "on" && lastLed[id] !== "on") SND.fx("led");
      lastLed[id] = st;
    }
    if (btnCap) btnCap.setAttribute("r", pressed ? 10 : 13);
    if (buzEl) buzEl.setAttribute("fill", out.buzz ? "#3b3f45" : "#1d1f22");
    SND.update({ ambience: [], devices: { buzzer: out.buzz } });
    const lines = [];
    for (const [id, v] of Object.entries(out.readings)) {
      const p = ch.parts.find((q) => q.id === id);
      lines.push(p.type === "tmp36" ? `analogRead = ${v}  →  ${CM.tmpFromAdc(v).toFixed(1)} °C` : `analogRead = ${v}  (${v < 300 ? "dark: lamp on" : "light: lamp off"})`);
    }
    if (ch.parts.some((p) => p.type === "button")) lines.push(`button reads ${analysis.parts.btn && analysis.parts.btn.state === "ok" && pressed ? "LOW (pressed)" : "HIGH"}`);
    if (out.buzz) lines.push("buzzer ON");
    const text = lines.join("\n") || "(nothing to print yet)";
    if (monitor.textContent !== text) monitor.textContent = text;
    requestAnimationFrame(frame);
  }
  openChallenge(ci, false);
  requestAnimationFrame(frame);
  window.IoTCircuit = { open: openChallenge, wire: (a, b) => { wires.push([a, b]); changed(); }, check: checkNow, get analysis() { return analysis; }, get wires() { return wires; }, frame };
})();
