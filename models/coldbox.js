// ============ COLD CART MODEL: a solar thermoelectric cold box for fish at a market, one virtual minute at a time ============
// Based on the SPARC student design project (a proposal): a portable, solar-powered thermoelectric cold station for
// vendors at an off-grid market. From the manuscript: 8 TEC Peltier modules switched by 2 MOSFET driver boards, a
// heatsink with 8 fans, an EPS box, a DS18B20 temperature sensor, MQ-136 (H2S) and MQ-137 (NH3) gas sensors for
// freshness, a 550 W solar panel, a 50 A MPPT charge controller and a 12.8 V 200 Ah LiFePO4 battery, and a goal of
// 8–12 hours of running time. Everything else below is a GAME VALUE, chosen to follow real physics:
//  - A Peltier module pumps heat from its cold side to its hot side AND turns its own electric power into heat, so
//    the hot side must get rid of both. The bigger the temperature gap across the module, the less heat it can pump.
//    Per module we use Qc = 39 − 0.51·ΔT watts pumped and P = 32 + 0.2·ΔT watts used, worked out with the standard
//    thermoelectric equations from a common TEC1-12706 datasheet (Imax 6.4 A, ΔTmax 66 °C, Qmax 50 W at a 25 °C hot
//    side), run at about 4 A. The manuscript doesn't name a module, so these are examples.
//  - The heatsink with its fans running sheds 1 °C per 33 W (0.03 K/W, game value); with the fans off only 0.2 K/W,
//    so the hot side soon overheats, the gap grows and cooling collapses (the module even warms its cold side).
//  - Box: heat leaks in through the EPS walls and lid at 2.5 W per °C of difference (game value), each lid opening
//    lets in 10 kJ (game value). Fresh fish store about 3.6 kJ per kg per °C (Engineering Toolbox).
//  - Spoilage: tropical fish spoil e^(0.12·T) times faster than at 0 °C (FAO Fisheries Technical Paper 348, eq. 6.d).
//    In the game, fish at 0 °C would keep about 10 days. The gas index (0–100) is a game value standing for what the
//    MQ-136/MQ-137 would see: the manuscript gives no ppm thresholds. Safe target: 4 °C or colder (FDA: store seafood
//    at 40 °F, 4 °C, or below).
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  const WEATHER = { sunny: { sun: 1, cool: 0, label: "Sunny" }, cloudy: { sun: 0.45, cool: 2, label: "Cloudy" }, rainy: { sun: 0.2, cool: 4, label: "Rainy" } };
  const LIMITS = { safe: 4, warm: 10, gasWatch: 30, gasSpoiled: 60, sinkHot: 70 };
  const PARTS = {
    modules: 8, qc0: 39, kTec: 0.51, p0: 32, pDT: 0.2, coldOffset: 3, // per Peltier module (game values from the datasheet)
    rFans: 0.03, rStill: 0.2, cSink: 4000,                            // heatsink: K/W with and without fans, J/K
    ua: 2.5, cBox: 10000, cFish: 3600, lidJ: 10000,                    // box: W/K, J/K (box and air), J/(kg·K), J per opening
    fanW: 19, controllerW: 6,                                          // 8 fans together; Pi Zero 2 W, screen and sensors
    panelW: 550, panelLoss: 0.8, batteryWh: 12.8 * 200                 // from the manuscript, with a game-value loss factor
  };
  const SHELF_HOURS_AT_0 = 240;

  // How many times faster tropical fish spoil than at 0 °C (FAO eq. 6.d, valid for 0–30 °C)
  const spoilRate = (t) => Math.exp(0.12 * clamp(t, 0, 35));
  // Sunlight from 0 to 1: daylight 06:00–18:00, strongest at noon, cut by clouds and rain
  function sunlight(hour, weather) {
    if (hour < 6 || hour > 18) return 0;
    return Math.sin(Math.PI * (hour - 6) / 12) * WEATHER[weather].sun;
  }
  // Air temperature: warmest at 14:00 (the day's high), coolest, 10 °C lower, at 02:00; clouds and rain cool it
  const airTemp = (hour, high, weather) => high - 5 + 5 * Math.cos(2 * Math.PI * (hour - 14) / 24) - WEATHER[weather].cool;
  // One Peltier module at a temperature gap dT (hot side minus cold side): heat pumped and power used, watts
  function peltier(dT) { return { qc: PARTS.qc0 - PARTS.kTec * dT, p: PARTS.p0 + PARTS.pDT * Math.max(0, dT) }; }
  const fishKg = (s) => s.fish.reduce((a, f) => a + f.kg, 0);

  const coldboxModel = {
    weather: WEATHER, limits: LIMITS, parts: PARTS, spoilRate, sunlight, airTemp, peltier, fishKg,
    actuators: { peltier: { kind: "switch" }, fans: { kind: "switch" }, alert: { kind: "event" } },
    init(o = {}) {
      const weather = (o.weatherDays && o.weatherDays[0]) || o.weather || "sunny";
      const high = o.airHigh ?? 33;
      return {
        weather, weatherDays: o.weatherDays || null, airHigh: high,
        box: o.boxStart ?? 12,                 // the fish and the air in the box, °C
        sink: airTemp(6, high, weather),       // the hot-side heatsink, °C
        air: airTemp(6, high, weather),
        fish: [{ kg: o.fishKg ?? 20, s: o.fishAge ?? 0.1, old: false }], // s: 0 just caught … 1 spoiled
        gas: 2, battWh: PARTS.batteryWh * (o.battery ?? 80) / 100,
        badAt: o.badAt ?? null, badKg: o.badKg ?? 5,
        sun: 0, peltierOn: false, fansOn: false, lidUntil: -1, sold: 0, thrown: 0, gen: 0, load: 0, flat: false
      };
    },
    readings(s) {
      return { box: +s.box.toFixed(2), sink: +s.sink.toFixed(1), gas: +clamp(s.gas, 0, 100).toFixed(1), battery: +(100 * s.battWh / PARTS.batteryWh).toFixed(1) };
    },
    step(s, ctx) {
      const hour = ctx.time.hour, P = PARTS;
      if (s.weatherDays && ctx.time.hh === 0 && ctx.time.mm === 0) s.weather = s.weatherDays[Math.min(s.weatherDays.length - 1, ctx.time.day - 1)];
      s.sun = sunlight(hour, s.weather);
      s.air = airTemp(hour, s.airHigh, s.weather);
      const kg = fishKg(s);
      const cBox = P.cBox + P.cFish * kg;

      // Customers come every 40 minutes from 07:00 to 17:00; the vendor opens the lid and sells 1 kg
      if (hour >= 7 && hour < 17 && ctx.minutes % 40 === 0 && s.fish[0].kg >= 1) {
        s.fish[0].kg -= 1; s.sold += 1; s.box += P.lidJ / cBox; s.gas *= 0.85; s.lidUntil = ctx.minutes + 2;
      }
      // Mission 5: someone adds a bag of fish that sat in the sun all morning
      if (s.badAt !== null && ctx.minutes === s.badAt) {
        s.fish.push({ kg: s.badKg, s: 0.9, old: true });
        s.box = (cBox * s.box + P.cFish * s.badKg * s.air) / (cBox + P.cFish * s.badKg);
        s.lidUntil = ctx.minutes + 2;
        ctx.note(`A neighbour put in ${s.badKg} kg of fish that sat in the sun all morning`);
      }
      // Freshness alert: the buzzer sounds, the vendor unlocks the box with a fingerprint, smells the fish and removes bad ones
      for (const e of ctx.events) if (e === "alert") {
        s.lidUntil = ctx.minutes + 2; s.box += P.lidJ / cBox; s.gas *= 0.85;
        const bad = s.fish.filter((f) => f.s > 0.5 && f.kg > 0);
        if (bad.length) { const out = bad.reduce((a, f) => a + f.kg, 0); s.thrown += out; bad.forEach((f) => (f.kg = 0)); ctx.note(`Alert! The vendor found ${out.toFixed(0)} kg of fish that smell off and took them out`); }
        else ctx.note("Alert: the vendor checked: all the fish smell fresh");
      }
      s.fish = s.fish.filter((f, i) => i === 0 || f.kg > 0);

      // Power: the battery can only run the Peltier modules and fans while it has charge
      s.flat = s.battWh <= 0;
      s.peltierOn = !!ctx.switches.peltier && !s.flat;
      s.fansOn = !!ctx.switches.fans && !s.flat;
      if (s.flat && (ctx.switches.peltier || ctx.switches.fans) && ctx.time.mm === 0) ctx.note("Battery empty: the cooler can't run");

      // Heat flows, worked out in 10-second steps (the heatsink changes temperature quickly)
      const n = 6, dt = 60 / n;
      let used = 0;
      for (let i = 0; i < n; i++) {
        let qc = 0, pw = 0;
        if (s.peltierOn) { const m = peltier(s.sink - (s.box - P.coldOffset)); qc = m.qc * P.modules; pw = m.p * P.modules; }
        const r = s.fansOn ? P.rFans : P.rStill;
        s.sink += dt / P.cSink * (qc + pw - (s.sink - s.air) / r); // the hot side gets the pumped heat plus the electric power
        s.box += dt / cBox * (P.ua * (s.air - s.box) - qc);
        used += (pw + (s.fansOn ? P.fanW : 0) + P.controllerW) * dt;
      }
      // Solar charging through the MPPT controller; a full battery can't take more
      s.gen = P.panelW * P.panelLoss * s.sun; s.load = used / 60;
      s.battWh = clamp(s.battWh + (s.gen * 60 - used) / 3600, 0, P.batteryWh);

      // Spoilage and the gas the MQ sensors smell: bad fish give off much more, the air in the box slowly leaks out
      const rate = spoilRate(s.box) / SHELF_HOURS_AT_0 / 60;
      let emit = 0;
      for (const f of s.fish) { f.s = clamp(f.s + rate, 0, 1); emit += 23 * f.kg * f.s ** 4; }
      s.gas += (emit - s.gas) / 60;
    },
    // How the fish are, for the scene and the status line
    mood(s) {
      if (s.gas >= LIMITS.gasSpoiled) return { id: "spoiled", text: "The box smells of spoiled fish!" };
      if (s.sink >= LIMITS.sinkHot) return { id: "overheat", text: "Hot side overheating: run the fans!" };
      if (s.box > LIMITS.warm) return { id: "warm", text: "Too warm: the fish spoil fast" };
      if (s.flat) return { id: "flat", text: "The battery is empty: no cooling" };
      if (s.gas >= LIMITS.gasWatch) return { id: "smelly", text: "Spoilage gas is rising: check the fish" };
      if (s.box > LIMITS.safe + 0.3) return { id: "cooling", text: s.peltierOn ? "Cooling down: not cold enough yet" : "Warming up: above 4 °C" };
      if (s.battWh < 0.15 * PARTS.batteryWh) return { id: "low", text: "Fish cold, but battery low" };
      return { id: "cold", text: "The fish are cold and fresh" };
    }
  };

  // ---- Missions: each checks the box every virtual minute ----
  // "Warm minutes" count the minutes after 08:00 (when the market is busy) with the fish above 4.5 °C.
  function track(sim) { return sim._track || (sim._track = { warm: 0, minBattery: 100 }); }
  const starsFor = (warm, lim = [10, 30]) => (warm <= lim[0] ? 3 : warm <= lim[1] ? 2 : 1);
  function marketDay(hours, o = {}) {
    const warmLimit = o.warmLimit ?? 90;
    return (sim, h) => {
      const t = track(sim), s = sim.state, r = coldboxModel.readings(s);
      if (h >= 2 && s.box > LIMITS.safe + 0.5) t.warm += 1;
      t.minBattery = Math.min(t.minBattery, r.battery);
      if (s.sink >= LIMITS.sinkHot) return { state: "lost", message: `The hot side reached ${Math.round(s.sink)} °C, too hot for the Peltier modules, and the box stopped cooling. The fans must carry that heat away: add a fan rule.` };
      if (s.gas >= LIMITS.gasSpoiled) return { state: "lost", message: "The box smells of spoiled fish and customers walk away. Keep the fish cold, and use the gas sensor to find bad fish early." };
      if (r.battery <= 0) return { state: "lost", message: "The battery ran flat, so the cooler stopped. Peltier modules use a lot of power: cool only when the box is above 4 °C." };
      if (t.warm > warmLimit) return { state: "lost", message: `The fish spent ${t.warm} minutes above 4 °C. Seafood should be kept at 4 °C or colder. Check the Graph tab, change your rules and try again.` };
      if (h >= hours) {
        let stars = starsFor(t.warm, o.warmStars), extra = "";
        if (o.batteryStars) { const b = r.battery, bs = b >= o.batteryStars[0] ? 3 : b >= o.batteryStars[1] ? 2 : 1; if (bs < stars) { stars = bs; extra = ` (end with ${o.batteryStars[0]}% battery or more for 3 stars)`; } }
        if (!extra && stars < 3) extra = ` (${(o.warmStars || [10])[0]} warm minutes or fewer for 3 stars)`;
        return { state: "won", stars, message: `Mission complete! ${t.warm} warm minutes, battery ${Math.round(r.battery)}%: ${"★".repeat(stars)}${extra}` };
      }
      return { state: "running", progress: h / hours, message: `${Math.floor(h)} of ${hours} hours · box ${s.box.toFixed(1)} °C · battery ${Math.round(r.battery)}%` };
    };
  }
  coldboxModel.missions = [
    { id: "market-day", title: "1. Market day", goal: "A sunny day at the market. The fish arrive at 12 °C. Cool them to 4 °C by 08:00 and keep them cold until the market closes at 18:00. The example rules already work; better rules earn more stars.",
      options: { weather: "sunny", airHigh: 33, battery: 80 }, check: marketDay(12) },
    { id: "hot-side", title: "2. Hot side, cold side", goal: "A heat wave: 37 °C in the afternoon. A Peltier module pushes heat into its hot side, so the heatsink fans must carry it away. Keep the fish cold for 12 hours without letting the hot side reach 70 °C.",
      options: { weather: "sunny", airHigh: 37, battery: 80 }, check: marketDay(12) },
    { id: "cloudy", title: "3. Cloudy day, half battery", goal: "Clouds all day and the battery starts at 50%, so the panel charges slowly. Keep the fish cold for 12 hours without the battery going flat. For 3 stars, end with 20% or more.",
      options: { weather: "cloudy", airHigh: 33, battery: 50 }, check: marketDay(12, { batteryStars: [20, 10] }) },
    { id: "rain-night", title: "4. Rain until night", goal: "Rain all day, and the vendor keeps the fish in the box until 21:00, three hours after sunset. Keep them cold for 15 hours. For 3 stars, end with 15% battery or more. Tip: a cooler heatsink and a target of about 4 °C use less power.",
      options: { weather: "rainy", airHigh: 33, battery: 80 }, check: marketDay(15, { batteryStars: [15, 8] }) },
    { id: "spoiled", title: "5. Spot the spoiling fish", goal: "At 10:00 a neighbour puts in 5 kg of fish that sat in the sun all morning. They give off spoilage gas. Find them before the box smells (gas index 60). The warm fish also warm the box for a while. Tip: IF Spoilage gas is above 40 THEN Freshness alert START.",
      options: { weather: "sunny", airHigh: 33, battery: 80, badAt: 600 }, check: marketDay(12, { warmLimit: 150, warmStars: [90, 120] }) }
  ];

  root.ColdboxModel = coldboxModel;
})(typeof window !== "undefined" ? window : globalThis);
