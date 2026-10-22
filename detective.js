// ============ GAME 4: SENSOR DETECTIVE ============
// Mystery cases: read the sensor graph, ask for a clue if you need one, and pick what went wrong.
// The cases and their data come from models/cases.js; this file only draws the screen.
(function () {
  "use strict";
  const { IoT, DetectiveCases } = window;
  const SND = window.IoTSound || { init() {}, fx() {}, update() {}, button: () => null };
  const KEY = "iotpg:detective";
  const saved = IoT.store.get(KEY, {});
  const stars = saved.stars || {};
  const save = () => IoT.store.set(KEY, { stars });
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
  const WORLD = { pond: "Pond", plant: "Plant", room: "Room" };

  // ---- A graph of one sensor, with its healthy band and dashed marks for events ----
  function graph(spec, data, marks, markLabel) {
    const pts = data.points, W = 600, H = 230, L = 50, B = 28, ns = "http://www.w3.org/2000/svg";
    const t0 = pts[0].minutes, t1 = pts[pts.length - 1].minutes;
    const x = (m) => L + ((m - t0) / Math.max(1, t1 - t0)) * (W - L - 8);
    const y = (v) => 8 + (1 - (IoT.clamp(v, spec.min, spec.max) - spec.min) / (spec.max - spec.min)) * (H - B - 8);
    const svg = document.createElementNS(ns, "svg");
    const vals = pts.map((p) => p[spec.key]);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${spec.label} from ${IoT.clockText(t0)} to ${IoT.clockText(t1)}: lowest ${Math.min(...vals)} ${spec.unit}, highest ${Math.max(...vals)} ${spec.unit}`);
    const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); return n; };
    add("rect", { class: "band", x: L, width: W - L - 8, y: y(spec.good[1]), height: Math.max(0, y(spec.good[0]) - y(spec.good[1])) });
    for (const v of [spec.min, (spec.min + spec.max) / 2, spec.max]) { add("line", { class: "axis", x1: L, x2: W - 8, y1: y(v), y2: y(v) }); add("text", { x: 2, y: y(v) + 4 }, String(+v.toFixed(1))); }
    // a tick and a label at every midnight and noon, so the reader can see when things happened
    for (let m = Math.ceil(t0 / 720) * 720; m <= t1; m += 720) {
      add("line", { class: "axis", x1: x(m), x2: x(m), y1: H - B, y2: H - B + 4 });
      add("text", { x: x(m), y: H - 6, "text-anchor": "middle" }, IoT.clockText(m).replace("Day ", "D").replace(", ", " "));
    }
    if (markLabel) for (const mk of marks) if (markLabel[mk.label]) add("line", { class: "mark", x1: x(mk.minutes), x2: x(mk.minutes), y1: 8, y2: H - B });
    add("polyline", { class: "line", points: pts.map((p) => `${x(p.minutes).toFixed(1)},${y(p[spec.key]).toFixed(1)}`).join(" ") });
    return el("figure", { class: "chart" }, el("figcaption", {}, el("strong", { text: spec.label }), el("span", { class: "muted", text: " " + spec.unit })), svg);
  }

  // ---- Screen ----
  SND.init({ theme: "detective" });
  document.body.dataset.game = "detective";
  const bar = el("header", { class: "bar" },
    el("a", { class: "btn back", href: "./", "aria-label": "Back to all games" }, "←", el("span", { class: "wide-only", text: " Games" })),
    el("h1", { text: "Detective", title: "Sensor Detective" }), SND.button());
  const list = el("nav", { class: "case-list", "aria-label": "Case files" });
  const view = el("article", { class: "case", "aria-live": "polite" });
  document.body.replaceChildren(bar, el("main", { class: "wrap detective" },
    el("div", { class: "case-intro" }, el("h2", { text: "Case files" }), el("p", { class: "muted", text: "Something went wrong in each pond, garden or room. Read the sensor graph, ask for a clue if you need one, and choose what happened. Solve it first time without a clue for 3 stars." })),
    list, view));

  const cache = {};
  let current = 0;
  function renderList() {
    list.replaceChildren(...DetectiveCases.map((c, i) => el("button", { type: "button", class: "case-chip", "aria-current": i === current ? "true" : false, onclick: () => open(i) },
      el("span", { class: "num", text: String(i + 1).padStart(2, "0") }), el("span", { class: "t", text: c.title }),
      el("span", { class: "stars", "aria-label": (stars[c.id] || 0) + " of 3 stars", text: "★".repeat(stars[c.id] || 0) + "☆".repeat(3 - (stars[c.id] || 0)) }))));
  }
  function open(i, focus = true) {
    current = i;
    const c = DetectiveCases[i];
    const data = cache[c.id] || (cache[c.id] = c.data());
    let wrong = 0, clueUsed = false, solved = false;
    const feedback = el("div", { class: "feedback", hidden: true });
    const clueBox = el("div", { class: "clue", hidden: true }, el("p", { text: c.clue.text }), c.clue.graph ? graph(c.clue.graph, data, data.marks, c.markLabel) : null);
    const clueBtn = el("button", { type: "button", class: "btn", text: "Show a clue", onclick: () => { clueUsed = true; clueBox.hidden = false; clueBtn.hidden = true; SND.fx("clue"); } });
    const opts = el("div", { class: "options", role: "group", "aria-label": "What happened?" });
    c.options.forEach((o) => {
      const b = el("button", { type: "button", class: "option", text: o.text, onclick: () => {
        if (solved) return;
        if (o.ok) {
          solved = true;
          const got = wrong === 0 && !clueUsed ? 3 : wrong <= 1 ? 2 : 1;
          stars[c.id] = Math.max(stars[c.id] || 0, got); save();
          b.dataset.state = "right";
          feedback.dataset.kind = "won";
          feedback.replaceChildren(el("h3", { text: "Case solved! " + "★".repeat(got) }), el("p", { text: c.explain }),
            i + 1 < DetectiveCases.length ? el("button", { type: "button", class: "btn btn--accent", text: "Next case →", onclick: () => open(i + 1) }) : el("p", { class: "muted", text: "That was the last case. Well done, detective!" }));
          SND.fx("correct"); setTimeout(() => SND.fx("win", got), 350);
          renderList();
        } else {
          wrong++;
          b.dataset.state = "wrong"; b.disabled = true;
          feedback.dataset.kind = "lost";
          feedback.replaceChildren(el("h3", { text: "Not quite" }), el("p", { text: o.why }), el("p", { class: "muted", text: "Look at the graph again and try another answer." }));
          SND.fx("wrong");
        }
        feedback.hidden = false;
      } });
      opts.append(b);
    });
    view.replaceChildren(
      el("p", { class: "case-meta", text: `Case ${i + 1} of ${DetectiveCases.length} · ${WORLD[c.world]}` }),
      el("h2", { class: "case-title", text: c.title, tabindex: "-1" }), el("p", { class: "story", text: c.story }),
      graph(c.graph, data, data.marks, c.markLabel), el("div", { class: "add" }, clueBtn), clueBox,
      el("h3", { class: "ask", text: "What happened?" }), opts, feedback);
    renderList();
    if (focus) view.querySelector(".case-title").focus();
  }
  renderList();
  open(Math.max(0, DetectiveCases.findIndex((c) => !stars[c.id])), false);
  window.IoTDetective = { open };
})();
