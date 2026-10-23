const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 }, category: { type: String, trim: true, default: 'Other Product', maxlength: 120 },
  brand: { type: String, trim: true, default: '', maxlength: 100 }, model: { type: String, trim: true, default: '', maxlength: 120 },
  specifications: { type: String, trim: true, default: '', maxlength: 1000 }, isActive: { type: Boolean, default: true }, isSystem: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ businessOwnerId: 1, name: 1, brand: 1, model: 1 }, { unique: true });
module.exports = mongoose.model('InstallmentsProduct', schema);
