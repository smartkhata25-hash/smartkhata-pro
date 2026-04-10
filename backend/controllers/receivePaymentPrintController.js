const ReceivePayment = require("../models/ReceivePayment");
const JournalEntry = require("../models/JournalEntry");

const {
  buildReceivePaymentPrint,
} = require("../services/receivePaymentPrintBuilder");

const generateReceivePaymentHTML = require("../templates/receivePaymentTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   HELPER: GET PAYMENT ENTRIES FROM JOURNAL
========================================================= */

const getPaymentEntries = async (paymentId) => {
  if (!paymentId) return [];

  const journal = await JournalEntry.findOne({
    referenceId: paymentId,
    sourceType: "receive_payment",
  }).populate("lines.account", "name");

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

const calculatePreviousBalance = async (customerId, paymentDate) => {
  if (!customerId) return 0;

  const customerData = await Customer.findById(customerId).populate("account");

  if (!customerData?.account) return 0;

  const customerAccountId = customerData.account._id;

  const journals = await JournalEntry.find({
    date: { $lt: paymentDate || new Date() },
    "lines.account": customerAccountId,
  });

  let debit = 0;
  let credit = 0;

  journals.forEach((journal) => {
    journal.lines.forEach((line) => {
      if (String(line.account) === String(customerAccountId)) {
        if (line.type === "debit") debit += Number(line.amount || 0);
        if (line.type === "credit") credit += Number(line.amount || 0);
      }
    });
  });

  return debit - credit;
};

/* =========================================================
   BUILD RECEIPT DATA (SHARED ENGINE)
========================================================= */

const buildReceiptData = async (payment, size = "standard") => {
  if (!payment) {
    return buildReceivePaymentPrint({}, [], {
      pageWidth: size,
      previousBalance: 0,
    });
  }

  const paymentEntries = await getPaymentEntries(payment._id);

  const previousBalance = await calculatePreviousBalance(
    payment.customer?._id,
    payment.date,
  );

  return buildReceivePaymentPrint(payment, paymentEntries, {
    pageWidth: size,
    previousBalance,
  });
};

const getReceivePaymentHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;
    const size = req.query.size || "standard";

    const payment = await ReceivePayment.findOne({
      _id: id,
      userId,
      isDeleted: false,
    }).populate("customer", "name phone");

    if (!payment) {
      return res.status(404).send("Receive payment not found");
    }

    const built = await buildReceiptData(payment, size);

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

    const payment = await ReceivePayment.findOne({
      _id: id,
      userId,
      isDeleted: false,
    }).populate("customer", "name phone");

    if (!payment) {
      return res.status(404).json({
        message: "Receive payment not found",
      });
    }

    const built = await buildReceiptData(payment, size);

    const html = generateReceivePaymentHTML(built);

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
      description: parsed.description,
      amount: parsed.paymentEntries?.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0,
      ),
      customer: {
        name: parsed.customerName || "",
        phone: parsed.customerPhone || "",
      },
    };

    const paymentEntries = parsed.paymentEntries || [];

    const previousBalance = await calculatePreviousBalance(
      parsed.customer,
      parsed.date,
    );

    const built = buildReceivePaymentPrint(payment, paymentEntries, {
      pageWidth: size,
      previousBalance: previousBalance,
    });
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
      description: parsed.description,
      amount: parsed.paymentEntries?.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0,
      ),
      customer: {
        name: parsed.customerName || "",
        phone: parsed.customerPhone || "",
      },
    };

    const paymentEntries = parsed.paymentEntries || [];

    const previousBalance = await calculatePreviousBalance(
      parsed.customer,
      parsed.date,
    );

    const built = buildReceivePaymentPrint(payment, paymentEntries, {
      pageWidth: size,
      previousBalance: previousBalance,
    });

    const html = generateReceivePaymentHTML(built);

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Preview-Receipt.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Preview PDF Error:", error);

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
