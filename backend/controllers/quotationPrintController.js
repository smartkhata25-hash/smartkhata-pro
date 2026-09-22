const PrintSetting = require("../models/PrintSetting");
const Quotation = require("../models/Quotation");
const { defaultSettings } = require("./printSettingController");
const { buildQuotationPrint } = require("../services/printBuilder");
const { generatePdfFromHtml } = require("../services/pdfService");
const generateSaleInvoiceHTML = require("../templates/saleInvoiceTemplate");

const getUserId = (req) => req.user?.id || req.userId;

const loadPrintSetting = async (userId) => {
  let printSetting = await PrintSetting.findOne({ userId });
  if (!printSetting || !printSetting.sales) {
    const defaults = await defaultSettings(userId);
    if (!printSetting) printSetting = await PrintSetting.create(defaults);
    else {
      Object.assign(printSetting, defaults);
      await printSetting.save();
    }
  }
  return printSetting;
};

const buildHtml = async (req, isPdf = false) => {
  const userId = getUserId(req);
  const quotation = await Quotation.findOne({ _id: req.params.id, createdBy: userId }).lean();
  if (!quotation) return null;
  const printSetting = await loadPrintSetting(userId);
  const built = buildQuotationPrint(quotation, printSetting);
  built.lang = req.query.lang === "ur" ? "ur" : quotation.lang || "en";
  built.page = { ...built.page, isPdf };
  return { quotation, html: generateSaleInvoiceHTML(built) };
};

exports.getQuotationHtml = async (req, res) => {
  try {
    const result = await buildHtml(req, false);
    if (!result) return res.status(404).send("Quotation not found");
    res.set({ "Content-Type": "text/html" });
    return res.send(result.html);
  } catch (error) {
    console.error("Quotation HTML error:", error);
    return res.status(500).send("Could not generate quotation preview");
  }
};

exports.generateQuotationPdf = async (req, res) => {
  try {
    const result = await buildHtml(req, true);
    if (!result) return res.status(404).json({ message: "Quotation not found." });
    const pdfBuffer = await generatePdfFromHtml(result.html);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Quotation-${result.quotation.quotationNo}.pdf`,
      "Content-Length": pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Quotation PDF error:", error);
    return res.status(500).json({ message: "Could not generate quotation PDF." });
  }
};
