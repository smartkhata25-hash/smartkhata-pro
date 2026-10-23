const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      enum: [
        'daily',
        'every_other_day',
        'every_3_days',
        'weekly',
        'every_15_days',
        'twice_monthly',
        'monthly',
        'custom_days',
      ],
      required: true,
    },
    startDate: { type: String, required: true },
    weekday: { type: Number, min: 0, max: 6, default: null },
    twiceMonthlyDays: [{ type: Number, min: 1, max: 31 }],
    monthlyDay: { type: Number, min: 1, max: 31, default: null },
    intervalDays: { type: Number, min: 1, max: 365, default: null },
  },
  { _id: false },
);

const installmentsCommitteeSchema = new mongoose.Schema(
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
    committeeNumber: { type: String, required: true, trim: true, uppercase: true },
    targetAmount: { type: Number, required: true, min: 0.01 },
    contributionAmount: { type: Number, required: true, min: 0.01 },
    schedule: { type: scheduleSchema, required: true },
    scheduleHistory: [{
      effectiveFrom: { type: String, required: true },
      effectiveTo: { type: String, default: '' },
      targetAmount: { type: Number, required: true },
      contributionAmount: { type: Number, required: true },
      schedule: { type: scheduleSchema, required: true },
      status: { type: String, enum: ['active', 'paused', 'closed'], default: 'active' },
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    }],
    status: { type: String, enum: ['active', 'paused', 'closed'], default: 'active' },
    closureType: { type: String, enum: ['', 'settled', 'early'], default: '' },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closeReason: { type: String, trim: true, default: '', maxlength: 500 },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archiveReason: { type: String, trim: true, default: '', maxlength: 500 },
    restoredAt: { type: Date, default: null },
    restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

installmentsCommitteeSchema.index(
  { businessOwnerId: 1, committeeNumber: 1 },
  { unique: true },
);
installmentsCommitteeSchema.index({ businessOwnerId: 1, memberId: 1, status: 1 });
installmentsCommitteeSchema.index({ businessOwnerId: 1, isArchived: 1, createdAt: -1 });

module.exports = mongoose.model('InstallmentsCommittee', installmentsCommitteeSchema);

