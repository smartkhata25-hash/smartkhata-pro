const { logActivity } = require("../utils/activityLogger");
const service = require("../services/weaving/weavingStockControlService");

const uid = (req) => req.user?.id || req.userId;
const fail = (res, error, fallback) => res.status(error.statusCode || 500).json({ message: error.message || fallback });
const record = async (req, action, work) => {
  const row = await work();
  await logActivity({ req, action, module: "weaving.stock_control", moduleScope: "weaving", entityType: "WeavingStockAdjustment", entityId: row._id, title: row.adjustmentNo });
  return row;
};

exports.meta = async (req, res) => { try { return res.json({ data: await service.getMeta(uid(req)) }); } catch (error) { return fail(res, error, "Failed to load Stock Control setup"); } };
exports.history = async (req, res) => { try { return res.json({ data: await service.getHistory(uid(req), req.query) }); } catch (error) { return fail(res, error, "Failed to load Stock Control history"); } };
exports.fabricTransfer = async (req, res) => { try { return res.status(201).json({ data: await record(req, "fabric_transfer", () => service.createFabricTransfer(uid(req), req.body, req.actorId || uid(req))) }); } catch (error) { return fail(res, error, "Failed to transfer Fabric"); } };
exports.yarnTransfer = async (req, res) => { try { return res.status(201).json({ data: await record(req, "yarn_transfer", () => service.createYarnTransfer(uid(req), req.body, req.actorId || uid(req))) }); } catch (error) { return fail(res, error, "Failed to transfer Yarn"); } };
exports.rewinderRecovery = async (req, res) => { try { return res.status(201).json({ data: await record(req, "rewinder_recovery", () => service.createRewinderRecovery(uid(req), req.body, req.actorId || uid(req))) }); } catch (error) { return fail(res, error, "Failed to recover Rewinder Yarn"); } };
exports.reverse = async (req, res) => { try { return res.json({ data: await record(req, "reverse_stock_adjustment", () => service.reverseAdjustment(uid(req), req.params.id, req.actorId || uid(req), req.body.reason)) }); } catch (error) { return fail(res, error, "Failed to reverse Stock adjustment"); } };
