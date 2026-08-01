const ReceivePayment = require("../models/ReceivePayment");
const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const PrintSetting = require("../models/PrintSetting");

const {
  buildReceivePaymentPrint,
} = require("../services/receivePaymentPrintBuilder");

const generateReceivePaymentHTML = require("../templates/receivePaymentTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   HELPER: GET PAYMENT ENTRIES FROM JOURNAL
========================================================= */

const getPaymentEntries = async (paymentId, userId = null) => {
  if (!paymentId) return [];

  const filter = {
    referenceId: paymentId,
    sourceType: "receive_payment",
    isDeleted: false,
  };

  if (userId) {
    filter.createdBy = userId;
  }

  const journal = await JournalEntry.findOne(filter)
    .sort({ createdAt: -1 })
    .populate("lines.account", "name");

  if (!journal || !journal.lines?.length) return [];

  return journal.lines
    .filter((line) => line.type === "debit")
    .map((line) => ({
      account: line.account,
      amount: line.amount,
      paymentType: line.paymentType,
    }));
};

/* =========================================================
   HELPER: CALCULATE CUSTOMER PREVIOUS BALANCE
========================================================= */

const Customer = require("../models/Customer");
const Party = require("../models/Party");

const calculatePreviousBalance = async ({
  customerId = null,
  partyId = null,
  paymentDate = null,
  paymentCreatedAt = null,
  paymentId = null,
  userId = null,
}) => {
  if (!customerId && !partyId) return 0;

  let accountId = null;

  if (partyId) {
    const partyData = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
    }).populate("account");

    accountId = partyData?.account?._id || null;
  } else {
    const customerData = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
    }).populate("account");

    accountId = customerData?.account?._id || null;
  }

  if (!accountId) return 0;

  const filter = {
    "lines.account": accountId,
    isDeleted: false,
    sourceType: { $ne: "reversal" },
  };

  if (userId) {
    filter.createdBy = new mongoose.Types.ObjectId(userId);
  }

  // موجودہ Receive Payment کو Balance میں دوبارہ شامل نہ کریں
  if (paymentId) {
    filter.referenceId = {
      $ne: new mongoose.Types.ObjectId(paymentId),
    };
  }

  // Payment سے پہلے والی Entries ہی شامل ہوں
  if (paymentDate) {
    filter.$or = [
      {
        date: { $lt: paymentDate },
      },
      {
        date: paymentDate,
        createdAt: {
          $lt: paymentCreatedAt || new Date(),
        },
      },
    ];
  }

  const journals = await JournalEntry.find(filter).select("lines");

  let debit = 0;
  let credit = 0;

  journals.forEach((journal) => {
    journal.lines.forEach((line) => {
      if (String(line.account) === String(accountId)) {
        if (line.type === "debit") {
          debit += Number(line.amount || 0);
        }

        if (line.type === "credit") {
          credit += Number(line.amount || 0);
        }
      }
    });
  });

  return debit - credit;
};

/* =========================================================
   BUILD RECEIPT DATA (SHARED ENGINE)
========================================================= */

const buildReceiptData = async (payment, size = "standard", userId = null) => {
  let company = {};

  if (userId) {
    const printSetting = await PrintSetting.findOne({ userId });

    if (printSetting?.sales?.header) {
      company = {
        companyName: printSetting.sales.header.companyName || "",
        address: printSetting.sales.header.showCompanyAddress
          ? printSetting.sales.header.address || ""
          : "",
        phone: printSetting.sales.header.showCompanyPhone
          ? printSetting.sales.header.phone || ""
          : "",
        taxNumber: printSetting.sales.header.showTaxNumber
          ? printSetting.sales.header.taxNumber || ""
          : "",
        showLogo: printSetting.sales.header.showLogo || false,
      };
    }
  }

  if (!payment) {
    return buildReceivePaymentPrint({}, [], {
      company,
      pageWidth: size,
      previousBalance: 0,
    });
  }

  const paymentObject = payment.toObject ? payment.toObject() : payment;

  const paymentEntries = await getPaymentEntries(paymentObject._id, userId);

  const customerId =
    paymentObject.customer?._id || paymentObject.customer || null;

  const partyId = paymentObject.partyId?._id || paymentObject.partyId || null;

  let previousBalance;

  // نئی Payments میں محفوظ Snapshot استعمال ہوگا
  if (
    paymentObject.previousBalance !== null &&
    paymentObject.previousBalance !== undefined
  ) {
    previousBalance = Number(paymentObject.previousBalance || 0);
  } else {
    // صرف پرانے records کے لیے fallback
    previousBalance = await calculatePreviousBalance({
      customerId,
      partyId,
      paymentDate: paymentObject.date,
      paymentCreatedAt: paymentObject.createdAt,
      paymentId: paymentObject._id,
      userId,
    });
  }

  const normalizedPayment = {
    ...paymentObject,
    customer: partyId ? paymentObject.partyId : paymentObject.customer,
  };

  return buildReceivePaymentPrint(normalizedPayment, paymentEntries, {
    company,
    pageWidth: size,
    previousBalance,
  });
};

const getReceivePaymentHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;
    const size = req.query.size || "standard";
    const lang = req.query.lang || "en";

    const payment = await ReceivePayment.findOne({
      _id: id,
      userId,
      isDeleted: false,
    })
      .populate("customer", "name phone account")
      .populate("partyId", "name phone account");

    if (!payment) {
      return res.status(404).send("Receive payment not found");
    }

    const built = await buildReceiptData(payment, size, userId);

    built.lang = lang;

    const html = generateReceivePaymentHTML(built);

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Receive Payment HTML Error:", error);

    return res.status(500).send("Failed to generate receipt HTML");
  }
};
/* =========================================================
   GENERATE RECEIVE PAYMENT PDF
========================================================= */

const generateReceivePaymentPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;
    const size = req.query.size || "standard";
    const lang = req.query.lang || "en";

    const payment = await ReceivePayment.findOne({
      _id: id,
      userId,
      isDeleted: false,
    })
      .populate("customer", "name phone account")
      .populate("partyId", "name phone account");

    if (!payment) {
      return res.status(404).json({
        message: "Receive payment not found",
      });
    }

    const built = await buildReceiptData(payment, size, userId);

    built.lang = lang;

    const html = generateReceivePaymentHTML({
      ...built,
      page: {
        ...built.page,
        isPdf: true,
      },
    });

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Receipt-${built?.documentInfo?.receiptNo || "receipt"}.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Receive Payment PDF Error:", error);

    return res.status(500).json({
      message: "PDF generation failed",
    });
  }
};
/* =========================================================
   PREVIEW RECEIVE PAYMENT (UNSAVED FORM) - HTML
========================================================= */

const previewReceivePaymentHtml = async (req, res) => {
  try {
    const size = req.query.size || "standard";
    const raw = req.query.data;

    if (!raw) {
      return res.status(400).send("Preview data missing");
    }

    const parsed = JSON.parse(decodeURIComponent(raw));

    const payment = {
      date: parsed.date,
      time: parsed.time,
      billNo: parsed.billNo,
      description: parsed.description,
      amount: parsed.paymentEntries?.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0,
      ),
      discountAmount: Number(parsed.discountAmount || 0),

      customer: {
        name: parsed.customerName || "",
        phone: parsed.customerPhone || "",
      },
    };

    const paymentEntries = parsed.paymentEntries || [];

    const userId = req.user?.id || req.userId || parsed.userId;

    const previousBalance =
      parsed.previousBalance !== undefined
        ? Number(parsed.previousBalance || 0)
        : await calculatePreviousBalance({
            customerId: parsed.customer || null,
            partyId: parsed.partyId || null,
            paymentDate: parsed.date,
            userId,
          });

    const printSetting = await PrintSetting.findOne({
      userId,
    });

    const company = printSetting?.sales?.header
      ? {
          companyName: printSetting.sales.header.companyName || "",
          address: printSetting.sales.header.showCompanyAddress
            ? printSetting.sales.header.address || ""
            : "",
          phone: printSetting.sales.header.showCompanyPhone
            ? printSetting.sales.header.phone || ""
            : "",
          taxNumber: printSetting.sales.header.showTaxNumber
            ? printSetting.sales.header.taxNumber || ""
            : "",
          showLogo: printSetting.sales.header.showLogo || false,
        }
      : {};

    const built = buildReceivePaymentPrint(payment, paymentEntries, {
      company,
      pageWidth: size,
      previousBalance: previousBalance,
    });
    built.lang = parsed.lang;
    const html = generateReceivePaymentHTML(built);

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Preview HTML Error:", error);

    return res.status(500).send("Preview generation failed");
  }
};

/* =========================================================
   PREVIEW RECEIVE PAYMENT (UNSAVED FORM) - PDF
========================================================= */

const previewReceivePaymentPdf = async (req, res) => {
  try {
    const size = req.query.size || "standard";
    const raw = req.query.data;

    if (!raw) {
      return res.status(400).json({
        message: "Preview data missing",
      });
    }

    const parsed = JSON.parse(decodeURIComponent(raw));

    const payment = {
      date: parsed.date,
      time: parsed.time,
      billNo: parsed.billNo,
      description: parsed.description,
      amount: parsed.paymentEntries?.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0,
      ),

      discountAmount: Number(parsed.discountAmount || 0),

      customer: {
        name: parsed.customerName || "",
        phone: parsed.customerPhone || "",
      },
    };

    const paymentEntries = parsed.paymentEntries || [];

    const userId = req.user?.id || req.userId || parsed.userId;

    const previousBalance =
      parsed.previousBalance !== undefined
        ? Number(parsed.previousBalance || 0)
        : await calculatePreviousBalance({
            customerId: parsed.customer || null,
            partyId: parsed.partyId || null,
            paymentDate: parsed.date,
            userId,
          });

    const printSetting = await PrintSetting.findOne({
      userId,
    });

    const company = printSetting?.sales?.header
      ? {
          companyName: printSetting.sales.header.companyName || "",
          address: printSetting.sales.header.showCompanyAddress
            ? printSetting.sales.header.address || ""
            : "",
          phone: printSetting.sales.header.showCompanyPhone
            ? printSetting.sales.header.phone || ""
            : "",
          taxNumber: printSetting.sales.header.showTaxNumber
            ? printSetting.sales.header.taxNumber || ""
            : "",
          showLogo: printSetting.sales.header.showLogo || false,
        }
      : {};

    const built = buildReceivePaymentPrint(payment, paymentEntries, {
      company,
      pageWidth: size,
      previousBalance: previousBalance,
    });

    built.lang = parsed.lang;

    const html = generateReceivePaymentHTML({
      ...built,
      page: {
        ...built.page,
        isPdf: true,
      },
    });

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Preview-Receipt.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Preview PDF Error FULL:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      message: "Preview PDF failed",
    });
  }
};
/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  getReceivePaymentHtml,
  generateReceivePaymentPdf,
  previewReceivePaymentHtml,
  previewReceivePaymentPdf,
};
