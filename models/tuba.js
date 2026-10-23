// ============ AUTUBA MODEL: a solar-powered coconut wine (tuba) barrel, one virtual minute at a time ============
// Simplified on purpose so it runs in a phone browser, but the directions follow published tuba and palm-wine science:
//  - Fresh coconut sap is sweet and near neutral (pH about 6.8–7.4). Yeasts turn its sugar into alcohol while
//    bacteria make acids, so pH falls. A palm-wine guide (Practical Action) gives pH about 5.5 and 1.5–2.1% alcohol
//    after 24 hours of slow natural fermentation, and pH 4.0 with 4.5–5.2% alcohol by 72 hours. Freshly gathered
//    Philippine tuba averaged pH 4.7 and 7.3% alcohol (Fernandez et al. 1980), and that study advised selling tuba
//    no later than two days after gathering, because it keeps souring.
//  - Left too long, acetic acid bacteria turn the alcohol into acid: the wine becomes coconut vinegar.
//  - Tongog (dried mangrove bark, Ceriops tagal) colours tuba orange-red and is used as a bittering and fermenting
//    agent. The manuscript calls it "yeast"; the game treats it as a helper that speeds a clean fermentation and
//    slightly slows souring.
//  - Warmth speeds both fermentation and souring (the game doubles the rates for every 10 °C, a common rule of thumb).
// From the manuscript: the parts (pH sensor, alcohol vapour sensor, ultrasonic level sensor, tongog servo dispenser,
// stirrer motor, peristaltic pump, buzzer and LEDs, 100 W solar panel, LiFePO4 battery, Arduino Mega 2560), that the
// ultrasonic level sets the tongog dose, and that abnormal pH means spoilage. The manuscript gives NO set points, so
// every number below (pH 4.8 ready, 4% alcohol, pH 3.8 spoiled, 24 L barrel, 20 L of sap a day, battery use, rates)
// is a game value chosen to match the sources above.
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  const WEATHER = { sunny: { sun: 1, label: "Sunny" }, cloudy: { sun: 0.35, label: "Cloudy" }, rainy: { sun: 0.15, label: "Rainy" } };
  const LIMITS = {
    ph: { fresh: 7.0, ready: 4.8, spoiled: 3.8 }, // ready to harvest at or below 4.8; spoiled (vinegar) below 3.8
    alcohol: { ready: 4, full: 7 },               // ready from 4%; all the sugar would make about 7% (like 7.3% tuba)
    barrel: 24, sapPour: 20, sapHour: 7,          // litres; the farmer brings fresh sap at 07:00 each morning
    litresPerDose: 5,                             // one tongog portion per 5 L of sap (game value)
    pumpLpm: 0.5,                                 // peristaltic pump, litres per minute
    battery: { base: 1.2, stirrer: 6, pump: 3, charge: 30, restart: 5 } // % per hour; charge at full noon sun
  };

  // Sunlight from 0 to 1: daylight 06:00–18:00, strongest at noon, cut by clouds and rain
  function sunlight(hour, weather) {
    if (hour < 6 || hour > 18) return 0;
    return Math.sin(Math.PI * (hour - 6) / 12) * WEATHER[weather].sun;
  }
  // Air temperature: warmest at 14:00 (the day's high), coolest, 8 °C lower, at 02:00; rain cools it by 2 °C
  const airTemp = (hour, high, weather) => high - 4 + 4 * Math.cos(2 * Math.PI * (hour - 14) / 24) - (weather === "rainy" ? 2 : 0);
  // How much faster things happen when warm: twice as fast for every 10 °C above 28 °C (half as fast 10 °C below)
  const warmth = (t) => Math.pow(2, (t - 28) / 10);
  // pH from the acids built up in the sap: fresh sap at its starting pH, falling toward 3 as acid builds
  const phFrom = (acid, fresh) => 3 + (fresh - 3) / (1 + acid);

  // A clean barrel full of fresh sap
  function freshBatch(s, litres) {
    s.level = litres; s.sugar = 1; s.alcohol = 0; s.acid = 0; s.sourBugs = 0.002;
    s.tongog = 0; s.dissolved = 0; s.batchMin = 0; s.activity = 0; s.jug = 0;
  }

  const tubaModel = {
    weather: WEATHER, limits: LIMITS, sunlight, airTemp, warmth, phFrom,
    actuators: { stirrer: { kind: "switch" }, pump: { kind: "switch" }, tongog: { kind: "event" } },
    init(o = {}) {
      const s = {
        weather: o.weather || "sunny", weatherDays: o.weatherDays || null, airHigh: o.airHigh ?? 31,
        freshPh: o.freshPh ?? LIMITS.ph.fresh,
        battery: o.battery ?? 80, power: true, sun: 0,
        temp: o.airHigh ? o.airHigh - 5 : 26,
        stirring: false, pumping: false, alarm: false,
        good: 0, early: 0, sour: 0, bitter: 0, sapMissed: 0, batches: 0, spoiledBatch: false
      };
      freshBatch(s, o.level ?? LIMITS.sapPour);
      s.temp = airTemp(6, s.airHigh, s.weather);
      return s;
    },
    readings(s) {
      const has = s.level > 0.2;
      return { ph: +(has ? phFrom(s.acid, s.freshPh) : 7).toFixed(2), alcohol: +(has ? s.alcohol : 0).toFixed(2), level: +s.level.toFixed(1), battery: +s.battery.toFixed(1) };
    },
    ph: (s) => phFrom(s.acid, s.freshPh),
    step(s, ctx) {
      const h = 1 / 60; // one minute, in hours
      const hour = ctx.time.hour, B = LIMITS.battery;
      if (s.weatherDays) s.weather = s.weatherDays[(ctx.time.day - 1) % s.weatherDays.length];
      s.sun = sunlight(hour, s.weather);

      // Solar battery: the 100 W panel charges it in sunlight; the controller always uses a little, motors use more.
      // When it runs empty the controller shuts down, and it restarts once the sun has charged it back to 5%.
      s.battery = clamp(s.battery + B.charge * s.sun * h, 0, 100);
      if (s.power && s.battery <= 0) { s.power = false; ctx.note("Battery empty: the controller has shut down"); }
      if (!s.power && s.battery >= B.restart) { s.power = true; ctx.note("The sun recharged the battery: the controller is back on"); }

      // The farmer pours in fresh sap each morning, but only into an empty barrel
      if (ctx.time.hh === LIMITS.sapHour && ctx.time.mm === 0 && ctx.time.day > 1) {
        if (s.level < 0.5) { freshBatch(s, LIMITS.sapPour); ctx.note("The farmer poured in 20 L of fresh sap"); }
        else { s.sapMissed += LIMITS.sapPour; ctx.note("The barrel was still full, so this morning's sap couldn't go in"); }
      }

      // Tongog dispenser: the ultrasonic level sets the dose, one portion per 5 L of sap
      for (const e of ctx.events) if (e === "tongog") {
        if (!s.power) ctx.note("No power: the tongog dispenser can't turn");
        else if (s.level < 1) ctx.note("The barrel is empty: nothing to dispense into");
        else { const doses = Math.max(1, Math.round(s.level / LIMITS.litresPerDose)); s.tongog += 1; ctx.note(`Tongog dispenser: ${doses} portions for ${s.level.toFixed(0)} L of sap`); }
      }

      // Stirrer (only while the sap covers the paddle) and peristaltic pump, both need power
      s.stirring = !!ctx.switches.stirrer && s.power && s.level > 2;
      s.pumping = !!ctx.switches.pump && s.power && s.level > 0;
      s.battery = clamp(s.battery - (s.power ? B.base + (s.stirring ? B.stirrer : 0) + (s.pumping ? B.pump : 0) : 0) * h, 0, 100);

      // Barrel temperature follows the air slowly (shaded stainless steel barrel)
      const air = airTemp(hour, s.airHigh, s.weather);
      s.temp += (air - s.temp) * 0.3 * h;

      if (s.level > 0.2) {
        s.batchMin += 1;
        const w = warmth(s.temp);
        // Tongog sinks and soaks in slowly; stirring spreads it through the sap in an hour or so
        s.dissolved += (Math.min(1.5, s.tongog) - s.dissolved) * (s.stirring ? 2 : 0.12) * h;
        const help = Math.min(1, s.dissolved);
        // Fermentation: sugar becomes alcohol (yeasts) and some acid (lactic bacteria); wild yeasts work even without tongog
        s.activity = w * (0.25 + 0.75 * help) * s.sugar; // how busy the yeasts are, for the bubbles
        const fermented = 0.13 * s.activity * h;
        s.sugar -= fermented;
        s.alcohol += LIMITS.alcohol.full * fermented;
        s.acid += 1.9 * fermented;
        // Souring: acetic bacteria grow slowly, then turn alcohol into acid; tongog slows them a little
        s.sourBugs += 0.17 * w * (1 - 0.3 * help) * s.sourBugs * (1 - s.sourBugs) * h;
        const soured = Math.min(s.alcohol, 0.07 * w * s.sourBugs * s.alcohol * h);
        s.alcohol -= soured; s.acid += 0.8 * soured;
      } else s.activity = 0;

      // Pumping out: each litre is graded by the pH, alcohol and tongog at that moment
      const ph = phFrom(s.acid, s.freshPh);
      if (s.pumping) {
        const out = Math.min(s.level, LIMITS.pumpLpm);
        s.level -= out; s.jug += out;
        if (ph < LIMITS.ph.spoiled) s.sour += out;
        else if (ph > LIMITS.ph.ready || s.alcohol < LIMITS.alcohol.ready) s.early += out;
        else if (s.tongog > 1.5) s.bitter += out;
        else s.good += out;
        if (s.level <= 0.001) {
          s.level = 0; s.batches += 1; s.pumping = false;
          ctx.note(ph < LIMITS.ph.spoiled ? "Barrel empty: that batch had turned to coconut vinegar" : ph > LIMITS.ph.ready || s.alcohol < LIMITS.alcohol.ready ? "Barrel empty: that was pumped out too early, still sweet sap" : "Barrel empty: a batch of coconut wine (tuba) is in the jug");
        }
      }

      // Spoilage alert: the buzzer and red LED come on when the pH falls below 3.8 (needs power)
      const was = s.alarm;
      s.alarm = s.power && s.level > 0.2 && ph < LIMITS.ph.spoiled;
      if (s.level > 0.2 && ph < LIMITS.ph.spoiled) s.spoiledBatch = true;
      if (s.alarm && !was) ctx.note("Spoilage alert! The pH is below 3.8: the tuba is turning into vinegar");
    },
    // How the batch is doing, for the scene, the LEDs and the status line
    mood(s) {
      if (s.level <= 0.2) return { id: "empty", text: "The barrel is empty and clean, waiting for fresh sap" };
      const ph = phFrom(s.acid, s.freshPh);
      if (ph < LIMITS.ph.spoiled) return { id: "spoiled", text: "The wine has turned sour: it's coconut vinegar now!" };
      if (!s.power) return { id: "off", text: "No power: the controller is off" };
      if (ph <= LIMITS.ph.ready && s.alcohol >= LIMITS.alcohol.ready) return { id: "ready", text: ph < 4.1 ? "Ready, but it's starting to sour. Harvest now!" : "The coconut wine (tuba) is ready to harvest" };
      if (s.alcohol < 0.5) return { id: "fresh", text: "Sweet fresh sap, just starting to ferment" };
      return { id: "fermenting", text: "Fermenting: the sap is slowly turning into tuba" };
    }
  };

  // ---- Missions: each checks the barrel every virtual minute ----
  function track(sim) { return sim._track || (sim._track = { minBattery: 100 }); }
  const litres = (v) => `${Math.round(v)} L`;
  // hours: how long the mission runs; need: litres of good tuba; o: { noMissed, battery, earlyWin }
  function harvest(hours, need, o = {}) {
    return (sim, h) => {
      const t = track(sim), s = sim.state;
      t.minBattery = Math.min(t.minBattery, s.battery);
      if (s.spoiledBatch) return { state: "lost", message: "The batch turned sour (pH below 3.8): it's coconut vinegar now, not tuba. Pump it out sooner, before it sours." };
      if (s.early > 2) return { state: "lost", message: `${litres(s.early)} went out too early: it was still sweet sap, not tuba yet. Wait for a lower pH or more alcohol before pumping.` };
      if (s.bitter > 2) return { state: "lost", message: "Too much tongog made the tuba too bitter. Add tongog only once per batch." };
      if (o.noMissed && s.sapMissed > 0) return { state: "lost", message: "The barrel was still full when the farmer came with the morning sap at 07:00, so 20 L were lost. Harvest each batch before then." };
      if (o.battery && t.minBattery <= 0) return { state: "lost", message: "The solar battery ran empty and the controller shut down. The stirrer motor uses the most power: stir only at the start of a batch." };
      const done = h >= hours || (o.earlyWin && s.good >= need);
      if (done) {
        if (s.good < need) return { state: "lost", message: `Only ${litres(s.good)} of good coconut wine (tuba) were collected; the goal was ${need} L. Check the Graph tab, change your rules and try again.` };
        const wasted = s.early + s.sour + s.bitter;
        const stars = Math.max(1, 3 - (wasted > 0 ? 1 : 0) - (t.minBattery < 20 ? 1 : 0));
        return { state: "won", stars, message: `Mission complete! ${litres(s.good)} of tuba collected: ${"★".repeat(stars)}${stars < 3 ? " (waste nothing and keep the battery above 20% for 3 stars)" : ""}` };
      }
      const ph = tubaModel.readings(s).ph;
      return { state: "running", progress: o.earlyWin ? Math.max(h / hours, s.good / need) : h / hours, message: `${Math.floor(h)} of ${hours} hours · ${litres(s.good)} of ${need} L of tuba · pH ${ph.toFixed(1)}` };
    };
  }
  const missions = [
    { id: "first-batch", title: "1. First batch", goal: "The barrel is full of fresh sap. Collect at least 15 L of good coconut wine (tuba) within 24 hours. The example rules add tongog and pump the tuba out when the pH drops.",
      options: { weather: "sunny", airHigh: 31 }, check: harvest(24, 15) },
    { id: "market", title: "2. Market day", goal: "A vinegar maker collects 15 L of tuba at 18:00 to turn into coconut vinegar (sukang tuba), and the sky is cloudy. Have 15 L in the jug by then (12 hours). Tip: stir the tongog in so it works faster.",
      options: { weather: "cloudy", airHigh: 31 }, check: harvest(12, 15, { earlyWin: true }) },
    { id: "rainy", title: "3. Two rainy days", goal: "Rain means little solar power, and the battery starts at 45%. Make two batches in 48 hours (35 L) without the battery running empty.",
      options: { weather: "rainy", airHigh: 29, battery: 45 }, check: harvest(48, 35, { noMissed: true, battery: true }) },
    { id: "sour-sap", title: "4. A different sap", goal: "Today's sap is a little sour from the start (pH 6.0). The pH drops fast, but the alcohol is slow to come. Collect 15 L of real tuba in 24 hours without pumping out any too early.",
      options: { weather: "sunny", airHigh: 31, freshPh: 6.0 }, check: harvest(24, 15) },
    { id: "three-days", title: "5. Three-day run", goal: "Rainy, cloudy, then rainy again. The battery starts at 30% and the sap starts at pH 6.3. Make three batches (55 L) in 72 hours: no sap lost, nothing sour, battery never empty.",
      options: { weatherDays: ["rainy", "cloudy", "rainy"], weather: "rainy", airHigh: 30, battery: 30, freshPh: 6.3 }, check: harvest(72, 55, { noMissed: true, battery: true }) }
  ];
  tubaModel.missions = missions;

  root.TubaModel = tubaModel;
})(typeof window !== "undefined" ? window : globalThis);
