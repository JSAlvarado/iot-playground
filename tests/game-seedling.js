// ============ TESTS: Seedling Chamber (the science behind the game values, and every mission) ============
(function (root) {
  "use strict";
  const { check, near } = root.IoTTest;
  const { IoT, SeedlingModel: M } = root;
  if (!M) return;

  // ---- Germination and heat (UC chart, University of Arizona) ----
  check("Seedling: tomato sprouts fastest at 25–30 °C, about 5.9 days (UC chart)", near(1 / M.germRate("tomato", 27), 5.9, 0.05));
  check("Seedling: tomato sprouts slowly at 10 °C (about 43 days)", near(1 / M.germRate("tomato", 10), 42.9, 0.5));
  check("Seedling: no tomato germination at 40 °C", M.germRate("tomato", 40) === 0 && M.germRate("tomato", 42) === 0);
  check("Seedling: germination slows above 30 °C", M.germRate("tomato", 35) < M.germRate("tomato", 30));
  check("Seedling: eggplant is slower than tomato at 20 °C", M.germRate("eggplant", 20) < M.germRate("tomato", 20));
  check("Seedling: growth is best at 20–29 °C and stops at 40 °C", M.growthTemp(25) === 1 && M.growthTemp(40) === 0 && M.growthTemp(36) < 0.3);
  check("Seedling: no light at night", M.daylight(2) === 0 && M.daylight(12) > 0.99);
  check("Seedling: rain only falls on rainy days, in showers", M.rainAt(1, 13, "sunny") === 0 && [...Array(24).keys()].some((h) => M.rainAt(1, h, "rainy") > 0) && [...Array(24).keys()].some((h) => M.rainAt(1, h, "rainy") === 0));

  // ---- The chamber ----
  const W = { kind: "if", sensor: "moisture", op: "<", value: 40, actuator: "valve", until: 60 };
  const F = { kind: "if", sensor: "temp", op: ">", value: 30, actuator: "fan" };
  const H = { kind: "if", sensor: "humidity", op: ">", value: 90, actuator: "fan" };
  const sim = (opts, rules, hours) => { const s = IoT.createSim(M, opts); s.rules = rules; let maxT = -99; for (let i = 0; i < hours * 60; i++) { s.tick(); maxT = Math.max(maxT, s.state.temp); } s.maxT = maxT; return s; };
  check("Seedling: a closed chamber in the sun goes above 40 °C", sim({ weather: "sunny" }, [W], 12).maxT > 40);
  check("Seedling: a fan rule keeps it below 35 °C", sim({ weather: "sunny" }, [W, F], 24).maxT < 35);
  check("Seedling: rain fills the barrel", (() => { const s = sim({ weather: "rainy", tank: 10 }, [], 24); return s.state.tank > 10; })());
  check("Seedling: no water means no sprouts", !sim({ weather: "cloudy", moisture: 20 }, [], 48).state.sprouted);
  check("Seedling: rainy nights drip without a humidity fan rule", sim({ weather: "rainy" }, [W, F], 24).state.dripHours > 2);
  check("Seedling: the humidity fan rule stops the dripping", sim({ weather: "rainy" }, [W, F, H], 24).state.dripHours === 0);

  // ---- Missions: each is won by sensible rules and lost by careless ones ----
  const missions = M.missions;
  function play(m, rules) {
    const s = IoT.createSim(M, m.options); s.rules = rules;
    const start = s.minutes;
    for (let i = 0; i < 24 * 60 * 8; i++) { s.tick(); const r = m.check(s, (s.minutes - start) / 60); if (r.state !== "running") return r; }
    return { state: "running" };
  }
  if (missions) {
    const byId = Object.fromEntries(missions.map((m) => [m.id, m]));
    const timeWater = [{ kind: "at", time: "07:00", actuator: "water" }, { kind: "at", time: "17:00", actuator: "water" }];
    const flood = { kind: "if", sensor: "moisture", op: "<", value: 95, actuator: "valve" };
    const cases = [
      ["first-sprouts", [W], []],
      ["sunny-heat", [W, F], [W]],
      ["rainy-nights", [W, F, H], [W, F]],
      ["dry-spell", [W, F], [flood, F]],
      ["dry-spell", [W, F], [...timeWater, F]],
      ["eggplant", [W, F, H], [W, F]]
    ];
    for (const [id, good, bad] of cases) {
      const m = byId[id];
      const won = play(m, good), lost = play(m, bad);
      check(`Seedling mission "${m.title}" is won by sensible rules`, won.state === "won", won.message);
      check(`Seedling mission "${m.title}" is lost by careless rules`, lost.state === "lost", lost.message);
    }
    check("Seedling: mission 1 is won with the default rule", play(missions[0], [W]).state === "won");
  }
})(typeof window !== "undefined" ? window : globalThis);
