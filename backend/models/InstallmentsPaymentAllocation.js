const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  allocationType: { type: String, enum: ['advance_to_invoice', 'payment_to_invoice', 'payment_to_schedule'], required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsMember', required: true, index: true },
  paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null, index: true },
  sourceLedgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsLedgerEntry', default: null, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null, index: true },
  committeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsCommittee', default: null, index: true },
  scheduledDueKey: { type: String, trim: true, default: '' },
  amount: { type: Number, required: true, min: 0.01 },
  status: { type: String, enum: ['allocated', 'reversed'], default: 'allocated', index: true },
  idempotencyKey: { type: String, required: true, trim: true },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.pre('validate', function validateOrigin(next) {
  if (!this.paymentTransactionId && !this.sourceLedgerEntryId) return next(new Error('Allocation requires a payment transaction or source ledger entry'));
  if (this.allocationType === 'payment_to_schedule' && !this.scheduledDueKey) return next(new Error('Schedule allocation requires a due reference'));
  if (!this.invoiceId && !this.committeeId && !this.scheduledDueKey) return next(new Error('Allocation requires an invoice, committee or scheduled due'));
  next();
});
schema.index({ businessOwnerId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ businessOwnerId: 1, sourceLedgerEntryId: 1, status: 1 });

module.exports = mongoose.model('InstallmentsPaymentAllocation', schema);
