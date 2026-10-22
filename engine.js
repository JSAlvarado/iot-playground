// ============ IOT PLAYGROUND ENGINE: the logic every game shares (no screen code, so it can be tested) ============
// A game supplies a model: its starting state, how one virtual minute changes the world, and its sensors and
// actuators. The engine runs the clock, applies the player's rule cards, checks missions and writes Arduino code.
(function (root) {
  "use strict";

  // ---- Science helpers ----
  // Dissolved-oxygen saturation of fresh water at sea level, mg/L (APHA 1992 / Benson & Krause equation).
  // 20 °C gives 9.09 mg/L and 25 °C gives 8.26 mg/L, matching published tables.
  function oxygenSaturation(tempC) {
    const T = tempC + 273.15;
    const ln = -139.34411 + 1.575701e5 / T - 6.642308e7 / T ** 2 + 1.2438e10 / T ** 3 - 8.621949e11 / T ** 4;
    return Math.exp(ln);
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- Clock: one tick is one virtual minute ----
  function timeOfDay(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440;
    return { day: Math.floor(minutes / 1440) + 1, hour: m / 60, hh: Math.floor(m / 60), mm: m % 60 };
  }
  const pad = (n) => String(n).padStart(2, "0");
  const clockText = (minutes) => { const t = timeOfDay(minutes); return `Day ${t.day}, ${pad(t.hh)}:${pad(t.mm)}`; };
  const parseTime = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h % 24) * 60 + (m || 0); };

  // ---- Rule cards ----
  // { kind: "if", sensor, op: "<" | ">", value, actuator }  → the actuator is ON while the condition is true
  //   with until: n, it stays ON until the reading passes n the other way (hysteresis: on below 4, off above 5)
  // { kind: "at", time: "07:00", actuator }                  → a one-time action at that time every day
  const hasUntil = (r) => typeof r.until === "number" && Number.isFinite(r.until);
  function evaluateRules(rules, readings, minutes, latch = new WeakMap()) {
    const on = {}, events = [];
    const now = ((minutes % 1440) + 1440) % 1440;
    for (const r of rules) {
      if (r.kind === "if") {
        const v = readings[r.sensor];
        if (typeof v !== "number") continue;
        let hit = r.op === "<" ? v < r.value : v > r.value;
        if (hasUntil(r)) {
          if (hit) latch.set(r, true);
          else if (r.op === "<" ? v > r.until : v < r.until) latch.set(r, false);
          hit = !!latch.get(r);
        }
        on[r.actuator] = on[r.actuator] || hit;
      } else if (r.kind === "at" && parseTime(r.time) === now) {
        events.push(r.actuator);
      }
    }
    return { on, events };
  }

  // ---- The simulation ----
  // model: { init(options) → state, step(state, ctx) → void, readings(state) → {sensor: value},
  //          actuators: { id: { kind: "switch" | "event" } } }
  function createSim(model, options = {}) {
    const sim = {
      model, options,
      minutes: options.startMinutes ?? 6 * 60,
      state: model.init(options),
      rules: [],
      latch: new WeakMap(), // which "until" rules are holding their device on
      manual: {},          // actuator id → "auto" | "on" | "off" (switches only)
      history: [],         // one sample every 10 virtual minutes: { minutes, ...readings }
      log: [],             // what happened, newest last
      pending: [],         // actions the player triggered by hand ("Feed now"), run on the next tick
      trigger(id) { sim.pending.push(id); },
      tick() {
        const readings = model.readings(sim.state);
        const { on, events } = evaluateRules(sim.rules, readings, sim.minutes, sim.latch);
        events.push(...sim.pending.splice(0));
        const switches = {};
        for (const [id, a] of Object.entries(model.actuators)) {
          if (a.kind !== "switch") continue;
          const mode = sim.manual[id] || "auto";
          switches[id] = mode === "on" ? true : mode === "off" ? false : !!on[id];
        }
        const ctx = { minutes: sim.minutes, time: timeOfDay(sim.minutes), switches, events, note: (text) => sim.log.push({ minutes: sim.minutes, text }) };
        model.step(sim.state, ctx);
        sim.minutes += 1;
        if (sim.minutes % 10 === 0) sim.history.push({ minutes: sim.minutes, ...model.readings(sim.state) });
        if (sim.history.length > 432) sim.history.shift(); // keep 3 virtual days
        if (sim.log.length > 50) sim.log.shift();
        return ctx;
      },
      run(minutes) { for (let i = 0; i < minutes; i++) sim.tick(); }
    };
    return sim;
  }

  // ---- Stars saved on this device ----
  const store = {
    get(key, fallback) { try { const v = JSON.parse(root.localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; } },
    set(key, value) { try { root.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not saved */ } }
  };

  // ---- "See the real code": the rule cards as an Arduino sketch ----
  // spec: { title, sensors: { id: { fn, unit, label } }, actuators: { id: { pin, label, kind, pulseMs } } }
  // An event with drives + durationMin (like "air out for 10 minutes") holds that switch on with a timer instead.
  function arduinoCode(rules, spec) {
    const usesTime = rules.some((r) => r.kind === "at");
    const acts = Object.entries(spec.actuators);
    const timed = acts.filter(([, a]) => a.kind === "event" && a.drives);
    const pinName = (id) => id.toUpperCase() + "_PIN";
    const lines = [];
    lines.push(`// ${spec.title}: generated from your rule cards in IoT Playground`);
    lines.push(`// The read...() functions stand for your real sensor code (each sensor's library has its own).`);
    if (usesTime) lines.push(`#include <RTClib.h>   // a real-time clock module (DS3231) keeps the time`);
    lines.push("");
    for (const [id, a] of acts) if (!a.drives) lines.push(`const int ${pinName(id)} = ${a.pin};   // ${a.label}`);
    if (usesTime) lines.push("RTC_DS3231 rtc;", "int lastMinuteRun = -1;");
    for (const [id, a] of timed) lines.push(`unsigned long ${id}Until = 0;   // ${a.label}: when the timer ends`);
    const ifRules = rules.filter((r) => r.kind === "if");
    const latched = ifRules.filter(hasUntil);
    latched.forEach((r, i) => lines.push(`bool ${r.actuator}Hold${i + 1} = false;   // rule ${i + 1} keeps the ${r.actuator} on until ${r.sensor} ${r.op === "<" ? ">" : "<"} ${r.until}`));
    lines.push("");
    for (const [, s] of Object.entries(spec.sensors)) lines.push(`float ${s.fn}();   // ${s.label}, in ${s.unit}`);
    lines.push("", "void setup() {", "  Serial.begin(115200);");
    for (const [id, a] of acts) if (!a.drives) lines.push(`  pinMode(${pinName(id)}, OUTPUT);`);
    if (usesTime) lines.push("  rtc.begin();");
    lines.push("}", "", "void loop() {");
    for (const [id, s] of Object.entries(spec.sensors)) lines.push(`  float ${id} = ${s.fn}();`);
    const atRules = rules.filter((r) => r.kind === "at");
    if (atRules.length) {
      lines.push("", "  DateTime now = rtc.now();", "  int minuteOfDay = now.hour() * 60 + now.minute();", "  if (minuteOfDay != lastMinuteRun) {", "    lastMinuteRun = minuteOfDay;");
      for (const r of atRules) {
        const a = spec.actuators[r.actuator];
        if (a.drives) {
          lines.push(`    if (minuteOfDay == ${parseTime(r.time)}) {   // ${r.time}: ${a.label}`,
            `      ${r.actuator}Until = millis() + ${a.durationMin}UL * 60UL * 1000UL;`, "    }");
        } else {
          lines.push(`    if (minuteOfDay == ${parseTime(r.time)}) {   // ${r.time}: ${a.label}`,
            `      digitalWrite(${pinName(r.actuator)}, HIGH);`, `      delay(${a.pulseMs || 3000});   // run it for a moment`,
            `      digitalWrite(${pinName(r.actuator)}, LOW);`, "    }");
        }
      }
      lines.push("  }");
    }
    if (latched.length) {
      lines.push("", "  // Hysteresis: switch on at one level, off at another, so devices don't click on and off");
      latched.forEach((r, i) => {
        const v = `${r.actuator}Hold${i + 1}`;
        lines.push(`  if (${r.sensor} ${r.op} ${r.value}) ${v} = true;`, `  else if (${r.sensor} ${r.op === "<" ? ">" : "<"} ${r.until}) ${v} = false;`);
      });
    }
    const byActuator = {};
    ifRules.forEach((r) => { (byActuator[r.actuator] = byActuator[r.actuator] || []).push(hasUntil(r) ? `${r.actuator}Hold${latched.indexOf(r) + 1}` : `${r.sensor} ${r.op} ${r.value}`); });
    for (const [id, a] of acts) {
      if (a.kind !== "switch") continue;
      const conds = (byActuator[id] || []).slice();
      for (const [eid, e] of timed) if (e.drives === id) conds.push(`(long)(${eid}Until - millis()) > 0`);
      lines.push("", `  // ${a.label}: ON while ${conds.length ? conds.join(" or ") : "no rule says so"}`);
      lines.push(`  digitalWrite(${pinName(id)}, ${conds.length ? "(" + conds.join(" || ") + ")" : "false"} ? HIGH : LOW);`);
    }
    lines.push("", "  delay(1000);   // check again every second", "}");
    return lines.join("\n");
  }

  root.IoT = { oxygenSaturation, clamp, timeOfDay, clockText, parseTime, evaluateRules, createSim, store, arduinoCode };
})(typeof window !== "undefined" ? window : globalThis);
