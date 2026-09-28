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

export const getInvoiceItemMoney = (item = {}) => ({
  price: moneyNumber(item.rate),
  total: moneyNumber(
    item.amount ?? Number(item.quantity || 0) * Number(item.rate || 0)
  ),
});

