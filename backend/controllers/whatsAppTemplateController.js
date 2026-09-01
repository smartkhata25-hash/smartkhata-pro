const WhatsAppTemplate = require("../models/WhatsAppTemplate");

const VALID_MODULE_SCOPES = new Set(["trading", "travel"]);

const REQUIRED_TEMPLATE_VARIABLES = Object.freeze([
  "{{name}}",
  "{{balance}}",
  "{{businessName}}",
]);

const DEFAULT_REMINDER_TEMPLATES = Object.freeze({
  englishTemplate: `💰 PAYMENT REMINDER

Aslamoalaikum: {{name}},

Your Remaining balance is:
Rs {{balance}}

Please pay soon.

Sent by:
{{businessName}}`,
  urduTemplate: `💰 ادائیگی یاد دہانی

السلام علیکم

محترم {{name}}

آپ کا بقایا:
Rs {{balance}}

براہ کرم جلد ادائیگی کریں۔

بھیجنے والا:
{{businessName}}`,
});

const getUserId = (req) => req.user?.id || req.userId;

const normalizeModuleScope = (value) => {
  const moduleScope = String(value || "")
    .trim()
    .toLowerCase();

  return VALID_MODULE_SCOPES.has(moduleScope) ? moduleScope : "";
};

const normalizeTemplateText = (value, fallback) => {
  const text = String(value || "").trim();

  return text || fallback;
};

const getMissingTemplateVariables = (template = "") =>
  REQUIRED_TEMPLATE_VARIABLES.filter(
    (variable) => !String(template || "").includes(variable),
  );

const validateTemplateVariables = (englishTemplate, urduTemplate) => {
  const missingEnglish = getMissingTemplateVariables(englishTemplate);
  const missingUrdu = getMissingTemplateVariables(urduTemplate);

  if (missingEnglish.length === 0 && missingUrdu.length === 0) {
    return null;
  }

  return {
    message:
      "Name, balance and business name variables cannot be removed from the WhatsApp template.",
    missingVariables: {
      englishTemplate: missingEnglish,
      urduTemplate: missingUrdu,
    },
  };
};

const serializeTemplate = (template, moduleScope) => {
  const plain = template?.toObject ? template.toObject() : template || {};

  return {
    _id: plain._id || null,
    userId: plain.userId || null,
    moduleScope,
    englishTemplate:
      plain.englishTemplate || DEFAULT_REMINDER_TEMPLATES.englishTemplate,
    urduTemplate: plain.urduTemplate || DEFAULT_REMINDER_TEMPLATES.urduTemplate,
    updatedAt: plain.updatedAt || null,
    isDefault: !plain._id,
  };
};

exports.DEFAULT_REMINDER_TEMPLATES = DEFAULT_REMINDER_TEMPLATES;

exports.getWhatsAppTemplate = async (req, res) => {
  try {
    const userId = getUserId(req);

    const moduleScope = normalizeModuleScope(
      req.params.moduleScope || req.query.moduleScope,
    );

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!moduleScope) {
      return res.status(400).json({
        message: "Invalid module scope",
      });
    }

    const template = await WhatsAppTemplate.findOne({
      userId,
      moduleScope,
    }).lean();

    return res.json(serializeTemplate(template, moduleScope));
  } catch (error) {
    console.error("WhatsApp template fetch failed:", error);

    return res.status(500).json({
      message: "Failed to load WhatsApp template",
      ...DEFAULT_REMINDER_TEMPLATES,
    });
  }
};

exports.updateWhatsAppTemplate = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = normalizeModuleScope(req.params.moduleScope);

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!moduleScope) {
      return res.status(400).json({
        message: "Invalid module scope",
      });
    }

    const englishTemplate = normalizeTemplateText(
      req.body?.englishTemplate,
      DEFAULT_REMINDER_TEMPLATES.englishTemplate,
    );

    const urduTemplate = normalizeTemplateText(
      req.body?.urduTemplate,
      DEFAULT_REMINDER_TEMPLATES.urduTemplate,
    );

    const validationError = validateTemplateVariables(
      englishTemplate,
      urduTemplate,
    );

    if (validationError) {
      return res.status(400).json(validationError);
    }

    const template = await WhatsAppTemplate.findOneAndUpdate(
      {
        userId,
        moduleScope,
      },
      {
        $set: {
          englishTemplate,
          urduTemplate,
        },
        $setOnInsert: {
          userId,
          moduleScope,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json(serializeTemplate(template, moduleScope));
  } catch (error) {
    console.error("WhatsApp template update failed:", error);

    return res.status(500).json({
      message: "Failed to update WhatsApp template",
    });
  }
};
