const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const AccountEntry = require('../models/InstallmentsAccountEntry');
const PaymentTransaction = require('../models/InstallmentsPaymentTransaction');
const Allocation = require('../models/InstallmentsPaymentAllocation');
const Invoice = require('../models/InstallmentsInvoice');
const { MODULE_SCOPES, buildModuleScopeFilter, normalizeModuleScope } = require('../utils/moduleScope');

test('installments is an explicit scope and never normalizes to trading', () => {
  assert.equal(MODULE_SCOPES.INSTALLMENTS, 'installments');
  assert.equal(normalizeModuleScope('installments'), 'installments');
  assert.deepEqual(buildModuleScopeFilter('installments'), { moduleScope: { $in: ['installments', 'shared'] } });
  assert.deepEqual(buildModuleScopeFilter('trading').$or.at(-1).moduleScope.$in, ['trading', 'both', 'shared']);
  assert.ok(Account.schema.path('moduleScope').enumValues.includes('installments'));
  assert.ok(JournalEntry.schema.path('moduleScope').enumValues.includes('installments'));
});

test('payment transaction has owner-scoped idempotency and supports no invoice', () => {
  const unique = PaymentTransaction.schema.indexes().find(([fields]) => fields.businessOwnerId === 1 && fields.idempotencyKey === 1);
  assert.equal(unique[1].unique, true);
  assert.equal(PaymentTransaction.schema.path('invoiceId').options.default, null);
  assert.equal(PaymentTransaction.schema.path('accountId').options.ref, 'Account');
  assert.ok(PaymentTransaction.schema.path('transactionType').enumValues.includes('invoice_customer_receipt'));
  assert.ok(PaymentTransaction.schema.path('transactionType').enumValues.includes('committee_savings_payout'));
});

test('account entries require an auditable origin but not an invoice', async () => {
  const base = {
    businessOwnerId: '507f1f77bcf86cd799439011', sharedAccountId: '507f1f77bcf86cd799439012',
    paymentTransactionId: '507f1f77bcf86cd799439013', journalEntryId: '507f1f77bcf86cd799439014',
    sourceType: 'payment_transaction', sourceId: '507f1f77bcf86cd799439013', entryDate: '2026-10-21',
    direction: 'in', amount: 100, description: 'Receipt', idempotencyKey: 'receipt:test', createdBy: '507f1f77bcf86cd799439011',
  };
  await new AccountEntry(base).validate();
  await assert.rejects(() => new AccountEntry({ ...base, paymentTransactionId: null, sourceId: null }).validate(), /auditable origin/);
});

test('allocation records require a payment/credit source and a target', async () => {
  const base = { businessOwnerId: '507f1f77bcf86cd799439011', allocationType: 'advance_to_invoice', memberId: '507f1f77bcf86cd799439012', sourceLedgerEntryId: '507f1f77bcf86cd799439013', invoiceId: '507f1f77bcf86cd799439014', amount: 50, idempotencyKey: 'allocation:test', createdBy: '507f1f77bcf86cd799439011' };
  await new Allocation(base).validate();
  await assert.rejects(() => new Allocation({ ...base, sourceLedgerEntryId: null }).validate(), /requires a payment transaction or source ledger/);
});

test('invoice reversal state and reusable posting/reversal code are wired', () => {
  assert.ok(Invoice.schema.path('accountingStatus').enumValues.includes('reversed'));
  const paymentSource = fs.readFileSync(path.join(__dirname, '../services/installments/installmentsPaymentService.js'), 'utf8');
  const invoiceSource = fs.readFileSync(path.join(__dirname, '../services/installments/installmentsInvoiceService.js'), 'utf8');
  assert.match(paymentSource, /postPaymentInSession/);
  assert.match(paymentSource, /listCompatiblePaymentTransactions/);
  assert.match(paymentSource, /reversePaymentInSession/);
  assert.match(paymentSource, /idempotencyKey/);
  assert.match(invoiceSource, /PAYMENT_TYPES\.INVOICE_CUSTOMER_RECEIPT/);
  assert.match(invoiceSource, /allocateAvailableAdvanceInSession/);
  assert.match(invoiceSource, /Legacy invoice payments require explicit account reconciliation/);
});
