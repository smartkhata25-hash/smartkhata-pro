const { logActivity } = require("../utils/activityLogger");
const service = require("../services/weaving/weavingStockControlService");

const uid = (req) => req.user?.id || req.userId;
const fail = (res, error, fallback) => {
  if (["CastError", "ValidationError"].includes(error.name)) return res.status(400).json({ message: "Select valid stock Items, Source/Destination Locations, ownership and quantities." });
  if (error.code === 11000) return res.status(409).json({ message: "This transfer is already being processed. Refresh the transfer history before retrying." });
  return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : fallback });
};
const record = async (req, action, work) => {
  const row = await work();
  // A completed stock adjustment must respond immediately; audit logging is best-effort.
  logActivity({ req, action, module: "weaving.stock_control", moduleScope: "weaving", entityType: "WeavingStockAdjustment", entityId: row._id, title: row.adjustmentNo })
    .catch((error) => console.error("Stock-control activity log failed", error));
  return row;
};

exports.meta = async (req, res) => { try { return res.json({ data: await service.getMeta(uid(req), req.query) }); } catch (error) { return fail(res, error, "Failed to load Stock Control setup"); } };
exports.history = async (req, res) => { try { return res.json({ data: await service.getHistory(uid(req), req.query) }); } catch (error) { return fail(res, error, "Failed to load Stock Control history"); } };
exports.fabricTransfer = async (req, res) => { try { return res.status(201).json({ data: await record(req, "fabric_transfer", () => service.createFabricTransfer(uid(req), req.body, req.actorId || uid(req))) }); } catch (error) { return fail(res, error, "Failed to transfer Fabric"); } };
exports.yarnTransfer = async (req, res) => { try { return res.status(201).json({ data: await record(req, "yarn_transfer", () => service.createYarnTransfer(uid(req), req.body, req.actorId || uid(req))) }); } catch (error) { return fail(res, error, "Failed to transfer Yarn"); } };
exports.rewinderRecovery = async (req, res) => { try { return res.status(201).json({ data: await record(req, "rewinder_recovery", () => service.createRewinderRecovery(uid(req), req.body, req.actorId || uid(req))) }); } catch (error) { return fail(res, error, "Failed to recover Rewinder Yarn"); } };
exports.reverse = async (req, res) => { try { return res.json({ data: await record(req, "reverse_stock_adjustment", () => service.reverseAdjustment(uid(req), req.params.id, req.actorId || uid(req), req.body.reason)) }); } catch (error) { return fail(res, error, "Failed to reverse Stock adjustment"); } };
