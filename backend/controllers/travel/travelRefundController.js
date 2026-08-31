const mongoose = require("mongoose");

const Customer = require("../../models/Customer");
const TravelBooking = require("../../models/TravelBooking");
const TravelRefund = require("../../models/TravelRefund");
const { logActivity } = require("../../utils/activityLogger");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
} = require("../../utils/moduleScope");
const {
  applyPrimaryAttachmentFields,
  cleanupTravelInvoiceAttachments,
  uploadTravelInvoiceFiles,
} = require("../../services/travel/travelInvoiceAttachmentService");
const { POSTING_STATUSES } = require("../../services/travel/travelInvoiceAccountingService");
const {
  buildRefundPayload,
  recalculateTravelRefundAccounts,
  reserveTravelRefundAmounts,
  sendError,
  serializeTravelRefund,
  postTravelRefundAccounting,
  TRAVEL_REFUND_ORIGIN,
} = require("../../services/travel/travelRefundService");
const { clearTravelReportCache } = require("../../services/travel/travelReportCacheService");
const { generateTravelRefundNumber } = require("../../services/travel/travelRefundNumberService");
const { cleanString, escapeRegex, getActorId, getUserId } = require("../../services/travel/travelBookingService");
const {
  getSoftDeleteReason,
  recalculateTravelSoftDeleteAccounts,
  reverseTravelJournals,
} = require("../../services/travel/travelSoftDeleteService");

const optionalObjectId = (value) => {
  if (!value) {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const addAndClause = (query, clause) => {
  query.$and = [...(query.$and || []), clause];
};

const roundMoneyValue = (value) => Number(Number(value || 0).toFixed(2));

const buildDateRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) {
    return null;
  }

  const range = {};

  if (fromDate) {
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }

  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return range;
};

const findTravelCustomersForSearch = async (userId, search) => {
  const safeSearch = escapeRegex(search);

  return Customer.find(
    applyModuleScopeFilter(
      {
        createdBy: userId,
        isActive: { $ne: false },
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { phone: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } },
        ],
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id")
    .limit(50)
    .lean();
};

const getRemainingRefundable = (invoice) =>
  Math.max(
    Number(invoice.netSale || invoice.sellingTotal || 0) -
      Number(invoice.refundedAmount || 0),
    0,
  );

const getRemainingVendorRecovery = (invoice) =>
  Math.max(
    Number(invoice.costTotal || 0) - Number(invoice.vendorRecoveredAmount || 0),
    0,
  );

exports.getRefundableTravelInvoices = async (req, res) => {
  try {
    const userId = getUserId(req);
    const search = cleanString(req.query.search);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const query = {
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
      accountingPosted: true,
      status: { $in: [...POSTING_STATUSES] },
    };

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { bookingNumber: { $regex: safeSearch, $options: "i" } },
        { invoiceNumber: { $regex: safeSearch, $options: "i" } },
        { notes: { $regex: safeSearch, $options: "i" } },
        { "bookingItems.title": { $regex: safeSearch, $options: "i" } },
      ];
    }

    const invoices = await TravelBooking.find(query)
      .select(
        "bookingNumber invoiceNumber invoiceDate status serviceType customerId bookingItems sellingTotal discountAmount netSale costTotal refundedAmount customerRefundedAmount vendorRecoveredAmount baseCurrency",
      )
      .populate("customerId", "name phone email moduleScope")
      .populate("bookingItems.vendorId", "name phone travelVendorType moduleScope")
      .sort({ invoiceDate: -1, updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    return res.json(
      invoices
        .map((invoice) => ({
          ...invoice,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber || invoice.bookingNumber,
          remainingRefundable: getRemainingRefundable(invoice),
          remainingVendorRecovery: getRemainingVendorRecovery(invoice),
        }))
        .filter((invoice) => invoice.remainingRefundable > 0),
    );
  } catch (error) {
    return sendError(res, error, "Refundable travel invoice fetch failed");
  }
};

exports.getTravelRefunds = async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const search = cleanString(req.query.search);
    const refundNumber = cleanString(req.query.refundNumber);
    const originalInvoice = cleanString(
      req.query.originalInvoice || req.query.originalInvoiceNumber,
    );
    const customerId = optionalObjectId(req.query.customerId || req.query.customer);
    const penaltyStatus = cleanString(req.query.penaltyStatus).toLowerCase();
    const paymentStatus = cleanString(req.query.paymentStatus).toLowerCase();
    const dateRange = buildDateRange(req.query.fromDate, req.query.toDate);
    const query = {
      userId,
      isDeleted: false,
      isReversed: { $ne: true },
    };

    if (refundNumber) {
      query.refundNumber = { $regex: escapeRegex(refundNumber), $options: "i" };
    }

    if (originalInvoice) {
      query.originalInvoiceNumber = {
        $regex: escapeRegex(originalInvoice),
        $options: "i",
      };
    }

    if (customerId) {
      query.customerId = customerId;
    }

    if (dateRange) {
      query.refundDate = dateRange;
    }

    if (penaltyStatus === "with") {
      query.penaltyAmount = { $gt: 0 };
    } else if (penaltyStatus === "without") {
      addAndClause(query, {
        $or: [{ penaltyAmount: { $lte: 0 } }, { penaltyAmount: { $exists: false } }],
      });
    }

    if (paymentStatus === "paid") {
      addAndClause(query, {
        $expr: { $gte: ["$paidBackAmount", "$customerRefundAmount"] },
      });
    } else if (paymentStatus === "outstanding") {
      addAndClause(query, {
        customerRefundAmount: { $gt: 0 },
        $expr: { $lt: ["$paidBackAmount", "$customerRefundAmount"] },
      });
    } else if (paymentStatus === "partial") {
      addAndClause(query, {
        paidBackAmount: { $gt: 0 },
        $expr: { $lt: ["$paidBackAmount", "$customerRefundAmount"] },
      });
    } else if (paymentStatus === "credit") {
      addAndClause(query, {
        customerRefundAmount: { $gt: 0 },
        paidBackAmount: { $lte: 0 },
      });
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const matchingCustomers = await findTravelCustomersForSearch(userId, search);

      addAndClause(query, {
        $or: [
          { refundNumber: { $regex: safeSearch, $options: "i" } },
          { originalInvoiceNumber: { $regex: safeSearch, $options: "i" } },
          { notes: { $regex: safeSearch, $options: "i" } },
          { customerId: { $in: matchingCustomers.map((customer) => customer._id) } },
        ],
      });
    }

    const [refunds, total] = await Promise.all([
      TravelRefund.find(query)
        .populate("customerId", "name phone email moduleScope")
        .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType")
        .populate("accountId", "name code category type")
        .sort({ refundDate: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TravelRefund.countDocuments(query),
    ]);

    return res.json({
      data: refunds.map(serializeTravelRefund),
      total,
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, error, "Travel refunds fetch failed");
  }
};

exports.getTravelRefundById = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid refund ID" });
    }

    const refund = await TravelRefund.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
      isReversed: { $ne: true },
    })
      .populate("customerId", "name phone email moduleScope")
      .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType bookingItems")
      .populate("refundItems.vendorId", "name phone travelVendorType moduleScope")
      .populate("accountId", "name code category type")
      .lean();

    if (!refund) {
      return res.status(404).json({ message: "Travel refund not found" });
    }

    return res.json(serializeTravelRefund(refund));
  } catch (error) {
    return sendError(res, error, "Travel refund fetch failed");
  }
};

exports.createTravelRefund = async (req, res) => {
  const session = await mongoose.startSession();
  let uploadedAttachments = [];
  let refund = null;
  let accountingAccountIds = [];
  let transactionCommitted = false;

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);

    await buildRefundPayload({ body: req.body, userId });
    uploadedAttachments = await uploadTravelInvoiceFiles(
      req.files,
      userId,
      "travel-refunds",
    );

    await session.withTransaction(async () => {
      const built = await buildRefundPayload({
        body: req.body,
        userId,
        session,
      });

      await reserveTravelRefundAmounts({
        invoice: built.invoice,
        refundData: built.data,
        userId,
        session,
      });

      const refundNumber = await generateTravelRefundNumber(
        userId,
        built.data.refundDate,
        session,
      );

      refund = new TravelRefund({
        ...built.data,
        userId,
        refundNumber,
        createdBy: actorId,
      });

      applyPrimaryAttachmentFields(refund, uploadedAttachments);

      await refund.save({ session });

      accountingAccountIds = await postTravelRefundAccounting({
        refund,
        invoice: built.invoice,
        customer: built.customer,
        paymentAccount: built.paymentAccount,
        userId,
        session,
      });
    });
    transactionCommitted = true;

    await recalculateTravelRefundAccounts(accountingAccountIds);
    clearTravelReportCache(userId);

    try {
      await logActivity({
        req,
        action: "create",
        module: "travel.refunds",
        entityType: "TravelRefund",
        entityId: refund._id,
        title: `Travel Refund ${refund.refundNumber}`,
        billNo: refund.refundNumber,
        description: `Travel refund ${refund.refundNumber} created`,
        after: refund,
      });
    } catch (logError) {
      console.error("Travel refund activity log failed:", logError.message);
    }

    const populated = await TravelRefund.findById(refund._id)
      .populate("customerId", "name phone email moduleScope")
      .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType")
      .populate("refundItems.vendorId", "name phone travelVendorType moduleScope")
      .populate("accountId", "name code category type")
      .lean();

    return res.status(201).json(serializeTravelRefund(populated));
  } catch (error) {
    if (!transactionCommitted) {
      await cleanupTravelInvoiceAttachments(uploadedAttachments);
    }

    return sendError(res, error, "Travel refund create failed");
  } finally {
    await session.endSession();
  }
};

exports.reverseTravelRefund = async (req, res) => {
  const session = await mongoose.startSession();
  let refund = null;
  let before = null;
  let accountIds = [];

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const reason = getSoftDeleteReason(req, "Travel refund corrected");

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid refund ID" });
    }

    await session.withTransaction(async () => {
      refund = await TravelRefund.findOne({
        _id: req.params.id,
        userId,
        isDeleted: false,
        isReversed: { $ne: true },
      }).session(session);

      if (!refund) {
        throw Object.assign(new Error("Travel refund not found"), { statusCode: 404 });
      }

      before = refund.toObject();

      const reversalResult = await reverseTravelJournals({
        userId,
        referenceId: refund._id,
        originModule: TRAVEL_REFUND_ORIGIN,
        sourceTypes: ["travel_refund", "refund_payment"],
        session,
        reason,
      });

      if (reversalResult.journals.length === 0) {
        throw Object.assign(
          new Error("Travel refund journals were not found for reversal"),
          { statusCode: 409 },
        );
      }

      accountIds = reversalResult.accountIds;

      if (refund.originalInvoiceId) {
        const invoice = await TravelBooking.findOne({
          _id: refund.originalInvoiceId,
          userId,
        }).session(session);

        if (invoice) {
          invoice.refundedAmount = Math.max(
            roundMoneyValue(invoice.refundedAmount) - roundMoneyValue(refund.grossRefundAmount),
            0,
          );
          invoice.customerRefundedAmount = Math.max(
            roundMoneyValue(invoice.customerRefundedAmount) -
              roundMoneyValue(refund.customerRefundAmount),
            0,
          );
          invoice.vendorRecoveredAmount = Math.max(
            roundMoneyValue(invoice.vendorRecoveredAmount) -
              roundMoneyValue(refund.vendorRecoveryAmount),
            0,
          );
          invoice.refundCount = Math.max(Number(invoice.refundCount || 0) - 1, 0);

          await invoice.save({ session });
        }
      }

      refund.isDeleted = true;
      refund.deletedAt = new Date();
      refund.deletedBy = actorId;
      refund.deleteReason = reason;
      refund.isReversed = true;
      refund.reversedAt = new Date();
      refund.reversedBy = actorId;
      refund.reversalJournalEntryIds = reversalResult.reversalIds;

      await refund.save({ session });
    });

    await recalculateTravelSoftDeleteAccounts(accountIds);
    clearTravelReportCache(userId);

    try {
      await logActivity({
        req,
        action: "reverse",
        module: "travel.refunds",
        entityType: "TravelRefund",
        entityId: refund._id,
        title: `Travel Refund ${refund.refundNumber}`,
        billNo: refund.refundNumber,
        description: `Travel refund ${refund.refundNumber} reversed and archived`,
        before,
        after: {
          isDeleted: refund.isDeleted,
          isReversed: refund.isReversed,
          reversalJournalEntryIds: refund.reversalJournalEntryIds,
          deleteReason: refund.deleteReason,
        },
      });
    } catch (logError) {
      console.error("Travel refund reverse activity log failed:", logError.message);
    }

    return res.json({
      message: "Travel refund reversed and archived successfully",
      refund,
      reversed: true,
    });
  } catch (error) {
    return sendError(res, error, "Travel refund delete failed");
  } finally {
    await session.endSession();
  }
};
