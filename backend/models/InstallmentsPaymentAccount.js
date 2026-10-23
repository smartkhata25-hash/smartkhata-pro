const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 }, type: { type: String, enum: ['cash', 'bank', 'jazzcash', 'easypaisa', 'other'], required: true },
  isActive: { type: Boolean, default: true }, isSystem: { type: Boolean, default: false }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
  compatibilityStatus: { type: String, enum: ['legacy_unmapped', 'mapped'], default: 'legacy_unmapped' },
}, { timestamps: true });
schema.index({ businessOwnerId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('InstallmentsPaymentAccount', schema);
