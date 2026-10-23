# IoT Playground

**Play it: https://jsalvarado.github.io/iot-playground/**

Browser games that teach how sensors, microcontrollers and automation work, for people who have never touched
electronics. Pick a game, watch live sensor readings, switch devices on and off, and write simple 

## Games

| Game | What you learn | Status |
|---|---|---|
| **FLOATech Pond Simulator** | A tilapia pond with water-temperature, dissolved-oxygen and pH sensors, a solar battery, an aerator and an automatic feeder. Why oxygen drops at night, why overfeeding is dangerous, and how to save battery power. 5 missions. | Playable |
| **Keep the Plant Alive** | A soil-moisture sensor, a light sensor, a pump with a water tank and a grow light. Watering by sensor instead of by clock, and why too much water is as bad as too little. 4 missions. | Playable |
| **My Korean Room Monitor** | A small studio room (원룸) in winter with temperature, humidity, fine-dust (미세먼지, PM2.5) and CO2 sensors, floor heating, a humidifier, an air purifier and a motorised window. Why heated air feels dry, why a closed room gets stuffy, and how to air out on a fine-dust day. 5 missions. | Playable |
| **Sensor Detective** | Ten mystery cases made from the other games' simulations: an oxygen crash, a drained battery, a −127 °C reading, a stuck sensor, a stuffy room and more. Read the graph, ask for a clue, pick the cause. | Playable |
| **Circuit Playground** | Tap-to-wire an Uno-style board: blink an LED through a 220 Ω resistor, read a button with INPUT_PULLUP, build an LDR night light, a TMP36 heat alarm and a traffic light. It catches missing resistors, backwards LEDs and short circuits, and shows the Arduino sketch for your wiring. 5 challenges. | Playable |

### From student design projects

Six more games are based on engineering design projects by students at Holy Cross of Davao College. They are
proposed designs, so each game simulates how its system is meant to work. Each Learn tab separates numbers **from the
design** from **game values** taken from published sources, and credits the project and school (no personal names).

| Game | Based on | What you learn |
|---|---|---|
| **Tuba Master** | AuTuba (solar coconut-wine fermentation) | Sweet sap turns into tuba as pH falls and alcohol rises; pump it out before it sours, and keep the solar battery alive. |
| **Copra Power** | CopraWatt (biomass generator and copra dryer) | Hold a copra dryer at 50–70 °C, dry copra to the grading targets, keep carbon monoxide low, and charge a battery from steam and sun. |
| **UV Tomato Guard** | TOMATRIX (UV-C tomato chamber) | Gas sensors decide when to run a fixed 3-minute UV-C cycle; the lid interlock keeps it safe; keep temperature and humidity in band. |
| **Seedling Chamber** | SeedSpark (solar seedling microclimate chamber) | Water by soil moisture, vent a hot chamber and keep damp nights from rotting tomato and eggplant seedlings. |
| **Cold Cart** | SPARC (solar thermoelectric cold box) | Keep a vendor's fish at 4 °C or colder; a Peltier needs its hot side cooled, and the battery has to last the market day. |
| **Curb-E Smart Sign Patrol** | Curb-E (AI no-parking smart sign) | Thresholds and false alarms: catch parked cars without flagging brief stops, and upload evidence only when the plate read is clear. |

The simulation games share the same tabs: **Rules** (rule cards, with an optional UNTIL level for
hysteresis, and IF rules that can START a timed action such as a UV-C cycle), **Missions** (goals with stars),
**Graph** (the last day of readings), **Code** (your rules as an Arduino sketch), **Learn** (what each sensor
measures, with sources) and **World** (free-play settings and a log of what happened). On a phone the whole game
fits on one screen with no page scrolling: the scene, a row of gauges, a row of controls and the tabs, whose panel
scrolls inside itself. A **?** button explains how to play.

**Weather you can see and hear.** Outdoor games draw their weather over the scene (slanted rain with splashes and
lightning, drifting cloud shadows, warm sunlight with turning rays, stars on clear nights), and each weather has its
own sound bed: rain with drops and distant thunder, gusty wind under clouds, birds, a breeze and afternoon cicadas in
the sun, crickets and frogs at night. Weather buttons (☀️ ☁️ 🌧️) sit on the scene in free play. Every game has **sound**: effects, ambience
for its world and soft generative music, all synthesised in the browser with the Web Audio API (no audio files), with
a speaker button to turn effects or music off.

## Accurate, but simplified

The simulations are simplified so they run in a phone browser, but their directions and healthy ranges follow
published sources, listed in each game's Learn tab:

## How it is built

- **Plain HTML, CSS and JavaScript**, no framework and no build step, hosted on GitHub Pages. It works on phones
  and needs no account; stars and rule cards are saved only on your device.
- **One shared engine** (`engine.js`) runs every game: a simulation clock (one tick is one virtual minute), rule
  cards, missions and the Arduino code generator. Each game adds a **model** (`models/`) with its science and a
  **game file** (`games/`) with its sensors, missions and an original SVG scene. The screen is shared (`ui.js`).
- **Tested automatically:** `tests/tests.js` and one `tests/game-<id>.js` per newer game check 213 facts the games depend on, from oxygen saturation values
  to "an aerator left on all the time empties the solar battery", "every Detective graph shows what its answer
  says" and "an LED with no resistor burns". GitHub Actions runs them on every push
  (`.github/workflows/test.yml`); every mission was also played through with good and bad rule sets so each one is
  winnable and teaches its lesson.
- Designed with the help of the **taste-skill** app-screen rules and built with **Claude Code** (AI-assisted
  development), following the **Superpowers** workflow.

| File | Holds |
|---|---|
| `index.html` | The game picker |
| `engine.js` | Clock, rule cards, simulation loop, Arduino code generator, oxygen saturation |
| `ui.js`, `style.css` | The shared game screen: gauges, controls, tabs, missions, graph, code, learn |
| `sound.js` | Effects, ambience, weather sounds and music, synthesised with the Web Audio API |
| `weather.js` | The rain, cloud and sunshine layer drawn over outdoor scenes |
| `models/pond.js`, `models/plant.js`, `models/room.js` | The science of each world |
| `models/cases.js`, `detective.js`, `detective.html` | Sensor Detective: the cases (built from the models) and the screen |
| `models/circuit.js`, `circuit.js`, `circuit.html` | Circuit Playground: the wiring rules and the board |
| `games/*.js`, `pond.html`, `plant.html`, `room.html` | Each simulation game's sensors, missions and scene |
| `models/<id>.js`, `games/<id>.js`, `<id>.html` | The six design-project games: tuba, copra, tomato, seedling, coldbox, curbe |
| `tests/` | The automated tests (`node tests/run-node.js`); `game-<id>.js` holds each newer game's checks |

## Sources

- SRAC 283, Tilapia: Life History and Biology (Popma & Masser): https://thefishsite.com/articles/tilapia-life-history-and-biology
- FAO, tilapia workshop handout: https://www.fao.org/fi/static-media/MeetingDocuments/TiLV/dec2018/p5.pdf
- WorldFish: https://digitalarchive.worldfishcenter.org/bitstream/handle/20.500.12348/5471/97996e83be62f70ef25ae7af4e00f572.pdf
- California Water Boards, dissolved-oxygen saturation table: https://www.waterboards.ca.gov/water_issues/programs/swamp/docs/cwt/guidance/3110en.pdf
- UConn, Watering Houseplants: https://soiltesting.cahnr.uconn.edu/watering-houseplants
- Iowa State Extension, Root Rots of Houseplants: https://yardandgarden.extension.iastate.edu/article/2014/02-14/rootrot.html
- PM2.5 forecast grades from March 2018: https://www.jjan.kr/article/20180326635951
- Air out 10 minutes, three times a day (2019): https://www.newsis.com/view/NISX20191213_0000860198
- Ministry of Environment test, grilling fish and fine dust: https://www.etoday.co.kr/news/view/1332784
- US EPA, Mold, moisture and your home: https://www.epa.gov/mold/brief-guide-mold-moisture-and-your-home
- US EPA, Indoor particulate matter: https://www.epa.gov/indoor-air-quality-iaq/indoor-particulate-matter
- WHO Housing and health guidelines: https://www.who.int/publications/i/item/9789241550376
