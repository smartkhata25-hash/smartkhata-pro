const mongoose = require("mongoose");

const documentSettingSchema = new mongoose.Schema({
  showHeader: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },

  showDescription: { type: Boolean, default: true },
  showUOM: { type: Boolean, default: true },

  showPaid: { type: Boolean, default: true },
  showStatus: { type: Boolean, default: true },
  showPaymentType: { type: Boolean, default: true },
  showBalance: { type: Boolean, default: true },
  showCustomerTotalBalance: { type: Boolean, default: true },

  showStamp: { type: Boolean, default: true },
  showBy: { type: Boolean, default: true },
});

const headerSettingSchema = new mongoose.Schema({
  companyName: { type: String, default: "" },
  address: { type: String, default: "" },
  phone: { type: String, default: "" },
  taxNumber: { type: String, default: "" },

  footerMessage: {
    type: String,
    default: "Thank you for your business!",
  },

  showLogo: { type: Boolean, default: false },

  // Optional Hide/Show Controls
  showCompanyAddress: { type: Boolean, default: true },
  showCompanyPhone: { type: Boolean, default: true },
  showTaxNumber: { type: Boolean, default: true },
});

const layoutSchema = new mongoose.Schema({
  headerSize: {
    type: String,
    enum: ["compact", "normal", "spacious"],
    default: "normal",
  },

  tableDensity: {
    type: String,
    enum: ["tight", "standard", "relaxed"],
    default: "standard",
  },

  rowHeight: {
    type: String,
    enum: ["small", "medium", "large"],
    default: "medium",
  },

  footerSize: {
    type: String,
    enum: ["compact", "normal", "spacious"],
    default: "normal",
  },

  footerBehavior: {
    type: String,
    enum: ["auto", "hideIfNoSpace"],
    default: "auto",
  },

  pageWidth: {
    type: String,
    enum: ["narrow", "standard", "wide", "thermal"],
    default: "standard",
  },

  columnSizes: {
    name: {
      type: String,
      enum: ["small", "compact", "medium", "large"],
      default: "medium",
    },
    description: {
      type: String,
      enum: ["small", "compact", "medium", "large"],
      default: "medium",
    },
    uom: {
      type: String,
      enum: ["small", "compact", "medium", "large"],
      default: "medium",
    },
    quantity: {
      type: String,
      enum: ["small", "compact", "medium", "large"],
      default: "medium",
    },
    price: {
      type: String,
      enum: ["small", "compact", "medium", "large"],
      default: "medium",
    },
    total: {
      type: String,
      enum: ["small", "compact", "medium", "large"],
      default: "medium",
    },
  },
});

const documentPrintSchema = new mongoose.Schema({
  header: headerSettingSchema,
  settings: documentSettingSchema,
  layout: layoutSchema,
});

const printSettingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    sales: documentPrintSchema,
    purchase: documentPrintSchema,
    saleReturn: documentPrintSchema,
    purchaseReturn: documentPrintSchema,
    travelInvoice: documentPrintSchema,
  },
  { timestamps: true },
);

module.exports = mongoose.model("PrintSetting", printSettingSchema);
