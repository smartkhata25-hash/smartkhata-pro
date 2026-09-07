const PurchaseInvoice = require("../models/PurchaseInvoice");
const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("./printSettingController");
const { buildPurchaseInvoicePrint } = require("../services/printBuilder");
const { generatePdfFromHtml } = require("../services/pdfService");
const generateSaleInvoiceHTML = require("../templates/saleInvoiceTemplate");

const safeFileName = (value, fallback) =>
  String(value || fallback || "PurchaseInvoice")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const normalizePreviewInvoice = (body = {}) => ({
  ...body,
  supplierName: body.supplierName || body.customerName || "-",
  supplierPhone: body.supplierPhone || body.customerPhone || "",
  items: Array.isArray(body.items) ? body.items : [],
});

const getPurchasePrintSetting = async (userId) => {
  let printSetting = await PrintSetting.findOne({ userId });

  if (!printSetting || !printSetting.purchase) {
    const defaults = await defaultSettings(userId);

    if (!printSetting) {
      printSetting = await PrintSetting.create(defaults);
    } else {
      printSetting.purchase = defaults.purchase;
      await printSetting.save();
    }
  }

  return printSetting;
};

const buildPurchaseHtml = async ({ userId, invoice, lang, isPdf = false }) => {
  const printSetting = await getPurchasePrintSetting(userId);
  const built = buildPurchaseInvoicePrint(invoice, printSetting);

  built.lang = lang || "en";

  if (isPdf) {
    built.page = {
      ...built.page,
      isPdf: true,
    };
  }

  return {
    built,
    html: generateSaleInvoiceHTML(built),
  };
};

const sendHtml = (res, html) => {
  res.set({
    "Content-Type": "text/html; charset=utf-8",
  });

  return res.send(html);
};

const sendPdf = async (res, html, fileName) => {
  const pdfBuffer = await generatePdfFromHtml(html);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=${fileName}`,
    "Content-Length": pdfBuffer.length,
  });

  return res.send(pdfBuffer);
};

const getPurchasePreviewHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = normalizePreviewInvoice(req.body);
    const { html } = await buildPurchaseHtml({
      userId,
      invoice,
      lang: invoice.lang || req.query.lang || "en",
    });

    return sendHtml(res, html);
  } catch (error) {
    console.error("Purchase preview print error:", error);
    return res.status(500).send("Purchase preview failed");
  }
};

const generatePurchasePreviewPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = normalizePreviewInvoice(req.body);
    const { built, html } = await buildPurchaseHtml({
      userId,
      invoice,
      lang: invoice.lang || req.query.lang || "en",
      isPdf: true,
    });
    const billNo = safeFileName(built.documentInfo?.billNo, "Preview");

    return sendPdf(res, html, `PurchaseInvoice-${billNo}.pdf`);
  } catch (error) {
    console.error("Purchase preview PDF error:", error);
    return res.status(500).json({
      message: "Purchase PDF generation failed",
    });
  }
};

const getSavedPurchaseInvoice = async (req) => {
  const userId = req.user?.id || req.userId;

  return PurchaseInvoice.findOne({
    _id: req.params.id,
    userId,
    isDeleted: false,
  })
    .populate("items.productId", "name description unit uom")
    .lean();
};

const getPurchaseInvoiceHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await getSavedPurchaseInvoice(req);

    if (!invoice) {
      return res.status(404).send("Purchase invoice not found");
    }

    const { html } = await buildPurchaseHtml({
      userId,
      invoice,
      lang: req.query.lang || "en",
    });

    return sendHtml(res, html);
  } catch (error) {
    console.error("Saved purchase print error:", error);
    return res.status(500).send("Failed to generate purchase invoice HTML");
  }
};

const generateSavedPurchasePdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await getSavedPurchaseInvoice(req);

    if (!invoice) {
      return res.status(404).json({
        message: "Purchase invoice not found",
      });
    }

    const { built, html } = await buildPurchaseHtml({
      userId,
      invoice,
      lang: req.query.lang || "en",
      isPdf: true,
    });
    const billNo = safeFileName(built.documentInfo?.billNo, invoice._id);

    return sendPdf(res, html, `PurchaseInvoice-${billNo}.pdf`);
  } catch (error) {
    console.error("Saved purchase PDF error:", error);
    return res.status(500).json({
      message: "Purchase PDF generation failed",
    });
  }
};

module.exports = {
  getPurchasePreviewHtml,
  generatePurchasePreviewPdf,
  getPurchaseInvoiceHtml,
  generateSavedPurchasePdf,
};
