import { formatMoneyDisplay } from './money';

export const formatInstallmentsMoney = (value, options = {}) => {
  const { absolute = false, maximumFractionDigits = 2, ...displayOptions } = options;
  return formatMoneyDisplay(
    absolute ? Math.abs(Number(value || 0)) : value,
    { ...displayOptions, minimumFractionDigits: 0, maximumFractionDigits }
  );
};

export const stripInstallmentsCurrencyPrefix = (value) => String(value || '').replace(/(?:\b(?:Rs\.?|PKR)|₨)\s*/gi, '');
