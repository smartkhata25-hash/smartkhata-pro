const mongoose = require('mongoose');

const installmentsLedgerEntrySchema = new mongoose.Schema(
  {
    businessOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InstallmentsMember',
      required: true,
      index: true,
    },
    entryDate: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ['opening_balance', 'opening_adjustment', 'sale_invoice', 'customer_receipt', 'customer_advance', 'committee_savings_payout', 'payment_reversal', 'invoice_reversal'],
      required: true,
    },
    referenceNumber: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    debit: { type: Number, min: 0, default: 0 },
    credit: { type: Number, min: 0, default: 0 },
    signedAmountAfter: { type: Number, required: true },
    idempotencyKey: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null, index: true },
    committeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsCommittee', default: null, index: true },
    paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null, index: true },
    scheduledDueKey: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

installmentsLedgerEntrySchema.index(
  { businessOwnerId: 1, memberId: 1, idempotencyKey: 1 },
  { unique: true },
);
installmentsLedgerEntrySchema.index({ businessOwnerId: 1, memberId: 1, entryDate: 1, createdAt: 1 });

module.exports = mongoose.model('InstallmentsLedgerEntry', installmentsLedgerEntrySchema);

