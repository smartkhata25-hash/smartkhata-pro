const buildBillWiseAgingPrintData = require("../services/billWiseAgingPrintBuilder");
const { ENTITY_TYPES, getBillWiseReceivableAging } = require("../services/billWiseAgingService");
const { generatePdfFromHtml } = require("../services/pdfService");
const generateBillWiseAgingLedgerHTML = require("../templates/billWiseAgingLedgerTemplate");

const getUserId = (req) => req.user?.id || req.userId;

const buildPrintDocument = async (req, entityType) => {
  const entityId =
    entityType === ENTITY_TYPES.CUSTOMER ? req.params.customerId : req.params.partyId;

  const agingData = await getBillWiseReceivableAging({
    entityType,
    entityId,
    userId: getUserId(req),
    asOfDate: req.query.asOfDate,
  });

  return buildBillWiseAgingPrintData({
    agingData,
    lang: req.query.lang === "ur" ? "ur" : "en",
  });
};

const sendHtml = async (req, res, entityType) => {
  try {
    const built = await buildPrintDocument(req, entityType);
    const html = generateBillWiseAgingLedgerHTML(built, req.query.size || "A4");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    return res.status(error.statusCode || 500).send(
      error.message || "Bill-wise aging HTML generation failed",
    );
  }
};

const sendPdf = async (req, res, entityType) => {
  try {
    const built = await buildPrintDocument(req, entityType);
    const html = generateBillWiseAgingLedgerHTML(built, req.query.size || "A4");
    const pdfBuffer = await generatePdfFromHtml(html);
    const entityName = String(built.entity?.name || built.entityType || "aging")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${entityName || "Aging"}-Aging-Ledger.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Bill-wise aging PDF generation failed",
    });
  }
};

const getCustomerBillWiseAgingHtml = (req, res) =>
  sendHtml(req, res, ENTITY_TYPES.CUSTOMER);

const generateCustomerBillWiseAgingPdf = (req, res) =>
  sendPdf(req, res, ENTITY_TYPES.CUSTOMER);

const getPartyBillWiseAgingHtml = (req, res) =>
  sendHtml(req, res, ENTITY_TYPES.PARTY);

const generatePartyBillWiseAgingPdf = (req, res) =>
  sendPdf(req, res, ENTITY_TYPES.PARTY);

module.exports = {
  getCustomerBillWiseAgingHtml,
  generateCustomerBillWiseAgingPdf,
  getPartyBillWiseAgingHtml,
  generatePartyBillWiseAgingPdf,
};
