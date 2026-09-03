const mongoose = require("mongoose");

const JournalEntry = require("../models/JournalEntry");
const PayBill = require("../models/PayBill");
const PrintSetting = require("../models/PrintSetting");
const ReceivePayment = require("../models/ReceivePayment");
const TravelBooking = require("../models/TravelBooking");
const TravelRefund = require("../models/TravelRefund");
const TravelVendorReturn = require("../models/TravelVendorReturn");
const { defaultSettings } = require("./printSettingController");
const { generatePdfFromHtml } = require("../services/pdfService");
const {
  buildTravelInvoicePrint,
  buildTravelPaymentReceiptPrint,
  buildTravelRefundPrint,
  buildTravelVendorReturnPrint,
} = require("../services/travel/travelPrintBuilder");
const {
  TRAVEL_INVOICE_ORIGIN,
  TRAVEL_RECEIVE_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_PAYMENT_ORIGIN,
} = require("../services/travel/travelAccountingMetricsService");
const {
  getUserId,
  populateBooking,
  sendError,
  serializeBooking,
} = require("../services/travel/travelBookingService");
const { renderTravelInvoiceHtml } = require("../templates/travelInvoiceTemplate");
const {
  renderTravelPaymentReceiptHtml,
} = require("../templates/travelPaymentReceiptTemplate");
const { renderTravelRefundHtml } = require("../templates/travelRefundTemplate");
const {
  renderTravelVendorReturnHtml,
} = require("../templates/travelVendorReturnTemplate");

const safeFilename = (value = "travel-invoice") =>
  String(value || "travel-invoice").replace(/[^a-z0-9._-]+/gi, "-");

const getTravelPrintSetting = async (userId) => {
  const existing = await PrintSetting.findOne({ userId }).lean();
  const defaults = await defaultSettings(userId);

  return {
    ...defaults,
    ...(existing || {}),
    travelInvoice: existing?.travelInvoice || defaults.travelInvoice,
  };
};

const sendHtml = (res, html) => {
  res.set("Content-Type", "text/html; charset=utf-8");

  return res.send(html);
};

const sendPdf = async ({ res, html, filePrefix, documentNumber }) => {
  const pdfBuffer = await generatePdfFromHtml(html);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=${filePrefix}-${safeFilename(
      documentNumber,
    )}.pdf`,
  });

  return res.send(pdfBuffer);
};

const assertValidDocumentId = (id, label) => {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  }
};

const getPaymentLine = (journal, lineType) =>
  (journal.lines || []).find((line) => line.type === lineType) || {};

const getTravelBookingDocument = async ({ req, autoPrint = false }) => {
  const userId = getUserId(req);
  const { id } = req.params;

  assertValidDocumentId(id, "booking ID");

  const booking = await populateBooking(
    TravelBooking.findOne({
      _id: id,
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
    }),
  ).lean();

  if (!booking) {
    throw Object.assign(new Error("Travel booking not found"), {
      statusCode: 404,
    });
  }

  const printSetting = await getTravelPrintSetting(userId);
  const built = buildTravelInvoicePrint(serializeBooking(booking), printSetting);
  const documentNumber =
    booking.invoiceNumber || booking.bookingNumber || `travel-${id}`;

  return {
    html: renderTravelInvoiceHtml(built, { autoPrint }),
    documentNumber,
  };
};

const getPaymentReceiptDocument = async ({ req, documentType, autoPrint = false }) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const isVendor = documentType === "vendor";

  assertValidDocumentId(id, "payment receipt ID");

  const journal = await JournalEntry.findOne({
    _id: id,
    createdBy: userId,
    isDeleted: false,
    isReversed: { $ne: true },
    sourceType: isVendor ? "pay_bill" : "receive_payment",
    originModule: {
      $in: isVendor
        ? [TRAVEL_INVOICE_ORIGIN, TRAVEL_VENDOR_PAYMENT_ORIGIN]
        : [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
    },
  })
    .select(
      "date time description billNo originModule referenceId customerId supplierId partyId lines",
    )
    .populate("customerId", "name phone email moduleScope")
    .populate("supplierId", "name phone email travelVendorType moduleScope")
    .populate("partyId", "name phone email role moduleScope")
    .populate("lines.account", "name code category type")
    .lean();

  if (!journal) {
    throw Object.assign(new Error("Travel payment receipt not found"), {
      statusCode: 404,
    });
  }

  const paymentLine = getPaymentLine(journal, isVendor ? "credit" : "debit");
  const [standalonePayment, invoice] = await Promise.all([
    journal.originModule ===
    (isVendor ? TRAVEL_VENDOR_PAYMENT_ORIGIN : TRAVEL_RECEIVE_PAYMENT_ORIGIN)
      ? (isVendor ? PayBill : ReceivePayment)
          .findOne({
            _id: journal.referenceId,
            userId,
            isDeleted: false,
            isReversed: { $ne: true },
            originModule: isVendor
              ? TRAVEL_VENDOR_PAYMENT_ORIGIN
              : TRAVEL_RECEIVE_PAYMENT_ORIGIN,
          })
          .select(
            "customer supplier partyId date time amount finalAmount paymentType billNo account description originModule",
          )
          .populate(
            isVendor ? "supplier" : "customer",
            isVendor
              ? "name phone email travelVendorType moduleScope"
              : "name phone email moduleScope",
          )
          .populate("partyId", "name phone email role moduleScope")
          .populate("account", "name code category type")
          .lean()
      : null,
    journal.originModule === TRAVEL_INVOICE_ORIGIN
      ? TravelBooking.findOne({
          _id: journal.referenceId,
          userId,
          isActive: true,
          isDeleted: false,
          isVoided: { $ne: true },
        })
          .select(
            "bookingNumber invoiceNumber customerType customerId customerPartyId accountId paymentType vendorPaymentAccountId vendorPaymentType notes baseCurrency",
          )
          .populate("customerId", "name phone email moduleScope")
          .populate("customerPartyId", "name phone email role moduleScope")
          .populate("accountId", "name code category type")
          .populate("vendorPaymentAccountId", "name code category type")
          .lean()
      : null,
  ]);

  const party = isVendor
    ? standalonePayment?.partyId ||
      standalonePayment?.supplier ||
      journal.partyId ||
      journal.supplierId ||
      null
    : standalonePayment?.partyId ||
      standalonePayment?.customer ||
      journal.partyId ||
      journal.customerId ||
      invoice?.customerPartyId ||
      invoice?.customerId ||
      null;
  const paymentAccount =
    standalonePayment?.account ||
    (isVendor ? invoice?.vendorPaymentAccountId : invoice?.accountId) ||
    paymentLine.account ||
    null;
  const paymentMethod =
    standalonePayment?.paymentType ||
    (isVendor ? invoice?.vendorPaymentType : invoice?.paymentType) ||
    paymentLine.paymentType ||
    "";
  const documentNumber =
    standalonePayment?.billNo ||
    journal.billNo ||
    invoice?.invoiceNumber ||
    invoice?.bookingNumber ||
    id;
  const printSetting = await getTravelPrintSetting(userId);
  const built = buildTravelPaymentReceiptPrint(
    {
      documentType,
      receiptNumber: documentNumber,
      referenceNo: standalonePayment?.billNo || journal.billNo || "",
      date: standalonePayment?.date || journal.date,
      time: standalonePayment?.time || journal.time || "",
      party,
      invoiceNo: invoice?.invoiceNumber || invoice?.bookingNumber || "",
      paymentMethod,
      paymentAccount,
      amount:
        Number(paymentLine.amount || 0) ||
        Number(standalonePayment?.finalAmount || standalonePayment?.amount || 0),
      notes: standalonePayment?.description || journal.description || "",
      currency: invoice?.baseCurrency || "PKR",
    },
    printSetting,
  );

  return {
    html: renderTravelPaymentReceiptHtml(built, { autoPrint }),
    documentNumber,
  };
};

const getTravelRefundDocument = async ({ req, autoPrint = false }) => {
  const userId = getUserId(req);
  const { id } = req.params;

  assertValidDocumentId(id, "refund ID");

  const refund = await TravelRefund.findOne({
    _id: id,
    userId,
    isDeleted: false,
    isReversed: { $ne: true },
  })
    .populate("customerId", "name phone email moduleScope")
    .populate("customerPartyId", "name phone email role moduleScope")
    .populate(
      "originalInvoiceId",
      "bookingNumber invoiceNumber serviceType customerType customerId customerPartyId bookingItems baseCurrency",
    )
    .populate("refundItems.vendorId", "name phone travelVendorType moduleScope")
    .populate("refundItems.vendorPartyId", "name phone email role moduleScope")
    .populate("accountId", "name code category type")
    .lean();

  if (!refund) {
    throw Object.assign(new Error("Travel refund not found"), {
      statusCode: 404,
    });
  }

  const printSetting = await getTravelPrintSetting(userId);
  const built = buildTravelRefundPrint(refund, printSetting);

  return {
    html: renderTravelRefundHtml(built, { autoPrint }),
    documentNumber: refund.refundNumber || id,
  };
};

const getTravelVendorReturnDocument = async ({ req, autoPrint = false }) => {
  const userId = getUserId(req);
  const { id } = req.params;

  assertValidDocumentId(id, "vendor return ID");

  const vendorReturn = await TravelVendorReturn.findOne({
    _id: id,
    userId,
    isDeleted: false,
    isReversed: { $ne: true },
  })
    .populate("vendorId", "name phone email travelVendorType moduleScope")
    .populate("vendorPartyId", "name phone email role moduleScope")
    .populate(
      "originalInvoiceId",
      "bookingNumber invoiceNumber serviceType bookingItems baseCurrency",
    )
    .populate("accountId", "name code category type")
    .lean();

  if (!vendorReturn) {
    throw Object.assign(new Error("Travel vendor return not found"), {
      statusCode: 404,
    });
  }

  const printSetting = await getTravelPrintSetting(userId);
  const built = buildTravelVendorReturnPrint(vendorReturn, printSetting);

  return {
    html: renderTravelVendorReturnHtml(built, { autoPrint }),
    documentNumber: vendorReturn.returnNumber || id,
  };
};

exports.previewTravelBookingInvoice = async (req, res) => {
  try {
    const { html } = await getTravelBookingDocument({ req });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel invoice preview failed");
  }
};

exports.printTravelBookingInvoice = async (req, res) => {
  try {
    const { html } = await getTravelBookingDocument({ req, autoPrint: true });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel invoice print failed");
  }
};

exports.generateTravelBookingPdf = async (req, res) => {
  try {
    const { html, documentNumber } = await getTravelBookingDocument({ req });

    return sendPdf({
      res,
      html,
      filePrefix: "Travel-Invoice",
      documentNumber,
    });
  } catch (error) {
    return sendError(res, error, "Travel invoice PDF generation failed");
  }
};

exports.previewTravelReceivePaymentReceipt = async (req, res) => {
  try {
    const { html } = await getPaymentReceiptDocument({
      req,
      documentType: "customer",
    });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel receive payment receipt preview failed");
  }
};

exports.printTravelReceivePaymentReceipt = async (req, res) => {
  try {
    const { html } = await getPaymentReceiptDocument({
      req,
      documentType: "customer",
      autoPrint: true,
    });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel receive payment receipt print failed");
  }
};

exports.generateTravelReceivePaymentReceiptPdf = async (req, res) => {
  try {
    const { html, documentNumber } = await getPaymentReceiptDocument({
      req,
      documentType: "customer",
    });

    return sendPdf({
      res,
      html,
      filePrefix: "TravelReceivePaymentReceipt",
      documentNumber,
    });
  } catch (error) {
    return sendError(res, error, "Travel receive payment receipt PDF failed");
  }
};

exports.previewTravelVendorPaymentReceipt = async (req, res) => {
  try {
    const { html } = await getPaymentReceiptDocument({
      req,
      documentType: "vendor",
    });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel vendor payment receipt preview failed");
  }
};

exports.printTravelVendorPaymentReceipt = async (req, res) => {
  try {
    const { html } = await getPaymentReceiptDocument({
      req,
      documentType: "vendor",
      autoPrint: true,
    });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel vendor payment receipt print failed");
  }
};

exports.generateTravelVendorPaymentReceiptPdf = async (req, res) => {
  try {
    const { html, documentNumber } = await getPaymentReceiptDocument({
      req,
      documentType: "vendor",
    });

    return sendPdf({
      res,
      html,
      filePrefix: "TravelVendorPaymentReceipt",
      documentNumber,
    });
  } catch (error) {
    return sendError(res, error, "Travel vendor payment receipt PDF failed");
  }
};

exports.previewTravelRefund = async (req, res) => {
  try {
    const { html } = await getTravelRefundDocument({ req });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel refund preview failed");
  }
};

exports.printTravelRefund = async (req, res) => {
  try {
    const { html } = await getTravelRefundDocument({ req, autoPrint: true });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel refund print failed");
  }
};

exports.generateTravelRefundPdf = async (req, res) => {
  try {
    const { html, documentNumber } = await getTravelRefundDocument({ req });

    return sendPdf({
      res,
      html,
      filePrefix: "TravelRefund",
      documentNumber,
    });
  } catch (error) {
    return sendError(res, error, "Travel refund PDF failed");
  }
};

exports.previewTravelVendorReturn = async (req, res) => {
  try {
    const { html } = await getTravelVendorReturnDocument({ req });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel vendor return preview failed");
  }
};

exports.printTravelVendorReturn = async (req, res) => {
  try {
    const { html } = await getTravelVendorReturnDocument({
      req,
      autoPrint: true,
    });

    return sendHtml(res, html);
  } catch (error) {
    return sendError(res, error, "Travel vendor return print failed");
  }
};

exports.generateTravelVendorReturnPdf = async (req, res) => {
  try {
    const { html, documentNumber } = await getTravelVendorReturnDocument({
      req,
    });

    return sendPdf({
      res,
      html,
      filePrefix: "TravelVendorReturn",
      documentNumber,
    });
  } catch (error) {
    return sendError(res, error, "Travel vendor return PDF failed");
  }
};
