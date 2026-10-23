const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentAccount', default: null, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null, index: true },
  paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null, index: true },
  sharedAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  sourceType: { type: String, enum: ['legacy_invoice', 'payment_transaction', 'reversal'], default: 'legacy_invoice' },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  entryDate: { type: String, required: true },
  direction: { type: String, enum: ['in', 'out'], required: true }, amount: { type: Number, required: true, min: 0.01 }, description: { type: String, required: true, trim: true }, idempotencyKey: { type: String, required: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.pre('validate', function validateOrigin(next) {
  if (!this.invoiceId && !this.paymentTransactionId && !this.sourceId) return next(new Error('Account entry requires an auditable origin'));
  if (this.sourceType !== 'legacy_invoice' && (!this.paymentTransactionId || !this.sharedAccountId || !this.journalEntryId)) return next(new Error('Posted account entry requires payment and journal references'));
  next();
});
schema.index({ businessOwnerId: 1, idempotencyKey: 1 }, { unique: true });
module.exports = mongoose.model('InstallmentsAccountEntry', schema);
