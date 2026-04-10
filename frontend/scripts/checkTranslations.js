const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const EN_FILE = path.join(__dirname, '../src/i18n/en.json');

const en = JSON.parse(fs.readFileSync(EN_FILE, 'utf8'));

const foundKeys = new Set();

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const regex = /t\(['"`]([^'"`]+)['"`]\)/g;

  let match;

  while ((match = regex.exec(content)) !== null) {
    foundKeys.add(match[1]);
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      scanDir(full);
    } else if (full.endsWith('.js') || full.endsWith('.jsx')) {
      scanFile(full);
    }
  });
}

scanDir(SRC_DIR);

const missing = [];

foundKeys.forEach((key) => {
  if (!en[key]) {
    missing.push(key);
  }
});

/* ---------- FILTER FAKE KEYS ---------- */

const ignorePatterns = [
  /^[a-z]$/, // single letters
  /^[A-Z]$/,
  /^[0-9]+$/,
  /^[A-Z0-9:-]+$/, // date/time formats
  /^\.$/,
  /filename=/,
  /content-type/,
  /web-vitals/,
  /\$\{/,
];

const cleanedMissing = missing.filter((key) => {
  return !ignorePatterns.some((pattern) => pattern.test(key));
});

/* ---------- OUTPUT ---------- */

console.log('\n🔍 Missing Translation Keys:\n');

cleanedMissing.forEach((k) => console.log('→', k));

console.log(`\n⚠️ Total Missing: ${cleanedMissing.length}`);
