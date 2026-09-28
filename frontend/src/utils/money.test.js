import {
  getInvoiceItemMoney,
  moneyNumber,
  roundMoney,
  sanitizeMoneyInput,
} from './money';

describe('money helpers', () => {
  test.each(['1', '12', '12.', '12.0', '12.05', '0.5', '0.50'])(
    'preserves valid money typing state %s',
    (value) => {
      expect(sanitizeMoneyInput(value)).toBe(value);
    }
  );

  test.each(['12.005', '1a', '1,000', '-1'])('rejects invalid money input %s', (value) => {
    expect(sanitizeMoneyInput(value)).toBeNull();
  });

  test('rounds floating-point money safely', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(moneyNumber('12.05')).toBe(12.05);
    expect(roundMoney(650 / 15)).toBe(43.33);
  });

  test('keeps a manually entered invoice amount authoritative', () => {
    const saved = getInvoiceItemMoney({
      quantity: 15,
      rate: roundMoney(650 / 15),
      amount: 650,
    });

    expect(saved).toEqual({ price: 43.33, total: 650 });
    expect(
      getInvoiceItemMoney({
        quantity: 15,
        rate: saved.price,
        amount: saved.total,
      })
    ).toEqual(saved);
  });

  describe.each(['Sale Invoice', 'Purchase Invoice'])('%s paid input', () => {
    test.each([
      ['25', '25.00'],
      ['100', '100.00'],
      ['12.05', '12.05'],
      ['0.50', '0.50'],
      ['12.', '12.00'],
      ['', '0.00'],
    ])('converts %s safely at render boundaries', (input, expected) => {
      const numericPaidAmount = moneyNumber(input);

      expect(typeof numericPaidAmount).toBe('number');
      expect(numericPaidAmount.toFixed(2)).toBe(expected);
    });
  });
});

