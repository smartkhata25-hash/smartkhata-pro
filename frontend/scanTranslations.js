const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');

const results = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // JSX text detection
  const regex = />\s*([^<>{}\n]+)\s*</g;

  let match;

  while ((match = regex.exec(content)) !== null) {
    const text = match[1].trim();

    if (
      text.length > 2 &&
      !text.includes('{') &&
      !text.includes('}') &&
      !text.includes('t(') &&
      !text.match(/^[0-9\s.,:]+$/)
    ) {
      results.push({
        file: filePath.replace(process.cwd(), ''),
        text: text,
      });
    }
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const full = path.join(dir, file);

    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      scanDir(full);
    } else if (
      full.endsWith('.js') ||
      full.endsWith('.jsx') ||
      full.endsWith('.ts') ||
      full.endsWith('.tsx')
    ) {
      scanFile(full);
    }
  });
}

console.log('\n🔍 Scanning project for hardcoded UI text...\n');

scanDir(SRC_DIR);

if (results.length === 0) {
  console.log('✅ No hardcoded UI text found\n');
} else {
  results.forEach((r) => {
    console.log(`📄 ${r.file}`);
    console.log(`   → "${r.text}"\n`);
  });

  console.log(`\n⚠️ Total found: ${results.length}\n`);
}
