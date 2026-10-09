const fs = require('fs');
const path = require('path');

const pageSource = fs.readFileSync(path.join(process.cwd(), 'src', 'pages', 'TrialBalancePage.js'), 'utf8');
const english = require('../i18n/en.json');

test('Trial Balance uses accounting terminology for every debit and credit surface', () => {
  expect(english['reports.debit']).toBe('Debit');
  expect(english['reports.credit']).toBe('Credit');
  expect(english['reports.totalDebit']).toBe('Total Debit');
  expect(english['reports.totalCredit']).toBe('Total Credit');
  expect(pageSource).toContain("t('reports.totalDebit')");
  expect(pageSource).toContain("t('reports.totalCredit')");
  expect(pageSource).toContain("name={t('reports.debit')}");
  expect(pageSource).toContain("name={t('reports.credit')}");
  expect(pageSource).not.toMatch(/t\(['"](?:debit|credit)['"]\)/);
  expect(pageSource).not.toMatch(/Money In|Money Out/);
});

test('balanced and NOT Balanced status remain data-driven', () => {
  expect(pageSource).toContain("isBalanced ? t('reports.trialBalanced') : t('reports.trialNotBalanced')");
});
