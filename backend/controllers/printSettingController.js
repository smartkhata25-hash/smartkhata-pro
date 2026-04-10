const PrintSetting = require("../models/PrintSetting");
const User = require("../models/User");

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
    }

    return res.json(setting);
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

    let setting = await PrintSetting.findOne({ userId });

    if (!setting) {
      const defaults = await defaultSettings(userId);
      setting = await PrintSetting.create(defaults);
    }

    if (!["sales", "saleReturn", "purchase", "purchaseReturn"].includes(type)) {
      return res.status(400).json({
        msg: "Invalid document type",
      });
    }

    if (req.body.header && setting[type]?.header) {
      Object.assign(setting[type].header, req.body.header);
    }

    if (req.body.settings && setting[type]?.settings) {
      Object.assign(setting[type].settings, req.body.settings);
    }

    if (req.body.layout && setting[type]?.layout) {
      Object.assign(setting[type].layout, req.body.layout);
    }
    await setting.save();

    return res.json(setting[type]);
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

    if (!["sales", "saleReturn", "purchase", "purchaseReturn"].includes(type)) {
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

    setting[type] = defaults[type];

    await setting.save();

    return res.json(setting[type]);
  } catch (err) {
    console.error("❌ PrintSetting RESET Error:", err);
    return res.status(500).json({
      msg: "Failed to reset print settings",
    });
  }
};

module.exports = {
  getPrintSetting,
  updatePrintSetting,
  resetPrintSetting,
  defaultSettings,
};
