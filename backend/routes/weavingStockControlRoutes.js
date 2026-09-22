const express = require("express");
const ctrl = require("../controllers/weavingStockControlController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();
router.use(protect, requireModule(MODULE_KEYS.WEAVING));
router.get("/meta", requirePermission("weaving.fabric_stock.view", "weaving.yarn_stock.view"), ctrl.meta);
router.get("/history", requirePermission("weaving.fabric_stock.view", "weaving.yarn_stock.view"), ctrl.history);
router.post("/fabric-transfer", requirePermission("weaving.fabric_stock.transfer"), ctrl.fabricTransfer);
router.post("/yarn-transfer", requirePermission("weaving.yarn_stock.transfer"), ctrl.yarnTransfer);
router.post("/rewinder-recovery", requirePermission("weaving.yarn_stock.rewinder_recovery"), ctrl.rewinderRecovery);
router.post("/:id/reverse", requirePermission("weaving.stock_adjustment.reverse"), ctrl.reverse);

module.exports = router;
