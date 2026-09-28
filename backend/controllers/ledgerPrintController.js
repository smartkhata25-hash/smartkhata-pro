const {
  getCustomerLedgerCore,
} = require("../services/customerLedgerCoreService");
const buildCustomerLedgerPrint = require("../services/ledgerPrintBuilder");
const generateCustomerLedgerHTML = require("../templates/customerLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");
const { getLedgerPrintHeader } = require("../services/ledgerPrintHeaderService");

const getUserId = (req) => req.user?.id || req.userId;

const buildCustomerLedgerDocument = async (req, outputType = "print") => {
  const { customerId } = req.params;
  const { startDate, endDate, lang, moduleScope = "" } = req.query;

  const rawData = await getCustomerLedgerCore({
    customerId,
    userId: getUserId(req),
    startDate,
    endDate,
    moduleScope,
  });
  const header = await getLedgerPrintHeader(
    getUserId(req),
    moduleScope,
    outputType,
  );

  const built = buildCustomerLedgerPrint({
    customerName: rawData.customerName,
    startDate,
    endDate,
    openingBalance: rawData.openingBalance,
    ledger: rawData.ledger,
    header,
    showDescription: moduleScope === "travel",
  });

  built.lang = lang || "ur";

  return built;
};

const getCustomerLedgerHtml = async (req, res) => {
  try {
    const built = await buildCustomerLedgerDocument(req, "print");
    const html = generateCustomerLedgerHTML(built, req.query.size || "A5");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    console.error("Ledger HTML Error:", error.message);

    return res.status(error.statusCode || 500).send("Failed to generate ledger HTML");
  }
};

const generateCustomerLedgerPdf = async (req, res) => {
  try {
    const built = await buildCustomerLedgerDocument(req, "pdf");
    const html = generateCustomerLedgerHTML(built, req.query.size || "A5");
    const pdfBuffer = await generatePdfFromHtml(html, {
      waitForImages: req.query.moduleScope === "travel",
      requireImages: req.query.moduleScope === "travel",
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Customer-Ledger.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Ledger PDF Error:", error.message);

    return res.status(error.statusCode || 500).json({
      message: "Ledger PDF generation failed",
    });
  }
};

module.exports = {
  getCustomerLedgerHtml,
  generateCustomerLedgerPdf,
};
