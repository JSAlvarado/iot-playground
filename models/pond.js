// ============ FLOATECH POND MODEL: a simplified tilapia pond, one virtual minute at a time ============
// Simplified on purpose so it runs in a phone browser, but the directions and ranges follow real pond science:
//  - Algae make oxygen in sunlight and everything in the pond uses oxygen all the time, so oxygen rises by day and
//    falls overnight, lowest around dawn. Warm water holds less oxygen (saturation from the APHA equation).
//  - Uneaten feed rots and uses oxygen. Photosynthesis removes CO2, so pH rises in the afternoon.
//  - Nile tilapia: best growth around 25–30 °C, stop eating below about 17 °C (SRAC 283). The game treats oxygen of
//    5 mg/L or more as healthy, below 3 as stressed and below 1 as danger (SRAC: keep ponds above 1 mg/L; FAO: above 4
//    for hatcheries). Best pH 6.5–8.5 (FAO).
(function (root) {
  "use strict";
  const { oxygenSaturation, clamp } = root.IoT;

  const WEATHER = { sunny: { sun: 1, label: "Sunny" }, cloudy: { sun: 0.55, label: "Cloudy" }, rainy: { sun: 0.3, label: "Rainy" } };
  const LIMITS = {
    oxygen: { good: 5, stress: 3, danger: 1 },
    temp: { bestLow: 25, bestHigh: 30, stopEating: 17, cold: 12, hot: 35 },
    ph: { low: 6.5, high: 8.5 }
  };

  // How hungry tilapia are at a water temperature: none below 17 °C, full at 25–30 °C, less again when very hot
  function appetite(t) {
    if (t < LIMITS.temp.stopEating) return 0;
    if (t < LIMITS.temp.bestLow) return (t - LIMITS.temp.stopEating) / (LIMITS.temp.bestLow - LIMITS.temp.stopEating);
    if (t <= LIMITS.temp.bestHigh) return 1;
    return clamp(1 - (t - LIMITS.temp.bestHigh) / 6, 0.2, 1);
  }
  // Sunlight from 0 to 1: daylight 06:00–18:00, strongest at noon, cut by clouds and rain
  function sunlight(hour, weather) {
    if (hour < 6 || hour > 18) return 0;
    return Math.sin(Math.PI * (hour - 6) / 12) * WEATHER[weather].sun;
  }
  // Air temperature: warmest at 14:00 (the day's high), coolest, 10 °C lower, at 02:00
  const airTemp = (hour, high) => high - 5 + 5 * Math.cos(2 * Math.PI * (hour - 14) / 24);

  const pondModel = {
    weather: WEATHER, limits: LIMITS, appetite, sunlight, airTemp,
    actuators: { aerator: { kind: "switch" }, feeder: { kind: "event" } },
    init(o = {}) {
      const high = o.airHigh ?? 31;
      const water = o.waterStart ?? high - 4;
      return {
        weather: o.weather || "sunny", airHigh: high,
        water, oxygen: oxygenSaturation(water) * 0.95, ph: 7.4,
        food: 0,            // uneaten feed in the pond, grams
        hunger: 0.3,        // 0 full … 1 starving
        health: 100,        // 0 … 100
        battery: o.battery ?? 80, // solar battery, %
        sun: 0, aeratorOn: false, fedToday: 0, wasted: 0
      };
    },
    readings(s) {
      return { temp: +s.water.toFixed(2), oxygen: +s.oxygen.toFixed(2), ph: +s.ph.toFixed(2), battery: +s.battery.toFixed(1) };
    },
    step(s, ctx) {
      const h = 1 / 60; // one minute, in hours
      const hour = ctx.time.hour;
      s.sun = sunlight(hour, s.weather);

      // Solar battery: the panel charges in sunlight; the aerator only runs while there is charge left
      s.battery = clamp(s.battery + 16 * s.sun * h, 0, 100);
      s.aeratorOn = !!ctx.switches.aerator && s.battery > 0;
      if (ctx.switches.aerator && s.battery <= 0 && hour % 1 < h) ctx.note("Battery empty: the aerator can't run");
      if (s.aeratorOn) s.battery = clamp(s.battery - 9 * h, 0, 100);

      // Water follows the air temperature slowly; rain cools it a little
      const air = airTemp(hour, s.airHigh) - (s.weather === "rainy" ? 2 : 0);
      s.water += (air - s.water) * 0.08 * h;

      // Feeding: each feeder run drops 100 g; fish eat by appetite, less when oxygen is low
      for (const e of ctx.events) if (e === "feeder") { s.food += 100; s.fedToday += 1; ctx.note("Feeder: 100 g of feed"); }
      const eatRate = 70 * appetite(s.water) * (s.oxygen < LIMITS.oxygen.stress ? 0.3 : 1) * s.hunger * 2;
      const eaten = Math.min(s.food, eatRate * h);
      s.food -= eaten;
      s.hunger = clamp(s.hunger + 0.035 * h - eaten / 220, 0, 1);
      const rotted = s.food * 0.08 * h; // leftover feed slowly rots
      s.food -= rotted; s.wasted += rotted;

      // Oxygen: made by algae in sun, used by fish, algae and rotting feed (faster when warm), mixed in at the surface
      const sat = oxygenSaturation(s.water);
      const respiration = 0.45 * (1 + 0.05 * (s.water - 25));
      const fromAir = (s.aeratorOn ? 0.75 : 0.06) * (sat - s.oxygen);
      s.oxygen += (1.3 * s.sun - respiration - 0.004 * s.food + fromAir) * h;
      s.oxygen = clamp(s.oxygen, 0, sat * 1.4); // sunny ponds can go above 100% saturation

      // pH: photosynthesis pushes it up, the pond drifts back toward neutral overnight
      s.ph += (0.32 * s.sun - 0.1 * (s.ph - 7.0)) * h;

      // Fish health
      let harm = 0;
      if (s.oxygen < LIMITS.oxygen.danger) harm += 30; else if (s.oxygen < LIMITS.oxygen.stress) harm += 8;
      if (s.water < LIMITS.temp.cold || s.water > LIMITS.temp.hot) harm += 5;
      if (s.ph < LIMITS.ph.low || s.ph > 9) harm += 3;
      if (s.hunger > 0.85) harm += 2;
      s.health = clamp(s.health + (harm ? -harm : 1) * h, 0, 100);
      if (ctx.time.hh === 0 && ctx.time.mm === 0) s.fedToday = 0;
    },
    // How the fish feel, for the scene and the status line
    mood(s) {
      if (s.health < 25 || s.oxygen < LIMITS.oxygen.danger) return { id: "danger", text: "The fish are in danger" };
      if (s.oxygen < LIMITS.oxygen.stress) return { id: "stressed", text: "Low oxygen: the fish are stressed" };
      if (s.water < LIMITS.temp.stopEating) return { id: "cold", text: "Too cold: the fish have stopped eating" };
      if (s.water > LIMITS.temp.hot) return { id: "hot", text: "The water is dangerously warm" };
      if (s.hunger > 0.75) return { id: "hungry", text: "The fish are hungry" };
      if (s.oxygen < LIMITS.oxygen.good) return { id: "ok", text: "The fish are okay, but oxygen is getting low" };
      return { id: "happy", text: "The fish are healthy and active" };
    }
  };

  root.PondModel = pondModel;
})(typeof window !== "undefined" ? window : globalThis);
