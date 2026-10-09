export const TRAVEL_REAL_PAYMENT_TYPES = Object.freeze(['cash', 'online', 'cheque']);

const parseAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

export const normalizeTravelPaymentTypeForEdit = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const paymentType = normalized === 'bank' ? 'online' : normalized;

  return TRAVEL_REAL_PAYMENT_TYPES.includes(paymentType) ? paymentType : 'cash';
};

export const applyCustomerReceiptAmountChange = (currentState, receivedAmount) => {
  const nextState = {
    ...currentState,
    receivedAmount,
  };

  if (parseAmount(receivedAmount) > 0) {
    nextState.paymentType = normalizeTravelPaymentTypeForEdit(currentState?.paymentType);
  }

  return nextState;
};

export const normalizeCustomerReceiptForPayload = (source = {}) => {
  const normalized = { ...source };

  if (parseAmount(normalized.receivedAmount) <= 0) {
    normalized.accountId = undefined;
    normalized.paymentType = undefined;
    return normalized;
  }

  normalized.paymentType = normalizeTravelPaymentTypeForEdit(normalized.paymentType);
  return normalized;
};
