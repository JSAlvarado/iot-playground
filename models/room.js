// ============ ROOM MODEL: a one-room studio (원룸) in a Korean winter, one virtual minute at a time ============
// Simplified for a game, with real directions and published guide values:
//  - Air in a closed room is slowly swapped with outdoor air (about 0.4 room volumes an hour in an airtight modern flat); an open window swaps
//    it much faster (here 6 an hour). That's what brings fresh air in, and also what lets cold air and fine dust in.
//  - Humidity is tracked as water in the air (g/m³), so heating cold, dry winter air makes the room feel dry: warm
//    air holds more water, so the same water is a lower relative humidity (Magnus formula for saturation).
//  - One person breathing out adds CO2 and some moisture. Outdoor air is about 420 ppm CO2.
//  - Indoor fine dust (PM2.5) comes in from outside and from cooking; it settles slowly and an air purifier filters it.
// Guide values: Korea's PM2.5 grades (good 0–15, moderate 16–35, bad 36–75, very bad 76+ µg/m³), Korea's 1,000 ppm
// CO2 standard for multi-use facilities, US EPA humidity advice (below 60%, ideally 30–50%) and WHO's 18 °C minimum
// indoor temperature in cold seasons. The comfort score that uses them is the game's own.
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  const ROOM = { volume: 30, airClosed: 0.4, airOpen: 6 };            // m³, room-air changes per hour
  const LIMITS = {
    temp: { cold: 16, cool: 18, warm: 26, hot: 28 },
    rh: { dry: 30, wet: 60, mould: 70 },
    pm: { good: 15, moderate: 35, bad: 75 },
    co2: { fresh: 1000, stuffy: 1500, bad: 2000 }
  };

  // Water the air can hold at a temperature, g/m³ (Magnus formula for saturation vapour pressure)
  function saturation(t) {
    const e = 6.112 * Math.exp((17.62 * t) / (243.12 + t)); // hPa
    return (216.7 * e) / (t + 273.15);
  }
  // Outdoor temperature over the day: warmest at 14:00 (the day's high), coldest at 02:00, 6 °C apart
  const outdoorTemp = (hour, high) => high - 3 + 3 * Math.cos((2 * Math.PI * (hour - 14)) / 24);
  const pmGrade = (pm) => (pm <= 15 ? "Good" : pm <= 35 ? "Moderate" : pm <= 75 ? "Bad" : "Very bad");

  const roomModel = {
    room: ROOM, limits: LIMITS, saturation, outdoorTemp, pmGrade,
    actuators: { heater: { kind: "switch" }, humidifier: { kind: "switch" }, purifier: { kind: "switch" }, window: { kind: "switch" },
      vent: { kind: "event" }, cook: { kind: "event" } },
    init(o = {}) {
      const high = o.outHigh ?? 2;
      const tin = o.tempStart ?? 17;
      const outT = outdoorTemp(18, high);
      return {
        outHigh: high, outPm: o.outPm ?? 12, outRh: o.outRh ?? 60, cookAt: o.cookAt ?? null,
        temp: tin, water: saturation(tin) * (o.rhStart ?? 35) / 100, pm: o.pmStart ?? 10, co2: o.co2Start ?? 600,
        outTemp: outT, ventLeft: 0, cookLeft: 0, windowOpen: false,
        heaterOn: false, humidifierOn: false, purifierOn: false, comfort: 100, heaterHours: 0
      };
    },
    readings(s) {
      return { temp: +s.temp.toFixed(2), humidity: +roomModel.rh(s).toFixed(1), pm: +s.pm.toFixed(1), co2: Math.round(s.co2) };
    },
    rh(s) { return clamp((100 * s.water) / saturation(s.temp), 0, 100); },
    step(s, ctx) {
      const h = 1 / 60, hour = ctx.time.hour;
      for (const e of ctx.events) {
        if (e === "vent") { s.ventLeft = 10; ctx.note("Window open for 10 minutes to air out the room"); }
        if (e === "cook") { s.cookLeft = 30; ctx.note("Cooking dinner: grilling fish for 30 minutes"); }
      }
      if (s.cookAt !== null && ctx.time.hh * 60 + ctx.time.mm === s.cookAt) { s.cookLeft = 30; ctx.note("Dinner time: grilling fish for 30 minutes"); }
      s.windowOpen = !!ctx.switches.window || s.ventLeft > 0;
      if (s.ventLeft > 0) s.ventLeft -= 1;
      s.heaterOn = !!ctx.switches.heater; s.humidifierOn = !!ctx.switches.humidifier; s.purifierOn = !!ctx.switches.purifier;
      const cooking = s.cookLeft > 0;
      if (cooking) s.cookLeft -= 1;
      const ach = s.windowOpen ? ROOM.airOpen : ROOM.airClosed;
      s.outTemp = outdoorTemp(hour, s.outHigh);
      const outWater = (saturation(s.outTemp) * s.outRh) / 100;

      // Temperature: heat leaks to the cold outside (much faster with the window open); the heater and the person add heat
      s.temp += ((s.outTemp - s.temp) * (0.06 + (s.windowOpen ? 0.25 : 0)) + (s.heaterOn ? 3.5 : 0) + 0.15 + (cooking ? 1 : 0)) * h;
      if (s.heaterOn) s.heaterHours += h;

      // Water in the air: swapped with outdoor air; a person adds about 40 g an hour, the humidifier 250 g, cooking 300 g
      s.water += (ach * (outWater - s.water) + (40 + (s.humidifierOn ? 250 : 0) + (cooking ? 300 : 0)) / ROOM.volume) * h;
      s.water = clamp(s.water, 0, saturation(s.temp)); // above 100% it condenses on the cold window

      // CO2: one resting person breathes out about 18 litres an hour (about 14 asleep, 23:00–07:00) into 30 m³,
      // about +600 ppm an hour in a sealed room (+470 asleep)
      const asleep = hour >= 23 || hour < 7;
      s.co2 += (ach * (420 - s.co2) + (asleep ? 470 : 600)) * h;

      // Fine dust: comes in with outdoor air (walls filter a little when closed), settles, is filtered; grilling makes a lot
      const inFrom = ach * (s.windowOpen ? 1 : 0.8) * s.outPm;
      s.pm += (inFrom - ach * s.pm - 0.2 * s.pm - (s.purifierOn ? (200 / ROOM.volume) * s.pm : 0) + (cooking ? 1000 : 0)) * h;
      s.pm = Math.max(0, s.pm);

      // Comfort: the game's score, lowered while the room is outside the guide values
      const rh = roomModel.rh(s);
      let harm = 0;
      if (s.temp < LIMITS.temp.cold || s.temp > LIMITS.temp.hot) harm += 6; else if (s.temp < LIMITS.temp.cool || s.temp > LIMITS.temp.warm) harm += 2;
      if (rh < LIMITS.rh.dry) harm += 2;
      if (rh > LIMITS.rh.mould) harm += 3;
      if (s.pm > 150) harm += 20; else if (s.pm > LIMITS.pm.bad) harm += 8; else if (s.pm > LIMITS.pm.moderate) harm += 3;
      if (s.co2 > LIMITS.co2.bad) harm += 4; else if (s.co2 > LIMITS.co2.stuffy) harm += 1;
      s.comfort = clamp(s.comfort + (harm ? -harm : 2) * h, 0, 100);
    },
    mood(s) {
      const rh = roomModel.rh(s);
      if (s.pm > LIMITS.pm.bad) return { id: "smoky", text: "The air is full of fine dust" };
      if (s.temp < LIMITS.temp.cold) return { id: "cold", text: "Freezing: it's too cold in here" };
      if (s.temp > LIMITS.temp.hot) return { id: "hot", text: "Too hot in here" };
      if (s.co2 > LIMITS.co2.stuffy) return { id: "stuffy", text: "Stuffy: the air needs freshening" };
      if (rh > LIMITS.rh.mould) return { id: "damp", text: "Too damp: water is condensing on the window" };
      if (s.pm > LIMITS.pm.moderate) return { id: "dusty", text: "Dusty air: fine dust is above 35 µg/m³" };
      if (rh < LIMITS.rh.dry) return { id: "dry", text: "The air is very dry" };
      if (s.temp < LIMITS.temp.cool) return { id: "cool", text: "A bit chilly" };
      if (s.co2 > LIMITS.co2.fresh) return { id: "ok", text: "Comfortable, but the air is getting stale" };
      return { id: "cozy", text: "Cozy and fresh" };
    }
  };

  root.RoomModel = roomModel;
})(typeof window !== "undefined" ? window : globalThis);
