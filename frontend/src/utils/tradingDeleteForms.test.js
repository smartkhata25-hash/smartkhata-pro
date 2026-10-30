import fs from 'fs';
import path from 'path';

const readComponent = (name) =>
  fs.readFileSync(path.join(process.cwd(), 'src', 'components', name), 'utf8');

test('form delete controls use delete permissions and loaded saved IDs', () => {
  const sale = readComponent('InvoiceForm.js');
  const purchase = readComponent('PurchaseInvoiceForm.js');
  const refund = readComponent('RefundInvoiceForm.js');
  const purchaseReturn = readComponent('PurchaseReturnForm.js');

  expect(sale).toMatch(/editingInvoiceFromAPI\?\._id && canDeleteSales/);
  expect(sale).not.toMatch(/editingInvoiceFromAPI\?\._id && canEditSales && \(\s*<button[\s\S]{0,300}handleDeleteInvoice/);

  expect(purchase).toMatch(/canDeletePurchases && invoiceId/);
  expect(purchase).toMatch(/deletePurchaseInvoice\(invoiceId\)/);

  expect(refund).toMatch(/setLoadedRefundId\(data\?\._id \|\| ''\)/);
  expect(refund).toMatch(/loadedRefundId && canDeleteRefunds/);
  expect(refund).toMatch(/deleteRefund\(loadedRefundId, token\)/);

  expect(purchaseReturn).toMatch(/setLoadedReturnId\(data\?\._id \|\| ''\)/);
  expect(purchaseReturn).toMatch(/loadedReturnId && canDeletePurchaseReturns/);
  expect(purchaseReturn).toMatch(/deletePurchaseReturn\(loadedReturnId, token\)/);
});

test('all form delete handlers use an immediate in-flight lock', () => {
  for (const name of [
    'InvoiceForm.js',
    'PurchaseInvoiceForm.js',
    'RefundInvoiceForm.js',
    'PurchaseReturnForm.js',
  ]) {
    const source = readComponent(name);
    expect(source).toMatch(/deleteInFlightRef\.current/);
    expect(source).toMatch(/deleteInFlightRef\.current = true/);
    expect(source).toMatch(/deleteInFlightRef\.current = false/);
  }
});
