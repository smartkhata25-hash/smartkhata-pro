export const TRAVEL_REAL_PAYMENT_TYPES = Object.freeze(['cash', 'online', 'cheque']);

const parseAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const roundMoney = (value) => Number(parseAmount(value).toFixed(2));
const roundAmount = (value) => Math.max(roundMoney(value), 0);

export const calculateInvoicePaymentSummary = ({
  localTotals = {},
  vendorGroups = [],
  vendorPayments = [],
} = {}) => {
  const invoiceTotal = roundAmount(localTotals.net);
  const customerReceived = roundAmount(localTotals.received);
  const customerDue = roundAmount(Math.max(invoiceTotal - customerReceived, 0));
  const extraCustomerPayment = roundAmount(Math.max(customerReceived - invoiceTotal, 0));

  const vendorBalances = vendorGroups.map((group) => {
    const payment = vendorPayments.find(
      (candidate) => {
        const candidateType = candidate?.vendorType === 'party' || candidate?.vendorPartyId
          ? 'party'
          : 'vendor';
        const candidateId = candidateType === 'party'
          ? candidate?.vendorPartyId
          : candidate?.vendorId;
        return `${candidateType}:${String(candidateId?._id || candidateId || '')}` === group.key;
      }
    );
    const invoiceVendorCost = roundAmount(group.totalCostBase);
    const vendorPaidNow = roundAmount(payment?.paidAmount);
    return {
      ...group,
      invoiceVendorCost,
      vendorPaidNow,
      invoiceVendorDue: roundAmount(Math.max(invoiceVendorCost - vendorPaidNow, 0)),
      extraVendorPayment: roundAmount(Math.max(vendorPaidNow - invoiceVendorCost, 0)),
    };
  });

  return {
    invoiceTotal,
    customerReceived,
    customerDue,
    extraCustomerPayment,
    estimatedCost: roundAmount(localTotals.cost),
    estimatedProfit: roundMoney(localTotals.profit),
    vendorPaidNow: roundAmount(vendorBalances.reduce((sum, row) => sum + row.vendorPaidNow, 0)),
    vendorDue: roundAmount(vendorBalances.reduce((sum, row) => sum + row.invoiceVendorDue, 0)),
    extraVendorPayment: roundAmount(
      vendorBalances.reduce((sum, row) => sum + row.extraVendorPayment, 0)
    ),
    vendorBalances,
  };
};

export const buildInvoiceExtraPaymentWarnings = (
  summary = {},
  { customerName = 'Customer', vendorNames = {} } = {}
) => {
  const rows = [];
  if (summary.extraCustomerPayment > 0) {
    rows.push({
      key: 'customer',
      label: 'Customer',
      name: customerName,
      amount: summary.invoiceTotal,
      paymentNow: summary.customerReceived,
      due: summary.customerDue,
      extraPayment: summary.extraCustomerPayment,
    });
  }
  (summary.vendorBalances || [])
    .filter((row) => row.extraVendorPayment > 0)
    .forEach((row) => rows.push({
      key: row.key,
      label: 'Vendor',
      name: vendorNames[row.key] || row.key,
      amount: row.invoiceVendorCost,
      paymentNow: row.vendorPaidNow,
      due: row.invoiceVendorDue,
      extraPayment: row.extraVendorPayment,
    }));
  return rows;
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
