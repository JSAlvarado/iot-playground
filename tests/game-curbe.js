// ============ TESTS: Curb-E Smart Sign Patrol ============
// The manuscript's 10-second siren, the weather and night effects on plate reads, power, heat, and every mission:
// winnable with a sensible rule set and lost by a careless one.
(function (root) {
  "use strict";
  const { check } = root.IoTTest;
  const { IoT, CurbeModel: M } = root;
  if (!M) return;

  // ---- Rule sets ----
  const siren = (v) => ({ kind: "if", sensor: "stopped", op: ">", value: v, actuator: "siren" });
  const upPlate = (v) => ({ kind: "if", sensor: "plate", op: ">", value: v, actuator: "upload" });
  const fan = { kind: "if", sensor: "temp", op: ">", value: 45, actuator: "fan", until: 40 };
  const sensible = [siren(4), upPlate(80), fan];
  const careless = {
    "first-shift": [],                                                                   // no rules: nobody is caught
    rush: [siren(3), upPlate(80), fan],                                                  // limit too low for 4-minute jams
    rain: [siren(4), upPlate(70), fan],                                                  // uploads unsure plate reads
    heat: [siren(4), upPlate(80)],                                                       // no fans: overheats
    night: [siren(4), upPlate(80), { kind: "if", sensor: "temp", op: ">", value: 20, actuator: "fan" }] // fans all night
  };
  function play(m, rules) {
    const sim = IoT.createSim(M, m.options); sim.rules = rules;
    const start = sim.minutes; let r;
    for (let i = 0; i < 13 * 60; i++) { sim.tick(); r = m.check(sim, (sim.minutes - start) / 60); if (r.state !== "running") break; }
    return { r, s: sim.state };
  }

  // ---- Facts and game values ----
  check("Curb-E: the siren strobe sounds for 10 seconds (manuscript)", M.limits.sirenSeconds === 10);
  check("Curb-E: plates read worse at night and in rain", M.plateCeiling(12, "sunny") > M.plateCeiling(22, "sunny") && M.plateCeiling(12, "sunny") > M.plateCeiling(12, "rainy") && M.plateMinutes(22, "rainy") > M.plateMinutes(12, "sunny"));
  check("Curb-E: no solar charging at night, less under rain", M.sunlight(2, "sunny") === 0 && M.sunlight(12, "rainy") < M.sunlight(12, "sunny"));
  const code = IoT.arduinoCode([siren(4), upPlate(80), fan], { title: "t", sensors: { stopped: { fn: "a", unit: "min", label: "x" } }, actuators: { siren: { pin: 17, label: "s", kind: "event", pulseMs: 10000 }, upload: { pin: 27, label: "u", kind: "event", pulseMs: 100 }, fan: { pin: 22, label: "f", kind: "switch" } } });
  check("Curb-E: the code tab holds the siren on for 10 000 ms", code.includes("delay(10000)"));

  // A brief stop flagged by a careless limit is a false alarm; a parked car warned and recorded is caught
  {
    const sim = IoT.createSim(M, { seed: 7, briefMax: 2 }); sim.rules = [siren(0), upPlate(80)];
    sim.run(6 * 60);
    check("Curb-E: a limit of 0 minutes flags brief stops (false alarms)", sim.state.falseAlarms >= 3, `${sim.state.falseAlarms} false alarms`);
    const ok = IoT.createSim(M, { seed: 7, briefMax: 2 }); ok.rules = [siren(3), upPlate(80)];
    ok.run(6 * 60);
    check("Curb-E: a 3-minute limit with brief stops up to 2 minutes makes no false alarms", ok.state.falseAlarms === 0 && ok.state.caught > 0, `caught ${ok.state.caught}, false ${ok.state.falseAlarms}`);
  }
  // Uploading without a clear plate read sends unclear evidence
  {
    const sim = IoT.createSim(M, { seed: 9 }); sim.rules = [siren(3), { kind: "if", sensor: "stopped", op: ">", value: 3, actuator: "upload" }];
    sim.run(6 * 60);
    check("Curb-E: uploading as soon as the siren sounds sends unclear plates", sim.state.falseAlarms >= 1 && sim.state.records === 0, `records ${sim.state.records}`);
  }
  // Heat and power
  {
    const hot = IoT.createSim(M, { seed: 4, airHigh: 36 }); hot.run(10 * 60);
    const cool = IoT.createSim(M, { seed: 4, airHigh: 36 }); cool.rules = [fan]; cool.run(10 * 60);
    check("Curb-E: on a 36 °C day the box passes 60 °C without fans, not with them", hot.state.heatStops > 0 && cool.state.heatStops === 0);
    const night = IoT.createSim(M, { seed: 5, battery: 40, startMinutes: 18 * 60 }); night.run(12 * 60);
    check("Curb-E: 40% battery lasts the night when the fans stay off", night.state.powerOuts === 0 && night.state.battery > 0, `battery ${night.state.battery.toFixed(1)}%`);
  }
  check("Curb-E: plates are fictional (GAM-07 style)", (() => { const sim = IoT.createSim(M, { seed: 1 }); sim.run(240); return /^(GAM|PLY|SIM|FUN|TOY)-\d{2}$/.test((sim.state.vehicle || sim.state.last).plate); })());

  // ---- Missions ----
  check("Curb-E: mission 1 is won with the example rules", play(M.missions[0], [siren(3), upPlate(80)]).r.state === "won");
  for (const m of M.missions) {
    const good = play(m, sensible), bad = play(m, careless[m.id]);
    check(`Curb-E mission "${m.title}" is won with sensible rules`, good.r.state === "won", good.r.message);
    check(`Curb-E mission "${m.title}" is lost with careless rules`, bad.r.state === "lost", bad.r.message);
  }
})(typeof window !== "undefined" ? window : globalThis);
