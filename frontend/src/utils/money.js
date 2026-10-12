const MONEY_INPUT_PATTERN = /^\d*(?:\.\d{0,2})?$/;

export const sanitizeMoneyInput = (value) => {
  const text = String(value ?? '');
  return MONEY_INPUT_PATTERN.test(text) ? text : null;
};

export const roundMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;

  return Math.round((number + Math.sign(number || 1) * Number.EPSILON) * 100) / 100;
};

export const moneyNumber = (value) => roundMoney(value || 0);

/**
 * Formats a monetary value for display using Pakistani lakh/crore grouping.
 * This helper never mutates or rounds the value used by calculations; the
 * fraction options only control its rendered representation.
 */
export const formatMoneyDisplay = (
  value,
  { minimumFractionDigits, maximumFractionDigits = 2, fallback = '0' } = {}
) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;

  const displayMinimum = minimumFractionDigits ?? (Number.isInteger(number) ? 0 : Math.min(2, maximumFractionDigits));

  return number.toLocaleString('en-IN', {
    minimumFractionDigits: displayMinimum,
    maximumFractionDigits,
  });
};

export const getInvoiceItemMoney = (item = {}) => ({
  price: moneyNumber(item.rate),
  total: moneyNumber(
    item.amount ?? Number(item.quantity || 0) * Number(item.rate || 0)
  ),
});

