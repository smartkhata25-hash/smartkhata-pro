const roundMoney = (value = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;

  return Math.round((number + Math.sign(number || 1) * Number.EPSILON) * 100) / 100;
};

const formatMoney = (value = 0) => roundMoney(value).toFixed(2);

module.exports = { formatMoney, roundMoney };

