const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referenceNumber: { type: String, required: true, trim: true },
  transactionType: {
    type: String,
    enum: ['customer_receipt', 'customer_advance', 'supplier_payment', 'committee_savings_payout', 'invoice_customer_receipt', 'invoice_supplier_payment', 'reversal'],
    required: true,
    index: true,
  },
  transactionDate: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  receivableAmount: { type: Number, min: 0, default: 0 },
  advanceAmount: { type: Number, min: 0, default: 0 },
  paymentMode: { type: String, enum: ['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'cheque', 'other'], default: 'cash' },
  paymentSource: { type: String, enum: ['manual', 'today_collections', 'invoice', 'system_reversal'], default: 'manual', index: true },
  collectionDate: { type: String, default: '', index: true },
  dailyCollectionKey: { type: String, trim: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  legacyPaymentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentAccount', default: null },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsMember', default: null, index: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsSupplier', default: null, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null, index: true },
  committeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsCommittee', default: null, index: true },
  status: { type: String, enum: ['draft', 'posted', 'reversed'], default: 'draft', index: true },
  idempotencyKey: { type: String, required: true, trim: true },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  reversalOfTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null },
  reversalTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null },
  correctionOfTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null, index: true },
  correctedByTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null },
  reversalReason: { type: String, trim: true, default: '' },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, trim: true, default: '', maxlength: 2000 },
  externalReference: { type: String, trim: true, default: '', maxlength: 200 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  postedAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ businessOwnerId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ businessOwnerId: 1, referenceNumber: 1 }, { unique: true });
schema.index({ businessOwnerId: 1, status: 1, transactionDate: -1, createdAt: -1 });
schema.index({ businessOwnerId: 1, reversalOfTransactionId: 1 }, { unique: true, partialFilterExpression: { reversalOfTransactionId: { $type: 'objectId' } } });
schema.index({ businessOwnerId: 1, correctionOfTransactionId: 1 }, { unique: true, partialFilterExpression: { correctionOfTransactionId: { $type: 'objectId' } } });
schema.index({ businessOwnerId: 1, dailyCollectionKey: 1 }, { unique: true, partialFilterExpression: { dailyCollectionKey: { $type: 'string' }, status: 'posted' } });

module.exports = mongoose.model('InstallmentsPaymentTransaction', schema);
