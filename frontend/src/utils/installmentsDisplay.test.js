import { formatInstallmentsDisplayRef } from './installmentsDisplay';

describe('formatInstallmentsDisplayRef', () => {
  test.each([
    ['INV-000001', 'reference', 'INV-1'],
    ['INV-000100', 'reference', 'INV-100'],
    ['INV-0001020', 'reference', 'INV-1020'],
    ['RCP-000009', 'reference', 'RCP-9'],
    ['000020', 'member', '20'],
    ['000020-02', 'committee', '20-02'],
    ['REV-INV-000025', 'reference', 'REV-INV-25'],
    ['INV-000001-RCPT', 'reference', 'INV-1-RCPT'],
  ])('formats %s safely', (value, type, expected) => {
    expect(formatInstallmentsDisplayRef(value, type)).toBe(expected);
  });

  test.each(['03001234567', '01/05/2026', 'Rs 100.00', 'MODEL-0010'])('does not alter arbitrary value %s', (value) => {
    expect(formatInstallmentsDisplayRef(value, 'reference')).toBe(value);
  });
});
