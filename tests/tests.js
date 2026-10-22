// ============ TESTS: the science and the engine, checked on every change ============
// Runs in two places with the same code: GitHub Actions (node tests/run-node.js) and locally in any JavaScript
// engine after engine.js and the models are loaded. Each check is a fact the games depend on.
(function (root) {
  "use strict";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail ?? "" });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
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

  // ---- Arduino code ----
  const code = IoT.arduinoCode([{ kind: "if", sensor: "oxygen", op: "<", value: 4, actuator: "aerator" }, { kind: "at", time: "07:00", actuator: "feeder" }],
    { title: "Test", sensors: { oxygen: { fn: "readOxygen", unit: "mg/L", label: "Dissolved oxygen" } },
      actuators: { aerator: { pin: 5, label: "Aerator", kind: "switch" }, feeder: { pin: 6, label: "Feeder", kind: "event" } } });
  check("Generated code switches the aerator on the rule", code.includes("digitalWrite(AERATOR_PIN, (oxygen < 4) ? HIGH : LOW);"));
  check("Generated code feeds at 07:00 (minute 420)", code.includes("if (minuteOfDay == 420)"));
  check("Generated code has setup() and loop()", code.includes("void setup()") && code.includes("void loop()"));

  root.TEST_RESULTS = results;
})(typeof window !== "undefined" ? window : globalThis);
