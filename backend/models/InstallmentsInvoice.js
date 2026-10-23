const mongoose = require('mongoose');
const itemSchema = new mongoose.Schema({ productId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsProduct', default: null }, supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsSupplier', required: true }, category: { type: String, trim: true, default: '' }, productName: { type: String, required: true, trim: true }, brand: { type: String, trim: true, default: '' }, model: { type: String, trim: true, default: '' }, specifications: { type: String, trim: true, default: '' }, quantity: { type: Number, required: true, min: 0.001 }, unitPurchaseCost: { type: Number, required: true, min: 0 }, unitSalePrice: { type: Number, required: true, min: 0 }, costTotal: { type: Number, required: true }, saleTotal: { type: Number, required: true }, grossProfit: { type: Number, required: true } }, { _id: true });
const paymentSchema = new mongoose.Schema({ supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsSupplier', required: true }, amount: { type: Number, required: true, min: 0.01 }, accountId: { type: mongoose.Schema.Types.ObjectId, required: true } }, { _id: false });
const schema = new mongoose.Schema({
  businessOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, invoiceNumber: { type: String, required: true, trim: true }, publicInvoiceNumber: { type: String, trim: true, default: '', index: true }, invoiceDate: { type: String, required: true }, dueDate: { type: String, default: '' },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsMember', required: true, index: true }, committeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsCommittee', default: null }, defaultSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsSupplier', required: true },
  items: { type: [itemSchema], validate: [(rows) => rows.length > 0, 'At least one item is required'] }, totalPurchaseCost: { type: Number, required: true }, totalSale: { type: Number, required: true }, grossProfit: { type: Number, required: true }, grossMarginPercent: { type: Number, required: true },
  existingAdvanceApplied: { type: Number, default: 0 }, accountedAdvanceApplied: { type: Number, default: 0 }, legacyAdvanceApplied: { type: Number, default: 0 }, customerReceiptAmount: { type: Number, default: 0 }, customerReceiptAccountId: { type: mongoose.Schema.Types.ObjectId, default: null }, supplierPayments: { type: [paymentSchema], default: [] }, customerBalanceAfter: { type: Number, default: 0 },
  notes: { type: String, trim: true, default: '', maxlength: 2000 }, status: { type: String, enum: ['draft', 'posted', 'cancelled'], default: 'draft', index: true }, accountingStatus: { type: String, enum: ['unposted', 'posted', 'reversing', 'reversed'], default: 'unposted' }, postedAt: { type: Date, default: null }, postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reversedAt: { type: Date, default: null }, reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, reversalReason: { type: String, trim: true, default: '' },
  cancelledAt: { type: Date, default: null }, cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, cancellationReason: { type: String, trim: true, default: '', maxlength: 500 },
  correctsInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null, index: true },
  correctedByInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentsInvoice', default: null },
  correctionReason: { type: String, trim: true, default: '', maxlength: 500 },
  accountingJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  advanceAllocationJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
  creationIdempotencyKey: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ businessOwnerId: 1, invoiceNumber: 1 }, { unique: true }); schema.index({ businessOwnerId: 1, status: 1, invoiceDate: -1 }); schema.index({ businessOwnerId: 1, creationIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { creationIdempotencyKey: { $type: 'string' } } });
schema.pre('validate', async function validateOwnerScopedReferences(next) {
  try {
    if (['reversing', 'reversed'].includes(this.accountingStatus)) return next();
    const Member = mongoose.model('InstallmentsMember'); const Supplier = mongoose.model('InstallmentsSupplier'); const Committee = mongoose.model('InstallmentsCommittee'); const Product = mongoose.model('InstallmentsProduct'); const session = this.$session();
    const member = await Member.findOne({ _id: this.memberId, businessOwnerId: this.businessOwnerId, isArchived: false }).session(session || null); if (!member) throw new Error('Active member not found');
    const supplierIds = [...new Set([this.defaultSupplierId, ...this.items.map((row) => row.supplierId)].filter(Boolean).map(String))]; const supplierCount = await Supplier.countDocuments({ _id: { $in: supplierIds }, businessOwnerId: this.businessOwnerId, isArchived: false }).session(session || null); if (supplierCount !== supplierIds.length) throw new Error('One or more suppliers are unavailable');
    if (this.committeeId) { const committee = await Committee.findOne({ _id: this.committeeId, memberId: this.memberId, businessOwnerId: this.businessOwnerId, isArchived: { $ne: true } }).session(session || null); if (!committee) throw new Error('Selected committee does not belong to this member or is archived'); }
    const productIds = [...new Set(this.items.map((row) => row.productId).filter(Boolean).map(String))]; if (productIds.length) { const productCount = await Product.countDocuments({ _id: { $in: productIds }, businessOwnerId: this.businessOwnerId, isActive: true }).session(session || null); if (productCount !== productIds.length) throw new Error('One or more products are unavailable'); }
    next();
  } catch (error) { next(error); }
});
module.exports = mongoose.model('InstallmentsInvoice', schema);
