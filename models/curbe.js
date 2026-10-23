// ============ CURB-E MODEL: a solar-powered AI smart sign at a No Parking / No Loading zone, one virtual minute at a time ============
// Curb-E is a proposed design (a student project): a traffic sign with two cameras, a Raspberry Pi 5 running YOLO
// (finds vehicles) and OCR (reads plates), a 12 V siren strobe, cooling fans, a 4G LTE modem for uploads and a
// solar panel + MPPT + LiFePO4 battery + UPS HAT. This model is simplified on purpose so it runs in a browser.
//  From the manuscript: the siren strobe sounds for 10 seconds when a violation is detected; evidence is an image,
//    the plate number, a timestamp and the location, sent over 4G; solar + LiFePO4 keep it running at night and on
//    cloudy days, the UPS HAT keeps the Pi running if the main power fails, fans stop it overheating.
//  Game values (the manuscript gives no rule or rating for these): how long a stop counts as parking (the player's
//    rule decides), the plate-read confidence numbers, the battery drain and solar charge rates, and the enclosure
//    temperatures. The shutdown at 60 °C enclosure air is a game value chosen to stay well below the 80–85 °C chip
//    limit where a Raspberry Pi throttles (Raspberry Pi documentation).
//  All plates are made up ("GAM 0001" style). Vehicles are invented by a seeded random generator.
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  const WEATHER = { sunny: { sun: 1, label: "Sunny" }, cloudy: { sun: 0.5, label: "Cloudy" }, rainy: { sun: 0.25, label: "Rainy" } };
  const LIMITS = {
    clearRead: 75,        // a plate read below this is "unclear": it might name the wrong car (game value)
    hotShutdown: 60,      // enclosure °C: Curb-E shuts down to protect the Pi (game value)
    coolRestart: 52,      // and starts again once it has cooled to this
    sirenSeconds: 10,     // from the manuscript
    warnedLeave: 3,       // a violator that drives off within 3 minutes of the warning counts as caught
    upsMinutes: 30        // how long the UPS HAT keeps the Pi going after the main battery empties (game value)
  };
  const PREFIX = ["GAM", "PLY", "SIM", "FUN", "TOY"]; // made-up plate letters, written like GAM-07 so they can't match a real plate

  // A small seeded random generator (mulberry32), so missions play the same every time
  function rand(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const between = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
  const isNight = (hour) => hour < 6 || hour >= 18;

  // Sunlight from 0 to 1: daylight 06:00–18:00, strongest at noon, cut by clouds and rain
  function sunlight(hour, weather) {
    if (hour < 6 || hour > 18) return 0;
    return Math.sin(Math.PI * (hour - 6) / 12) * WEATHER[weather].sun;
  }
  // Air temperature: warmest at 14:00, 9 °C cooler at 02:00; rain cools it 2 °C
  const airTemp = (hour, high, weather) => high - 4.5 + 4.5 * Math.cos(2 * Math.PI * (hour - 14) / 24) - (weather === "rainy" ? 2 : 0);

  // The best plate read the camera can reach, %: bright days are best, night (street lights only) and rain are worse
  function plateCeiling(hour, weather) {
    if (isNight(hour)) return { sunny: 88, cloudy: 86, rainy: 78 }[weather];
    return { sunny: 97, cloudy: 95, rainy: 89 }[weather];
  }
  // How many minutes it takes the AI to build a good read from many frames (slower in the dark and rain)
  function plateMinutes(hour, weather) {
    return (isNight(hour) ? 2.5 : 1) * (weather === "rainy" ? 1.8 : weather === "cloudy" ? 1.2 : 1);
  }

  // A new vehicle stops at the curb: a brief stop (stuck in traffic, a quick stop) or a vehicle that parks
  function newVehicle(s, hour) {
    s.count += 1;
    const parkChance = isNight(hour) ? 0.6 : s.parkShare;
    const parks = rand(s) < parkChance;
    const dwell = parks ? (isNight(hour) ? between(s, 20, 180) : between(s, s.parkMin, 40)) : between(s, 1, s.briefMax);
    return {
      id: s.count, plate: `${PREFIX[s.count % PREFIX.length]}-${String(s.count % 100).padStart(2, "0")}`, // e.g. GAM-07: not a real plate format
      kind: parks ? "park" : "brief", dwell, t: 0,
      quality: between(s, -6, 3), // a clean, straight-on plate reads better than a dirty, angled one
      conf: 0, warned: false, warnT: 0, recorded: false, unclear: false, falseCounted: false, color: between(s, 0, 5)
    };
  }

  const model = {
    weather: WEATHER, limits: LIMITS, sunlight, airTemp, plateCeiling, plateMinutes, isNight,
    actuators: { siren: { kind: "event" }, upload: { kind: "event" }, fan: { kind: "switch" } },
    init(o = {}) {
      const high = o.airHigh ?? 31;
      return {
        weather: o.weather || "sunny", airHigh: high,
        rng: (o.seed ?? Math.floor(Math.random() * 1e9)) | 0,
        arrive: o.arrive ?? 0.12,     // chance per minute that a vehicle pulls in by day (when the curb is empty)
        parkShare: o.parkShare ?? 0.35, briefMax: o.briefMax ?? 2, parkMin: o.parkMin ?? 6,
        battery: o.battery ?? 80, ups: LIMITS.upsMinutes,
        temp: o.tempStart ?? 30, sun: 0, fanOn: false,
        down: null,                  // null, "power" or "heat": Curb-E is off
        vehicle: null, count: 0, last: null,
        caught: 0, missed: 0, falseAlarms: 0, unclear: 0, violators: 0, records: 0,
        sirens: 0, uploads: 0, heatStops: 0, powerOuts: 0
      };
    },
    readings(s) {
      const v = s.down ? null : s.vehicle;
      return { stopped: v ? v.t : 0, plate: v && v.warned ? Math.round(v.conf) : 0, battery: +s.battery.toFixed(1), temp: +s.temp.toFixed(1) };
    },
    step(s, ctx) {
      const h = 1 / 60, hour = ctx.time.hour;
      s.sun = sunlight(hour, s.weather);

      // Power: the solar panel (through the MPPT) charges the LiFePO4 battery; the Pi, cameras and modem use it all the time
      s.fanOn = !!ctx.switches.fan && !s.down;
      s.battery = clamp(s.battery + (14 * s.sun - 2.5 - (s.fanOn ? 1.5 : 0)) * h, 0, 100);
      if (s.battery <= 0) {
        if (s.ups > 0) { if (s.ups === LIMITS.upsMinutes) ctx.note("Main battery empty: the UPS HAT keeps the Pi running for a short while"); s.ups -= 1; }
        if (s.ups <= 0 && s.down !== "power") { s.down = "power"; s.powerOuts += 1; ctx.note("Out of power: Curb-E has shut down"); }
      } else if (s.battery > 5) {
        s.ups = Math.min(LIMITS.upsMinutes, s.ups + 0.5);
        if (s.down === "power") { s.down = null; ctx.note("The sun recharged the battery: Curb-E is back on"); }
      }

      // Enclosure temperature: the sun heats the metal box, the electronics add a little, the fans pull in outside air
      const air = airTemp(hour, s.airHigh, s.weather);
      const target = air + (s.fanOn ? 1.5 + 10 * s.sun : 3 + 26 * s.sun);
      s.temp += (target - s.temp) * 0.06;
      if (!s.down && s.temp > LIMITS.hotShutdown) { s.down = "heat"; s.heatStops += 1; ctx.note("Too hot! Curb-E shut down to protect the Raspberry Pi"); }
      else if (s.down === "heat" && s.temp < LIMITS.coolRestart) { s.down = null; ctx.note("Cooled down: Curb-E is back on"); }

      // Actions: the siren warns the driver, the upload sends the evidence over 4G. Neither works while Curb-E is off.
      const cur = s.vehicle;
      const falseAlarm = (veh, why) => { if (veh && veh.falseCounted) return; if (veh) veh.falseCounted = true; s.falseAlarms += 1; ctx.note(why); };
      for (const e of ctx.events) {
        if (s.down) { ctx.note("Curb-E is off, so nothing happened"); continue; }
        if (e === "siren") {
          s.sirens += 1; s.battery = Math.max(0, s.battery - 0.05);
          if (!cur) { falseAlarm(null, "False alarm: the siren sounded at an empty curb"); continue; }
          if (cur.warned) continue;
          cur.warned = true; cur.warnT = cur.t;
          if (cur.kind === "brief") { falseAlarm(cur, `False alarm: ${cur.plate} only stopped briefly`); continue; }
          ctx.note(`Siren 10 s: ${cur.plate} warned after ${cur.t} min`);
          if (rand(s) < 0.35) cur.dwell = Math.min(cur.dwell, cur.t + between(s, 1, 2)); // some drivers move on at once
        } else if (e === "upload") {
          if (!cur) { ctx.note("Nothing to record: the curb is empty"); continue; }
          if (cur.recorded) continue;
          s.uploads += 1; s.battery = Math.max(0, s.battery - 0.1);
          // Without a warning first, the camera only has one quick, zoomed-out frame
          const conf = cur.warned ? cur.conf : 0.6 * (plateCeiling(hour, s.weather) + cur.quality);
          if (cur.kind === "brief") { falseAlarm(cur, `False alarm: evidence sent for ${cur.plate}, a brief stop`); continue; }
          if (conf < LIMITS.clearRead) { cur.unclear = true; s.unclear += 1; falseAlarm(cur, `Unclear photo: plate read only ${Math.round(conf)}%, it might name the wrong car`); continue; }
          cur.recorded = true; s.records += 1;
          ctx.note(`Evidence uploaded over 4G: ${cur.plate}, plate read ${Math.round(conf)}%`);
        }
      }

      // The curb: vehicles pull in, stay, and leave. A violator is one that parks; brief stops are not flagged.
      const v = s.vehicle;
      if (v) {
        v.t += 1;
        if (v.warned) v.conf += (plateCeiling(hour, s.weather) + v.quality - v.conf) * (1 - Math.exp(-1 / plateMinutes(hour, s.weather)));
        if (v.t > v.dwell) {
          if (v.kind === "park") {
            s.violators += 1;
            const ok = v.recorded || (v.warned && v.t - v.warnT <= LIMITS.warnedLeave + 1);
            if (ok) s.caught += 1; else { s.missed += 1; ctx.note(`Missed: ${v.plate} parked ${v.dwell} min and left without a clear record`); }
          }
          s.last = v; s.vehicle = null;
        }
      } else {
        const busy = isNight(hour) ? 0.05 : s.arrive;
        if (rand(s) < busy) s.vehicle = newVehicle(s, hour);
      }
    },
    // How the sign is doing, for the scene and the status line
    mood(s) {
      if (s.down === "heat") return { id: "hot", text: "Too hot: Curb-E has shut down to cool off" };
      if (s.down === "power") return { id: "off", text: "Out of power: Curb-E is off" };
      const v = s.vehicle;
      if (s.temp > 55) return { id: "warm", text: "The box is getting very hot" };
      if (s.battery < 15) return { id: "low", text: "The battery is low" };
      if (v && v.recorded) return { id: "recorded", text: `${v.plate} recorded` };
      if (v && v.warned && v.kind === "park") return { id: "warned", text: `${v.plate} warned · ${v.t} min` };
      if (v && v.t > 0) return { id: "stopped", text: `${v.plate} stopped ${v.t} min` };
      return { id: "clear", text: "Curb clear" };
    }
  };

  // ---- Missions (pure logic, so the tests can run them): a fair tally of caught, missed and false alarms ----
  const tally = (s) => `Caught ${s.caught} · Missed ${s.missed} · False alarms ${s.falseAlarms}`;
  function patrol(hours, extra = {}) {
    return (sim, h) => {
      const s = sim.state;
      if (s.falseAlarms > 2) return { state: "lost", message: s.unclear >= 2 ? `${s.unclear} unclear photos were uploaded, and they might name the wrong car. Upload only when the Plate read is above 80%. (${tally(s)})` : `${s.falseAlarms} false alarms: Curb-E flagged drivers who did nothing wrong. Raise your Stopped limit so brief stops are let go. (${tally(s)})` };
      if (extra.heat && s.heatStops) return { state: "lost", message: "Curb-E overheated and shut down, so violators went unseen. Add a rule: IF Box temp is above 45 THEN Cooling fans ON." };
      if (extra.power && s.powerOuts) return { state: "lost", message: "The battery and the UPS ran empty before sunrise. Run the cooling fan only when the box is really hot, not all night." };
      if (h >= hours) {
        const rate = s.violators ? s.caught / s.violators : 1;
        if (rate < 0.75) return { state: "lost", message: `Only ${s.caught} of ${s.violators} parked vehicles were caught. Warn sooner (a lower Stopped limit), and make sure an upload rule follows the warning. (${tally(s)})` };
        const stars = s.falseAlarms === 0 && rate >= 0.9 ? 3 : s.falseAlarms <= 1 && rate >= 0.8 ? 2 : 1;
        return { state: "won", stars, message: `Mission complete! ${tally(s)}: ${"★".repeat(stars)}${stars < 3 ? " (catch 9 in 10 with no false alarms for 3 stars)" : ""}` };
      }
      return { state: "running", progress: h / hours, message: `${Math.floor(h)} of ${hours} h · ${tally(s)}` };
    };
  }
  model.missions = [
    { id: "first-shift", title: "1. First shift", goal: "A sunny day from 06:00 to 18:00. Catch at least 3 in 4 vehicles that park, with no more than 2 false alarms. The example rules warn after 3 minutes, then upload when the plate read is clear.",
      options: { weather: "sunny", airHigh: 30, seed: 101 }, check: patrol(12) },
    { id: "rush", title: "2. Rush hour", goal: "Heavy traffic: cars get stuck at the curb for up to 4 minutes before they can move. Don't flag them! Catch 3 in 4 parked vehicles with at most 2 false alarms. Tip: raise the Stopped limit.",
      options: { weather: "cloudy", airHigh: 30, seed: 202, briefMax: 4, parkMin: 8, arrive: 0.16, parkShare: 0.3 }, check: patrol(12) },
    { id: "rain", title: "3. Rainy day", goal: "Rain makes plates hard to read, and an unclear photo might name the wrong car. Upload only clear evidence and still catch 3 in 4 parked vehicles.",
      options: { weather: "rainy", airHigh: 29, seed: 303, battery: 60, parkMin: 8 }, check: patrol(12) },
    { id: "heat", title: "4. Hot afternoon", goal: "36 °C and full sun: the metal box heats up fast. Above 60 °C Curb-E shuts down to protect the Raspberry Pi. Keep it running all day and catch 3 in 4.",
      options: { weather: "sunny", airHigh: 36, seed: 404, parkMin: 8 }, check: patrol(12, { heat: true }) },
    { id: "night", title: "5. Night shift", goal: "From 18:00 to 06:00 there's no sun, so Curb-E runs on its LiFePO4 battery (40%) and UPS. Plates are harder to read in the dark. Keep it on until sunrise and catch 3 in 4.",
      options: { weather: "sunny", airHigh: 30, seed: 505, battery: 40, startMinutes: 18 * 60 }, check: patrol(12, { power: true }) }
  ];

  root.CurbeModel = model;
})(typeof window !== "undefined" ? window : globalThis);
