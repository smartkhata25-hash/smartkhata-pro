const mongoose = require('mongoose');

const installmentsSequenceSchema = new mongoose.Schema(
  {
    businessOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    seq: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true },
);

installmentsSequenceSchema.index(
  { businessOwnerId: 1, key: 1 },
  { unique: true },
);

module.exports = mongoose.model('InstallmentsSequence', installmentsSequenceSchema);

