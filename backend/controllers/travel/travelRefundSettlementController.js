const {
  getActorId,
  getUserId,
  sendError,
} = require("../../services/travel/travelBookingService");
const {
  TRAVEL_REFUND_ORIGIN,
  TRAVEL_VENDOR_RETURN_ORIGIN,
  fetchHistory,
  getOutstandingCustomerRefunds,
  getOutstandingSummary,
  getOutstandingVendorSources,
  reverseSettlement,
  settleCustomerRefund,
  settleVendorRefund,
} = require("../../services/travel/travelRefundSettlementService");

exports.getOutstandingSummary = async (req, res) => {
  try {
    return res.json(await getOutstandingSummary(getUserId(req)));
  } catch (error) {
    return sendError(res, error, "Travel refund outstanding summary failed");
  }
};

exports.getOutstandingCustomerRefunds = async (req, res) => {
  try {
    return res.json(await getOutstandingCustomerRefunds({ userId: getUserId(req), query: req.query }));
  } catch (error) {
    return sendError(res, error, "Outstanding customer refunds fetch failed");
  }
};

exports.payCustomerRefund = async (req, res) => {
  try {
    const result = await settleCustomerRefund({
      userId: getUserId(req), actorId: getActorId(req), refundId: req.params.refundId, body: req.body,
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error, "Travel customer refund payment failed");
  }
};

exports.getCustomerRefundHistory = async (req, res) => {
  try {
    return res.json(await fetchHistory({
      userId: getUserId(req), referenceId: req.params.refundId,
      originModule: TRAVEL_REFUND_ORIGIN, sourceType: "refund_payment",
    }));
  } catch (error) {
    return sendError(res, error, "Customer refund payment history failed");
  }
};

exports.reverseCustomerRefundPayment = async (req, res) => {
  try {
    return res.json(await reverseSettlement({
      userId: getUserId(req), actorId: getActorId(req), sourceType: TRAVEL_REFUND_ORIGIN,
      sourceId: req.params.refundId, journalId: req.params.journalId, kind: "customer",
    }));
  } catch (error) {
    return sendError(res, error, "Customer refund payment reversal failed");
  }
};

exports.getOutstandingVendorRefunds = async (req, res) => {
  try {
    return res.json(await getOutstandingVendorSources({ userId: getUserId(req), query: req.query }));
  } catch (error) {
    return sendError(res, error, "Outstanding vendor refunds fetch failed");
  }
};

exports.receiveVendorRefund = async (req, res) => {
  try {
    const result = await settleVendorRefund({
      userId: getUserId(req), actorId: getActorId(req), sourceType: req.params.sourceType,
      sourceId: req.params.sourceId, body: req.body,
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error, "Travel vendor refund receipt failed");
  }
};

exports.getVendorRefundHistory = async (req, res) => {
  try {
    if (![TRAVEL_REFUND_ORIGIN, TRAVEL_VENDOR_RETURN_ORIGIN].includes(req.params.sourceType)) {
      return res.status(400).json({ message: "Invalid vendor refund source" });
    }
    const identity = req.query.vendorType === "party"
      ? { entityType: "party", id: req.query.vendorPartyId }
      : { entityType: "vendor", id: req.query.vendorId };
    return res.json(await fetchHistory({
      userId: getUserId(req), referenceId: req.params.sourceId,
      originModule: req.params.sourceType, sourceType: "purchase_return_payment",
      identity: identity.id ? identity : null,
    }));
  } catch (error) {
    return sendError(res, error, "Vendor refund receipt history failed");
  }
};

exports.reverseVendorRefundReceipt = async (req, res) => {
  try {
    const sourceType = req.params.sourceType;
    if (![TRAVEL_REFUND_ORIGIN, TRAVEL_VENDOR_RETURN_ORIGIN].includes(sourceType)) {
      return res.status(400).json({ message: "Invalid vendor refund source" });
    }
    return res.json(await reverseSettlement({
      userId: getUserId(req), actorId: getActorId(req), sourceType,
      sourceId: req.params.sourceId, journalId: req.params.journalId, kind: "vendor",
    }));
  } catch (error) {
    return sendError(res, error, "Vendor refund receipt reversal failed");
  }
};
