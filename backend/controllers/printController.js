const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");
const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("./printSettingController");

const {
  buildSaleInvoicePrint,
  buildSaleReturnPrint,
} = require("../services/printBuilder");
const { generatePdfFromHtml } = require("../services/pdfService");
const generateSaleInvoiceHTML = require("../templates/saleInvoiceTemplate");

/* =========================================================
   ✅ GET SALE INVOICE PRINT DATA
========================================================= */
const getSaleInvoicePrint = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      createdBy: userId,
      isDeleted: false,
    }).populate("items.productId", "name");

    if (!invoice) {
      return res.status(404).json({
        message: "Sale invoice not found",
      });
    }

    let printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting || !printSetting.sales) {
      const defaults = await defaultSettings(userId);

      if (!printSetting) {
        printSetting = await PrintSetting.create(defaults);
      } else {
        Object.assign(printSetting, defaults);
        await printSetting.save();
      }
    }

    const formattedData = buildSaleInvoicePrint(invoice, printSetting);

    return res.json(formattedData);
  } catch (error) {
    console.error("❌ Sale Print Error:", error);
    return res.status(500).json({
      message: "Failed to generate sale print data",
    });
  }
};

/* =========================================================
   ✅ GET SALE RETURN PRINT DATA
========================================================= */
const getSaleReturnPrint = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const refund = await RefundInvoice.findOne({
      _id: id,
      createdBy: userId,
    }).populate("items.productId", "name");

    if (!refund) {
      return res.status(404).json({
        message: "Sale return not found",
      });
    }

    let printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting) {
      return res.status(400).json({
        message: "Print settings not found",
      });
    }

    const formattedData = buildSaleReturnPrint(refund, printSetting);

    return res.json(formattedData);
  } catch (error) {
    console.error("❌ Sale Return Print Error:", error);
    return res.status(500).json({
      message: "Failed to generate sale return print data",
    });
  }
};

/* =========================================================
   ✅ SALE PREVIEW
========================================================= */
const salePreview = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const invoice = req.body;

    let printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting || !printSetting.sales) {
      const defaults = await defaultSettings(userId);

      if (!printSetting) {
        printSetting = await PrintSetting.create(defaults);
      } else {
        Object.assign(printSetting, defaults);
        await printSetting.save();
      }
    }

    const built = buildSaleInvoicePrint(invoice, printSetting);

    const html = generateSaleInvoiceHTML(built);

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (err) {
    console.error("❌ Preview HTML Error:", err);
    return res.status(500).send("Preview failed");
  }
};
/* =========================================================
   ✅ SALE RETURN PREVIEW
========================================================= */
const saleReturnPreview = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const refund = req.body;

    const printSetting = await PrintSetting.findOne({ userId: String(userId) });

    if (!printSetting || !printSetting.saleReturn) {
      console.error("❌ PrintSetting missing for user:", userId);
      return res.status(400).send("Print settings not found");
    }

    const built = buildSaleReturnPrint(refund, printSetting);

    const html = generateSaleInvoiceHTML(built);

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (err) {
    console.error("❌ Sale Return Preview Error:", err);
    return res.status(500).send("Preview failed");
  }
};

/* =========================================================
   ✅ GENERATE SALE PDF
========================================================= */
const generateSalePdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = req.body;

    let printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting) {
      return res.status(400).json({
        message: "Print settings not found",
      });
    }

    const built = buildSaleInvoicePrint(invoice, printSetting);

    const html = generateSaleInvoiceHTML(built);

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Invoice-${built.documentInfo.billNo}.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ PDF Error:", err);
    res.status(500).json({ message: "PDF generation failed" });
  }
};

/* =========================================================
   ✅ GENERATE SALE RETURN PDF
========================================================= */
const generateSaleReturnPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const refund = req.body;

    const printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting) {
      return res.status(400).json({
        message: "Print settings not found",
      });
    }

    const built = buildSaleReturnPrint(refund, printSetting);

    const html = generateSaleInvoiceHTML(built);

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=SaleReturn-${built.documentInfo.billNo}.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Sale Return PDF Error:", err);
    res.status(500).json({ message: "PDF generation failed" });
  }
};
/* =========================================================
   ✅ GET SALE INVOICE HTML (MASTER PRINT ENGINE)
========================================================= */
const getSaleInvoiceHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      createdBy: userId,
      isDeleted: false,
    }).populate("items.productId", "name");

    if (!invoice) {
      return res.status(404).send("Sale invoice not found");
    }

    let printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting) {
      return res.status(400).send("Print settings not found");
    }

    const built = buildSaleInvoicePrint(invoice, printSetting);

    const html = generateSaleInvoiceHTML(built);

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Sale HTML Print Error:", error);
    return res.status(500).send("Failed to generate sale invoice HTML");
  }
};

/* =========================================================
   ✅ GET SALE RETURN HTML
========================================================= */
const getSaleReturnHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const refund = await RefundInvoice.findOne({
      _id: id,
      createdBy: userId,
    }).populate("items.productId", "name");

    if (!refund) {
      return res.status(404).send("Sale return not found");
    }

    const printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting) {
      return res.status(400).send("Print settings not found");
    }

    const built = buildSaleReturnPrint(refund, printSetting);

    const html = generateSaleInvoiceHTML(built);

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (error) {
    console.error("❌ Sale Return HTML Error:", error);
    return res.status(500).send("Failed to generate sale return HTML");
  }
};
/* =========================================================
   ✅ PREVIEW SETTINGS HTML (LIVE SETTINGS PREVIEW)
========================================================= */
const generatePreviewSettingsHtml = async (req, res) => {
  try {
    const { type, settings } = req.body;

    if (!type || !settings) {
      return res.status(400).send("Invalid preview data");
    }

    const previewInvoice = {
      invoiceDate: new Date(),
      invoiceTime: new Date().toLocaleTimeString(),
      billNo: "PREVIEW",
      customerName: "Preview Customer",
      customerPhone: "03000000000",
      by: "Admin User",
      items: [
        {
          productId: null,
          name: "Product A",
          description: "Sample Description",
          uom: "PCS",
          quantity: 2,
          price: 500,
          total: 1000,
        },
        {
          productId: null,
          name: "Product B",
          description: "Another Item",
          uom: "PCS",
          quantity: 1,
          price: 700,
          total: 700,
        },
      ],
      totalAmount: 1700,
      discountAmount: 100,
      grandTotal: 1600,
      paidAmount: 500,
      paymentType: "cash",
    };

    const previewPrintSetting = {
      [type]: {
        header: settings.header || {},
        settings: settings.settings || {},
        layout: settings.layout || {},
      },
    };

    let built;

    if (type === "sales") {
      built = buildSaleInvoicePrint(previewInvoice, previewPrintSetting);
    } else if (type === "saleReturn") {
      built = buildSaleReturnPrint(previewInvoice, previewPrintSetting);
    } else {
      return res.status(400).send("Unsupported preview type");
    }

    const html = generateSaleInvoiceHTML(built);

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (error) {
    console.error("❌ Preview Settings HTML Error:", error);
    return res.status(500).send("Preview generation failed");
  }
};

module.exports = {
  getSaleInvoicePrint,
  getSaleReturnPrint,
  salePreview,
  saleReturnPreview,
  generateSalePdf,
  getSaleInvoiceHtml,
  generatePreviewSettingsHtml,
  getSaleReturnHtml,
  generateSaleReturnPdf,
};
