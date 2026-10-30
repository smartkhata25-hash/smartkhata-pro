import { formatDocumentReference, formatReferenceText } from './referenceDisplay';

describe('reference display formatting', () => {
  test.each([
    ['WP-00013', 'WP-13'],
    ['PAY-00005', 'PAY-5'],
    ['SB-00003', 'SB-3'],
    ['INV-000123', 'INV-123'],
    ['TR-2026-00042', 'TR-2026-42'],
    ['REV-INV-00007', 'REV-INV-7'],
  ])('formats %s', (stored, expected) => {
    expect(formatDocumentReference(stored)).toBe(expected);
  });

  test('formats references embedded in descriptions', () => {
    expect(formatReferenceText('Purchase WP-00013 - MAKKAH TRADER'))
      .toBe('Purchase WP-13 - MAKKAH TRADER');
  });

  test.each(['03001234567', '2026-01-05', 'ACC-0001', 'EMP-001', 'MODEL-0010'])
  ('preserves unrelated value %s', (value) => {
    expect(formatDocumentReference(value)).toBe(value);
    expect(formatReferenceText(value)).toBe(value);
  });
});

