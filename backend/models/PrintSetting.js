const mongoose = require("mongoose");

/* =========================================================
   DOCUMENT VISIBILITY SETTINGS
========================================================= */
const documentSettingSchema = new mongoose.Schema({
  // 🔹 Basic Visibility Controls
  showHeader: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },

  // 🔹 Item Columns Control (ONLY THESE TWO ARE HIDEABLE)
  showDescription: { type: Boolean, default: true },
  showUOM: { type: Boolean, default: true },

  // 🔹 Payment & Status Controls
  showPaid: { type: Boolean, default: true },
  showStatus: { type: Boolean, default: true },
  showPaymentType: { type: Boolean, default: true },
  showBalance: { type: Boolean, default: true },

  // 🔹 Extra
  showStamp: { type: Boolean, default: true },
  showBy: { type: Boolean, default: true },
});

/* =========================================================
   HEADER SETTINGS
========================================================= */
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

/* =========================================================
   LAYOUT SETTINGS (UPDATED WITH COLUMN SIZE CONTROL)
========================================================= */
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
    enum: ["narrow", "standard", "wide"],
    default: "standard",
  },

  /* ================= NEW: COLUMN SIZE CONTROL ================= */
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

/* =========================================================
   DOCUMENT SCHEMA (Header + Settings + Layout)
========================================================= */
const documentPrintSchema = new mongoose.Schema({
  header: headerSettingSchema,
  settings: documentSettingSchema,
  layout: layoutSchema,
});

/* =========================================================
   MAIN PRINT SETTING SCHEMA
========================================================= */
const printSettingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Each document has its own full config
    sales: documentPrintSchema,
    purchase: documentPrintSchema,
    saleReturn: documentPrintSchema,
    purchaseReturn: documentPrintSchema,
  },
  { timestamps: true },
);

module.exports = mongoose.model("PrintSetting", printSettingSchema);
