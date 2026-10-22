# IoT Playground

**Play it: https://jsalvarado.github.io/iot-playground/**

Browser games that teach how sensors, microcontrollers and automation work, for people who have never touched
electronics. Pick a game, watch live sensor readings, switch devices on and off, and write simple **rule cards**
("IF oxygen is below 4 THEN aerator ON") that make things automatic. Every game turns your rules into **real
Arduino code**. Built by Johnstheward S. Alvarado.

## Games

| Game | What you learn | Status |
|---|---|---|
| **FLOATech Pond Simulator** | A tilapia pond with water-temperature, dissolved-oxygen and pH sensors, a solar battery, an aerator and an automatic feeder. Why oxygen drops at night, why overfeeding is dangerous, and how to save battery power. 5 missions. | Playable |
| **Keep the Plant Alive** | A soil-moisture sensor, a light sensor, a pump with a water tank and a grow light. Watering by sensor instead of by clock, and why too much water is as bad as too little. 4 missions. | Playable |
| **My Korean Room Monitor** | Temperature, humidity and fine dust (미세먼지) in a room, with windows, a heater and a humidifier. | Coming soon |
| **Sensor Detective** | Mystery levels: read sensor graphs, find the cause and pick the fix. | Coming soon |
| **Circuit Playground** | A drag-and-wire breadboard sandbox: inputs, decisions and outputs. | Coming soon |

Each game has the same tabs: **Rules** (rule cards), **Missions** (goals with stars), **Graph** (the last day of
readings), **Code** (your rules as an Arduino sketch) and **Learn** (what each sensor measures, with sources).

## Accurate, but simplified

The simulations are simplified so they run in a phone browser, but their directions and healthy ranges follow
published sources, listed in each game's Learn tab:

- **Tilapia:** best growth around 25–30 °C, most stop feeding below about 17 °C and can't survive more than a few
  days at 10–11 °C (SRAC 283). Best pH 6.5–8.5 (FAO). Tilapia survive brief oxygen lows below 1 mg/L, but ponds should
  stay above 1 mg/L (SRAC); the game treats 5 mg/L and above as healthy, below 3 as stressful and below 1 as danger.
- **Oxygen saturation** (how much oxygen water can hold) is calculated with the APHA freshwater equation:
  9.09 mg/L at 20 °C, 8.26 mg/L at 25 °C.
- **Plants:** waterlogged soil pushes out the air roots need and can lead to root rot (UConn, Iowa State Extension).

## How it is built

- **Plain HTML, CSS and JavaScript**, no framework and no build step, hosted on GitHub Pages. It works on phones
  and needs no account; stars and rule cards are saved only on your device.
- **One shared engine** (`engine.js`) runs every game: a simulation clock (one tick is one virtual minute), rule
  cards, missions and the Arduino code generator. Each game adds a **model** (`models/`) with its science and a
  **game file** (`games/`) with its sensors, missions and an original SVG scene. The screen is shared (`ui.js`).
- **Tested automatically:** `tests/tests.js` checks 25 facts the games depend on, from oxygen saturation values
  to "an aerator left on all the time empties the solar battery". GitHub Actions runs them on every push
  (`.github/workflows/test.yml`); every mission was also played through with good and bad rule sets so each one is
  winnable and teaches its lesson.
- Designed with the help of the **taste-skill** app-screen rules and built with **Claude Code** (AI-assisted
  development), following the **Superpowers** workflow.

| File | Holds |
|---|---|
| `index.html` | The game picker |
| `engine.js` | Clock, rule cards, simulation loop, Arduino code generator, oxygen saturation |
| `ui.js`, `style.css` | The shared game screen: gauges, controls, tabs, missions, graph, code, learn |
| `models/pond.js`, `models/plant.js` | The science of each world |
| `games/pond.js`, `games/plant.js`, `pond.html`, `plant.html` | Each game's sensors, missions and scene |
| `tests/` | The automated tests (`node tests/run-node.js`) |

## Sources

- SRAC 283, Tilapia: Life History and Biology (Popma & Masser): https://thefishsite.com/articles/tilapia-life-history-and-biology
- FAO, tilapia workshop handout: https://www.fao.org/fi/static-media/MeetingDocuments/TiLV/dec2018/p5.pdf
- WorldFish: https://digitalarchive.worldfishcenter.org/bitstream/handle/20.500.12348/5471/97996e83be62f70ef25ae7af4e00f572.pdf
- California Water Boards, dissolved-oxygen saturation table: https://www.waterboards.ca.gov/water_issues/programs/swamp/docs/cwt/guidance/3110en.pdf
- UConn, Watering Houseplants: https://soiltesting.cahnr.uconn.edu/watering-houseplants
- Iowa State Extension, Root Rots of Houseplants: https://yardandgarden.extension.iastate.edu/article/2014/02-14/rootrot.html
