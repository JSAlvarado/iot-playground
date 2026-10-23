// ============ COPRAWATT MODEL: a coconut-farm biomass burner that dries copra and charges a battery ============
// Simplified on purpose so it runs in a phone browser. One tick is one virtual minute.
//  - The burner heats the copra dryer and a boiler. Steam spins a generator that charges a 12 V LiFePO4 battery,
//    and a 100 W solar panel helps in daylight.
//  - Numbers FROM THE MANUSCRIPT (all are the design's PROJECTIONS or assumptions, not measurements):
//    burn time per kg: shells 2.5 h, husks 1.8 h, leaves 0.7 h, wood 2.2 h; estimated 4.0, 3.5, 2.5, 4.2 kWh/kg;
//    a 4 L boiler takes about 45 min to reach 100 °C; generator about 720 W, 612 W of effective charging;
//    solar 100 W x 95% MPPT, about 4 peak sun hours a day; battery 12 V 100 Ah, 80% usable (BMS stops at 20%);
//    inverter 90%; household loads 85 W evening, 40 W fan; dryer band 50–70 °C.
//  - GAME VALUES from published sources: copra grades by moisture from a Philippine Department of Agriculture
//    technical brief (Grade 1 6–7.9%, Grade 2 8–10.9%, Grade 3 11–13.9%, reject 14% and up); about 60 °C for about
//    20 hours dries copra well (University of Moratuwa drying study). Carbon monoxide: OSHA limit 50 ppm over an
//    8-hour day, NIOSH recommended 35 ppm and a 200 ppm ceiling never to be passed.
//  - Invented for the game: the heating, cooling, smoke and drying rates, the scorch and mould penalties.
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  // Fuel table from the manuscript's Appendix I (projected): hours one kilogram burns, estimated kWh per kilogram
  const FUELS = {
    shells: { label: "Coconut shells", short: "Shells", hours: 2.5, kwh: 4.0 },
    husks: { label: "Coconut husks", short: "Husks", hours: 1.8, kwh: 3.5 },
    leaves: { label: "Dry leaves", short: "Leaves", hours: 0.7, kwh: 2.5 },
    wood: { label: "Wood", short: "Wood", hours: 2.2, kwh: 4.2 }
  };
  const fuelPower = (type) => FUELS[type].kwh / FUELS[type].hours; // kW of heat while one kilogram burns
  const WEATHER = { sunny: { sun: 1, cool: 0, dry: 1, label: "Sunny" }, cloudy: { sun: 0.5, cool: 1, dry: 0.9, label: "Cloudy" }, rainy: { sun: 0.15, cool: 3, dry: 0.7, label: "Rainy" } };
  const LIMITS = {
    dryer: { low: 50, high: 70, scorch: 72 },         // manuscript band; scorching above 72 °C is a game value
    grade: { one: 7.9, two: 10.9, three: 13.9 },      // DA copra grades by moisture, %
    co: { niosh: 35, osha: 50, ceiling: 200 },        // ppm
    battery: { cutoff: 20 },                          // the BMS keeps 20% in reserve (80% usable)
    burnerMaxKg: 4
  };
  const POWER = { battWh: 1200, genW: 612, solarW: 95, peakFactor: 0.52, inverter: 0.9 };
  POWER.peakFactor = 4 / (12 * 2 / Math.PI); // a sine-shaped sunny day then gives 4 peak sun hours, as assumed

  // Grade from moisture (DA technical brief); below 6% still counts as Grade 1 here
  function grade(m) {
    if (m <= LIMITS.grade.one) return "Grade 1";
    if (m <= LIMITS.grade.two) return "Grade 2";
    if (m <= LIMITS.grade.three) return "Grade 3";
    return "Not dry yet";
  }
  // Sunlight 0 … 1: daylight 06:00–18:00, strongest at noon, cut by clouds and rain
  function sunlight(hour, weather) {
    if (hour < 6 || hour > 18) return 0;
    return Math.sin(Math.PI * (hour - 6) / 12) * WEATHER[weather].sun;
  }
  const airTemp = (hour, high) => high - 4 + 4 * Math.cos(2 * Math.PI * (hour - 14) / 24);
  // How fast copra loses water at a dryer temperature (per hour): nothing below 42 °C, about 0.11 at 60 °C
  const dryRate = (t) => (t <= 42 ? 0 : 0.11 * Math.min(1.6, (t - 42) / 18));
  // The family's electricity use from the battery, in watts (manuscript's runtime table), through a 90% inverter
  function houseLoad(hour) {
    const ac = hour >= 18 && hour < 23 ? 85 : hour >= 23 || hour < 6 ? 40 : 20;
    return ac / POWER.inverter;
  }

  const model = {
    fuels: FUELS, fuelPower, weather: WEATHER, limits: LIMITS, power: POWER, grade, sunlight, airTemp, dryRate, houseLoad,
    actuators: { fan: { kind: "switch" }, fuel: { kind: "event" } },
    init(o = {}) {
      const high = o.airHigh ?? 31;
      const air = airTemp(6, high);
      return {
        weather: o.weather || "sunny", airHigh: high, fuelType: o.fuelType || "shells",
        loads: [],             // fuel in the hopper, burning one at a time: { type, left: hours }
        heat: 0,               // kW of heat right now
        dryer: air, boiler: air, co: 2,
        moisture: o.moisture ?? 45, // game starting value for a fresh batch, %
        quality: 100,          // 100 = perfect white copra; scorching and mould lower it
        battery: o.battery ?? 60,
        sun: 0, fanOn: false, steam: false, genW: 0, solarW: 0, powered: true,
        fuelUsed: 0, maxCO: 2, maxDryer: air, minBattery: o.battery ?? 60, darkMinutes: 0
      };
    },
    readings(s) {
      return { dryer: +s.dryer.toFixed(2), moisture: +s.moisture.toFixed(2), co: +s.co.toFixed(1), battery: +s.battery.toFixed(1) };
    },
    step(s, ctx) {
      const h = 1 / 60, hour = ctx.time.hour, w = WEATHER[s.weather];
      s.sun = sunlight(hour, s.weather);

      // Fuel: each "add fuel" puts 1 kg of the chosen fuel in the hopper (4 kg at most); each kilogram burns for its table time
      for (const e of ctx.events) if (e === "fuel") {
        const kg = s.loads.length;
        if (kg >= LIMITS.burnerMaxKg) ctx.note("The fuel hopper is full (4 kg)");
        else { s.loads.push({ type: s.fuelType, left: FUELS[s.fuelType].hours }); s.fuelUsed += 1; ctx.note(`Added 1 kg of ${FUELS[s.fuelType].label.toLowerCase()}`); }
      }
      // The burner feeds one kilogram at a time from its hopper, so more fuel burns longer, not hotter
      const burning = s.loads[0];
      const kw = burning ? fuelPower(burning.type) : 0;
      if (burning && (burning.left -= h) <= 0) s.loads.shift();
      s.heat += (kw - s.heat) * 0.15; // flames take a few minutes to catch and to die down
      if (kw === 0 && s.heat < 0.05) s.heat = 0;

      // Exhaust fan: pulls smoke out through the cyclone and the carbon filter; it also carries some heat away
      s.fanOn = !!ctx.switches.fan;
      const air = airTemp(hour, s.airHigh) - w.cool;
      const dryerTarget = air + 27 * s.heat - (s.fanOn ? 12 : 0);
      s.dryer += (dryerTarget - s.dryer) * 0.03;
      s.maxDryer = Math.max(s.maxDryer, s.dryer);

      // Boiler: about 45 minutes to boil a 4 L charge on a shell fire; steam spins the generator
      const boilerTarget = air + 110 * Math.min(1.4, s.heat);
      s.boiler = Math.min(100, s.boiler + (boilerTarget - s.boiler) * 0.035);
      s.steam = s.boiler >= 99.5 && s.heat > 0.8;
      s.genW = s.steam ? POWER.genW : 0;

      // Battery: generator + solar in, the household out; the BMS cuts the load at 20%
      s.solarW = POWER.solarW * POWER.peakFactor * s.sun;
      const load = houseLoad(hour);
      s.powered = s.battery > LIMITS.battery.cutoff;
      const wh = (s.genW + s.solarW - (s.powered ? load : 0)) * h;
      s.battery = clamp(s.battery + wh / POWER.battWh * 100, 0, 100);
      if (!s.powered) s.darkMinutes += 1;
      s.minBattery = Math.min(s.minBattery, s.battery);

      // Carbon monoxide near the dryer: made by the fire, cleared slowly by the breeze or fast by the fan
      s.co += (40 * s.heat - (s.fanOn ? 4 : 0.15) * s.co) * h;
      s.co = Math.max(0, s.co);
      s.maxCO = Math.max(s.maxCO, s.co);

      // Drying: water leaves faster when hotter, slower in humid rain; copra can't get much drier than about 4%
      s.moisture -= dryRate(s.dryer) * w.dry * (s.moisture - 4) * h;
      if (s.dryer < 42 && s.moisture > 14 && s.weather === "rainy") s.moisture = Math.min(50, s.moisture + 0.1 * h); // damp air creeps back in
      // Quality: too hot scorches the copra; wet copra sitting cool for long goes mouldy
      if (s.dryer > LIMITS.dryer.scorch) s.quality -= (s.dryer - LIMITS.dryer.scorch) * 1.5 * h;
      if (s.dryer < 42 && s.moisture > 14) s.quality -= 0.6 * h;
      s.quality = clamp(s.quality, 0, 100);
    },
    // How the copra and the farm are doing, for the scene and the status line
    mood(s) {
      if (s.co >= LIMITS.co.osha) return { id: "smoke", text: "Smoke alert: CO is high near the dryer" };
      if (s.dryer > LIMITS.dryer.scorch) return { id: "scorch", text: "Too hot! The copra is scorching" };
      if (s.moisture <= LIMITS.grade.one) return { id: "done", text: "Grade 1 copra! Ready to sell" };
      if (!s.powered) return { id: "dark", text: "The battery is low: the lights are out" };
      if (s.dryer < LIMITS.dryer.low && s.moisture > LIMITS.grade.three) return { id: "cool", text: "The dryer is too cool to dry the copra" };
      if (s.co >= LIMITS.co.niosh) return { id: "smoky", text: "It's getting smoky near the dryer" };
      if (s.dryer > LIMITS.dryer.high) return { id: "warm", text: "The dryer is a bit too hot" };
      if (s.moisture <= LIMITS.grade.three) return { id: "graded", text: `The copra is ${grade(s.moisture)} now. Keep drying!` };
      return { id: "drying", text: "The copra is drying nicely" };
    }
  };

  // ---- Missions (pure logic, so the tests can run them): each checks the farm every virtual minute ----
  function track(sim) { return sim._track || (sim._track = { minQuality: 100 }); }
  const starsFor = (q) => (q >= 97 ? 3 : q >= 92 ? 2 : 1);
  // goal: { moisture, hours, minQuality, maxFuel, maxCO, minBattery, dry: true if the copra must be dried }
  function mission(goal) {
    return (sim, h) => {
      const s = sim.state, t = track(sim);
      t.minQuality = Math.min(t.minQuality, s.quality);
      if (s.co > (goal.maxCO ?? LIMITS.co.ceiling)) return { state: "lost", message: `Carbon monoxide reached ${Math.round(s.co)} ppm. That's unsafe for the family. Add a rule that runs the exhaust fan when CO rises.` };
      if (goal.minQuality && s.quality < goal.minQuality) return { state: "lost", message: `The copra quality fell to ${Math.round(s.quality)}%: ${s.maxDryer > LIMITS.dryer.scorch ? "it scorched. Keep the dryer at 70 °C or below" : "it sat wet and cool too long"}.` };
      if (goal.maxFuel && s.fuelUsed > goal.maxFuel) return { state: "lost", message: `You used ${s.fuelUsed} kg of fuel, more than ${goal.maxFuel} kg. Pick a fuel that burns longer, or add fuel only when needed.` };
      if (goal.minBattery && s.battery < goal.minBattery) return { state: "lost", message: `The battery fell to ${Math.round(s.battery)}% and the lights went out. Start the burner when the battery is low.` };
      const dried = !goal.moisture || s.moisture <= goal.moisture;
      const timeUp = h >= goal.hours;
      if ((goal.moisture && dried) || (!goal.moisture && timeUp)) {
        const stars = starsFor(t.minQuality);
        const what = goal.moisture ? `${grade(s.moisture)} copra in ${Math.floor(h)} hours` : `${goal.hours} hours`;
        return { state: "won", stars, message: `Mission complete! ${what}, lowest quality ${Math.round(t.minQuality)}%: ${"★".repeat(stars)}${stars < 3 ? " (keep quality above 97% for 3 stars)" : ""}` };
      }
      if (timeUp) return { state: "lost", message: `Time's up: the copra is still at ${s.moisture.toFixed(1)}% moisture. Keep the dryer near 60 °C so it dries faster.` };
      const part = goal.moisture ? `copra ${s.moisture.toFixed(1)}% (goal ${goal.moisture}%)` : `battery ${Math.round(s.battery)}%`;
      return { state: "running", progress: goal.moisture ? Math.min(h / goal.hours, (45 - s.moisture) / (45 - goal.moisture)) : h / goal.hours,
        message: `${Math.floor(h)} of ${goal.hours} h · ${part}${goal.maxFuel ? ` · fuel ${s.fuelUsed}/${goal.maxFuel} kg` : ""}` };
    };
  }
  model.missions = [
    { id: "first-batch", title: "1. First batch", goal: "Dry fresh copra to Grade 3 (below 14% moisture) within 24 hours, without letting carbon monoxide pass 200 ppm. The example rules add fuel and run the fan for you.",
      options: { weather: "sunny", airHigh: 31, fuelType: "shells" }, check: mission({ moisture: 13.9, hours: 24 }) },
    { id: "best-fuel", title: "2. The best fuel", goal: "Today the burner is loaded with dry leaves. Leaves burn out fast and run far too hot (a game value). Dry the copra to Grade 2 (below 11%) within 30 hours, with no more than 10 kg of fuel and quality above 95%. Tip: in the World tab, pick the fuel that burns longest per kilogram.",
      options: { weather: "sunny", airHigh: 31, fuelType: "leaves" }, check: mission({ moisture: 10.9, hours: 30, maxFuel: 10, minQuality: 95 }) },
    { id: "hot-day", title: "3. Hot afternoon", goal: "A hot day (34 °C) and only husks, which burn hotter in this game. Reach Grade 1 (below 8%) within 36 hours and keep quality above 90%: don't let the dryer pass 70 °C.",
      options: { weather: "sunny", airHigh: 34, fuelType: "husks" }, check: mission({ moisture: 7.9, hours: 36, minQuality: 90 }) },
    { id: "rain-lights", title: "4. Rainy nights", goal: "Two rainy days. The copra is already dry, and the sun barely charges the battery. Keep the battery above 20% for 48 hours, using no more than 6 kg of shells. Tip: IF Battery is below 30 THEN Add fuel.",
      options: { weather: "rainy", airHigh: 28, fuelType: "shells", moisture: 6.5, battery: 45 }, check: mission({ hours: 48, minBattery: 20, maxFuel: 6 }) },
    { id: "rainy-batch", title: "5. Rainy harvest", goal: "Rain all day: no sun-drying, cooler air and a weak solar panel. Dry a fresh batch to Grade 1 within 34 hours, keep CO below 50 ppm and the battery above 20%. Tip: rain cools the dryer, so try a hotter fuel (in this game husks burn hotter but faster).",
      options: { weather: "rainy", airHigh: 28, fuelType: "shells", battery: 30 }, check: mission({ moisture: 7.9, hours: 34, maxCO: 50, minBattery: 20, minQuality: 85 }) }
  ];

  root.CopraModel = model;
})(typeof window !== "undefined" ? window : globalThis);
