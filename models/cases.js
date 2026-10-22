// ============ SENSOR DETECTIVE CASES: mysteries made from the real game models ============
// Each case runs a pond, plant or room simulation with a mistake in it (a bad rule, an empty tank, a loose sensor
// wire) and records the sensor readings every 10 virtual minutes. The player reads the graphs and picks the cause.
// No screen code here, so the tests can check that every graph really shows what its answer says.
(function (root) {
  "use strict";
  const { IoT, PondModel, PlantModel, RoomModel } = root;

  // Run a model for some hours and sample it every 10 minutes: sample(state, readings) → { key: value }
  function record(model, options, rules, hours, sample, setup) {
    const sim = IoT.createSim(model, options);
    sim.rules = rules;
    if (setup) setup(sim);
    const points = [], marks = [];
    let prevOpen = false;
    for (let i = 0; i < hours * 60; i++) {
      const ctx = sim.tick();
      for (const e of ctx.events) marks.push({ minutes: sim.minutes, label: e });
      if (sim.state.windowOpen && !prevOpen) marks.push({ minutes: sim.minutes, label: "window" });
      prevOpen = !!sim.state.windowOpen;
      if (sim.minutes % 10 === 0) points.push({ minutes: sim.minutes, ...sample(sim.state, model.readings(sim.state), sim.minutes) });
    }
    return { points, marks };
  }
  const feed2 = [{ kind: "at", time: "07:00", actuator: "feeder" }, { kind: "at", time: "17:00", actuator: "feeder" }];
  const aerate = { kind: "if", sensor: "oxygen", op: "<", value: 4, until: 5, actuator: "aerator" };
  const heat = { kind: "if", sensor: "temp", op: "<", value: 20, until: 22, actuator: "heater" };
  const G = {
    oxygen: { key: "oxygen", label: "Dissolved oxygen", unit: "mg/L", min: 0, max: 12, good: [5, 12] },
    temp: { key: "temp", label: "Water temperature", unit: "°C", min: 10, max: 40, good: [25, 30] },
    battery: { key: "battery", label: "Solar battery", unit: "%", min: 0, max: 100, good: [30, 100] },
    moisture: { key: "moisture", label: "Soil moisture", unit: "%", min: 0, max: 100, good: [40, 70] },
    tank: { key: "tank", label: "Water tank", unit: "L", min: 0, max: 3, good: [0.5, 3] },
    health: { key: "health", label: "Plant health", unit: "%", min: 0, max: 100, good: [70, 100] },
    co2: { key: "co2", label: "CO2", unit: "ppm", min: 400, max: 2500, good: [400, 1000] },
    pm: { key: "pm", label: "Indoor PM2.5", unit: "µg/m³", min: 0, max: 150, good: [0, 35] },
    rh: { key: "humidity", label: "Humidity", unit: "%", min: 0, max: 100, good: [30, 60] }
  };

  const cases = [
    { id: "cloudy-dawn", world: "pond", title: "The morning the fish gasped",
      story: "After two grey days, the farmer finds the tilapia gasping at the surface at dawn. The feeder ran twice a day as usual, and the aerator has no rule.",
      data: () => record(PondModel, { weather: "cloudy", airHigh: 31 }, feed2, 48, (s, r) => ({ oxygen: r.oxygen, temp: r.temp })),
      graph: G.oxygen, clue: { text: "Weather log: cloudy, cloudy. The second graph shows the water temperature.", graph: G.temp },
      options: [
        { text: "The water got too hot for the fish", why: "The water stayed between about 25 and 28 °C (see the clue graph), inside the tilapia's best range of 25–30 °C." },
        { text: "Cloudy days: the algae made little oxygen, and nothing aerated the pond at night", ok: true },
        { text: "The fish were fed far too much", why: "Two 100 g meals a day is normal here. Overfeeding shows as oxygen crashing within hours of the extra meals, even while the sun is up." },
        { text: "The oxygen probe broke", why: "A broken probe usually gives impossible or frozen readings. This one rises a little each day and falls each night, which is real pond behaviour." }
      ],
      explain: "Oxygen rises by day because algae photosynthesise, and falls overnight because everything in the pond keeps using it. Under clouds the daytime rise is small, so each night starts lower and ends lower. A rule like IF Oxygen is below 4 THEN Aerator ON UNTIL 5 would have kept it safe." },

    { id: "six-meals", world: "pond", title: "Six meals a day",
      story: "A new helper set the feeder to run every two hours, from 06:00 to 16:00, on a hot sunny day. By evening the pond looked murky and the fish were gasping.",
      data: () => record(PondModel, { weather: "sunny", airHigh: 31 }, ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00"].map((t) => ({ kind: "at", time: t, actuator: "feeder" })), 24,
        (s, r) => ({ oxygen: r.oxygen, temp: r.temp })),
      graph: G.oxygen, markLabel: { feeder: "feed" }, clue: { text: "The dashed lines on the graph are the feeder runs: 6 × 100 g." },
      options: [
        { text: "Uneaten feed rotted, and the bacteria breaking it down used up the oxygen", ok: true },
        { text: "It was night, so the algae stopped making oxygen", why: "Every night is dark, yet on normal two-meal days the oxygen never falls this far. Here it started falling in the afternoon, while the sun was still up, as uneaten feed piled up." },
        { text: "The water was too warm", why: "Warm water holds a little less oxygen, but the same day without the extra meals stays healthy. The drops line up with the feeding." },
        { text: "The solar battery ran out", why: "The battery only matters for the aerator, and nothing in this case used it." }
      ],
      explain: "Fish eat only so much. The rest of the feed sinks or drifts and rots, and the bacteria that break it down use oxygen. That's why farmers feed measured amounts and watch whether the fish finish it." },

    { id: "flat-battery", world: "pond", title: "Dead before dawn",
      story: "The aerator was switched to always ON to be safe. The solar battery started at 40%, and by the first cloudy evening the aerator went silent. That night the oxygen fell.",
      data: () => record(PondModel, { weather: "cloudy", airHigh: 31, battery: 40 }, feed2, 40, (s, r) => ({ battery: r.battery, oxygen: r.oxygen }), (sim) => { sim.manual.aerator = "on"; }),
      graph: G.battery, clue: { text: "The second graph shows the oxygen.", graph: G.oxygen },
      options: [
        { text: "The solar panel broke", why: "The battery still climbs during the day, so the panel is charging. It just can't keep up." },
        { text: "Running the aerator all the time drained the battery, so it stopped when it was needed most", ok: true },
        { text: "The fish were overfed", why: "Only two normal meals a day, and the oxygen held up until the battery hit 0%." },
        { text: "The oxygen probe broke", why: "The oxygen falls once the battery is empty and the aerator stops, and rises again by day: that's real pond behaviour, not a sensor fault." }
      ],
      explain: "An aerator uses more power than a small solar panel makes on a cloudy day. Running it only when oxygen is low (an IF rule) saves the battery for the night, when it matters." },

    { id: "minus-127", world: "pond", title: "−127 °C in the tropics",
      story: "The pond's temperature graph shows the water at −127 °C for a few hours one night, then back to normal. The fish were fine.",
      data: () => {
        const d = record(PondModel, { weather: "sunny", airHigh: 31 }, [...feed2, aerate], 30, (s, r) => ({ temp: r.temp }));
        d.points.forEach((p) => { const h = (p.minutes % 1440) / 60; if (p.minutes > 1440 && h >= 1 && h < 3.5) p.temp = -127; });
        return d;
      },
      graph: { ...G.temp, min: -130, max: 40, good: [25, 30] }, clue: { text: "The DS18B20 temperature probe hangs on a long wire from the floating unit, and it was a windy night." },
      options: [
        { text: "The pond froze for a few hours", why: "Water freezes at 0 °C, and a tropical pond can't drop 150 degrees in minutes and bounce back. The fish would not have survived." },
        { text: "The probe's wire came loose, and −127 is the 'no sensor answered' code", ok: true },
        { text: "A heat wave confused the sensor", why: "A heat wave would push readings up, not down to −127." },
        { text: "The controller ran out of memory", why: "That usually freezes or restarts the controller; it doesn't produce one exact number like −127 again and again." }
      ],
      explain: "The common DallasTemperature library for the DS18B20 returns −127 °C (its 'device disconnected' value) when the probe doesn't answer: a loose wire, a bad joint or a missing 4.7 kΩ pull-up resistor. Good code checks for −127 and ignores it instead of acting on it." },

    { id: "drowned", world: "plant", title: "The plant that drowned",
      story: "Someone wanted to be sure the plant never got thirsty and set the pump rule to IF Soil moisture is below 99 THEN Pump ON. Three cloudy days later, the leaves are yellow.",
      data: () => record(PlantModel, { weatherDays: Array(7).fill("cloudy") }, [{ kind: "if", sensor: "moisture", op: "<", value: 99, actuator: "pump" }], 72,
        (s, r) => ({ moisture: r.moisture, health: s.health })),
      graph: G.moisture, clue: { text: "The second graph shows the plant's health.", graph: G.health },
      options: [
        { text: "Too much rain", why: "It was cloudy, not rainy. The soil is wet because of the pump." },
        { text: "The rule's number is so high that the pump almost never stops, so the soil is waterlogged", ok: true },
        { text: "The soil sensor is broken", why: "The reading behaves like real soil: it climbs while the pump runs. It's the rule that's wrong." },
        { text: "Not enough light", why: "Cloudy days slow growth, but they don't turn leaves yellow by themselves. The graph shows soggy soil above 85%." }
      ],
      explain: "Roots need air as well as water. Waterlogged soil pushes out the oxygen they need, and root rot can follow, so overwatering often looks like thirst. A rule like IF moisture is below 40 THEN Pump ON waters only when the soil is actually dry." },

    { id: "empty-tank", world: "plant", title: "Pump running, soil still dry",
      story: "The pump rule worked for days, then the plant started drooping. The controller log says the pump keeps switching on.",
      data: () => record(PlantModel, { weatherDays: Array(7).fill("sunny"), tank: 1.2 }, [{ kind: "if", sensor: "moisture", op: "<", value: 40, actuator: "pump" }], 120,
        (s, r) => ({ moisture: r.moisture, tank: r.tank })),
      graph: G.moisture, clue: { text: "The second graph shows the water tank.", graph: G.tank },
      options: [
        { text: "The rule's number is too low", why: "The same rule kept the soil at 40% for days. Something changed later." },
        { text: "The water tank ran empty, so the pump had nothing to pump", ok: true },
        { text: "The plant needs more light", why: "Light helps it grow, but the problem here is water: the soil keeps drying." },
        { text: "The soil sensor is broken", why: "The reading drops smoothly as the soil dries, which is what a working sensor shows." }
      ],
      explain: "A pump can only move water that's there. Real systems add a float switch or level sensor to the tank, so the controller can warn you and stop the pump: running dry can damage it." },

    { id: "flat-line", world: "plant", title: "A perfectly flat line",
      story: "The soil-moisture graph shows 52% for two whole days, not a wiggle, while the leaves droop. The pump rule (below 40) never switched on.",
      data: () => {
        const d = record(PlantModel, { weatherDays: Array(7).fill("sunny") }, [], 60, (s, r) => ({ moisture: r.moisture, health: s.health }));
        d.points.forEach((p) => { if (p.minutes > 600) p.moisture = 52; });
        return d;
      },
      graph: G.moisture, clue: { text: "The second graph shows the plant's health, which the sensor can't fake.", graph: G.health },
      options: [
        { text: "The soil stayed perfectly moist", why: "Real soil dries in the sun every day, and the plant's health is falling. The reading isn't telling the truth." },
        { text: "The sensor's reading is stuck, so the pump rule never saw the soil get dry", ok: true },
        { text: "The plant was overwatered", why: "The pump never ran at all, so nothing watered it." },
        { text: "Too much light", why: "Sun dries the soil faster, but it wouldn't freeze the reading at exactly 52%." }
      ],
      explain: "Real readings always move a little. A perfectly flat line usually means the sensor is unplugged, damaged or the code stopped updating it, and every rule that trusts it goes blind. Many controllers raise an alarm if a reading hasn't changed for hours." },

    { id: "stuffy", world: "room", title: "A heavy head in the morning",
      story: "You wake up with a heavy head in your small studio. The heating ran all night, and the window stayed shut because it was below freezing outside.",
      data: () => record(RoomModel, { startMinutes: 22 * 60, outHigh: 2, co2Start: 650 }, [heat], 10, (s, r) => ({ co2: r.co2, humidity: r.humidity })),
      graph: G.co2, clue: { text: "Window log: closed from 22:00 to 08:00. One person was in the room." },
      options: [
        { text: "The floor heating made CO2", why: "Korean floor heating uses hot water from a boiler that vents outside, so it adds no CO2 to the room's air." },
        { text: "Your own breathing in a closed room: CO2 kept building up all night", ok: true },
        { text: "Air pollution from outside", why: "Outdoor air has about 420 ppm of CO2, and the window was shut. The CO2 came from inside." },
        { text: "The CO2 sensor drifted", why: "Sensors can drift slowly over weeks, not climb 900 ppm in one night and match exactly when someone was home with the window shut." }
      ],
      explain: "Every breath adds CO2. In a small sealed room one sleeping person can push it well past 1,000 ppm, the limit Korea sets for multi-use facilities such as hospitals and daycare centres. A short airing, or a rule like IF CO2 is above 1000 THEN Window ON UNTIL 700, keeps it fresh." },

    { id: "dust-in", world: "room", title: "Fresh air, dirtier air",
      story: "On a Very bad fine-dust day (90 µg/m³ outside), the smart window kept opening to clear the CO2. Indoor PM2.5 kept jumping up. The humidifier was off all day.",
      data: () => record(RoomModel, { startMinutes: 8 * 60, outHigh: 4, outPm: 90 }, [heat, { kind: "if", sensor: "co2", op: ">", value: 1000, until: 700, actuator: "window" }], 12,
        (s, r) => ({ pm: r.pm, co2: r.co2 })),
      graph: G.pm, markLabel: { window: "window" }, clue: { text: "The dashed lines are the times the window opened." },
      options: [
        { text: "Outdoor fine dust came in every time the window opened", ok: true },
        { text: "Cooking", why: "Nothing was cooked, and the jumps line up with the window opening, not with mealtimes." },
        { text: "Mist from the humidifier", why: "Ultrasonic humidifiers filled with tap water really can raise PM readings, but this one was off all day." },
        { text: "The air purifier broke", why: "There was no purifier rule in this room. That's the missing piece, not a broken part." }
      ],
      explain: "Airing out swaps your room's air for outdoor air, dust included. On bad days, keep airings short and run an air purifier, for example IF PM2.5 is above 35 THEN Purifier ON UNTIL 15." },

    { id: "foggy", world: "room", title: "A foggy, dripping window",
      story: "Someone switched the humidifier to always ON because the winter air felt dry. Now water runs down the window every morning and there's a dark spot in the corner.",
      data: () => record(RoomModel, { startMinutes: 18 * 60, outHigh: 0 }, [heat], 24, (s, r) => ({ humidity: r.humidity, co2: r.co2 }), (sim) => { sim.manual.humidifier = "on"; }),
      graph: G.rh, clue: { text: "Humidifier log: ON for 24 hours straight." },
      options: [
        { text: "Rain outside got in", why: "The window was shut, and cold winter air holds very little water anyway." },
        { text: "The humidifier ran nonstop and pushed the humidity far above 60%, so water condensed on the cold glass", ok: true },
        { text: "Opening the window", why: "In winter, opening the window makes the room drier, not wetter." },
        { text: "The heating", why: "Heating actually lowers the relative humidity. It's the humidifier that added the water." }
      ],
      explain: "Warm, damp air meets the cold window and condenses, and damp corners grow mould. The US EPA advises keeping indoor humidity below 60%. A rule like IF Humidity is below 40 THEN Humidifier ON UNTIL 50 stops it in time." }
  ];

  root.DetectiveCases = cases;
})(typeof window !== "undefined" ? window : globalThis);
