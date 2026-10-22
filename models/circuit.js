// ============ CIRCUIT MODEL: wiring checks for Circuit Playground (no screen code, so it can be tested) ============
// The player connects part legs to board pins with jumper wires. This file works out which legs share a connection
// (a "net"), checks each part against real electronics rules, and runs the challenge's program on the result.
// Real numbers used: a 5 V board; an LED drops about 2 V, so a 220 Ω resistor gives (5 − 2) / 220 ≈ 14 mA, under the
// 20 mA an Uno pin is rated for (40 mA absolute maximum). analogRead gives 0–1023 for 0–5 V. A TMP36 outputs
// 0.5 V + 10 mV per °C. A light-dependent resistor (LDR) drops from about 1 MΩ in the dark to a few kΩ in light.
(function (root) {
  "use strict";
  const DIGITAL = ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"];
  const ANALOG = ["A0", "A1", "A2"];
  const PINS = [...DIGITAL, "5V", "GND1", "GND2", ...ANALOG];
  const isDigital = (p) => DIGITAL.includes(p), isAnalog = (p) => ANALOG.includes(p);
  const VF = { red: 2.0, yellow: 2.1, green: 2.2 };                // typical LED forward voltages (bright pure-green, blue and white LEDs drop about 3 V)
  const PART_LEGS = { led: ["a", "k"], res: ["r1", "r2"], button: ["p1", "p2"], ldr: ["p1", "p2"], tmp36: ["vs", "out", "gnd"], buzzer: ["plus", "minus"] };
  const LEG_NAMES = { a: "long leg (+)", k: "short leg (−)", r1: "left end", r2: "right end", p1: "left leg", p2: "right leg", vs: "+Vs leg (left)", out: "Vout leg (middle)", gnd: "GND leg (right)", plus: "+ leg", minus: "− leg" };

  // ---- Nets: which terminals are joined by wires (both GND pins are the same net) ----
  function nets(wires) {
    const parent = {};
    const find = (x) => { while (parent[x] && parent[x] !== x) x = parent[x] = parent[parent[x]] || parent[x]; return x; };
    const join = (a, b) => { parent[a] = parent[a] || a; parent[b] = parent[b] || b; const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    join("GND1", "GND2");
    for (const [a, b] of wires) join(a, b);
    const of = (t) => (parent[t] ? find(t) : t);
    const members = {};
    for (const t of Object.keys(parent)) (members[of(t)] = members[of(t)] || []).push(t);
    const net = (t) => members[of(t)] || [t];
    const pinsIn = (t) => net(t).filter((m) => PINS.includes(m)).map((p) => (p.startsWith("GND") ? "GND" : p));
    return { of, net, pinsIn };
  }

  // What a leg reaches: a board pin straight away, or through one resistor
  function reach(N, parts, term) {
    const direct = [...new Set(N.pinsIn(term))];
    if (direct.length) return { pins: direct, via: null };
    for (const p of parts.filter((q) => q.type === "res")) {
      for (const [leg, other] of [["r1", "r2"], ["r2", "r1"]]) {
        if (N.of(`${p.id}.${leg}`) === N.of(term)) {
          const far = [...new Set(N.pinsIn(`${p.id}.${other}`))];
          if (far.length) return { pins: far, via: p };
        }
      }
    }
    return { pins: [], via: null };
  }
  const kindOf = (pins) => (pins.includes("GND") ? "gnd" : pins.includes("5V") ? "5v" : pins.find(isDigital) ? "pin" : pins.find(isAnalog) ? "analog" : null);

  // ---- Check every part; returns results per part plus a list of problems, worst first ----
  function analyze(ch, wires) {
    const N = nets(wires), parts = ch.parts, res = {}, problems = [], used = {};
    const claim = (pin, who) => { (used[pin] = used[pin] || []).push(who); };
    // Short circuits first: they would damage a real board
    for (const t of PINS) {
      const pins = [...new Set(N.pinsIn(t))];
      if (pins.includes("5V") && pins.includes("GND")) { problems.push({ level: "bad", text: "5V is wired straight to GND: a short circuit! On a real board the USB fuse cuts the power (and on an external supply the regulator can overheat). Remove that wire." }); break; }
    }
    for (const d of DIGITAL) {
      const pins = [...new Set(N.pinsIn(d))];
      if (pins.includes("GND") || pins.includes("5V")) problems.push({ level: "bad", text: `${d} is wired straight to ${pins.includes("GND") ? "GND" : "5V"}. When the pin drives the other way, a large current flows and can damage it.` });
      const others = pins.filter((p) => p !== d && (isDigital(p) || isAnalog(p)));
      if (others.length) problems.push({ level: "bad", text: `${d} is wired straight to ${others[0]}. Keep each pin on its own connection.` });
    }
    for (const p of parts) {
      const T = (leg) => `${p.id}.${leg}`;
      if (p.type === "led") {
        const A = reach(N, parts, T("a")), K = reach(N, parts, T("k"));
        const a = kindOf(A.pins), k = kindOf(K.pins);
        const ohms = (A.via ? A.via.ohms : 0) + (K.via ? K.via.ohms : 0);
        let r;
        if (a === "pin" && k === "gnd") r = { state: ohms ? "ok" : "noResistor", pin: A.pins.find(isDigital), ohms };
        else if (a === "5v" && k === "gnd") r = { state: ohms ? "always" : "noResistor", pin: "5V", ohms };
        else if ((a === "gnd" && (k === "pin" || k === "5v"))) r = { state: "reversed", pin: K.pins.find(isDigital) || "5V", ohms };
        else r = { state: "open" };
        if (r.state === "ok" && r.ohms < 150) r.state = "lowResistor";
        r.mA = r.ohms ? ((5 - VF[p.color]) / r.ohms) * 1000 : null;
        if (r.pin && isDigital(r.pin)) claim(r.pin, p.label);
        r.res = [A.via, K.via].filter(Boolean).map((q) => q.id);
        res[p.id] = r;
        const name = p.label;
        if (r.state === "noResistor") problems.push({ level: "bad", text: `The ${name} has no resistor. Nothing limits the current, so the LED (and the pin) can be damaged. Put the 220 Ω resistor in series: pin → resistor → LED long leg.` });
        if (r.state === "reversed") problems.push({ level: "warn", text: `The ${name} is in backwards. Current only flows from the long leg (+) to the short leg (−): the long leg goes toward the pin, the short leg to GND.` });
        if (r.state === "always") problems.push({ level: "warn", text: `The ${name} is on 5V, so it's always on and the program can't switch it. Connect it to a digital pin (D2–D13) instead.` });
        if (r.state === "lowResistor") problems.push({ level: "warn", text: `The resistor for the ${name} is too small: about ${Math.round(r.mA)} mA would flow. Use the 220 Ω one.` });
        if (r.state === "open") problems.push({ level: "info", text: `The ${name} isn't connected yet: it needs a path from a digital pin, through a 220 Ω resistor and the LED, to GND.` });
      } else if (p.type === "button") {
        const one = kindOf(N.pinsIn(T("p1"))), two = kindOf(N.pinsIn(T("p2")));
        const pin = [...N.pinsIn(T("p1")), ...N.pinsIn(T("p2"))].find(isDigital);
        const kinds = [one, two];
        let r = { state: "open" };
        if (kinds.includes("pin") && kinds.includes("gnd")) r = { state: "ok", pin };
        else if (kinds.includes("pin") && kinds.includes("5v")) r = { state: "toVcc", pin };
        if (pin) claim(pin, "button");
        res[p.id] = r;
        if (r.state === "toVcc") problems.push({ level: "warn", text: "With INPUT_PULLUP the pin already sits at 5V, so pressing a button to 5V changes nothing. Connect the button's other leg to GND: pressing it pulls the pin LOW." });
        if (r.state === "open") problems.push({ level: "info", text: "The button needs one leg on a digital pin and the other on GND." });
      } else if (p.type === "ldr") {
        const r10 = parts.find((q) => q.type === "res" && q.ohms === 10000);
        const l1 = N.pinsIn(T("p1")), l2 = N.pinsIn(T("p2"));
        const aPin = [...l1, ...l2].find(isAnalog);
        const toV = [l1, l2].some((x) => x.includes("5V")), toG = [l1, l2].some((x) => x.includes("GND"));
        const rA = r10 && aPin && [N.pinsIn(`${r10.id}.r1`), N.pinsIn(`${r10.id}.r2`)].some((x) => x.includes(aPin));
        const rG = r10 && [N.pinsIn(`${r10.id}.r1`), N.pinsIn(`${r10.id}.r2`)].some((x) => x.includes("GND"));
        const rV = r10 && [N.pinsIn(`${r10.id}.r1`), N.pinsIn(`${r10.id}.r2`)].some((x) => x.includes("5V"));
        let r = { state: "open", pin: aPin };
        if (aPin && toV && rA && rG) r = { state: "ok", pin: aPin };
        else if (aPin && toG && rA && rV) r = { state: "inverted", pin: aPin };
        else if (aPin && toV && !rA) r = { state: "noDivider", pin: aPin };
        else if (!aPin && [...l1, ...l2].find(isDigital)) r = { state: "digital" };
        res[p.id] = r;
        if (r.state === "inverted") problems.push({ level: "warn", text: "The divider is upside down: with the LDR to GND and the 10 kΩ to 5V, the reading goes DOWN in light, so the lamp works backwards. Swap them: 5V → LDR → A-pin → 10 kΩ → GND." });
        if (r.state === "noDivider") problems.push({ level: "warn", text: "The LDR alone can't give a reading: the A-pin needs the 10 kΩ resistor to GND too. Together they make a voltage divider whose middle voltage changes with light." });
        if (r.state === "digital") problems.push({ level: "warn", text: "The light sensor gives a changing voltage, so it needs an analog pin (A0–A2), not a digital one." });
        if (r.state === "open") problems.push({ level: "info", text: "Build the light sensor: 5V → LDR → an analog pin (A0–A2) → 10 kΩ resistor → GND." });
      } else if (p.type === "tmp36") {
        const vs = N.pinsIn(T("vs")), out = N.pinsIn(T("out")), gnd = N.pinsIn(T("gnd"));
        let r = { state: "open", pin: out.find(isAnalog) };
        if (vs.includes("5V") && gnd.includes("GND") && out.find(isAnalog)) r = { state: "ok", pin: out.find(isAnalog) };
        else if (vs.includes("GND") && gnd.includes("5V")) r = { state: "reversed" };
        else if (vs.includes("5V") && gnd.includes("GND") && out.find(isDigital)) r = { state: "digital" };
        res[p.id] = r;
        if (r.state === "reversed") problems.push({ level: "bad", text: "The TMP36's power is reversed (+Vs on GND, GND on 5V). A real sensor gets hot and can be destroyed this way. Flat side facing you, the legs are +Vs, Vout, GND from left to right." });
        if (r.state === "digital") problems.push({ level: "warn", text: "The TMP36's Vout is a voltage that changes with temperature, so it needs an analog pin (A0–A2)." });
        if (r.state === "open") problems.push({ level: "info", text: "Wire the TMP36: +Vs to 5V, Vout to an analog pin (A0–A2), GND to GND." });
      } else if (p.type === "buzzer") {
        const plus = kindOf(N.pinsIn(T("plus"))), minus = kindOf(N.pinsIn(T("minus")));
        const pin = [...N.pinsIn(T("plus")), ...N.pinsIn(T("minus"))].find(isDigital);
        let r = { state: "open", pin };
        if (plus === "pin" && minus === "gnd") r = { state: "ok", pin };
        else if (plus === "gnd" && minus === "pin") r = { state: "reversed", pin };
        if (pin) claim(pin, "buzzer");
        res[p.id] = r;
        if (r.state === "reversed") problems.push({ level: "warn", text: "The buzzer is in backwards. An active buzzer only works one way: + to the pin, − to GND." });
        if (r.state === "open") problems.push({ level: "info", text: "Wire the buzzer: + to a digital pin, − to GND." });
      }
    }
    for (const [pin, who] of Object.entries(used)) if (who.length > 1) problems.push({ level: "bad", text: `${who.join(" and ")} share ${pin}. Give each one its own pin so the program can control them separately.` });
    const order = { bad: 0, warn: 1, info: 2 };
    problems.sort((x, y) => order[x.level] - order[y.level]);
    const shared = Object.values(used).some((w) => w.length > 1);
    const ok = !problems.some((q) => q.level === "bad" || q.level === "warn") && parts.filter((p) => p.type !== "res").every((p) => res[p.id] && res[p.id].state === "ok") && !shared;
    return { parts: res, problems, ok };
  }

  // ---- Sensors ----
  // LDR resistance from light level (lux), a typical GL5528-like curve: ~1 MΩ in the dark, ~10–20 kΩ at 10 lux
  const ldrOhms = (lux) => Math.min(1e6, 15000 * Math.pow(10 / Math.max(0.01, lux), 0.8));
  const toAdc = (v) => Math.round(Math.max(0, Math.min(5, v)) / 5 * 1023);
  function analogValue(state, inputs) {
    if (state.kind === "ldr") {
      const R = ldrOhms(inputs.lux);
      if (state.state === "ok") return toAdc(5 * 10000 / (10000 + R));
      if (state.state === "inverted") return toAdc(5 * R / (10000 + R));
      if (state.state === "noDivider") return 1023;
      return null;
    }
    if (state.kind === "tmp36") return state.state === "ok" ? toAdc(0.5 + 0.01 * inputs.tempC) : null;
    return null;
  }
  const tmpFromAdc = (adc) => (adc * 5 / 1023 - 0.5) * 100;

  // ---- The challenges ----
  const led = (id, color, x, y) => ({ id, type: "led", color, label: `${color} LED`, x, y });
  const res = (id, ohms, x, y) => ({ id, type: "res", ohms, label: ohms === 220 ? "220 Ω resistor" : "10 kΩ resistor", x, y });
  const CHALLENGES = [
    { id: "blink", title: "1. First light", goal: "Make the red LED blink. Wire a digital pin → the 220 Ω resistor → the LED's long leg, and its short leg → GND.",
      parts: [led("led1", "red", 250, 420), res("r1", 220, 110, 520)],
      hint: "Tap the D13 pin, then the resistor's left end. Tap the resistor's right end, then the LED's long leg (+). Finally tap the LED's short leg (−), then a GND pin.",
      program: (io, t) => { io.write("led1", Math.floor(t) % 2 === 0); },
      test: (run) => run({ t: 0.2 }).leds.led1 === "on" && run({ t: 1.2 }).leds.led1 === "off",
      code: (p) => [`const int LED_PIN = ${p.led1 || 13};   // the pin your LED is wired to`, "", "void setup() {", "  pinMode(LED_PIN, OUTPUT);", "}", "", "void loop() {",
        "  digitalWrite(LED_PIN, HIGH);   // LED on", "  delay(1000);", "  digitalWrite(LED_PIN, LOW);    // LED off", "  delay(1000);", "}"] },
    { id: "button", title: "2. Push to light", goal: "Light the green LED only while the button is held down. The button goes between a digital pin and GND.",
      parts: [{ id: "btn", type: "button", label: "button", x: 110, y: 400 }, led("led1", "green", 300, 400), res("r1", 220, 230, 540)],
      hint: "LED: a pin → resistor → long leg, short leg → GND. Button: one leg to another digital pin (for example D2), the other leg to GND.",
      program: (io) => { io.write("led1", io.read("btn") === "LOW"); },
      test: (run) => run({ pressed: true }).leds.led1 === "on" && run({ pressed: false }).leds.led1 === "off",
      code: (p) => [`const int BUTTON_PIN = ${p.btn || 2};`, `const int LED_PIN = ${p.led1 || 13};`, "", "void setup() {", "  pinMode(BUTTON_PIN, INPUT_PULLUP);   // reads HIGH until the button connects it to GND",
        "  pinMode(LED_PIN, OUTPUT);", "}", "", "void loop() {", "  bool pressed = digitalRead(BUTTON_PIN) == LOW;", "  digitalWrite(LED_PIN, pressed ? HIGH : LOW);", "}"] },
    { id: "night", title: "3. Night light", goal: "Make the yellow LED turn on by itself when it gets dark. Build a light sensor from the LDR and the 10 kΩ resistor, then wire the LED.",
      parts: [{ id: "ldr", type: "ldr", label: "light sensor (LDR)", x: 90, y: 400 }, res("r10", 10000, 120, 520), led("led1", "yellow", 300, 400), res("r1", 220, 250, 580)],
      hint: "Light sensor: 5V → one LDR leg; the other LDR leg → A0; A0 → one end of the 10 kΩ resistor; its other end → GND. LED: pin → 220 Ω → long leg, short leg → GND.",
      program: (io) => { const light = io.analog("ldr"); io.write("led1", light !== null && light < 300); },
      test: (run) => run({ lux: 1 }).leds.led1 === "on" && run({ lux: 300 }).leds.led1 === "off",
      code: (p) => [`const int LIGHT_PIN = ${p.ldr || "A0"};   // the middle of the LDR + 10 kΩ divider`, `const int LED_PIN = ${p.led1 || 13};`, "", "void setup() {", "  pinMode(LED_PIN, OUTPUT);", "  Serial.begin(9600);", "}", "",
        "void loop() {", "  int light = analogRead(LIGHT_PIN);   // 0 (dark) to 1023 (bright)", "  Serial.println(light);", "  digitalWrite(LED_PIN, light < 300 ? HIGH : LOW);   // dark: lamp on", "  delay(200);", "}"] },
    { id: "heat", title: "4. Heat alarm", goal: "Sound the buzzer when the TMP36 temperature sensor reads above 30 °C. It's an active buzzer: it beeps by itself whenever its pin is HIGH.",
      parts: [{ id: "tmp", type: "tmp36", label: "TMP36 temperature sensor", x: 110, y: 410 }, { id: "buz", type: "buzzer", label: "active buzzer", x: 290, y: 410 }],
      hint: "TMP36 (flat side facing you): left leg +Vs → 5V, middle leg Vout → A0, right leg → GND. Buzzer: + → a digital pin, − → GND.",
      program: (io) => { const adc = io.analog("tmp"); io.write("buz", adc !== null && tmpFromAdc(adc) > 30); },
      test: (run) => run({ tempC: 35 }).buzz && !run({ tempC: 24 }).buzz,
      code: (p) => [`const int TEMP_PIN = ${p.tmp || "A0"};`, `const int BUZZER_PIN = ${p.buz || 8};`, "", "void setup() {", "  pinMode(BUZZER_PIN, OUTPUT);", "  Serial.begin(9600);", "}", "", "void loop() {",
        "  int reading = analogRead(TEMP_PIN);", "  float volts = reading * 5.0 / 1023.0;", "  float celsius = (volts - 0.5) * 100.0;   // TMP36: 0.5 V at 0 °C, +10 mV per °C", "  Serial.println(celsius);",
        "  digitalWrite(BUZZER_PIN, celsius > 30 ? HIGH : LOW);", "  delay(500);", "}"] },
    { id: "traffic", title: "5. Traffic light", goal: "Wire three LEDs, each with its own 220 Ω resistor and its own pin, so the program can run green → yellow → red.",
      parts: [led("red", "red", 90, 380), led("yellow", "yellow", 200, 380), led("green", "green", 310, 380), res("rr", 220, 70, 500), res("ry", 220, 200, 560), res("rg", 220, 330, 500)],
      hint: "Same as challenge 1, three times: each LED gets its own pin (for example D11, D12, D13), its own resistor, and its short leg to GND.",
      program: (io, t) => { const c = t % 7; io.write("green", c < 3); io.write("yellow", c >= 3 && c < 4); io.write("red", c >= 4); },
      test: (run) => { const a = run({ t: 1 }).leds, b = run({ t: 3.5 }).leds, c = run({ t: 5 }).leds; return a.green === "on" && a.red === "off" && b.yellow === "on" && c.red === "on" && c.green === "off"; },
      code: (p) => [`const int RED_PIN = ${p.red || 11};`, `const int YELLOW_PIN = ${p.yellow || 12};`, `const int GREEN_PIN = ${p.green || 13};`, "", "void setup() {", "  pinMode(RED_PIN, OUTPUT);", "  pinMode(YELLOW_PIN, OUTPUT);", "  pinMode(GREEN_PIN, OUTPUT);", "}", "",
        "void show(bool r, bool y, bool g) {", "  digitalWrite(RED_PIN, r);", "  digitalWrite(YELLOW_PIN, y);", "  digitalWrite(GREEN_PIN, g);", "}", "",
        "void loop() {", "  show(false, false, true);  delay(3000);   // green", "  show(false, true, false);  delay(1000);   // yellow", "  show(true, false, false);  delay(3000);   // red", "}"] }
  ];

  // ---- Run the challenge's program on the wired circuit ----
  // inputs: { t: seconds, pressed, lux, tempC }; returns which LEDs are on / off / burnt, whether the buzzer sounds,
  // and the readings a serial monitor would print
  function run(ch, A, inputs) {
    const out = { leds: {}, buzz: false, readings: {}, pins: {} };
    const parts = Object.fromEntries(ch.parts.map((p) => [p.id, p]));
    const io = {
      write(id, high) { out.pins[id] = !!high; },
      read(id) { const r = A.parts[id]; if (!r || r.state === "open") return "HIGH"; return r.state === "ok" && inputs.pressed ? "LOW" : "HIGH"; },
      analog(id) { const r = A.parts[id]; if (!r) return null; const v = analogValue({ kind: parts[id].type, state: r.state }, inputs); if (v !== null) out.readings[id] = v; return v; }
    };
    ch.program(io, inputs.t || 0);
    for (const p of ch.parts) {
      const r = A.parts[p.id];
      if (p.type === "led") {
        const high = r.pin === "5V" ? true : !!out.pins[p.id];
        out.leds[p.id] = r.state === "ok" || r.state === "always" ? (high ? "on" : "off") : r.state === "noResistor" || r.state === "lowResistor" ? (high ? "burn" : "off") : "off";
      }
      if (p.type === "buzzer") out.buzz = r.state === "ok" && !!out.pins[p.id];
    }
    return out;
  }
  // The pins the player chose, for the generated code: { partId: 13 or "A0" }
  function chosenPins(A) {
    const pins = {};
    for (const [id, r] of Object.entries(A.parts)) if (r.pin && r.pin !== "5V") pins[id] = isDigital(r.pin) ? Number(r.pin.slice(1)) : r.pin;
    return pins;
  }
  const verify = (ch, A) => A.ok && ch.test((inputs) => run(ch, A, { t: 0, pressed: false, lux: 300, tempC: 24, ...inputs }));

  root.CircuitModel = { DIGITAL, ANALOG, PINS, PART_LEGS, LEG_NAMES, VF, CHALLENGES, nets, analyze, run, verify, chosenPins, ldrOhms, tmpFromAdc, toAdc };
})(typeof window !== "undefined" ? window : globalThis);
