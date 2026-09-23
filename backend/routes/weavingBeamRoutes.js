const express = require("express");
const ctrl = require("../controllers/weavingBeamController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");
const { PERMISSIONS } = require("../utils/permissionList");
const router = express.Router();
router.use(protect, requireModule(MODULE_KEYS.WEAVING));
router.get("/meta", requirePermission(PERMISSIONS.WEAVING_BEAMS.VIEW), ctrl.meta);
router.get("/sets", requirePermission(PERMISSIONS.WEAVING_BEAMS.VIEW), ctrl.listSets);
router.get("/sets/:id", requirePermission(PERMISSIONS.WEAVING_BEAMS.VIEW), ctrl.getSet);
router.post("/sync", requirePermission(PERMISSIONS.WEAVING_BEAMS.CREATE), ctrl.sync);
router.post("/jobs", requirePermission(PERMISSIONS.WEAVING_BEAMS.CREATE, PERMISSIONS.WEAVING_BEAMS.APPROVE),
  (req, res, next) => req.body.approve ? requirePermission(PERMISSIONS.WEAVING_BEAMS.APPROVE)(req, res, next) : next(),
  (req, res, next) => req.body.load || req.body.loomId ? requirePermission(PERMISSIONS.WEAVING_BEAMS.LOAD)(req, res, next) : next(),
  ctrl.createJob);
router.post("/jobs/:id/void", requirePermission(PERMISSIONS.WEAVING_BEAMS.VOID), ctrl.voidJob);
module.exports = router;
