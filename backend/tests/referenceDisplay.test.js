const assert = require('node:assert/strict');
const test = require('node:test');
const {
  formatDocumentReference,
  formatReferenceText,
  formatReferencesForDisplay,
} = require('../utils/referenceDisplay');

test('formats confirmed generated reference families', () => {
  assert.equal(formatDocumentReference('WP-00013'), 'WP-13');
  assert.equal(formatDocumentReference('TRR-2026-00007'), 'TRR-2026-7');
  assert.equal(formatDocumentReference('REV-PAY-00005'), 'REV-PAY-5');
});

test('formats nested print data without mutating the source', () => {
  const source = { invoiceNo: 'INV-000123', description: 'Paid against INV-000123' };
  const output = formatReferencesForDisplay(source);
  assert.deepEqual(output, { invoiceNo: 'INV-123', description: 'Paid against INV-123' });
  assert.equal(source.invoiceNo, 'INV-000123');
});

test('preserves unrelated identifiers and meaningful zeros', () => {
  for (const value of ['03001234567', '2026-01-05', 'ACC-0001', 'EMP-001', 'MODEL-0010']) {
    assert.equal(formatDocumentReference(value), value);
    assert.equal(formatReferenceText(value), value);
  }
});

