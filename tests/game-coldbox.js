// ============ TESTS: COLD CART (the SPARC solar thermoelectric cold box) ============
// The science the game teaches, and every mission: won by a sensible rule set, lost by a careless one.
(function (root) {
  "use strict";
  const { check, near } = root.IoTTest;
  const { IoT, ColdboxModel: M } = root;
  if (!M) return;

  // ---- Numbers from the manuscript and the sources ----
  check("Cold Cart: the 12.8 V 200 Ah LiFePO4 battery stores 2560 Wh", M.parts.batteryWh === 2560);
  check("Cold Cart: 8 Peltier modules and a 550 W panel, as in the manuscript", M.parts.modules === 8 && M.parts.panelW === 550);
  check("Cold Cart: safe fish storage is 4 °C (40 °F) or colder (FDA)", M.limits.safe === 4 && near(M.limits.safe * 9 / 5 + 32, 40, 1));
  check("Cold Cart: tropical fish spoil about 3.3× faster at 10 °C and ~25–36× at 27–30 °C than at 0 °C (FAO eq. 6.d)",
    near(M.spoilRate(10), 3.32, 0.05) && M.spoilRate(27) > 25 && near(M.spoilRate(30), 36.6, 0.5), M.spoilRate(10).toFixed(2));
  // ---- Peltier physics ----
  const small = M.peltier(20), big = M.peltier(60);
  check("Cold Cart: a bigger hot–cold gap means less heat pumped for more power", big.qc < small.qc && big.p > small.p);
  check("Cold Cart: past about 76 °C of gap a Peltier module warms its cold side", M.peltier(80).qc < 0 && M.peltier(70).qc > 0);
  check("Cold Cart: no sun at night, full sun at noon", M.sunlight(2, "sunny") === 0 && near(M.sunlight(12, "sunny"), 1, 0.001) && M.sunlight(12, "rainy") < M.sunlight(12, "cloudy"));

  const pel = { kind: "if", sensor: "box", op: ">", value: 4, until: 2, actuator: "peltier" };
  const pelEco = { kind: "if", sensor: "box", op: ">", value: 4, until: 3.5, actuator: "peltier" };
  const fan = { kind: "if", sensor: "sink", op: ">", value: 35, actuator: "fans" };
  const always = { kind: "if", sensor: "battery", op: ">", value: 0, actuator: "peltier" };
  const alertR = { kind: "if", sensor: "gas", op: ">", value: 40, actuator: "alert" };
  const box = (opts, rules, hours) => { const s = IoT.createSim(M, opts); s.rules = rules; s.run(hours * 60); return s; };
  check("Cold Cart: without the fans the hot side passes 70 °C within an hour", box({ weather: "sunny" }, [pel], 1).state.sink > 70);
  check("Cold Cart: with fans the box reaches 4 °C or colder within 2 hours", box({ weather: "sunny" }, [pel, fan], 2).state.box <= 4.1);
  check("Cold Cart: with no cooling, fish on a sunny day spoil (gas index 60+)", box({ weather: "sunny" }, [], 12).state.gas >= 60);
  check("Cold Cart: a cooler running nonstop on a cloudy day empties a half-full battery",
    box({ weather: "cloudy", battery: 50 }, [always, fan], 12).history.some((h) => h.battery === 0));
  const hotFan = box({ weather: "cloudy", battery: 50 }, [pel, { kind: "if", sensor: "sink", op: ">", value: 45, actuator: "fans" }], 12).state.battWh;
  check("Cold Cart: letting the heatsink run hotter wastes battery", hotFan < box({ weather: "cloudy", battery: 50 }, [pel, fan], 12).state.battWh);

  // ---- Missions: run each until it ends ----
  const missions = M.missions;
  function play(m, rules) {
    const s = IoT.createSim(M, m.options); s.rules = rules; const start = s.minutes;
    for (let i = 0; i < 48 * 60; i++) { s.tick(); const r = m.check(s, (s.minutes - start) / 60); if (r.state !== "running") return r; }
    return { state: "timeout" };
  }
  check("Cold Cart: there are 5 missions", missions.length === 5);
  const plans = {
    "market-day": { good: [pel, fan], bad: [fan] },
    "hot-side": { good: [pel, fan], bad: [pel] },
    "cloudy": { good: [pelEco, fan], bad: [always, fan] },
    "rain-night": { good: [pelEco, fan], bad: [always, fan] },
    "spoiled": { good: [pel, fan, alertR], bad: [pel, fan] }
  };
  for (const m of missions) {
    const p = plans[m.id];
    const won = play(m, p.good), lost = play(m, p.bad);
    check(`Cold Cart mission "${m.title}" is won with sensible rules`, won.state === "won", won.message);
    check(`Cold Cart mission "${m.title}" is lost with careless rules`, lost.state === "lost", lost.message);
  }
  const m1 = play(missions[0], JSON.parse(JSON.stringify([pel, fan])));
  check("Cold Cart: mission 1 is won with the example rules", m1.state === "won", m1.message);
})(typeof window !== "undefined" ? window : globalThis);
