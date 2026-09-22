const mongoose = require("mongoose");

const quotationItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    uom: { type: String, default: "", trim: true },
    quantity: { type: Number, required: true, min: 0.000001 },
    price: { type: Number, required: true, min: 0.000001 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNo: { type: String, required: true, trim: true },
    quotationDate: { type: Date, required: true },
    quotationTime: { type: String, default: "" },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, default: "", trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: "Party", default: null },
    customerType: { type: String, enum: ["customer", "party"], default: "customer" },
    items: { type: [quotationItemSchema], required: true },
    subTotal: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    by: { type: String, default: "", trim: true },
    lang: { type: String, enum: ["en", "ur"], default: "en" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true },
);

quotationSchema.index({ createdBy: 1, quotationNo: 1 }, { unique: true });
quotationSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("Quotation", quotationSchema);
