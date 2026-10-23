const mongoose = require('mongoose');

const installmentsMemberSchema = new mongoose.Schema(
  {
    businessOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    memberNumber: { type: String, required: true, trim: true, uppercase: true },
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    mobile: { type: String, trim: true, default: '', maxlength: 40 },
    alternateMobile: { type: String, trim: true, default: '', maxlength: 40 },
    address: { type: String, trim: true, default: '', maxlength: 500 },
    cnic: { type: String, trim: true, default: '', maxlength: 40 },
    joiningDate: { type: String, required: true },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    profileIncomplete: { type: Boolean, default: false },
    openingBalanceSigned: { type: Number, default: 0 },
    openingBalanceInitializedAt: { type: Date, default: null },
    openingBalanceDate: { type: String, default: '' },
    openingBalanceEnteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    openingBalanceLastAdjustedAt: { type: Date, default: null },
    openingBalanceLastAdjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    restoredAt: { type: Date, default: null },
    restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

installmentsMemberSchema.index(
  { businessOwnerId: 1, memberNumber: 1 },
  { unique: true },
);
installmentsMemberSchema.index({ businessOwnerId: 1, isArchived: 1, fullName: 1 });
installmentsMemberSchema.index({ businessOwnerId: 1, mobile: 1 });

module.exports = mongoose.model('InstallmentsMember', installmentsMemberSchema);

