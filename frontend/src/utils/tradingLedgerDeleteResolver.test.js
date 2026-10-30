import { resolveTradingLedgerDeleteTarget } from './tradingLedgerDeleteResolver';

const ids = {
  journal: '64a000000000000000000001',
  sale: '64a000000000000000000002',
  purchase: '64a000000000000000000003',
  refund: '64a000000000000000000004',
  purchaseReturn: '64a000000000000000000005',
  payment: '64a000000000000000000006',
};

const allowAll = () => true;
const resolve = (entry, permission = allowAll) =>
  resolveTradingLedgerDeleteTarget({ _id: ids.journal, billNo: '1005', ...entry }, permission);

test('sales invoice and its generated payment target the same original invoice', () => {
  const invoice = resolve({ sourceType: 'sale_invoice', invoiceId: ids.sale });
  const payment = resolve({
    sourceType: 'receive_payment',
    originModule: 'sale_invoice',
    referenceId: ids.sale,
  });
  expect(invoice).toMatchObject({ action: 'saleInvoice', id: ids.sale, permission: 'sales.delete' });
  expect(payment).toMatchObject({ action: 'saleInvoice', id: ids.sale });
  expect(payment.id).not.toBe(ids.journal);
});

test('standalone receive payment targets only the payment document', () => {
  expect(
    resolve({
      sourceType: 'receive_payment',
      originModule: 'receive_payment_form',
      referenceId: ids.payment,
    })
  ).toMatchObject({ action: 'receivePayment', id: ids.payment });
});

test('purchase invoice, payment and discount target the purchase invoice', () => {
  for (const sourceType of ['purchase_invoice', 'purchase_payment', 'purchase_discount']) {
    expect(resolve({ sourceType, referenceId: ids.purchase })).toMatchObject({
      action: 'purchaseInvoice',
      id: ids.purchase,
    });
  }
});

test('refund and linked payment target the refund workflow', () => {
  for (const sourceType of ['refund_invoice', 'refund_payment']) {
    expect(resolve({ sourceType, referenceId: ids.refund })).toMatchObject({
      action: 'refund',
      id: ids.refund,
    });
  }
});

test('purchase return and linked payment target the return workflow', () => {
  for (const sourceType of ['purchase_return', 'purchase_return_payment']) {
    expect(resolve({ sourceType, referenceId: ids.purchaseReturn })).toMatchObject({
      action: 'purchaseReturn',
      id: ids.purchaseReturn,
    });
  }
});

test('opening variants use existing parent deletion workflows', () => {
  expect(resolve({ sourceType: 'opening_sale_invoice', invoiceId: ids.sale })).toMatchObject({
    action: 'saleInvoice',
  });
  expect(
    resolve({ sourceType: 'opening_purchase_invoice', invoiceId: ids.purchase })
  ).toMatchObject({ action: 'purchaseInvoice' });
  expect(resolve({ sourceType: 'opening_refund_invoice', invoiceId: ids.refund })).toMatchObject({
    action: 'refund',
  });
  expect(
    resolve({ sourceType: 'opening_purchase_return', invoiceId: ids.purchaseReturn })
  ).toMatchObject({ action: 'purchaseReturn' });
});

test('permission denial, ambiguity, model mismatch and unsupported rows stay hidden', () => {
  expect(resolve({ sourceType: 'sale_invoice', invoiceId: ids.sale }, () => false)).toBeNull();
  expect(resolve({ sourceType: 'sale_invoice' })).toBeNull();
  expect(
    resolve({ sourceType: 'sale_invoice', invoiceId: ids.sale, invoiceModel: 'PurchaseInvoice' })
  ).toBeNull();
  expect(resolve({ sourceType: 'manual', referenceId: ids.sale })).toBeNull();
  expect(resolve({ sourceType: 'opening_balance', referenceId: ids.sale })).toBeNull();
});

test('Travel rows never expose Trading delete actions', () => {
  expect(
    resolve({
      sourceType: 'receive_payment',
      originModule: 'travel_invoice',
      referenceId: ids.sale,
    })
  ).toBeNull();
  expect(
    resolve({ sourceType: 'purchase_payment', moduleScope: 'travel', referenceId: ids.purchase })
  ).toBeNull();
});
