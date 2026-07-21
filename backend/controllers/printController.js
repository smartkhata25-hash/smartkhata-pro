const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");
const PrintSetting = require("../models/PrintSetting");
const { defaultSettings } = require("./printSettingController");
const Customer = require("../models/Customer");
const Party = require("../models/Party");
const Account = require("../models/Account");

const {
  buildSaleInvoicePrint,
  buildSaleReturnPrint,
} = require("../services/printBuilder");
const { generatePdfFromHtml } = require("../services/pdfService");
const generateSaleInvoiceHTML = require("../templates/saleInvoiceTemplate");

//CUSTOMER / PARTY CURRENT BALANCE FOR PRINT

const attachCustomerTotalBalance = async (document, userId) => {
  let accountId = null;

  if (document.partyId) {
    const partyId = document.partyId?._id || document.partyId;

    const party = await Party.findOne({
      _id: partyId,
      userId,
    }).select("account");

    accountId = party?.account;
  } else if (document.customerId) {
    const customerId = document.customerId?._id || document.customerId;

    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
    }).select("account");

    accountId = customer?.account?._id || customer?.account;
  }

  const plainDocument = document.toObject ? document.toObject() : document;

  if (!accountId) {
    return {
      ...plainDocument,
      customerTotalBalance: 0,
    };
  }

  const account = await Account.findById(accountId).select("balance");

  return {
    ...plainDocument,
    customerTotalBalance: Number(account?.balance || 0),
  };
};

// GET SALE INVOICE PRINT DATA

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

// GET SALE RETURN PRINT DATA

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

    const refundWithBalance = await attachCustomerTotalBalance(refund, userId);

    const formattedData = buildSaleReturnPrint(refundWithBalance, printSetting);

    return res.json(formattedData);
  } catch (error) {
    console.error("❌ Sale Return Print Error:", error);
    return res.status(500).json({
      message: "Failed to generate sale return print data",
    });
  }
};

// SALE PREVIEW

const salePreview = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const invoice = req.body;

    console.log("LANG RECEIVED:", invoice.lang);

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

    built.lang = invoice.lang;

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

// SALE RETURN PREVIEW

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
    built.lang = refund.lang || "en";
    const html = generateSaleInvoiceHTML(built);

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (err) {
    console.error("❌ Sale Return Preview Error:", err);
    return res.status(500).send("Preview failed");
  }
};

// GENERATE SALE PDF

const generateSalePdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const invoice = req.body;
    console.log("LANG RECEIVED:", invoice.lang);

    let printSetting = await PrintSetting.findOne({ userId });

    if (!printSetting) {
      return res.status(400).json({
        message: "Print settings not found",
      });
    }

    const built = buildSaleInvoicePrint(invoice, printSetting);

    built.lang = invoice.lang;

    built.page = {
      ...built.page,
      isPdf: true,
    };

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

// GENERATE SALE RETURN PDF

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

    built.lang = refund.lang || "en";

    built.page = {
      ...built.page,
      isPdf: true,
    };

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

// GET SALE INVOICE HTML (MASTER PRINT ENGINE)

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

    built.lang = req.query.lang || "en";

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

// GET SALE RETURN HTML

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

    const refundWithBalance = await attachCustomerTotalBalance(refund, userId);

    const built = buildSaleReturnPrint(refundWithBalance, printSetting);

    built.lang = req.query.lang || "en";

    const html = generateSaleInvoiceHTML(built);

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (error) {
    console.error("❌ Sale Return HTML Error:", error);
    return res.status(500).send("Failed to generate sale return HTML");
  }
};

// PREVIEW SETTINGS HTML (LIVE SETTINGS PREVIEW)

const generatePreviewSettingsHtml = async (req, res) => {
  try {
    const { type, settings, lang } = req.body;

    if (!type || !settings) {
      return res.status(400).send("Invalid preview data");
    }

    const previewInvoice = {
      lang: lang || "en",
      invoiceDate: new Date(),
      invoiceTime: new Date().toLocaleTimeString(),
      billNo: "PREVIEW",
      customerName: "Preview Customer",
      customerPhone: "03000000000",
      by: "Admin User",
      customerTotalBalance: 2500,
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

    built.lang = lang || "en";

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
