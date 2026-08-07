const mongoose = require("mongoose");

const {
  AVAILABLE_COMPONENTS,
  PRESETS,
  getBusinessValueSummary,
} = require("../services/businessValueService");

exports.getBusinessValue = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { preset = "complete", components = "" } = req.query;

    const summary = await getBusinessValueSummary({
      userId,
      preset,
      components,
    });

    res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("Get Business Value Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to calculate business value.",
      error: error.message,
    });
  }
};

exports.getBusinessValueOptions = async (req, res) => {
  try {
    res.json({
      success: true,

      presets: [
        {
          key: "stock_assets",
          label: "Stock & Assets",
          components: PRESETS.stock_assets,
        },

        {
          key: "operational",
          label: "Operational Value",
          components: PRESETS.operational,
        },

        {
          key: "complete",
          label: "Complete Business Value",
          components: PRESETS.complete,
        },

        {
          key: "custom",
          label: "Custom",
          components: AVAILABLE_COMPONENTS,
        },
      ],

      components: [
        {
          key: "inventory",
          label: "Inventory",
          effect: "positive",
          defaultIncluded: true,
        },

        {
          key: "assets",
          label: "Business Assets",
          effect: "positive",
          defaultIncluded: true,
        },

        {
          key: "cash",
          label: "Cash",
          effect: "positive",
          defaultIncluded: true,
        },

        {
          key: "bank",
          label: "Bank / Online / Cheque",
          effect: "positive",
          defaultIncluded: true,
        },

        {
          key: "receivables",
          label: "Receivables",
          effect: "positive",
          defaultIncluded: true,
        },

        {
          key: "payables",
          label: "Payables",
          effect: "negative",
          defaultIncluded: true,
        },

        {
          key: "liabilities",
          label: "Business Liabilities",
          effect: "negative",
          defaultIncluded: true,
        },
      ],
    });
  } catch (error) {
    console.error("Get Business Value Options Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load business value options.",
      error: error.message,
    });
  }
};
