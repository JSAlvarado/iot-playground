// ============ SEEDLING CHAMBER MODEL: a solar-powered seedling chamber on a small farm, one virtual minute at a time ============
// Simplified on purpose so it runs in a phone browser. The SeedSpark manuscript gives the parts but no set points,
// so every number below is a GAME VALUE, chosen from the published sources named next to it:
//  - Germination speed follows the UC Master Gardener soil-temperature chart (days for seedlings to appear at each
//    soil temperature; tomato fastest, about 6 days, at 25–30 °C; little or none at 40 °C). Where that chart has no
//    number (eggplant above 30 °C or below 20 °C) the game guesses, and says so in the Learn tab.
//  - Heat: tomato germination falls sharply above 35 °C (University of Arizona thesis, 1990), and seedlings
//    developed normally at 23/21 °C but were delayed at 40/25 °C, so the game harms seedlings above 35 °C and much
//    faster above 40 °C.
//  - Damp: damping-off is favoured by wet media, high humidity, condensation drips and poor air circulation
//    (UConn IPM), so the game counts dripping condensation (humidity above 95%) on wet soil as harmful.
//  - Light: direct sun is about 32,000–100,000 lux and full daylight without direct sun 10,000–25,000 lux
//    (illuminance table); seedlings in low light stretch and grow slowly (Purdue Extension).
//  - The seedlings grow 6 times faster than real life (SPEED) so a mission takes a few virtual days, not weeks.
//  - SeedSpark's proposed bioelectrical root stimulation has no numbers in the manuscript and no established
//    benefit, so it has no effect here.
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  // Davao-like weather, game values: sun strength, the day's high and low (°C) and outdoor humidity (%)
  const WEATHER = {
    sunny: { sun: 1, high: 32, low: 24, rhDay: 62, rhNight: 88, label: "Sunny" },
    cloudy: { sun: 0.45, high: 29, low: 24, rhDay: 72, rhNight: 90, label: "Cloudy" },
    rainy: { sun: 0.25, high: 27, low: 23, rhDay: 88, rhNight: 95, label: "Rainy" }
  };
  // Days for seedlings to appear at each soil temperature (°C), from the UC chart (°F converted: 50 °F = 10 °C,
  // 59 = 15, 68 = 20, 77 = 25, 86 = 30, 95 = 35, 104 = 40). 0 means little or no germination. Eggplant values
  // marked "guess" are not in the chart.
  const CROPS = {
    tomato: { label: "Tomato", days: [[5, 0], [10, 42.9], [15, 13.6], [20, 8.2], [25, 5.9], [30, 5.9], [35, 9.2], [40, 0]] },
    eggplant: { label: "Eggplant", days: [[15, 0], [20, 13.1], [25, 8.1], [30, 5.3], [35, 8 /* guess */], [40, 0 /* guess */]] },
    pepper: { label: "Pepper", days: [[10, 0], [15, 25], [20, 12.5], [25, 8.4], [30, 7.6], [35, 8.8], [40, 0]] }
  };
  const SPEED = 6; // seedlings grow 6× faster than real life
  const LIMITS = {
    temp: { bestLow: 18, bestHigh: 29, hot: 35, deadly: 40 },     // 65–85 °F optimum (UC); 35 and 40 °C (Arizona)
    moisture: { dry: 25, low: 40, high: 70, soggy: 90 },          // game scale like a capacitive sensor, 0–100%
    humidity: { drip: 95 },                                       // condensation drips above this (game value)
    light: { dim: 10000, full: 25000 },                           // lux (illuminance table)
    barrel: 40                                                    // rain barrel, litres (game addition)
  };

  // Germination speed: the fraction of the way to sprouting per real day (1 / days), interpolated from the chart
  function germRate(crop, t) {
    const d = CROPS[crop].days;
    const rate = (days) => (days > 0 ? 1 / days : 0);
    if (t <= d[0][0] || t >= d[d.length - 1][0]) return 0;
    for (let i = 1; i < d.length; i++) {
      if (t <= d[i][0]) { const f = (t - d[i - 1][0]) / (d[i][0] - d[i - 1][0]); return rate(d[i - 1][1]) + (rate(d[i][1]) - rate(d[i - 1][1])) * f; }
    }
    return 0;
  }
  // How well seedlings grow at an air temperature, 0–1: best 20–29 °C, slower when hot, stopped at 40 °C
  function growthTemp(t) {
    if (t < 15) return 0;
    if (t < 20) return (t - 15) / 5;
    if (t <= LIMITS.temp.bestHigh) return 1;
    if (t < LIMITS.temp.hot) return 1 - 0.7 * (t - LIMITS.temp.bestHigh) / (LIMITS.temp.hot - LIMITS.temp.bestHigh);
    if (t < LIMITS.temp.deadly) return 0.3 * (LIMITS.temp.deadly - t) / (LIMITS.temp.deadly - LIMITS.temp.hot);
    return 0;
  }
  // Daylight from 0 to 1: 06:00–18:00, strongest at noon
  const daylight = (hour) => (hour < 6 || hour > 18 ? 0 : Math.sin(Math.PI * (hour - 6) / 12));
  // Outdoor air: warmest at 14:00, coolest at 02:00
  const airTemp = (hour, w) => (w.high + w.low) / 2 + (w.high - w.low) / 2 * Math.cos(2 * Math.PI * (hour - 14) / 24);
  // Rain on rainy days comes in irregular showers: a morning one and an afternoon one, at different times each day
  function rainAt(day, hour, weather) {
    if (weather !== "rainy") return 0;
    const a = 4 + (day * 3) % 4, b = 12 + (day * 5) % 4;
    if (hour >= a && hour < a + 2.5) return 0.7;
    if (hour >= b && hour < b + 3.5) return 1;
    return 0;
  }

  const seedlingModel = {
    weather: WEATHER, crops: CROPS, limits: LIMITS, speed: SPEED, germRate, growthTemp, daylight, airTemp, rainAt,
    actuators: { valve: { kind: "switch" }, fan: { kind: "switch" }, water: { kind: "event" }, refill: { kind: "event" } },
    init(o = {}) {
      const days = o.weatherDays || [o.weather || "sunny"];
      const w = WEATHER[days[0]];
      return {
        weatherDays: days, weather: days[0], crop: o.crop || "tomato",
        temp: airTemp(6, w), outTemp: airTemp(6, w), humidity: w.rhNight, moisture: o.moisture ?? 55, lux: 0, sun: 0, day: 0, rain: 0,
        tank: o.tank ?? 30,      // litres in the rain barrel that feeds the valve
        germ: 0,                 // 0 … 1: how far the seeds are toward sprouting
        sprouted: false, growth: 0, // growth: true leaves grown (1 = the first true leaf)
        health: 100, dripHours: 0, waterTimer: 0, valveOn: false, fanOn: false, used: 0, refills: 0
      };
    },
    readings(s) {
      return { moisture: +s.moisture.toFixed(1), temp: +s.temp.toFixed(1), humidity: +s.humidity.toFixed(1), light: +(s.lux / 1000).toFixed(1) };
    },
    leaves(s) { return Math.min(4, Math.floor(s.growth)); },
    step(s, ctx) {
      const h = 1 / 60;
      const { hour, day } = ctx.time;
      s.weather = s.weatherDays[(day - 1) % s.weatherDays.length];
      const w = WEATHER[s.weather];
      s.rain = rainAt(day, hour, s.weather);
      s.sun = daylight(hour) * w.sun * (s.rain > 0 ? 0.6 : 1);
      s.outTemp = airTemp(hour, w);
      s.day = daylight(hour);
      s.lux = 60000 * s.sun; // inside the acrylic walls, a little less than full sun

      // Devices: "Water now" (or a time rule) opens the valve for 10 minutes; the valve needs water in the barrel
      for (const e of ctx.events) {
        if (e === "water") { s.waterTimer = 10; ctx.note("Watering for 10 minutes"); }
        if (e === "refill") { s.tank = LIMITS.barrel; s.refills += 1; ctx.note("The farmer filled the rain barrel"); }
      }
      s.fanOn = !!ctx.switches.fan;
      const wantValve = !!ctx.switches.valve || s.waterTimer > 0;
      if (s.waterTimer > 0) s.waterTimer -= 1;
      s.valveOn = wantValve && s.tank > 0;
      if (wantValve && s.tank <= 0 && ctx.time.mm === 0) ctx.note("The rain barrel is empty: the valve can't water");
      if (s.rain > 0) s.tank = Math.min(LIMITS.barrel, s.tank + 4 * s.rain * h); // the roof gutter fills the barrel

      // Temperature: sun heats the closed chamber far above the outdoor air; the exhaust fan swaps in outside air
      const gain = 12 * s.sun * (s.fanOn ? 0.15 : 1);
      s.temp += (s.outTemp + gain - s.temp) * (s.fanOn ? 8 : 3) * h;

      // Humidity: wet soil fills a closed chamber with vapour (it drips at night); warming dries the air;
      // the fan brings it back toward the outdoor humidity
      const warm = (s.outTemp - w.low) / (w.high - w.low);
      const rhOut = w.rhNight - (w.rhNight - w.rhDay) * warm;
      const wet = Math.max(0, (s.moisture - 50) / 50);
      const closed = Math.min(100, rhOut + 4 + 10 * wet) - 3 * Math.max(0, s.temp - s.outTemp);
      const rhTarget = s.fanOn ? Math.min(closed, rhOut - 1) : closed;
      s.humidity = clamp(s.humidity + (rhTarget - s.humidity) * (s.fanOn ? 6 : 1.5) * h, 20, 100);

      // Soil water: dries faster in sun, heat and moving air, slower in humid air; the valve adds water;
      // above 80% the extra drains away (wasted)
      let dry = (0.4 + 2.4 * s.sun + 0.12 * Math.max(0, s.temp - 25)) * (1 - 0.5 * Math.max(0, (s.humidity - 70) / 30)) * (0.5 + s.moisture / 100);
      if (s.fanOn) dry += 0.5;
      if (s.sprouted) dry += 0.15 * (1 + s.growth); // bigger seedlings drink more
      let change = -dry;
      if (s.valveOn) { change += 30; s.tank = Math.max(0, s.tank - 6 * h); s.used += 6 * h; }
      if (s.moisture > 80) change -= (s.moisture - 80) * 0.6;
      s.moisture = clamp(s.moisture + change * h, 0, 100);

      // Germination: seeds need moist (not soaked) soil and the right warmth; light doesn't matter yet
      if (!s.sprouted) {
        const water = s.moisture < 30 ? 0 : s.moisture > LIMITS.moisture.soggy ? 0.3 : 1;
        s.germ = Math.min(1, s.germ + germRate(s.crop, s.temp) * SPEED / 24 * water * h);
        if (s.germ >= 1) { s.sprouted = true; ctx.note("The first sprouts are up!"); }
      } else if (s.growth < 4) {
        // Growth: needs light, comfortable warmth and water
        const lightF = Math.min(1, s.lux / LIMITS.light.full);
        const waterF = s.moisture < LIMITS.moisture.dry ? 0 : s.moisture < 35 ? 0.5 : 1;
        const before = Math.floor(s.growth);
        s.growth = Math.min(4, s.growth + 0.13 * growthTemp(s.temp) * lightF * waterF * (s.health / 100) * h);
        if (Math.floor(s.growth) > before) ctx.note(Math.floor(s.growth) >= 4 ? "Four true leaves: ready to transplant!" : `True leaf number ${Math.floor(s.growth)} has opened`);
      }

      // Health
      let harm = 0;
      if (s.temp > LIMITS.temp.deadly) harm += 25; else if (s.temp > LIMITS.temp.hot) harm += 6;
      if (s.moisture < 20) harm += s.sprouted ? 4 : 1;
      if (s.moisture > LIMITS.moisture.soggy) harm += 3;
      if (s.humidity > LIMITS.humidity.drip && s.moisture > 45) { harm += 3; s.dripHours += h; } // condensation drips: damping-off risk
      s.health = clamp(s.health + (harm ? -harm : 1) * h, 0, 100);
    },
    // How the seedlings are doing, for the scene and the status line
    mood(s) {
      const L = LIMITS;
      if (s.health < 30) return { id: "danger", text: "The seedlings are dying" };
      if (s.temp > L.temp.deadly) return { id: "hot", text: "Too hot! The chamber is cooking the seedlings" };
      if (s.temp > L.temp.hot) return { id: "hot", text: "Too hot for seedlings: let the heat out" };
      if (s.humidity > L.humidity.drip && s.moisture > 45) return { id: "damp", text: "Water is dripping inside: mould can start" };
      if (s.moisture < L.moisture.dry) return { id: "dry", text: s.sprouted ? "The soil is too dry: the seedlings droop" : "The soil is too dry for the seeds" };
      if (s.moisture > L.moisture.soggy) return { id: "soggy", text: "The soil is soaked: roots need air too" };
      if (!s.sprouted) return s.temp < 15 ? { id: "ok", text: "Too cool: the seeds are waiting" } : { id: "happy", text: "The seeds are soaking up water and waking up" };
      if (s.growth >= 4) return { id: "happy", text: "Ready to transplant!" };
      if (s.day > 0.6 && s.lux < L.light.dim) return { id: "ok", text: "Dim light: the seedlings grow slowly" };
      return { id: "happy", text: "The seedlings are healthy and growing" };
    },
    stage(s) {
      if (!s.sprouted) return `seeds ${Math.round(s.germ * 100)}% awake`;
      const n = Math.min(4, Math.floor(s.growth));
      return n === 0 ? "sprouts" : `${n} true leaf${n > 1 ? "s" : ""}`.replace("leafs", "leaves");
    }
  };

  // ---- Missions (shown by games/seedling.js): each checks the chamber every virtual minute ----
  function track(sim) { return sim._track || (sim._track = { minHealth: 100 }); }
  const starsFor = (minHealth) => (minHealth >= 95 ? 3 : minHealth >= 85 ? 2 : 1);
  // goal: { sprout: true } or { leaves: n }; extra.fail(state) can end the mission early with a reason
  function grow(hours, goal, extra) {
    return (sim, h) => {
      const t = track(sim), s = sim.state;
      t.minHealth = Math.min(t.minHealth, s.health);
      if (s.health < 70) return { state: "lost", message: `The seedlings got too weak (health ${Math.floor(s.health)}%). Check the Graph tab to see what went wrong, change your rules and try again.` };
      const fail = extra && extra.fail(s);
      if (fail) return { state: "lost", message: fail };
      const done = goal.leaves ? s.growth >= goal.leaves : s.sprouted;
      if (done) {
        const stars = starsFor(t.minHealth);
        return { state: "won", stars, message: `Mission complete in ${Math.round(h)} hours! Lowest health ${Math.round(t.minHealth)}%: ${"★".repeat(stars)}${stars < 3 ? " (keep health above 95% for 3 stars)" : ""}` };
      }
      if (h >= hours) return { state: "lost", message: goal.leaves ? `Time's up: the seedlings have ${seedlingModel.leaves(s)} of ${goal.leaves} true leaves. Warm days, good light and moist soil make them grow faster.` : "Time's up: the seeds haven't sprouted yet. Seeds need moist soil and comfortable warmth." };
      return { state: "running", progress: h / hours, message: `${Math.floor(h)} of ${hours} hours · ${seedlingModel.stage(s)} · health ${Math.round(s.health)}%` };
    };
  }
  const dripFail = (limit) => (s) => (s.dripHours >= limit ? `Water dripped inside the chamber for ${limit} hours. Wet, still air lets damping-off mould attack seedlings. Run the fan when the humidity is very high.` : null);
  const missions = [
    { id: "first-sprouts", title: "1. First sprouts", goal: "Cloudy days are gentle. Keep the soil moist so the tomato seeds sprout within 40 hours. The example rule waters by soil moisture.",
      options: { weather: "cloudy", crop: "tomato", moisture: 45 }, check: grow(40, { sprout: true }) },
    { id: "sunny-heat", title: "2. Sunny and hot", goal: "The sun heats a closed chamber far above the outdoor air, and seeds suffer above 35 °C. Sprout the tomatoes within 40 hours. Tip: add a fan rule.",
      options: { weather: "sunny", crop: "tomato" }, check: grow(40, { sprout: true }) },
    { id: "rainy-nights", title: "3. Rainy nights", goal: "Rain fills the barrel, but a closed, wet chamber drips at night, and drips bring mould. Sprout the tomatoes with less than 4 hours of dripping.",
      options: { weatherDays: ["rainy", "rainy"], crop: "tomato" }, check: grow(48, { sprout: true }, { fail: dripFail(4) }) },
    { id: "dry-spell", title: "4. Dry spell", goal: "Three sunny days, no rain, and the farmer is away (no refills). The barrel holds 36 litres. Grow the first true leaf without the barrel running dry.",
      options: { weather: "sunny", crop: "tomato", tank: 36 },
      check: grow(72, { leaves: 1 }, { fail: (s) => (s.refills > 0 ? "The farmer is away in this mission, so no refills. Water only when the soil needs it." : s.tank <= 0 ? "The rain barrel ran dry. Water by soil moisture, and stop before the soil is soaked: extra water just drains away." : null) }) },
    { id: "eggplant", title: "5. Eggplant week", goal: "Eggplant sprouts slower when it's cool. Sun, rain and clouds take turns for 5 days. Grow 2 true leaves with less than 4 hours of dripping.",
      options: { weatherDays: ["sunny", "rainy", "cloudy", "sunny", "rainy"], crop: "eggplant" }, check: grow(120, { leaves: 2 }, { fail: dripFail(4) }) }
  ];

  seedlingModel.missions = missions;

  root.SeedlingModel = seedlingModel;
})(typeof window !== "undefined" ? window : globalThis);
