const {
  enrichCustomerLedgerRows,
  getCustomerLedgerCore,
} = require("../services/customerLedgerCoreService");
const buildCustomerDetailLedgerPrint = require("../services/customerDetailLedgerPrintBuilder");
const generateCustomerDetailLedgerHTML = require("../templates/customerDetailLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

const getUserId = (req) => req.user?.id || req.userId;

const buildCustomerDetailLedgerDocument = async (req) => {
  const { customerId } = req.params;
  const { startDate, endDate, lang, moduleScope = "" } = req.query;

  const rawData = await getCustomerLedgerCore({
    customerId,
    userId: getUserId(req),
    startDate,
    endDate,
    moduleScope,
  });
  const ledger = await enrichCustomerLedgerRows({
    ledger: rawData.ledger,
    userId: getUserId(req),
  });

  const built = buildCustomerDetailLedgerPrint({
    customerName: rawData.customerName,
    startDate,
    endDate,
    openingBalance: rawData.openingBalance,
    ledger,
  });

  built.lang = lang || "ur";

  return built;
};

const getCustomerDetailLedgerHtml = async (req, res) => {
  try {
    const built = await buildCustomerDetailLedgerDocument(req);
    const html = generateCustomerDetailLedgerHTML(built, req.query.size || "A4");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    console.error("Detail Ledger HTML Error:", error.message);

    return res
      .status(error.statusCode || 500)
      .send("Failed to generate detailed ledger HTML");
  }
};

const generateCustomerDetailLedgerPdf = async (req, res) => {
  try {
    const built = await buildCustomerDetailLedgerDocument(req);
    const html = generateCustomerDetailLedgerHTML(built, req.query.size || "A4");
    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Customer-Detailed-Ledger.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Detail Ledger PDF Error:", error.message);

    return res.status(error.statusCode || 500).json({
      message: "Detailed ledger PDF generation failed",
    });
  }
};

module.exports = {
  getCustomerDetailLedgerHtml,
  generateCustomerDetailLedgerPdf,
};
