const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsSupplier', required: true, index: true },
  entryDate: { type: String, required: true },
  sourceType: { type: String, enum: ['opening_balance', 'opening_adjustment', 'purchase_invoice', 'supplier_payment', 'payment_reversal', 'invoice_reversal', 'adjustment', 'return'], required: true },
  referenceNumber: { type: String, required: true, trim: true }, description: { type: String, required: true, trim: true },
  debit: { type: Number, min: 0, default: 0 }, credit: { type: Number, min: 0, default: 0 },
  signedAmountAfter: { type: Number, required: true }, idempotencyKey: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null, index: true },
  paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsPaymentTransaction', default: null, index: true },
}, { timestamps: true });

schema.index({ businessOwnerId: 1, supplierId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ businessOwnerId: 1, supplierId: 1, entryDate: 1, createdAt: 1 });
module.exports = mongoose.model('InstallmentsSupplierLedgerEntry', schema);
