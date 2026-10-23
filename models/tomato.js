// ============ TOMATRIX MODEL: a UV-C tomato box at a market stall, one virtual minute at a time ============
// Simplified on purpose so it runs in a phone browser. What comes FROM THE MANUSCRIPT (TOMATRIX, a proposed design):
//  - Spoilage-risk thresholds: CO2 about 800 ppm, VOC above 400–500 ppm (MQ-135, an ethylene proxy), NH3 above 10–15 ppm.
//  - Storage band: best about 20 °C; respiration and spoilage rise above 25 °C; chilling injury below 10 °C;
//    RH 85–95 % (drier air means water loss, near 100 % helps mould grow).
//  - A fixed UV-C cycle of about 182 s: a 0.97 kJ/m² dose at 0.533 mW/cm² (two 254 nm lamps, 10 cm away), the dose
//    from the cited study by Pinheiro et al. (2015). The lamp works only with the lid closed (NC reed switch), and a
//    servo shutter covers the sensors while the lamp is on. A 10-minute monitoring window before each decision.
// GAME VALUES (invented to make a playable model, guided by general postharvest science, not measured by TOMATRIX):
//  the rates of ripening, microbe growth and water loss and how they speed up with heat (Q10 about 2–2.5), how much
//  one UV-C cycle helps (fewer surface microbes, slower ripening for a day), the skin damage from more than 4 cycles
//  in 24 hours, heat damage above 30 °C, the gas production rates, the box's air leak and the fan's air exchange.
(function (root) {
  "use strict";
  const { clamp } = root.IoT;

  const LIMITS = {
    co2: 800, voc: 450, nh3: 12.5,                         // manuscript: ≈800, 400–500, 10–15 ppm (middles used)
    temp: { best: 20, spoilAbove: 25, chillBelow: 10, hot: 30 }, // hot (30 °C) is a game value for the gauge
    rh: { low: 85, high: 95 },
    uv: { seconds: 182, irradiance: 0.533, dose: 0.97 },  // s, mW/cm², kJ/m²
    window: 10,                                           // monitoring window, minutes
    maxCycles: 4                                          // game value: more cycles than this in 24 h damage the skins
  };
  // UV-C dose in kJ/m² from seconds and irradiance in mW/cm²: 1 mW/cm² for 1 s is 1 mJ/cm² = 0.01 kJ/m²
  const uvDose = (seconds, mWcm2 = LIMITS.uv.irradiance) => seconds * mWcm2 / 100;
  const q10 = (q, t) => Math.pow(q, (t - LIMITS.temp.best) / 10); // how much faster a process runs than at 20 °C

  // The market air: warmest at 14:00 (the day's high), coolest, 7 °C lower, at 02:00; damper when it's cooler
  const marketTemp = (hour, high) => high - 3.5 + 3.5 * Math.cos(2 * Math.PI * (hour - 14) / 24);
  const marketRH = (temp, high) => clamp(88 - (temp - (high - 7)) / 7 * 20, 60, 95);
  // Afternoon sun on the front counter, 0–1 (09:00–17:00); the shaded spot inside the stall gets none
  const sunOn = (hour, spot) => (spot === "sun" && hour > 9 && hour < 17 ? Math.sin(Math.PI * (hour - 9) / 8) : 0);

  // One batch of tomatoes: microbes (a log-count index, 2 at the start), ripeness (1 = fully ripe), water lost (%)
  const batch = (ripe) => ({ microbes: 2, ripe, massLoss: 0, injury: 0 });
  function freshness(b) {
    return clamp(100 - 22 * Math.max(0, b.microbes - 2) - 35 * Math.max(0, b.ripe - 1) - 2.5 * b.massLoss - b.injury, 0, 100);
  }
  // How a batch changes in one minute in the box's air (temp °C, rh %, voc ppm); slow = UV-C slowed ripening
  function age(b, temp, rh, voc, fan, slow) {
    const d = 1 / 1440; // one minute, in days
    const wet = rh > LIMITS.rh.high ? 1 + (rh - LIMITS.rh.high) / 5 * 1.5 : rh < LIMITS.rh.low ? 0.85 : 1;
    const over = Math.max(0, b.ripe - 1);
    b.microbes += 0.18 * q10(2.5, temp) * wet * (1 + 0.6 * over) * d;
    const ethylene = 1 + 0.4 * Math.max(0, (voc - 200) / 400); // trapped ethylene speeds ripening
    if (temp >= LIMITS.temp.chillBelow) b.ripe += 0.12 * q10(2, temp) * ethylene * (slow ? 0.75 : 1) * d;
    else b.injury += 24 * d; // chilling injury: cold tomatoes stop ripening properly and get pitted
    if (temp > LIMITS.temp.hot) b.injury += 0.8 * (temp - LIMITS.temp.hot) * 24 * d; // heat damage: soft, blotchy fruit
    b.massLoss += 0.08 * (100 - rh) * q10(1.5, temp) * (fan ? 1.3 : 1) * d;
  }

  const model = {
    limits: LIMITS, uvDose, marketTemp, marketRH, sunOn, freshness,
    actuators: { fan: { kind: "switch" }, uv: { kind: "event" }, lid: { kind: "event" } },
    init(o = {}) {
      const high = o.airHigh ?? 29, start = (o.startMinutes ?? 360) / 60;
      const t = marketTemp(start, high);
      const s = {
        airHigh: high, spot: o.spot || "shade", lidOpens: o.lidOpens || [], // [[minute of day, minutes open], ...]
        temp: t + 1, rh: 90, co2: 520, voc: 120, nh3: 1,
        treated: batch(o.ripe ?? 0.4), control: batch(o.ripe ?? 0.4),
        lidOpen: false, autoLidUntil: -1, monitorUntil: (o.startMinutes ?? 360) + LIMITS.window,
        lampLeft: 0, doseNow: 0, lastDone: -999, slowUntil: -1, cycles: [], uvDamage: 0, blocked: 0, cutShort: 0, totalCycles: 0,
        fanOn: false, air: t, sun: 0
      };
      s.shown = { co2: s.co2, voc: s.voc, temp: s.temp, rh: s.rh, nh3: s.nh3 };
      return s;
    },
    readings(s) {
      const v = s.shown; // the sensors' last readings: frozen while the shutter covers them during UV-C
      return { co2: Math.round(v.co2), voc: Math.round(v.voc), temp: +v.temp.toFixed(1), rh: +v.rh.toFixed(1), nh3: +v.nh3.toFixed(1) };
    },
    step(s, ctx) {
      const now = ctx.minutes, hour = ctx.time.hour;
      const closeLid = () => { s.lidOpen = false; s.monitorUntil = now + LIMITS.window; ctx.note("Lid closed: checking the air for 10 minutes"); };
      const openLid = (why) => {
        s.lidOpen = true;
        if (s.lampLeft > 0) { s.lampLeft = 0; s.cutShort += 1; ctx.note("Lid opened: the UV-C lamp switched OFF for safety"); }
        else ctx.note(why);
      };

      // ---- Buttons and rules: open/close the lid, start a UV-C cycle ----
      for (const e of ctx.events) {
        if (e === "lid") { if (s.lidOpen) { s.autoLidUntil = -1; closeLid(); } else openLid("Lid open: the UV-C lamp can't run"); }
        if (e === "uv") {
          if (s.lidOpen) { s.blocked += 1; ctx.note("UV-C won't start: close the lid first"); }
          else if (s.lampLeft <= 0) { s.lampLeft = LIMITS.uv.seconds; s.doseNow = 0; ctx.note("UV-C cycle started: 182 s, the sensor shutter closes"); }
        }
      }
      // A customer or the vendor opens the lid at set times (missions)
      const mod = ((now % 1440) + 1440) % 1440;
      for (const [at, len] of s.lidOpens) if (mod === at && !s.lidOpen) { openLid("A customer opened the lid to pick tomatoes"); s.autoLidUntil = now + len; }
      if (s.lidOpen && s.autoLidUntil >= 0 && now >= s.autoLidUntil) { s.autoLidUntil = -1; closeLid(); }

      // ---- The UV-C lamp: only with the lid closed (the reed switch), counting the dose second by second ----
      const lampOn = s.lampLeft > 0 && !s.lidOpen;
      s.lampOn = lampOn;
      if (lampOn) {
        const secs = Math.min(60, s.lampLeft);
        s.lampLeft -= secs; s.doseNow += uvDose(secs);
        if (s.lampLeft <= 0) {
          s.lampLeft = 0; s.lastDone = now; s.totalCycles += 1; s.monitorUntil = now + LIMITS.window;
          s.cycles = s.cycles.filter((t) => now - t < 1440); s.cycles.push(now);
          // Game values: fewer surface microbes and slower ripening for a day (the direction Pinheiro et al. report)
          s.treated.microbes = Math.max(1, s.treated.microbes - 0.4);
          s.slowUntil = now + 1440;
          if (s.cycles.length > LIMITS.maxCycles) { s.treated.injury += 6; s.uvDamage += 1; ctx.note("Too much UV-C today: the tomato skins are getting damaged"); }
          else ctx.note(`UV-C cycle complete: ${s.doseNow.toFixed(2)} kJ/m²`);
        }
      }

      // ---- The box's air: it follows the market air, warmed by the sun and the tomatoes, mixed by the fan ----
      s.fanOn = !!ctx.switches.fan;
      s.air = marketTemp(hour, s.airHigh);
      s.sun = sunOn(hour, s.spot);
      const mixing = s.lidOpen ? 0.3 : s.fanOn ? 0.3 : 1;
      s.temp += (s.air + (1 + 6 * s.sun) * mixing + (lampOn ? 0.5 : 0) - s.temp) * 0.04;
      const k = s.lidOpen ? 1 : s.fanOn ? 0.12 : 0.04; // air exchanged per minute
      const ex = s.lidOpen ? 0.3 : s.fanOn ? 0.02 : 0.002;
      s.rh += (99.5 - s.rh) * 0.012 * Math.sqrt(q10(2, s.temp)) + (marketRH(s.air, s.airHigh) - s.rh) * ex; // tomatoes breathe out water
      s.rh = clamp(s.rh, 30, 100);
      // Gases: respiration (CO2), ethylene and other VOCs, and ammonia from rotting, all faster when warm and ripe
      const b = s.treated, rot = Math.max(0, b.microbes - 2);
      const co2Made = 6.6 * q10(2.2, s.temp) * (0.7 + 0.6 * b.ripe) * (1 + 0.5 * rot);
      const vocMade = 4.8 * q10(2, s.temp) * (0.4 + 0.9 * b.ripe) * (1 + 0.9 * rot);
      const nh3Made = 0.02 + 0.5 * Math.pow(rot, 1.5) * q10(2, s.temp);
      s.co2 += co2Made - k * (s.co2 - 420);
      s.voc += vocMade - k * (s.voc - 30);
      s.nh3 += nh3Made - k * (s.nh3 - 0.5);
      if (!lampOn) s.shown = { co2: s.co2, voc: s.voc, temp: s.temp, rh: s.rh, nh3: s.nh3 };

      // ---- The tomatoes: the treated batch in TOMATRIX, and an untreated batch in the same conditions ----
      age(s.treated, s.temp, s.rh, s.voc, s.fanOn, now < s.slowUntil);
      age(s.control, s.temp, s.rh, s.voc, s.fanOn, false);
    },
    // The LCD's four states from the manuscript, plus the lid and the monitoring window
    lcd(s, minutes) {
      if (s.lidOpen) return ["LID OPEN", "UV-C LOCKED OFF"];
      if (s.lampLeft > 0) { const m = Math.floor(s.lampLeft / 60), sec = s.lampLeft % 60; return ["UV-C TREATMENT", `ACTIVE ${m}:${String(sec).padStart(2, "0")}`]; }
      if (minutes - s.lastDone < LIMITS.window) return ["TREATMENT", "COMPLETE"];
      if (minutes < s.monitorUntil) return ["MONITORING", `${s.monitorUntil - minutes} MIN LEFT`];
      return model.atRisk(s) ? ["HIGH SPOILAGE RISK", "UV NEEDED"] : ["FRESH", "ALL GASES OK"];
    },
    atRisk(s) { const r = model.readings(s); return r.co2 > LIMITS.co2 || r.voc > LIMITS.voc || r.nh3 > LIMITS.nh3; },
    // How the tomatoes are doing, for the scene and the status line
    mood(s) {
      const f = freshness(s.treated);
      if (f < 40) return { id: "spoiled", text: "The tomatoes are spoiling!" };
      if (s.temp < LIMITS.temp.chillBelow) return { id: "cold", text: "Too cold: chilling injury" };
      if (f < 60) return { id: "soft", text: "The tomatoes are getting soft" };
      if (s.rh > LIMITS.rh.high + 2) return { id: "damp", text: "Very damp air: mould can grow" };
      if (s.temp > LIMITS.temp.hot) return { id: "hot", text: "The box is hot: tomatoes ripen fast" };
      if (s.rh < LIMITS.rh.low - 3) return { id: "dry", text: "Dry air: the tomatoes lose water" };
      if (f < 80) return { id: "ok", text: "The tomatoes are okay" };
      return { id: "fresh", text: "The tomatoes are fresh" };
    }
  };

  // ---- Missions: each checks the tomatoes every virtual minute (the game screen lists them) ----
  const fresh = (s) => freshness(s.treated);
  function track(sim) { return sim._track || (sim._track = { minFresh: 100, wet: 0, dry: 0 }); }
  // hours: how long; failAt: lowest freshness allowed; extra: { fail(t, s) → message, win(t, s) → { ok, message } }
  function keep(hours, failAt, extra = {}) {
    return (sim, h) => {
      const t = track(sim), s = sim.state, f = fresh(s);
      t.minFresh = Math.min(t.minFresh, f);
      if (s.rh > LIMITS.rh.high) t.wet += 1;
      if (s.rh < LIMITS.rh.low) t.dry += 1;
      if (f < failAt) return { state: "lost", message: `The tomatoes' freshness fell to ${Math.round(f)}%. Check the Graph tab to see what went wrong, change your rules and try again.` };
      const fail = extra.fail && extra.fail(t, s);
      if (fail) return { state: "lost", message: fail };
      if (h >= hours) {
        const win = extra.win ? extra.win(t, s) : { ok: true };
        if (!win.ok) return { state: "lost", message: win.message };
        const stars = t.minFresh >= failAt + 12 ? 3 : t.minFresh >= failAt + 5 ? 2 : 1;
        return { state: "won", stars, message: `Mission complete! Lowest freshness ${Math.round(t.minFresh)}%: ${"★".repeat(stars)}${stars < 3 ? ` (stay above ${failAt + 12}% for 3 stars)` : ""}` };
      }
      return { state: "running", progress: h / hours, message: `${Math.floor(h)} of ${hours} hours · freshness ${Math.round(f)}%` };
    };
  }
  const overdose = (t, s) => (s.uvDamage > 0 ? "Too much UV-C: more than 4 cycles in a day damaged the tomato skins. Use UNTIL on your UV-C rule so it can't start again and again." : null);
  // Five customers a day open the lid for 10 minutes (minute of the day, minutes open)
  const CUSTOMERS = [8, 10, 12, 14, 16].map((hh) => [hh * 60, 10]);
  const missions = [
    { id: "humid", title: "1. Load and close", goal: "A single layer of fresh tomatoes is in the box with the lid closed. Keep the humidity between 85 and 95% for one market day (12 hours). The example rule runs the fan when the air gets too damp.",
      options: { ripe: 0.4 },
      check: keep(12, 70, { fail: (t) => (t.wet > 90 ? "The box stayed above 95% humidity for over 90 minutes: mould loves that. Run the fan when humidity is high." : t.dry > 90 ? "The box stayed below 85% humidity for over 90 minutes, so the tomatoes dried out. Don't run the fan all the time." : null) }) },
    { id: "gas", title: "2. Gas alarm", goal: "These tomatoes are riper, so they give off more gas. Keep freshness above 78% for 2 days. Tip: an IF rule on VOC that STARTs the UV-C cycle.",
      options: { ripe: 0.8 }, check: keep(48, 78, { fail: overdose }) },
    { id: "lid", title: "3. Customers open the lid", goal: "Customers open the lid five times a day (8:00 to 16:00). The lamp stops whenever the lid opens. Give at least 2 full UV-C doses in 2 days, with no more than 1 cycle cut short or refused.",
      options: { ripe: 0.7, lidOpens: CUSTOMERS },
      check: keep(48, 75, { fail: (t, s) => (s.cutShort + s.blocked >= 2 ? "Two UV-C cycles were stopped or refused because the lid was open. Start the cycle when nobody opens the box, like after the market closes." : overdose(t, s)),
        win: (t, s) => (s.totalCycles >= 2 ? { ok: true } : { ok: false, message: `Only ${s.totalCycles} full UV-C dose${s.totalCycles === 1 ? "" : "s"} in 2 days. Opening the lid lets the gases out, so a gas rule may never fire. Try a time rule.` }) }) },
    { id: "heat", title: "4. Afternoon sun", goal: "The box sits on the front counter, and the afternoon sun heats it. Keep freshness above 70% for 2 days. Tip: the fan stops the closed box heating up above the market air.",
      options: { ripe: 0.4, spot: "sun" }, check: keep(48, 70, { fail: overdose }) },
    { id: "compare", title: "5. Beat the untreated batch", goal: "Five days at the stall, with an untreated batch beside the box for comparison. Keep freshness above 60%, end at least 20 points fresher than the untreated tomatoes, and never run more than 4 UV-C cycles in a day.",
      options: { ripe: 0.4 },
      check: keep(120, 60, { fail: overdose,
        win: (t, s) => { const gap = fresh(s) - freshness(s.control); return gap >= 20 ? { ok: true } : { ok: false, message: `Your tomatoes ended only ${Math.round(gap)} points fresher than the untreated batch. Give them a UV-C dose about once a day.` }; } }) }
  ];

  model.missions = missions;

  root.TomatoModel = model;
})(typeof window !== "undefined" ? window : globalThis);
