// ============ TESTS: COPRA POWER (COPRAWATT) ============
// The manuscript's projected numbers, the published safety and grading lines, and every mission won by sensible
// rules and lost by careless ones.
(function (root) {
  "use strict";
  const { check, near } = root.IoTTest;
  const { IoT, CopraModel: M } = root;
  if (!M) return;

  // ---- Numbers from the manuscript (projections) and published sources ----
  check("Copra: shells burn longest per kg (2.5 h, projected)", Object.values(M.fuels).every((f) => f.hours <= M.fuels.shells.hours) && M.fuels.leaves.hours === 0.7);
  check("Copra: dryer band is 50–70 °C (manuscript)", M.limits.dryer.low === 50 && M.limits.dryer.high === 70);
  check("Copra: DA grades by moisture", M.grade(7.5) === "Grade 1" && M.grade(9) === "Grade 2" && M.grade(12) === "Grade 3" && M.grade(15) === "Not dry yet");
  check("Copra: CO lines are NIOSH 35, OSHA 50 and the 200 ppm ceiling", M.limits.co.niosh === 35 && M.limits.co.osha === 50 && M.limits.co.ceiling === 200);
  // Battery: 1200 Wh with 80% usable = 960 Wh; generator alone 612 W → about 1.57 h, hybrid 707 W → about 1.36 h
  const usable = M.power.battWh * (1 - M.limits.battery.cutoff / 100);
  check("Copra: 960 Wh usable, 1.57 h on the generator, 1.36 h hybrid", usable === 960 && near(usable / M.power.genW, 1.57, 0.01) && near(usable / (M.power.genW + M.power.solarW), 1.36, 0.01));
  // A sunny day gives the 4 peak sun hours the design assumes (100 W x 95% → about 380 Wh)
  let solarWh = 0; for (let m = 0; m < 1440; m++) solarWh += M.power.solarW * M.power.peakFactor * M.sunlight(m / 60, "sunny") / 60;
  check("Copra: a sunny day gives about 4 peak sun hours of solar", near(solarWh, 380, 5), solarWh.toFixed(0) + " Wh");
  check("Copra: copra dries faster near 60 °C than at 50 °C, not at all when cold", M.dryRate(60) > M.dryRate(50) && M.dryRate(35) === 0);

  // ---- The physics behaves sensibly ----
  const play = (opts, rules, hours) => { const s = IoT.createSim(M, opts); s.rules = rules; s.run(hours * 60); return s; };
  const fuelRule = { kind: "if", sensor: "dryer", op: "<", value: 50, actuator: "fuel" };
  const fanRule = { kind: "if", sensor: "co", op: ">", value: 35, actuator: "fan" };
  const noFan = play({ weather: "sunny" }, [fuelRule], 6), withFan = play({ weather: "sunny" }, [fuelRule, fanRule], 6);
  check("Copra: without the fan, CO builds up near the dryer", noFan.state.maxCO > 150 && withFan.state.maxCO < 45, `${noFan.state.maxCO.toFixed(0)} vs ${withFan.state.maxCO.toFixed(0)} ppm`);
  check("Copra: the steam generator charges the battery", withFan.state.battery > 90);
  const rainSolar = play({ weather: "rainy", battery: 50 }, [], 12), sunSolar = play({ weather: "sunny", battery: 50 }, [], 12);
  check("Copra: rain weakens solar charging", sunSolar.state.battery > rainSolar.state.battery + 15);

  // ---- Every mission: won with sensible rules, lost with careless ones ----
  const missions = M.missions;
  function runMission(m, rules, fuelType) {
    const s = IoT.createSim(M, m.options); s.rules = rules;
    if (fuelType) s.state.fuelType = fuelType;
    const start = s.minutes; let r;
    for (let i = 0; i < 72 * 60; i++) { s.tick(); r = m.check(s, (s.minutes - start) / 60); if (r.state !== "running") break; }
    return r;
  }
  const hotFan = { kind: "if", sensor: "dryer", op: ">", value: 66, actuator: "fan" };
  const battRule = { kind: "if", sensor: "battery", op: "<", value: 30, actuator: "fuel" };
  const defaults = [fuelRule, fanRule];
  const plans = [
    { win: [defaults], lose: [[[]], [[fuelRule]]] },                                 // 1: defaults win; no rules or no fan lose
    { win: [defaults, "shells"], lose: [[defaults], [defaults, "wood"]] },          // 2: shells win; leaves or wood scorch
    { win: [[fuelRule, fanRule, hotFan]], lose: [[defaults]] },                      // 3: a temperature fan rule saves the copra
    { win: [[battRule, fanRule]], lose: [[defaults], [[fanRule]]] },                 // 4: the battery rule saves fuel
    { win: [[fuelRule, fanRule, hotFan], "husks"], lose: [[defaults], [[fuelRule]]] } // 5: a hotter fuel dries in the rain
  ];
  missions.forEach((m, i) => {
    const p = plans[i];
    const won = runMission(m, p.win[0], p.win[1]);
    check(`Copra mission ${i + 1} (${m.id}) is winnable`, won.state === "won", won.message);
    p.lose.forEach(([rules, fuel], j) => {
      const lost = runMission(m, rules, fuel);
      check(`Copra mission ${i + 1} (${m.id}) is lost by careless plan ${j + 1}`, lost.state === "lost", lost.message);
    });
  });
  check("Copra: mission 1 is won with the example rules", runMission(missions[0], defaults).state === "won");
})(typeof window !== "undefined" ? window : globalThis);
