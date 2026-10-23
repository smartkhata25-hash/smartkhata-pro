const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  supplierNumber: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, trim: true, default: '', maxlength: 40 },
  notes: { type: String, trim: true, default: '', maxlength: 1000 },
  openingBalanceSigned: { type: Number, default: 0 },
  openingBalanceDate: { type: String, default: '' },
  openingBalanceInitializedAt: { type: Date, default: null },
  openingBalanceEnteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  openingBalanceLastAdjustedAt: { type: Date, default: null },
  openingBalanceLastAdjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null }, archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  restoredAt: { type: Date, default: null }, restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ businessOwnerId: 1, supplierNumber: 1 }, { unique: true });
schema.index({ businessOwnerId: 1, isArchived: 1, name: 1 });
module.exports = mongoose.model('InstallmentsSupplier', schema);
