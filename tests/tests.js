// ============ TESTS: the science and the engine, checked on every change ============
// Runs in two places with the same code: GitHub Actions (node tests/run-node.js) and locally in any JavaScript
// engine after engine.js and the models are loaded. Each check is a fact the games depend on.
(function (root) {
  "use strict";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail ?? "" });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  // Each newer game adds its own checks in tests/game-<id>.js, loaded after this file, through IoTTest
  root.IoTTest = { check, near, results };
  root.TEST_RESULTS = results;
  const { IoT, PondModel, PlantModel } = root;

  // ---- Science helpers ----
  check("O2 saturation at 20 °C is 9.09 mg/L (APHA table)", near(IoT.oxygenSaturation(20), 9.09, 0.02), IoT.oxygenSaturation(20).toFixed(3));
  check("O2 saturation at 25 °C is 8.26 mg/L (APHA table)", near(IoT.oxygenSaturation(25), 8.26, 0.02), IoT.oxygenSaturation(25).toFixed(3));
  check("Warmer water holds less oxygen", IoT.oxygenSaturation(30) < IoT.oxygenSaturation(25));
  check("Clock text", IoT.clockText(6 * 60 + 5) === "Day 1, 06:05" && IoT.clockText(1440 + 125) === "Day 2, 02:05");

  // ---- Rule cards ----
  const r1 = IoT.evaluateRules([{ kind: "if", sensor: "oxygen", op: "<", value: 4, actuator: "aerator" }], { oxygen: 3.5 }, 0);
  check("IF oxygen < 4 turns the aerator on at 3.5", r1.on.aerator === true);
  const r2 = IoT.evaluateRules([{ kind: "if", sensor: "oxygen", op: "<", value: 4, actuator: "aerator" }], { oxygen: 6 }, 0);
  check("IF oxygen < 4 leaves the aerator off at 6", !r2.on.aerator);
  const r3 = IoT.evaluateRules([{ kind: "at", time: "07:00", actuator: "feeder" }], {}, 7 * 60);
  const r4 = IoT.evaluateRules([{ kind: "at", time: "07:00", actuator: "feeder" }], {}, 7 * 60 + 1);
  check("AT 07:00 fires at 07:00 only", r3.events.includes("feeder") && !r4.events.includes("feeder"));
  check("AT rules repeat every day", IoT.evaluateRules([{ kind: "at", time: "07:00", actuator: "feeder" }], {}, 1440 + 7 * 60).events.length === 1);

  // ---- Pond ----
  if (PondModel) {
    check("Tilapia stop eating below about 17 °C", PondModel.appetite(16) === 0);
    check("Tilapia eat fully at 25–30 °C", PondModel.appetite(27) === 1);
    check("No sunlight at night", PondModel.sunlight(2, "sunny") === 0 && PondModel.sunlight(12, "sunny") > 0.99);
    const feed = [{ kind: "at", time: "07:00", actuator: "feeder" }, { kind: "at", time: "17:00", actuator: "feeder" }];
    const aerate = { kind: "if", sensor: "oxygen", op: "<", value: 4, actuator: "aerator" };
    const pond = (opts, rules, days = 2) => { const s = IoT.createSim(PondModel, opts); s.rules = rules; s.run(days * 1440); return s; };
    const day = pond({ weather: "sunny" }, feed, 1);
    const lows = day.history.filter((h) => h.minutes % 1440 >= 300 && h.minutes % 1440 <= 420).map((h) => h.oxygen);
    const highs = day.history.filter((h) => h.minutes % 1440 >= 840 && h.minutes % 1440 <= 1020).map((h) => h.oxygen);
    check("Oxygen is higher in the afternoon than at dawn", Math.min(...highs) > Math.max(...lows));
    check("A sunny day with feeding and an aerator rule keeps fish healthy", pond({ weather: "sunny" }, [...feed, aerate]).state.health >= 95);
    check("Cloudy weather without an aerator harms the fish", pond({ weather: "cloudy" }, feed).state.health < 60);
    check("An aerator rule saves them on cloudy days", pond({ weather: "cloudy" }, [...feed, aerate]).state.health >= 95);
    check("An aerator left on all the time empties the solar battery",
      pond({ weather: "cloudy" }, [...feed, { kind: "if", sensor: "oxygen", op: "<", value: 99, actuator: "aerator" }]).history.some((h) => h.battery === 0));
    const over = pond({ weather: "sunny" }, ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00"].map((t) => ({ kind: "at", time: t, actuator: "feeder" })));
    check("Overfeeding crashes the oxygen", over.history.some((h) => h.oxygen < 1));
    check("Without feeding the fish get hungry", pond({ weather: "sunny" }, [aerate], 3).state.hunger > 0.75);
  }

  // ---- Plant ----
  if (PlantModel) {
    const water = { kind: "if", sensor: "moisture", op: "<", value: 40, actuator: "pump" };
    const plant = (opts, rules, days = 7) => { const s = IoT.createSim(PlantModel, opts); s.rules = rules; s.run(days * 1440); return s; };
    check("A pump rule keeps the plant healthy for 7 sunny days", plant({ weatherDays: Array(7).fill("sunny") }, [water]).state.health >= 90);
    check("Without watering the soil dries out in sunny weather", plant({ weatherDays: Array(7).fill("sunny") }, []).state.moisture < 25);
    check("Watering too much makes the soil soggy",
      plant({ weatherDays: Array(7).fill("cloudy") }, [{ kind: "if", sensor: "moisture", op: "<", value: 99, actuator: "pump" }]).history.some((h) => h.moisture > 85));
    check("The pump stops when the water tank is empty",
      plant({ weatherDays: Array(7).fill("sunny"), tank: 1 }, [{ kind: "if", sensor: "moisture", op: "<", value: 99, actuator: "pump" }]).state.tank === 0);
  }

  // ---- Rule cards with UNTIL (hysteresis) ----
  const hold = { kind: "if", sensor: "oxygen", op: "<", value: 4, until: 5, actuator: "aerator" };
  const latch = new WeakMap();
  const seq = [3.9, 4.5, 5.1, 4.5].map((o) => IoT.evaluateRules([hold], { oxygen: o }, 0, latch).on.aerator);
  check("UNTIL keeps a device on until the second level, then off", seq.join() === "true,true,false,false", seq.join());

  // ---- Room ----
  if (root.RoomModel) {
    const R = root.RoomModel;
    check("Air at 20 °C holds about 17.3 g/m³ of water (Magnus)", near(R.saturation(20), 17.3, 0.2), R.saturation(20).toFixed(2));
    check("PM2.5 grades: 15 Good, 35 Moderate, 36 Bad, 76 Very bad", R.pmGrade(15) === "Good" && R.pmGrade(35) === "Moderate" && R.pmGrade(36) === "Bad" && R.pmGrade(76) === "Very bad");
    const room = (opts, rules, hours = 24) => { const s = IoT.createSim(R, { startMinutes: 1080, ...opts }); s.rules = rules; s.run(hours * 60); return s; };
    const heatR = { kind: "if", sensor: "temp", op: "<", value: 20, until: 22, actuator: "heater" };
    const winR = { kind: "if", sensor: "co2", op: ">", value: 1000, until: 700, actuator: "window" };
    check("Without heating the room gets cold in winter", room({ outHigh: 0 }, [], 12).state.temp < 12);
    check("A heating rule keeps the room at 20–22 °C", (() => { const s = room({ outHigh: 0 }, [heatR], 12); return s.state.temp >= 19.5 && s.state.temp <= 22.5; })());
    check("Heating dry winter air keeps humidity below 30% for most of the day", (() => { const h = room({ outHigh: -2 }, [heatR]).history; return h.filter((p) => p.humidity < 30).length > h.length / 2; })());
    check("CO2 climbs past 1500 ppm in a closed room overnight", room({}, [heatR], 12).state.co2 > 1500);
    check("A window rule keeps CO2 near or below 1000 ppm", room({}, [heatR, winR]).history.every((p) => p.co2 <= 1010));
    check("On a Very bad dust day an open window lets fine dust in", room({ outPm: 90 }, [heatR, winR]).history.some((p) => p.pm > 75));
    check("An air purifier keeps indoor PM2.5 under 50 on that day",
      room({ outPm: 90 }, [heatR, winR, { kind: "if", sensor: "pm", op: ">", value: 35, until: 15, actuator: "purifier" }]).history.every((p) => p.pm < 50));
    check("Grilling fish in a closed room pushes PM2.5 far above 75", room({ cookAt: 1140 }, [heatR], 6).history.some((p) => p.pm > 300));
  }

  // ---- Sensor Detective: every graph shows what its answer says ----
  if (root.DetectiveCases) {
    const C = Object.fromEntries(root.DetectiveCases.map((c) => [c.id, c.data()]));
    const vals = (id, key) => C[id].points.map((p) => p[key]);
    const min = (a) => Math.min(...a), max = (a) => Math.max(...a);
    check("Every case has exactly one right answer", root.DetectiveCases.every((c) => c.options.filter((o) => o.ok).length === 1 && c.options.every((o) => o.ok || o.why)));
    check("Case 1: two cloudy days push oxygen below 3 while water stays 24–29 °C", min(vals("cloudy-dawn", "oxygen")) < 3 && min(vals("cloudy-dawn", "temp")) > 24 && max(vals("cloudy-dawn", "temp")) < 29);
    check("Case 2: six meals crash the oxygen, starting while the sun is up",
      min(vals("six-meals", "oxygen")) < 1 && C["six-meals"].points.some((p) => p.minutes % 1440 === 17 * 60 && p.oxygen < 5));
    check("Case 3: the battery empties on the first evening, then oxygen falls", (() => { const z = C["flat-battery"].points.find((p) => p.battery === 0); return z && z.minutes < 1440 && C["flat-battery"].points.some((p) => p.minutes > z.minutes && p.oxygen < 4); })());
    check("Case 4: the temperature shows −127 only for a few hours", vals("minus-127", "temp").filter((v) => v === -127).length <= 18 && vals("minus-127", "temp").includes(-127));
    check("Case 5: soil stays above 85% (waterlogged) and health falls", max(vals("drowned", "moisture")) > 85 && min(vals("drowned", "health")) < 70);
    check("Case 6: the tank reaches 0 and the soil dries below 25%", min(vals("empty-tank", "tank")) === 0 && min(vals("empty-tank", "moisture")) < 25);
    check("Case 7: the reading is flat while the plant's health falls", new Set(C["flat-line"].points.filter((p) => p.minutes > 600).map((p) => p.moisture)).size === 1 && min(vals("flat-line", "health")) < 90);
    check("Case 8: CO2 climbs about 900 ppm in one closed night", max(vals("stuffy", "co2")) - vals("stuffy", "co2")[0] > 800);
    check("Case 9: indoor PM2.5 rises above 35 after the window opens", max(vals("dust-in", "pm")) > 35 && C["dust-in"].marks.some((m) => m.label === "window"));
    check("Case 10: a nonstop humidifier pushes humidity above 70%", max(vals("foggy", "humidity")) > 70);
  }

  // ---- Circuit Playground: real wiring rules ----
  if (root.CircuitModel) {
    const CM = root.CircuitModel, ch = (id) => CM.CHALLENGES.find((c) => c.id === id);
    const good1 = [["D13", "r1.r1"], ["r1.r2", "led1.a"], ["led1.k", "GND1"]];
    check("A 220 Ω LED circuit passes and blinks", CM.verify(ch("blink"), CM.analyze(ch("blink"), good1)));
    check("220 Ω gives about 14 mA for a red LED", near(CM.analyze(ch("blink"), good1).parts.led1.mA, 13.6, 0.2));
    check("An LED with no resistor burns when the pin goes HIGH", CM.run(ch("blink"), CM.analyze(ch("blink"), [["D13", "led1.a"], ["led1.k", "GND2"]]), { t: 0.1 }).leds.led1 === "burn");
    check("A backwards LED stays dark", CM.analyze(ch("blink"), [["D13", "r1.r1"], ["r1.r2", "led1.k"], ["led1.a", "GND1"]]).parts.led1.state === "reversed");
    check("5V wired to GND is reported as a short circuit", CM.analyze(ch("blink"), [...good1, ["5V", "GND1"]]).problems[0].text.includes("short circuit"));
    const btnOk = [["D13", "r1.r1"], ["r1.r2", "led1.a"], ["led1.k", "GND1"], ["D2", "btn.p1"], ["btn.p2", "GND2"]];
    check("Button to GND with INPUT_PULLUP works", CM.verify(ch("button"), CM.analyze(ch("button"), btnOk)));
    check("Button to 5V with INPUT_PULLUP does nothing", CM.analyze(ch("button"), [...btnOk.slice(0, 4), ["btn.p2", "5V"]]).parts.btn.state === "toVcc");
    const night = [["5V", "ldr.p1"], ["ldr.p2", "A0"], ["A0", "r10.r1"], ["r10.r2", "GND1"], ["D13", "r1.r1"], ["r1.r2", "led1.a"], ["led1.k", "GND2"]];
    check("LDR + 10 kΩ divider: dark reads low, light reads high", CM.verify(ch("night"), CM.analyze(ch("night"), night)));
    check("An upside-down divider is caught", CM.analyze(ch("night"), [["GND1", "ldr.p1"], ["ldr.p2", "A0"], ["A0", "r10.r1"], ["r10.r2", "5V"], ...night.slice(4)]).parts.ldr.state === "inverted");
    check("TMP36: 0.75 V reads as 25 °C", near(CM.tmpFromAdc(CM.toAdc(0.75)), 25, 0.5));
    const heat = [["tmp.vs", "5V"], ["tmp.out", "A0"], ["tmp.gnd", "GND1"], ["buz.plus", "D8"], ["buz.minus", "GND2"]];
    check("Heat alarm sounds above 30 °C, quiet at 24 °C", CM.verify(ch("heat"), CM.analyze(ch("heat"), heat)));
    check("A reversed TMP36 is flagged as dangerous", CM.analyze(ch("heat"), [["tmp.vs", "GND1"], ["tmp.out", "A0"], ["tmp.gnd", "5V"], ...heat.slice(3)]).problems[0].level === "bad");
    const tl = ["red:rr:D11", "yellow:ry:D12", "green:rg:D13"].flatMap((s) => { const [l, r, d] = s.split(":"); return [[d, r + ".r1"], [r + ".r2", l + ".a"], [l + ".k", "GND1"]]; });
    check("Traffic light with three pins runs green, yellow, red", CM.verify(ch("traffic"), CM.analyze(ch("traffic"), tl)));
    check("Two LEDs on one pin are caught", !CM.analyze(ch("traffic"), tl.map((w) => (w[0] === "D12" ? ["D11", w[1]] : w))).ok);
  }

  // ---- Arduino code ----
  const code = IoT.arduinoCode([{ kind: "if", sensor: "oxygen", op: "<", value: 4, actuator: "aerator" }, { kind: "at", time: "07:00", actuator: "feeder" }],
    { title: "Test", sensors: { oxygen: { fn: "readOxygen", unit: "mg/L", label: "Dissolved oxygen" } },
      actuators: { aerator: { pin: 5, label: "Aerator", kind: "switch" }, feeder: { pin: 6, label: "Feeder", kind: "event" } } });
  check("Generated code switches the aerator on the rule", code.includes("digitalWrite(AERATOR_PIN, (oxygen < 4) ? HIGH : LOW);"));
  check("Generated code feeds at 07:00 (minute 420)", code.includes("if (minuteOfDay == 420)"));
  check("Generated code has setup() and loop()", code.includes("void setup()") && code.includes("void loop()"));
  const code2 = IoT.arduinoCode([hold], { title: "T", sensors: { oxygen: { fn: "readOxygen", unit: "mg/L", label: "DO" } }, actuators: { aerator: { pin: 5, label: "Aerator", kind: "switch" } } });
  check("Generated code writes the UNTIL rule as hysteresis", code2.includes("if (oxygen < 4) aeratorHold1 = true;") && code2.includes("else if (oxygen > 5) aeratorHold1 = false;"));
  const code3 = IoT.arduinoCode([{ kind: "at", time: "12:00", actuator: "vent" }], { title: "T", sensors: {}, actuators: { window: { pin: 8, label: "Window", kind: "switch" }, vent: { label: "Air out", kind: "event", drives: "window", durationMin: 10 } } });
  check("A 10-minute airing uses a timer, not a 10-minute delay()", code3.includes("ventUntil = millis() + 10UL * 60UL * 1000UL;") && !code3.includes("delay(600000)"));

  // ---- IF rules that START an action (like a timed UV cycle) fire once each time they turn true ----
  const pulseModel = { actuators: { uv: { kind: "event" } }, init: () => ({ gas: 0, starts: 0 }), readings: (s) => ({ gas: s.gas }),
    step(s, ctx) { s.starts += ctx.events.filter((e) => e === "uv").length; } };
  const ps = IoT.createSim(pulseModel); ps.rules = [{ kind: "if", sensor: "gas", op: ">", value: 5, actuator: "uv" }];
  ps.state.gas = 9; ps.run(30); ps.state.gas = 1; ps.run(5); ps.state.gas = 9; ps.run(5);
  check("An IF rule starts an action once per time it turns true, not every minute", ps.state.starts === 2, ps.state.starts);
  const code4 = IoT.arduinoCode([{ kind: "if", sensor: "gas", op: ">", value: 400, actuator: "uv" }],
    { title: "T", sensors: { gas: { fn: "readGas", unit: "ppm", label: "Gas" } },
      actuators: { lamp: { pin: 7, label: "UV lamp", kind: "switch", onlyIf: "lidClosed()" }, uv: { label: "UV cycle", kind: "event", drives: "lamp", durationMs: 182000 } } });
  check("Arduino code starts a timed cycle on the rising edge and guards the lamp", /uvNow && !uvWasTrue/.test(code4) && /182000UL/.test(code4) && /&& lidClosed\(\)/.test(code4));

  root.TEST_RESULTS = results;
})(typeof window !== "undefined" ? window : globalThis);
