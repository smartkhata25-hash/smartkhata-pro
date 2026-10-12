const roundMoney = (value = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;

  return Math.round((number + Math.sign(number || 1) * Number.EPSILON) * 100) / 100;
};

const formatMoney = (
  value = 0,
  { minimumFractionDigits, maximumFractionDigits = 2, fallback = "0" } = {},
) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;

  const displayMinimum =
    minimumFractionDigits ?? (Number.isInteger(number) ? 0 : Math.min(2, maximumFractionDigits));

  return number.toLocaleString("en-IN", {
    minimumFractionDigits: displayMinimum,
    maximumFractionDigits,
  });
};

module.exports = { formatMoney, roundMoney };

