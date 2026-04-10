const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const EN_FILE = path.join(__dirname, 'src/i18n/en.json');

const usedKeys = new Set();

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const regex = /t\(['"`](.*?)['"`]\)/g;

  let match;

  while ((match = regex.exec(content)) !== null) {
    usedKeys.add(match[1]);
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

const en = JSON.parse(fs.readFileSync(EN_FILE));

const missing = [];

usedKeys.forEach((key) => {
  if (!key.split('.').reduce((o, k) => (o || {})[k], en)) {
    missing.push(key);
  }
});

console.log('\n🔍 Missing Translation Keys:\n');

missing.forEach((k) => console.log('→', k));

console.log(`\n⚠️ Total Missing: ${missing.length}`);
