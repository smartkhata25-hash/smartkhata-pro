const mongoose = require("mongoose");

const {
  AVAILABLE_COMPONENTS,
  PRESETS,
  TRAVEL_AVAILABLE_COMPONENTS,
  TRAVEL_PRESETS,
  getBusinessValueSummary,
} = require("../services/businessValueService");
const {
  getControllerStatusCode,
  requireBusinessValueModuleScope,
} = require("../utils/businessValueModuleScope");
const { MODULE_SCOPES } = require("../utils/moduleScope");

const COMPONENT_OPTIONS = Object.freeze({
  inventory: {
    key: "inventory",
    label: "Inventory",
    effect: "positive",
    defaultIncluded: true,
  },

  assets: {
    key: "assets",
    label: "Business Assets",
    effect: "positive",
    defaultIncluded: true,
  },

  cash: {
    key: "cash",
    label: "Cash",
    effect: "positive",
    defaultIncluded: true,
  },

  bank: {
    key: "bank",
    label: "Bank / Online / Cheque",
    effect: "positive",
    defaultIncluded: true,
  },

  receivables: {
    key: "receivables",
    label: "Receivables",
    effect: "positive",
    defaultIncluded: true,
  },

  loan_receivables: {
    key: "loan_receivables",
    label: "Loans / Advances Given",
    effect: "positive",
    defaultIncluded: true,
  },

  payables: {
    key: "payables",
    label: "Payables",
    effect: "negative",
    defaultIncluded: true,
  },

  liabilities: {
    key: "liabilities",
    label: "Business Liabilities",
    effect: "negative",
    defaultIncluded: true,
  },
});

const getOptionsForScope = (moduleScope) => {
  const presets = moduleScope === MODULE_SCOPES.TRAVEL ? TRAVEL_PRESETS : PRESETS;
  const components =
    moduleScope === MODULE_SCOPES.TRAVEL
      ? TRAVEL_AVAILABLE_COMPONENTS
      : AVAILABLE_COMPONENTS;

  return {
    presets,
    components,
  };
};

exports.getBusinessValue = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const moduleScope = requireBusinessValueModuleScope(req);

    const { preset = "complete", components = "" } = req.query;

    const summary = await getBusinessValueSummary({
      userId,
      preset,
      components,
      moduleScope,
    });

    res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("Get Business Value Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to calculate business value.",
      error: error.message,
    });
  }
};

exports.getBusinessValueOptions = async (req, res) => {
  try {
    const moduleScope = requireBusinessValueModuleScope(req);
    const scopeOptions = getOptionsForScope(moduleScope);

    res.json({
      success: true,
      moduleScope,

      presets: [
        {
          key: "stock_assets",
          label: "Stock & Assets",
          components: scopeOptions.presets.stock_assets,
        },

        {
          key: "operational",
          label: "Operational Value",
          components: scopeOptions.presets.operational,
        },

        {
          key: "complete",
          label: "Complete Business Value",
          components: scopeOptions.presets.complete,
        },

        {
          key: "custom",
          label: "Custom",
          components: scopeOptions.components,
        },
      ],

      components: scopeOptions.components.map(
        (component) => COMPONENT_OPTIONS[component],
      ),
    });
  } catch (error) {
    console.error("Get Business Value Options Error:", error);
    const statusCode = getControllerStatusCode(error);

    res.status(statusCode).json({
      success: false,
      message: "Failed to load business value options.",
      error: error.message,
    });
  }
};
