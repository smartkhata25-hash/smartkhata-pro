const WeavingContract = require("../models/WeavingContract");
const WeavingGodown = require("../models/WeavingGodown");
const WeavingParty = require("../models/WeavingParty");
const WeavingSizingBill = require("../models/WeavingSizingBill");
const WeavingSizingIssue = require("../models/WeavingSizingIssue");
const WeavingSizingReceipt = require("../models/WeavingSizingReceipt");
const WeavingYarn = require("../models/WeavingYarn");
const WeavingYarnMovement = require("../models/WeavingYarnMovement");
const { logActivity } = require("../utils/activityLogger");
const commercial = require("../services/weaving/weavingCommercialService");
const sizing = require("../services/weaving/weavingSizingService");

const listFilter = (req, dateField = "date") => {
  const filter = { userId: uid(req), status: { $ne: "void" } };
  if (req.query.sizingPartyId) filter.sizingPartyId = req.query.sizingPartyId;
  if (req.query.from || req.query.to) filter[dateField] = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
  return filter;
};

const uid = (req) => req.user?.id || req.userId;
const fail = (res, error, message) =>
  res
    .status(error.statusCode || 500)
    .json({ message: error.message || message });
const respond = (res, promise, message) =>
  promise
    .then((data) => res.json({ data }))
    .catch((error) => fail(res, error, message));

exports.meta = async (req, res) => {
  try {
    const userId = uid(req);
    const [parties, yarns, godowns, contracts, issues, receipts] =
      await Promise.all([
        WeavingParty.find({
          userId,
          isActive: true,
          isHidden: { $ne: true },
          serviceTypes: "sizing",
        }).sort({ name: 1 }),
        WeavingYarn.find({ userId, isActive: true }).sort({ name: 1 }),
        WeavingGodown.find({ userId, isActive: true }).sort({ name: 1 }),
        WeavingContract.find({ userId }).sort({ contractDate: -1 }),
        WeavingSizingIssue.find({ userId, status: "posted" })
          .populate("sizingPartyId", "name")
          .sort({ date: -1 }),
        WeavingSizingReceipt.find({ userId, status: "posted" })
          .populate("sizingPartyId", "name")
          .sort({ date: -1 }),
      ]);
    return res.json({
      data: {
        parties,
        yarns,
        godowns,
        contracts,
        issues,
        receipts,
        nextIssueNo: await commercial.nextNo(
          WeavingSizingIssue,
          userId,
          "issueNo",
          "SI",
        ),
        nextReceiptNo: await commercial.nextNo(
          WeavingSizingReceipt,
          userId,
          "receiptNo",
          "SR",
        ),
        nextReturnNo: await commercial.nextNo(
          WeavingYarnMovement,
          userId,
          "returnNo",
          "SRN",
        ),
        nextBillNo: await commercial.nextNo(
          WeavingSizingBill,
          userId,
          "billNo",
          "SB",
        ),
      },
    });
  } catch (error) {
    return fail(res, error, "Failed to load Sizing setup");
  }
};
exports.listIssues = (req, res) =>
  respond(
    res,
    WeavingSizingIssue.find({ ...listFilter(req), ...(req.query.yarnId ? { "lines.yarnId": req.query.yarnId } : {}) })
      .populate("sizingPartyId", "name")
      .populate("lines.yarnId", "name count")
      .sort({ date: -1 }),
    "Failed to load issues",
  );
exports.createIssue = async (req, res) => {
  try {
    const row = await sizing.createIssue(uid(req), req.body);
    await logActivity({
      req,
      action: "create",
      module: "weaving.sizing.issue",
      moduleScope: "weaving",
      entityType: "WeavingSizingIssue",
      entityId: row._id,
      title: row.issueNo,
    });
    return res.status(201).json({ data: row });
  } catch (error) {
    return fail(res, error, "Failed to create issue");
  }
};
exports.voidIssue = (req, res) => respond(res, sizing.voidIssue(uid(req), req.params.id, req.body.reason), "Failed to void Sizing issue");
exports.updateIssue = (req, res) => respond(res, sizing.updateIssue(uid(req), req.params.id, req.body), "Failed to update Sizing issue");
exports.listReceipts = (req, res) =>
  respond(
    res,
    WeavingSizingReceipt.find(listFilter(req))
      .populate("sizingPartyId", "name")
      .populate("issueId", "issueNo")
      .sort({ date: -1 }),
    "Failed to load receipts",
  );
exports.createReceipt = async (req, res) => {
  try {
    const { receipt: row, yarnReturn, bill } = await sizing.createReceiptBundle(uid(req), req.body);
    await logActivity({
      req,
      action: "create",
      module: "weaving.sizing.receipt",
      moduleScope: "weaving",
      entityType: "WeavingSizingReceipt",
      entityId: row._id,
      title: row.receiptNo,
    });
    for (const [linked, type, entityType, title] of [
      [yarnReturn, "return", "WeavingYarnMovement", yarnReturn?.returnNo],
      [bill, "bill", "WeavingSizingBill", bill?.billNo],
    ]) {
      if (linked) await logActivity({
        req,
        action: "create",
        module: `weaving.sizing.${type}`,
        moduleScope: "weaving",
        entityType,
        entityId: linked._id,
        title,
      });
    }
    return res.status(201).json({ data: row });
  } catch (error) {
    return fail(res, error, "Failed to create receipt");
  }
};
exports.voidReceipt = (req, res) => respond(res, sizing.voidReceiptBundle(uid(req), req.params.id, req.body.reason), "Failed to void Sizing receiving");
exports.updateReceipt = (req, res) => respond(res, sizing.updateReceiptBundle(uid(req), req.params.id, req.body), "Failed to update Sizing receiving");
exports.createReturn = async (req, res) => {
  try {
    const row = await sizing.createReturn(uid(req), req.body);
    await logActivity({
      req,
      action: "create",
      module: "weaving.sizing.return",
      moduleScope: "weaving",
      entityType: "WeavingYarnMovement",
      entityId: row._id,
      title: row.returnNo || "Sizing Yarn Return",
    });
    return res.status(201).json({ data: row });
  } catch (error) {
    return fail(res, error, "Failed to create Sizing return");
  }
};
exports.listReturns = (req, res) => {
  const filter = { userId: uid(req), movementType: "sizing_return", isVoided: { $ne: true } };
  if (req.query.sizingPartyId) filter.sizingPartyId = req.query.sizingPartyId;
  if (req.query.yarnId) filter.yarnId = req.query.yarnId;
  if (req.query.from || req.query.to) filter.date = { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) };
  return respond(res, WeavingYarnMovement.find(filter).populate("sizingPartyId", "name").populate("yarnId", "name count").populate("sizingReceiptId", "receiptNo").sort({ date: -1 }), "Failed to load Sizing returns");
};
exports.voidReturn = (req, res) => respond(res, sizing.voidReturn(uid(req), req.params.id, req.body.reason), "Failed to void Sizing return");
exports.updateReturn = (req, res) => respond(res, sizing.updateReturn(uid(req), req.params.id, req.body), "Failed to update Sizing return");
exports.listBills = (req, res) =>
  respond(
    res,
    WeavingSizingBill.find({ ...listFilter(req, "billDate"), ...(req.query.paymentStatus ? { paymentStatus: req.query.paymentStatus } : {}) })
      .populate("sizingPartyId", "name")
      .populate("receiptId", "receiptNo")
      .populate("paymentTransactionIds", "amount paymentMethod paymentAccountId chequeNo chequeBank chequeDate status")
      .sort({ billDate: -1 }),
    "Failed to load bills",
  );
exports.getBill = async (req, res) => {
  try {
    const row = await WeavingSizingBill.findOne({
      _id: req.params.id,
      userId: uid(req),
    })
      .populate("sizingPartyId", "name phone")
      .populate("receiptId", "receiptNo date")
      .lean();
    if (!row) return res.status(404).json({ message: "Sizing bill not found" });
    return res.json({ data: row });
  } catch (error) {
    return fail(res, error, "Failed to load Sizing bill");
  }
};
exports.createBill = async (req, res) => {
  try {
    const row = await sizing.createBill(uid(req), req.body);
    await logActivity({
      req,
      action: "create",
      module: "weaving.sizing.bill",
      moduleScope: "weaving",
      entityType: "WeavingSizingBill",
      entityId: row._id,
      title: row.billNo,
    });
    return res.status(201).json({ data: row });
  } catch (error) {
    return fail(res, error, "Failed to create bill");
  }
};
exports.voidBill = (req, res) => respond(res, sizing.voidBill(uid(req), req.params.id, req.body.reason), "Failed to void Sizing bill");
exports.updateBill = (req, res) => respond(res, sizing.updateBill(uid(req), req.params.id, req.body), "Failed to update Sizing bill");
exports.materialLedger = (req, res) =>
  respond(
    res,
    sizing.materialLedger(uid(req), req.query),
    "Failed to load material ledger",
  );
exports.stock = async (req, res) => {
  try {
    const rows = await sizing.materialLedger(uid(req), req.query);
    const grouped = new Map();
    rows.forEach((row) => {
      const key = `${row.sizingPartyId?._id}:${row.yarnId?._id}:${row.ownershipType}:${row.ownerPartyId?._id || "own"}`;
      grouped.set(key, {
        sizingParty: row.sizingPartyId,
        yarn: row.yarnId,
        ownershipType: row.ownershipType,
        owner: row.ownerPartyId,
        packageType: row.packageType,
        balanceKg: row.balanceKg,
        balancePackages: row.balancePackages,
        balanceSmallCones: row.balanceSmallCones,
        balanceLargeCones: row.balanceLargeCones,
      });
    });
    return res.json({
      data: [...grouped.values()].filter(
        (row) =>
          Math.abs(row.balanceKg) > 0.0001 ||
          row.balancePackages ||
          row.balanceSmallCones ||
          row.balanceLargeCones,
      ),
    });
  } catch (error) {
    return fail(res, error, "Failed to load Sizing stock");
  }
};
