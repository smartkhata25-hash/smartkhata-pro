const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("../controllers/printSettingController");
const { getFileUrl } = require("./r2FileService");

const getDocumentTypeForScope = (moduleScope) =>
  String(moduleScope || "").toLowerCase() === "travel"
    ? "travelInvoice"
    : "sales";

const resolveLedgerPrintHeader = (printSetting, moduleScope = "trading") => {
  const type = getDocumentTypeForScope(moduleScope);
  const documentSetting = printSetting?.[type] || {};
  const settings = documentSetting.settings || {};
  const header = documentSetting.header || {};

  if (settings.showHeader === false) return null;

  return {
    companyName: header.companyName || "",
    phone: header.showCompanyPhone === false ? "" : header.phone || "",
    address: header.showCompanyAddress === false ? "" : header.address || "",
    logoUrl:
      header.showLogo === true && header.logoKey
        ? getFileUrl(header.logoKey)
        : "",
  };
};

const getLedgerPrintHeader = async (userId, moduleScope = "trading") => {
  const existing = await PrintSetting.findOne({ userId }).lean();
  const type = getDocumentTypeForScope(moduleScope);
  const printSetting = existing?.[type]
    ? existing
    : await defaultSettings(userId);

  return resolveLedgerPrintHeader(printSetting, moduleScope);
};

module.exports = {
  getDocumentTypeForScope,
  getLedgerPrintHeader,
  resolveLedgerPrintHeader,
};
