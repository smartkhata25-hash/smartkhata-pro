const PrintSetting = require("../models/PrintSetting");
const User = require("../models/User");
const { deleteFile, getFileUrl, uploadFile } = require("../services/r2FileService");

const DOCUMENT_TYPES = [
  "sales",
  "saleReturn",
  "purchase",
  "purchaseReturn",
  "travelInvoice",
];

const serializePrintSetting = (setting) => {
  const value = typeof setting?.toObject === "function" ? setting.toObject() : setting;
  if (!value) return value;

  DOCUMENT_TYPES.forEach((type) => {
    const header = value[type]?.header;
    if (header) header.logoUrl = header.logoKey ? getFileUrl(header.logoKey) : "";
  });

  return value;
};

/* =========================================================
   DEFAULT DOCUMENT SETTINGS
========================================================= */
const defaultDocumentSettings = {
  showHeader: true,
  showFooter: true,

  // ONLY THESE TWO CAN BE HIDDEN
  showDescription: false,
  showUOM: false,

  // Payment & Status
  showPaid: true,
  showStatus: true,
  showPaymentType: true,
  showBalance: true,
  showNetTotal: true,
  showCustomerTotalBalance: true,

  showStamp: true,
  showBy: true,
};

/* =========================================================
   DEFAULT LAYOUT SETTINGS (UPDATED WITH COLUMN SIZES)
========================================================= */
const defaultLayoutSettings = {
  headerSize: "normal",
  tableDensity: "standard",
  rowHeight: "medium",
  footerSize: "normal",
  footerBehavior: "auto",
  pageWidth: "standard",

  // ✅ NEW: COLUMN SIZE DEFAULTS
  columnSizes: {
    name: "medium",
    description: "medium",
    uom: "medium",
    quantity: "medium",
    price: "medium",
    total: "medium",
  },
};

/* =========================================================
   BUILD DEFAULT HEADER FROM USER DATA
========================================================= */
const buildDefaultHeader = (user) => ({
  companyName: user?.businessName || "",
  address: user?.address || "",
  phone: user?.mobile || "",
  taxNumber: "",

  footerMessage: "Thank you for your business!",
  showLogo: false,
  logoKey: "",

  showCompanyAddress: true,
  showCompanyPhone: true,
  showTaxNumber: false,
});

/* =========================================================
   DEFAULT SETTINGS STRUCTURE (PER USER)
========================================================= */
const defaultSettings = async (userId) => {
  const user = await User.findById(userId);
  const defaultHeader = buildDefaultHeader(user);

  const documentBlock = {
    header: { ...defaultHeader },
    settings: { ...defaultDocumentSettings },
    layout: { ...defaultLayoutSettings },
  };

  return {
    userId,
    sales: { ...documentBlock },
    purchase: { ...documentBlock },
    saleReturn: { ...documentBlock },
    purchaseReturn: { ...documentBlock },
    travelInvoice: { ...documentBlock },
  };
};

/* =========================================================
   ✅ GET PRINT SETTINGS
========================================================= */
const getPrintSetting = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    let setting = await PrintSetting.findOne({ userId });

    if (!setting) {
      const defaults = await defaultSettings(userId);
      setting = await PrintSetting.create(defaults);
    } else {
      const defaults = await defaultSettings(userId);
      let changed = false;
      DOCUMENT_TYPES.forEach((type) => {
        if (!setting[type]) {
          setting[type] = defaults[type];
          changed = true;
        }
      });
      if (changed) await setting.save();
    }

    return res.json(serializePrintSetting(setting));
  } catch (err) {
    console.error("❌ PrintSetting GET Error:", err);
    return res.status(500).json({
      msg: "Failed to load print settings",
    });
  }
};
/* =========================================================
   ✅ UPDATE DOCUMENT-WISE PRINT SETTINGS
========================================================= */
const updatePrintSetting = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { type } = req.params;

    if (!DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({ msg: "Invalid document type" });
    }

    let setting = await PrintSetting.findOne({ userId });

    if (!setting) {
      const defaults = await defaultSettings(userId);
      setting = await PrintSetting.create(defaults);
    }

    if (!setting[type]) {
      const defaults = await defaultSettings(userId);
      setting[type] = defaults[type];
    }

    if (req.body.header && setting[type]?.header) {
      const { logoKey, logoUrl, ...safeHeader } = req.body.header;
      Object.assign(setting[type].header, safeHeader);
    }

    if (req.body.settings && setting[type]?.settings) {
      Object.assign(setting[type].settings, req.body.settings);
    }

    if (req.body.layout && setting[type]?.layout) {
      Object.assign(setting[type].layout, req.body.layout);
    }
    await setting.save();

    return res.json(serializePrintSetting(setting)[type]);
  } catch (err) {
    console.error("❌ PrintSetting UPDATE Error:", err);
    return res.status(500).json({
      msg: "Failed to update print settings",
    });
  }
};

const resetPrintSetting = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { type } = req.params;

    if (!DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({
        msg: "Invalid document type",
      });
    }

    let setting = await PrintSetting.findOne({ userId });

    if (!setting) {
      const defaults = await defaultSettings(userId);
      setting = await PrintSetting.create(defaults);
    }

    const defaults = await defaultSettings(userId);
    const oldLogoKey = setting[type]?.header?.logoKey || "";

    setting[type] = defaults[type];

    await setting.save();

    if (oldLogoKey) {
      deleteFile(oldLogoKey).catch((error) =>
        console.error("Reset print logo cleanup failed:", error.message),
      );
    }

    return res.json(serializePrintSetting(setting)[type]);
  } catch (err) {
    console.error("❌ PrintSetting RESET Error:", err);
    return res.status(500).json({
      msg: "Failed to reset print settings",
    });
  }
};

const uploadPrintLogo = async (req, res) => {
  const userId = req.user?.id || req.userId;
  const { type } = req.params;

  if (!DOCUMENT_TYPES.includes(type)) {
    return res.status(400).json({ msg: "Invalid document type" });
  }
  if (!req.file || !req.file.mimetype?.startsWith("image/")) {
    return res.status(400).json({ msg: "Please select a valid image logo" });
  }

  let uploaded;
  try {
    let setting = await PrintSetting.findOne({ userId });
    if (!setting) setting = await PrintSetting.create(await defaultSettings(userId));
    if (!setting[type]) {
      const defaults = await defaultSettings(userId);
      setting[type] = defaults[type];
    }

    const oldKey = setting[type]?.header?.logoKey || "";
    uploaded = await uploadFile({
      buffer: req.file.buffer,
      userId,
      moduleName: "print-logos",
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    setting[type].header.logoKey = uploaded.key;
    setting[type].header.showLogo = true;
    await setting.save();

    if (oldKey && oldKey !== uploaded.key) {
      deleteFile(oldKey).catch((error) =>
        console.error("Old print logo cleanup failed:", error.message),
      );
    }

    return res.json(serializePrintSetting(setting)[type]);
  } catch (error) {
    if (uploaded?.key) {
      await deleteFile(uploaded.key).catch(() => {});
    }
    console.error("Print logo upload error:", error);
    return res.status(500).json({ msg: "Failed to upload print logo" });
  }
};

const removePrintLogo = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { type } = req.params;
    if (!DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({ msg: "Invalid document type" });
    }

    const setting = await PrintSetting.findOne({ userId });
    if (!setting?.[type]?.header) {
      return res.status(404).json({ msg: "Print settings not found" });
    }

    const oldKey = setting[type].header.logoKey || "";
    setting[type].header.logoKey = "";
    setting[type].header.showLogo = false;
    await setting.save();
    if (oldKey) {
      deleteFile(oldKey).catch((error) =>
        console.error("Print logo cleanup failed:", error.message),
      );
    }

    return res.json(serializePrintSetting(setting)[type]);
  } catch (error) {
    console.error("Print logo remove error:", error);
    return res.status(500).json({ msg: "Failed to remove print logo" });
  }
};

module.exports = {
  getPrintSetting,
  updatePrintSetting,
  resetPrintSetting,
  defaultSettings,
  uploadPrintLogo,
  removePrintLogo,
  _test: { serializePrintSetting },
};
