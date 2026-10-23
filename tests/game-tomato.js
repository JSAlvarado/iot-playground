// ============ TESTS: UV Tomato Guard (TOMATRIX) ============
// The manuscript's numbers, the lid interlock, and every mission won by sensible rules and lost by careless ones.
(function (root) {
  "use strict";
  const { check, near } = root.IoTTest;
  const { IoT, TomatoModel: M } = root;
  if (!M) return;
  const L = M.limits;

  // ---- The manuscript's numbers ----
  check("Tomato: 182 s at 0.533 mW/cm² is a 0.97 kJ/m² UV-C dose", near(M.uvDose(182), 0.97, 0.005), M.uvDose(182).toFixed(3));
  check("Tomato: spoilage thresholds CO2 ≈ 800 ppm, VOC 400–500 ppm, NH3 10–15 ppm",
    L.co2 === 800 && L.voc >= 400 && L.voc <= 500 && L.nh3 >= 10 && L.nh3 <= 15);
  check("Tomato: storage band best 20 °C, spoilage above 25 °C, chilling below 10 °C, RH 85–95 %",
    L.temp.best === 20 && L.temp.spoilAbove === 25 && L.temp.chillBelow === 10 && L.rh.low === 85 && L.rh.high === 95);

  // ---- The UV-C cycle and the lid interlock ----
  const fresh = (opts = {}) => IoT.createSim(M, opts);
  let s = fresh(); s.trigger("uv"); s.run(4);
  check("Tomato: one UV-C cycle lasts 182 s (4 one-minute ticks) and gives the full dose",
    s.state.totalCycles === 1 && near(s.state.doseNow, 0.97, 0.005) && s.state.lampLeft === 0, s.state.doseNow.toFixed(3));
  s = fresh(); s.trigger("lid"); s.tick(); s.trigger("uv"); s.tick();
  check("Tomato: the UV-C lamp refuses to start while the lid is open", s.state.blocked === 1 && !s.state.lampOn && s.state.totalCycles === 0);
  s = fresh(); s.trigger("uv"); s.tick(); s.trigger("lid"); s.tick(); s.run(5);
  check("Tomato: opening the lid mid-cycle switches the lamp off (no full dose)", s.state.cutShort === 1 && s.state.totalCycles === 0 && !s.state.lampOn);
  s = fresh(); s.run(30); const before = M.readings(s.state).voc; s.trigger("uv"); s.run(2);
  check("Tomato: the shutter covers the sensors during UV-C, so readings hold", M.readings(s.state).voc === before && s.state.lampOn);
  s = fresh();
  s.rules = [{ kind: "if", sensor: "co2", op: ">", value: 0, actuator: "uv", until: -1 }]; s.run(60);
  check("Tomato: an IF rule STARTs the UV-C cycle once, not every minute", s.state.totalCycles === 1);

  // ---- The science, simplified ----
  const twoDays = (opts, rules = []) => { const x = fresh(opts); x.rules = rules; x.run(2 * 1440); return x.state; };
  check("Tomato: a hotter market spoils tomatoes faster", M.freshness(twoDays({ airHigh: 33 }).treated) < M.freshness(twoDays({ airHigh: 25 }).treated) - 10);
  const shut = fresh(); shut.run(1440);
  check("Tomato: a closed box with no fan gets damper than 95 %", shut.history.some((h) => h.rh > 96));
  const fanRule = { kind: "if", sensor: "rh", op: ">", value: 95, actuator: "fan", until: 90 };
  const vented = fresh(); vented.rules = [fanRule]; vented.run(1440);
  check("Tomato: a fan rule keeps the humidity in the 85–95 % band", vented.history.every((h) => h.rh >= 85 && h.rh <= 95.5));
  const always = twoDays({}, [{ kind: "if", sensor: "rh", op: ">", value: 0, actuator: "fan" }]);
  check("Tomato: a fan left on all the time dries the tomatoes out", always.treated.massLoss > twoDays({}, [fanRule]).treated.massLoss * 1.3);
  const sunny = fresh({ spot: "sun" }); sunny.run(10 * 60);
  check("Tomato: a closed box in the afternoon sun gets hotter than the market air", sunny.state.temp > sunny.state.air + 3);
  check("Tomato: the untreated batch spoils faster than the treated one with a sensible UV-C rule",
    (() => { const x = twoDays({ ripe: 0.8 }, [fanRule, { kind: "if", sensor: "voc", op: ">", value: 450, actuator: "uv", until: 300 }]); return M.freshness(x.treated) > M.freshness(x.control) + 5; })());

  // ---- Every mission: won by a sensible rule set, lost by a careless one ----
  const play = (m, rules) => {
    const x = IoT.createSim(M, m.options); x.rules = rules;
    const start = x.minutes;
    for (let i = 0; i < 200 * 60; i++) { x.tick(); const r = m.check(x, (x.minutes - start) / 60); if (r.state !== "running") return r; }
    return { state: "timeout" };
  };
  const uvVoc = { kind: "if", sensor: "voc", op: ">", value: 450, actuator: "uv", until: 300 };
  const uvCo2 = { kind: "if", sensor: "co2", op: ">", value: 800, actuator: "uv" };
  const fanHot = { kind: "if", sensor: "temp", op: ">", value: 28, actuator: "fan" };
  const at = (time) => ({ kind: "at", time, actuator: "uv" });
  const [m1, m2, m3, m4, m5] = M.missions;
  const cases = [
    [m1, [fanRule], "won", "the example fan rule"], [m1, [], "lost", "no rules (too damp)"],
    [m1, [{ kind: "if", sensor: "rh", op: ">", value: 0, actuator: "fan" }], "lost", "the fan always on (too dry)"],
    [m2, [fanRule, uvVoc], "won", "a VOC rule that starts UV-C"], [m2, [fanRule], "lost", "no UV-C rule"],
    [m3, [fanRule, at("19:00")], "won", "UV-C at 19:00 after the market"], [m3, [fanRule, at("10:00")], "lost", "UV-C at 10:00 when customers open the lid"],
    [m4, [fanRule, uvVoc, fanHot], "won", "a fan rule for heat"], [m4, [fanRule, uvVoc], "lost", "no fan rule for heat"],
    [m5, [fanRule, uvVoc], "won", "a VOC rule with UNTIL"], [m5, [fanRule, uvCo2], "lost", "a CO2 rule without UNTIL (too much UV-C)"], [m5, [fanRule], "lost", "no UV-C at all"]
  ];
  for (const [m, rules, want, why] of cases) {
    const r = play(m, rules);
    check(`Tomato mission "${m.title}" is ${want} with ${why}`, r.state === want, r.message);
  }
  check("Tomato: there are 5 missions", M.missions.length === 5);
})(typeof window !== "undefined" ? window : globalThis);
