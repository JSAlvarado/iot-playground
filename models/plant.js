// ============ PLANT MODEL: a potted plant on a balcony, one virtual minute at a time ============
// Simplified for a game, with real directions: soil dries faster in sun, rain wets it, plants need light to grow,
// and roots suffer both when the soil is very dry and when it stays waterlogged (they need air too).
// Moisture is a 0–100% scale like a capacitive soil-moisture sensor's reading; 40–70% is this plant's comfortable
// range (real plants differ, so the game uses one easy range).
(function (root) {
  "use strict";
  const { clamp } = root.IoT;
  const SUN = { sunny: 1, cloudy: 0.55, rainy: 0.3 };
  const LIMITS = { dry: 25, low: 40, high: 70, soggy: 85 };

  function sunlight(hour, weather) {
    if (hour < 6 || hour > 18) return 0;
    return Math.sin(Math.PI * (hour - 6) / 12) * SUN[weather];
  }

  const plantModel = {
    limits: LIMITS, sunlight,
    actuators: { pump: { kind: "switch" }, growlight: { kind: "switch" } },
    init(o = {}) {
      return {
        weatherDays: o.weatherDays || ["sunny", "cloudy", "sunny", "rainy", "sunny", "sunny", "cloudy"],
        weather: "sunny", moisture: o.moisture ?? 55, light: 0,
        tank: o.tank ?? 10,     // litres in the pump's water tank
        health: 100, growth: 0, pumpOn: false, growLightOn: false
      };
    },
    readings(s) {
      return { moisture: +s.moisture.toFixed(1), light: Math.round(s.light * 100), tank: +s.tank.toFixed(2) };
    },
    step(s, ctx) {
      const h = 1 / 60;
      const hour = ctx.time.hour;
      s.weather = s.weatherDays[(ctx.time.day - 1) % s.weatherDays.length];
      const sun = sunlight(hour, s.weather);

      // Light: the sun, plus the grow light when it's on
      s.growLightOn = !!ctx.switches.growlight;
      s.light = clamp(sun + (s.growLightOn ? 0.6 : 0), 0, 1);

      // Soil water: dries all the time, faster in sun; rain falls 10:00–16:00 on rainy days; the pump adds water
      let change = -(0.25 + 0.9 * sun);
      if (s.weather === "rainy" && hour >= 10 && hour < 16) change += 4;
      s.pumpOn = !!ctx.switches.pump && s.tank > 0;
      if (ctx.switches.pump && s.tank <= 0 && ctx.time.mm === 0) ctx.note("Water tank empty: the pump can't run");
      if (s.pumpOn) { change += 6; s.tank = clamp(s.tank - 0.4 * h, 0, 100); }
      s.moisture = clamp(s.moisture + change * h, 0, 100);

      // Health and growth
      let harm = 0;
      if (s.moisture < LIMITS.dry) harm += 4;
      if (s.moisture > LIMITS.soggy) harm += 3;
      const comfortable = s.moisture >= LIMITS.low - 10 && s.moisture <= LIMITS.high + 10;
      s.health = clamp(s.health + (harm ? -harm : comfortable ? 1 : 0) * h, 0, 100);
      if (!harm && s.moisture >= LIMITS.low && s.moisture <= LIMITS.high && s.light > 0.2) s.growth += 0.03 * s.light * h;
    },
    leaves(s) { return Math.min(12, 4 + Math.floor(s.growth)); },
    mood(s) {
      if (s.health < 30) return { id: "danger", text: "The plant is wilting badly" };
      if (s.moisture < LIMITS.dry) return { id: "dry", text: "The soil is too dry: the leaves are drooping" };
      if (s.moisture > LIMITS.soggy) return { id: "soggy", text: "The soil is waterlogged: the roots can't breathe" };
      if (s.moisture < LIMITS.low) return { id: "ok", text: "Getting dry, it will need water soon" };
      if (s.moisture > LIMITS.high) return { id: "ok", text: "A little too wet" };
      return { id: "happy", text: s.light > 0.2 ? "Happy and growing" : "Happy, resting until there's light" };
    }
  };

  root.PlantModel = plantModel;
})(typeof window !== "undefined" ? window : globalThis);
