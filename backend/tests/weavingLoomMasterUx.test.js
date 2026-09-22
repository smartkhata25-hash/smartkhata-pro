const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "../controllers/weavingOperationsController.js"),
  "utf8",
);
const mastersSource = fs.readFileSync(
  path.join(__dirname, "../../frontend/src/pages/weaving/WeavingMastersPage.js"),
  "utf8",
);

assert.match(
  controllerSource,
  /collation\(\{ locale: "en", numericOrdering: true \}\)\.sort\(\{ loomNumber: 1, _id: 1 \}\)/,
);
assert.doesNotMatch(controllerSource, /listLooms[\s\S]{0,300}sort\(\{ (?:name|updatedAt): 1 \}\)/);
assert.match(mastersSource, /navigate\(`\/weaving\/looms\?loomId=\$\{row\._id\}`\)/);
assert.match(mastersSource, /event\.stopPropagation\(\);\s*edit\(row\)/);
assert.match(mastersSource, /if \(tab !== 'loom'\) \{\s*setNotice\(/);

console.log("weaving Loom Master UX tests passed");
