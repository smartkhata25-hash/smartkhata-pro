const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const asDocumentId = (value) => {
  const id = value ? String(value?._id || value) : '';
  return OBJECT_ID_PATTERN.test(id) ? id : '';
};

const isTravelRow = (entry = {}) => {
  const origin = String(entry.originModule || '').toLowerCase();
  const scope = String(entry.moduleScope || '').toLowerCase();
  const type = String(entry.sourceType || '').toLowerCase();
  return scope === 'travel' || origin.startsWith('travel_') || type.startsWith('travel_');
};

const modelMatches = (entry, expectedModel) => {
  const model = String(entry?.invoiceModel || '').trim();
  return !model || model === expectedModel;
};

const TARGETS = Object.freeze({
  saleInvoice: { permission: 'sales.delete', label: 'Sales Invoice' },
  purchaseInvoice: { permission: 'purchases.delete', label: 'Purchase Invoice' },
  refund: { permission: 'refunds.delete', label: 'Sale Refund' },
  purchaseReturn: { permission: 'purchase_returns.delete', label: 'Purchase Return' },
  receivePayment: { permission: 'receive_payments.delete', label: 'Receive Payment' },
  payBill: { permission: 'pay_bills.delete', label: 'Pay Bill' },
});

const buildTarget = (action, entry, id, permissionChecker) => {
  const config = TARGETS[action];
  if (!config || !id || !permissionChecker(config.permission)) return null;
  return {
    action,
    id,
    permission: config.permission,
    label: config.label,
    billNo: String(entry.billNo || '').trim(),
    journalEntryId: asDocumentId(entry._id),
    key: `${action}:${id}`,
  };
};

export const resolveTradingLedgerDeleteTarget = (
  entry,
  permissionChecker = () => false
) => {
  if (!entry || isTravelRow(entry)) return null;

  const type = String(entry.sourceType || '').toLowerCase();
  const origin = String(entry.originModule || '').toLowerCase();
  const invoiceId = asDocumentId(entry.invoiceId);
  const referenceId = asDocumentId(entry.referenceId);
  const parentId = invoiceId || referenceId;

  if (['sale_invoice', 'opening_sale_invoice'].includes(type)) {
    if (!modelMatches(entry, 'Invoice')) return null;
    return buildTarget('saleInvoice', entry, parentId, permissionChecker);
  }
  if (
    ['receive_payment', 'sale_discount'].includes(type) &&
    origin === 'sale_invoice'
  ) {
    if (!modelMatches(entry, 'Invoice')) return null;
    return buildTarget('saleInvoice', entry, parentId, permissionChecker);
  }

  if (['refund_invoice', 'opening_refund_invoice', 'refund_payment'].includes(type)) {
    if (!modelMatches(entry, 'RefundInvoice')) return null;
    return buildTarget('refund', entry, parentId, permissionChecker);
  }

  if (['purchase_invoice', 'opening_purchase_invoice'].includes(type)) {
    if (!modelMatches(entry, 'PurchaseInvoice')) return null;
    return buildTarget('purchaseInvoice', entry, parentId, permissionChecker);
  }
  if (['purchase_payment', 'purchase_discount'].includes(type)) {
    if (!modelMatches(entry, 'PurchaseInvoice')) return null;
    return buildTarget('purchaseInvoice', entry, parentId, permissionChecker);
  }

  if (['purchase_return', 'opening_purchase_return', 'purchase_return_payment'].includes(type)) {
    if (!modelMatches(entry, 'PurchaseReturn')) return null;
    return buildTarget('purchaseReturn', entry, parentId, permissionChecker);
  }

  if (
    ['receive_payment', 'receive_payment_discount'].includes(type) &&
    origin === 'receive_payment_form'
  ) {
    return buildTarget('receivePayment', entry, referenceId, permissionChecker);
  }

  if (type === 'pay_bill') {
    return buildTarget('payBill', entry, referenceId, permissionChecker);
  }

  return null;
};

export const isTradingLedgerDeleteSupported = (entry, permissionChecker) =>
  Boolean(resolveTradingLedgerDeleteTarget(entry, permissionChecker));

