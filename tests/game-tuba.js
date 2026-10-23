// ============ TESTS: Tuba Master (AuTuba) ============
// The fermentation science the game is built on (sweet sap → tuba within a day → vinegar after about two days),
// the solar battery and weather, and every mission: winnable with a sensible rule set and lost by a careless one.
(function (root) {
  "use strict";
  const { check, near } = root.IoTTest;
  const { IoT, TubaModel: M } = root;
  if (!M) return;

  // ---- Rule sets ----
  const tongog = { kind: "if", sensor: "level", op: ">", value: 5, actuator: "tongog" };
  const pumpPh = (v) => ({ kind: "if", sensor: "ph", op: "<", value: v, actuator: "pump" });
  const pumpAlc = (v) => ({ kind: "if", sensor: "alcohol", op: ">", value: v, actuator: "pump" });
  const stir = (v) => ({ kind: "if", sensor: "alcohol", op: "<", value: v, actuator: "stirrer" });
  const stirAlways = { kind: "if", sensor: "battery", op: ">", value: -1, actuator: "stirrer" };
  const defaults = [tongog, pumpPh(4.7)];
  const sensible = {
    "first-batch": defaults,
    market: [tongog, pumpPh(4.7), stir(2)],
    rainy: [tongog, pumpPh(4.7), stir(1)],
    "sour-sap": [tongog, pumpAlc(4.5)],
    "three-days": [tongog, pumpAlc(4.5), stir(1)]
  };
  const careless = {
    "first-batch": [tongog],                         // never pumps: the batch sours into vinegar
    market: defaults,                                // no stirring: not ready by 18:00
    rainy: [tongog, pumpPh(4.7), stirAlways],        // stirs all the time: the battery dies
    "sour-sap": defaults,                            // pH alone: pumps out weak, unfinished sap
    "three-days": [tongog, pumpPh(4.7), stir(1)]     // pH alone again, with sour-ish sap
  };
  function play(m, rules) {
    const sim = IoT.createSim(M, m.options); sim.rules = rules;
    const start = sim.minutes; let r;
    for (let i = 0; i < 80 * 60; i++) { sim.tick(); r = m.check(sim, (sim.minutes - start) / 60); if (r.state !== "running") break; }
    return { r, s: sim.state };
  }
  const batch = (opts, rules, hours) => { const s = IoT.createSim(M, opts); s.rules = rules; s.run(hours * 60); return s; };
  const at = (sim, hour) => sim.history.find((h) => h.minutes === sim.options.startMinutes + hour * 60 || h.minutes === 360 + hour * 60);

  // ---- Science and game values ----
  check("Tuba: fresh sap starts near neutral (pH 7)", near(M.readings(M.init({})).ph, 7, 0.01));
  {
    const s = batch({ weather: "sunny", airHigh: 31 }, [tongog], 72);
    const h12 = at(s, 12), h24 = at(s, 24), h72 = at(s, 70);
    check("Tuba: with tongog, a sunny batch is ready within about 12–16 hours (pH ≤ 4.8, alcohol ≥ 4%)",
      s.history.findIndex((h) => h.ph <= M.limits.ph.ready && h.alcohol >= M.limits.alcohol.ready) / 6 <= 16, `pH ${h12.ph} and ${h12.alcohol}% at 12 h`);
    check("Tuba: after a day the pH is in tuba's published range (about 4.3–4.7)", h24.ph >= 4.3 && h24.ph <= 4.7, `pH ${h24.ph}`);
    check("Tuba: left about three days it sours below pH 3.8 and the alcohol falls (sell within 2 days)",
      h72.ph < M.limits.ph.spoiled && h72.alcohol < Math.max(...s.history.map((h) => h.alcohol)) - 2 && at(s, 40).ph > M.limits.ph.spoiled, `pH ${h72.ph} at 70 h`);
    check("Tuba: the spoilage alarm (buzzer and red LED) is on once the pH is below 3.8", s.state.alarm === true);
  }
  {
    const wild = batch({ weather: "sunny", airHigh: 31 }, [], 24), helped = batch({ weather: "sunny", airHigh: 31 }, [tongog], 24);
    check("Tuba: without tongog the sap ferments more slowly", wild.state.alcohol < helped.state.alcohol - 2, `${wild.state.alcohol.toFixed(1)}% vs ${helped.state.alcohol.toFixed(1)}%`);
    const cool = batch({ weather: "sunny", airHigh: 26 }, [tongog], 12), warm = batch({ weather: "sunny", airHigh: 34 }, [tongog], 12);
    check("Tuba: warmth speeds fermentation", warm.state.alcohol > cool.state.alcohol);
  }
  {
    const sun = batch({ weather: "sunny", battery: 30 }, [], 12), rain = batch({ weather: "rainy", battery: 30 }, [], 12);
    check("Tuba: the solar battery charges far less in the rain", sun.state.battery > rain.state.battery + 30);
    check("Tuba: no solar charging at night", M.sunlight(2, "sunny") === 0 && M.sunlight(12, "sunny") > 0.99);
    const drain = batch({ weather: "rainy", battery: 45 }, [stirAlways], 24);
    check("Tuba: stirring all the time on a rainy day empties the battery and shuts the controller down", drain.history.some((h) => h.battery === 0));
  }
  {
    const s = IoT.createSim(M, { weather: "sunny" }); s.trigger("tongog"); s.trigger("tongog"); s.rules = [pumpPh(4.7)]; s.run(24 * 60);
    check("Tuba: adding tongog twice makes the batch too bitter", s.state.bitter > 0 && s.state.good === 0);
  }
  check("Tuba: the farmer can't pour new sap into a full barrel", batch({ weather: "sunny" }, [tongog], 26).state.sapMissed === 20);

  // ---- Missions ----
  check("Tuba: mission 1 is won with the example rules", play(M.missions[0], defaults).r.state === "won");
  for (const m of M.missions) {
    const good = play(m, sensible[m.id]), bad = play(m, careless[m.id]);
    check(`Tuba mission "${m.title}" is won with sensible rules`, good.r.state === "won", good.r.message);
    check(`Tuba mission "${m.title}" is lost with careless rules`, bad.r.state === "lost", bad.r.message);
  }
  const code = IoT.arduinoCode(sensible.market, { title: "t", sensors: { ph: { fn: "readPH", unit: "pH", label: "p" }, alcohol: { fn: "readAlcoholPercent", unit: "%", label: "a" }, level: { fn: "readSapLevel", unit: "L", label: "l" } },
    actuators: { stirrer: { pin: 8, label: "s", kind: "switch", onlyIf: "level > 2" }, pump: { pin: 9, label: "p", kind: "switch", onlyIf: "level > 0" }, tongog: { pin: 10, label: "t", kind: "event", pulseMs: 800 } } });
  check("Tuba: the code tab starts the dispenser once when the sap level rises and guards the stirrer", code.includes("tongogWasTrue") && code.includes("&& level > 2"));
})(typeof window !== "undefined" ? window : globalThis);
