const PrintSetting = require("../../models/PrintSetting");
const { defaultSettings } = require("../../controllers/printSettingController");
const { getFileBuffer } = require("../r2FileService");

const OUTPUT_TYPES = Object.freeze({
  PRINT: "print",
  PDF: "pdf",
  PREVIEW: "preview",
});

const isLogoEnabledForOutput = (header = {}, outputType = OUTPUT_TYPES.PRINT) => {
  if (!header.logoKey) return false;

  if (outputType === OUTPUT_TYPES.PDF && typeof header.showLogoOnPdf === "boolean") {
    return header.showLogoOnPdf;
  }

  if (outputType === OUTPUT_TYPES.PRINT && typeof header.showLogoOnPrint === "boolean") {
    return header.showLogoOnPrint;
  }

  if (outputType === OUTPUT_TYPES.PREVIEW) {
    const printEnabled =
      typeof header.showLogoOnPrint === "boolean"
        ? header.showLogoOnPrint
        : header.showLogo === true;
    const pdfEnabled =
      typeof header.showLogoOnPdf === "boolean"
        ? header.showLogoOnPdf
        : header.showLogo === true;

    return printEnabled || pdfEnabled;
  }

  return header.showLogo === true;
};

const assertUserOwnedLogoKey = (logoKey, userId) => {
  const expectedPrefix = `users/${String(userId)}/print-logos/`;

  if (!String(logoKey || "").startsWith(expectedPrefix)) {
    const error = new Error("Travel logo does not belong to the authenticated user");
    error.statusCode = 403;
    throw error;
  }
};

const loadTravelPrintSetting = async (userId) => {
  const existing = await PrintSetting.findOne({ userId }).lean();
  const defaults = await defaultSettings(userId);

  return {
    ...defaults,
    ...(existing || {}),
    travelInvoice: existing?.travelInvoice || defaults.travelInvoice,
  };
};

const resolveTravelBranding = async ({
  userId,
  outputType = OUTPUT_TYPES.PRINT,
  printSetting,
  fileLoader = getFileBuffer,
}) => {
  const resolvedSetting = printSetting || (await loadTravelPrintSetting(userId));
  const documentSetting = resolvedSetting.travelInvoice || {};
  const header = documentSetting.header || {};
  const logoEnabled = isLogoEnabledForOutput(header, outputType);
  let logoDataUrl = "";

  if (logoEnabled) {
    assertUserOwnedLogoKey(header.logoKey, userId);

    try {
      const file = await fileLoader(header.logoKey);

      if (!file.mimeType.startsWith("image/") || !file.buffer.length) {
        throw new Error("Stored Travel logo is not a valid image");
      }

      logoDataUrl = `data:${file.mimeType};base64,${file.buffer.toString("base64")}`;
    } catch (cause) {
      const error = new Error(
        "Travel logo is enabled but could not be loaded. Please replace or remove it in Travel Settings.",
      );
      error.statusCode = 502;
      error.cause = cause;
      throw error;
    }
  }

  return {
    printSetting: {
      ...resolvedSetting,
      travelInvoice: {
        ...documentSetting,
        header: {
          ...header,
          logoUrl: logoDataUrl,
          showLogo: logoEnabled,
        },
      },
    },
    branding: {
      companyName: header.companyName || "",
      address: header.showCompanyAddress === false ? "" : header.address || "",
      phone: header.showCompanyPhone === false ? "" : header.phone || "",
      taxNumber: header.showTaxNumber === false ? "" : header.taxNumber || "",
      logoUrl: logoDataUrl,
      logoEnabled,
    },
  };
};

module.exports = {
  OUTPUT_TYPES,
  isLogoEnabledForOutput,
  loadTravelPrintSetting,
  resolveTravelBranding,
  _test: { assertUserOwnedLogoKey },
};
