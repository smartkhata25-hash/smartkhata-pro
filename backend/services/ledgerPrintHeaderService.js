const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("../controllers/printSettingController");
const { getFileUrl } = require("./r2FileService");
const {
  OUTPUT_TYPES,
  isLogoEnabledForOutput,
  resolveTravelBranding,
} = require("./travel/travelBrandingService");

const getDocumentTypeForScope = (moduleScope) =>
  String(moduleScope || "").toLowerCase() === "travel"
    ? "travelInvoice"
    : "sales";

const resolveLedgerPrintHeader = (
  printSetting,
  moduleScope = "trading",
  outputType = OUTPUT_TYPES.PRINT,
) => {
  const type = getDocumentTypeForScope(moduleScope);
  const documentSetting = printSetting?.[type] || {};
  const settings = documentSetting.settings || {};
  const header = documentSetting.header || {};
  const isTravel = String(moduleScope || "").toLowerCase() === "travel";
  const logoEnabled = isLogoEnabledForOutput(header, outputType);
  const showBusinessDetails = settings.showHeader !== false;

  if (!showBusinessDetails && !(isTravel && logoEnabled)) return null;

  return {
    companyName: showBusinessDetails ? header.companyName || "" : "",
    phone:
      showBusinessDetails && header.showCompanyPhone !== false
        ? header.phone || ""
        : "",
    address:
      showBusinessDetails && header.showCompanyAddress !== false
        ? header.address || ""
        : "",
    taxNumber:
      isTravel && showBusinessDetails && header.showTaxNumber !== false
        ? header.taxNumber || ""
        : "",
    logoUrl: logoEnabled
      ? header.logoUrl || getFileUrl(header.logoKey)
      : "",
    logoRequired: isTravel && logoEnabled,
  };
};

const getLedgerPrintHeader = async (
  userId,
  moduleScope = "trading",
  outputType = OUTPUT_TYPES.PRINT,
) => {
  if (String(moduleScope || "").toLowerCase() === "travel") {
    const { printSetting } = await resolveTravelBranding({ userId, outputType });
    return resolveLedgerPrintHeader(printSetting, moduleScope, outputType);
  }

  const existing = await PrintSetting.findOne({ userId }).lean();
  const type = getDocumentTypeForScope(moduleScope);
  const printSetting = existing?.[type]
    ? existing
    : await defaultSettings(userId);

  return resolveLedgerPrintHeader(printSetting, moduleScope, outputType);
};

module.exports = {
  getDocumentTypeForScope,
  getLedgerPrintHeader,
  resolveLedgerPrintHeader,
};
