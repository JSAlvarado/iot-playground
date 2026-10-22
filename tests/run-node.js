// Runs tests/tests.js with Node (used by GitHub Actions): loads the engine and models, prints each check,
// and exits with an error if any check fails, which marks the workflow run as failed.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({ console, Math, JSON, Object, Array, Number, String });
for (const file of ["engine.js", "models/pond.js", "models/plant.js", "models/room.js", "models/cases.js", "models/circuit.js", "tests/tests.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const results = context.TEST_RESULTS;
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  (" + r.detail + ")" : ""}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
