// Runs the tests with Node (used by GitHub Actions): loads the engine, every model, tests/tests.js and each game's
// tests/game-*.js, prints each check, and exits with an error if any check fails, which marks the run as failed.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({ console, Math, JSON, Object, Array, Number, String, Set, Map, WeakMap });
const list = (dir, re) => fs.readdirSync(path.join(root, dir)).filter((f) => re.test(f)).sort().map((f) => dir + "/" + f);
// The first five models in their original order (Detective's cases are built from the pond, plant and room models)
const first = ["models/pond.js", "models/plant.js", "models/room.js", "models/cases.js", "models/circuit.js"];
const files = ["engine.js", ...first, ...list("models", /\.js$/).filter((f) => !first.includes(f)), "tests/tests.js", ...list("tests", /^game-.*\.js$/)];
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const results = context.TEST_RESULTS;
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
