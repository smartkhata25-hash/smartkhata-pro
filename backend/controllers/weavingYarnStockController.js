const service = require("../services/weaving/weavingYarnStockService");
const costing = require("../services/weaving/weavingCostingService");
const { logActivity } = require("../utils/activityLogger");
const uid = (req) => req.user?.id || req.userId;
const fail = (res, error, message) => res.status(error.statusCode || 500).json({ message: error.message || message });
exports.summary = async (req, res) => { try { return res.json({ data: await service.getSummary(uid(req), req.query) }); } catch (error) { return fail(res, error, "Failed to load Yarn Stock"); } };
exports.ledger = async (req, res) => { try { return res.json({ data: await service.getLedger(uid(req), req.params.yarnId, req.query) }); } catch (error) { return fail(res, error, "Failed to load Yarn Ledger"); } };
exports.consumptionMeta = async (req, res) => { try { return res.json({ data: await service.getWeftConsumptionMeta(uid(req)) }); } catch (error) { return fail(res, error, "Failed to load Weft Consumption setup"); } };
exports.consumeWeft = async (req, res) => {
  try {
    const result = await service.createWeftConsumption(uid(req), req.body, req.actorId || uid(req));
    try { await costing.rebuildCosting(uid(req)); } catch (error) { console.error("Weaving costing refresh after Weft Consumption failed", error); }
    await logActivity({ req, action: "create", module: "weaving.yarn_stock", moduleScope: "weaving", entityType: "WeavingYarnMovement", entityId: result.batchId, title: "Weft Yarn Consumption" });
    return res.status(201).json({ data: result });
  } catch (error) { return fail(res, error, "Failed to record Weft Yarn Consumption"); }
};
exports.reverseConsumption = async (req, res) => {
  try {
    const result = await service.reverseWeftConsumption(uid(req), req.params.batchId, req.body.reason, req.actorId || uid(req));
    try { await costing.rebuildCosting(uid(req)); } catch (error) { console.error("Weaving costing refresh after Weft reversal failed", error); }
    await logActivity({ req, action: "reverse", module: "weaving.yarn_stock", moduleScope: "weaving", entityType: "WeavingYarnMovement", entityId: req.params.batchId, title: "Weft Yarn Consumption Reversal" });
    return res.json({ data: result });
  } catch (error) { return fail(res, error, "Failed to reverse Weft Yarn Consumption"); }
};
