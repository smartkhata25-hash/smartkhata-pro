const express = require("express");

const ctrl = require("../controllers/weavingAttendanceController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");
const { PERMISSIONS } = require("../utils/permissionList");

const router = express.Router();

router.use(protect);
router.use(requireModule(MODULE_KEYS.WEAVING));

router.get(
  "/meta",
  requirePermission(
    PERMISSIONS.WEAVING_ATTENDANCE.VIEW,
    PERMISSIONS.WEAVING_ATTENDANCE.MANAGE,
    PERMISSIONS.WEAVING_ATTENDANCE.OVERRIDE,
  ),
  ctrl.getAttendanceMeta,
);

router.get(
  "/session",
  requirePermission(
    PERMISSIONS.WEAVING_ATTENDANCE.VIEW,
    PERMISSIONS.WEAVING_ATTENDANCE.MANAGE,
    PERMISSIONS.WEAVING_ATTENDANCE.OVERRIDE,
  ),
  ctrl.getAttendanceSession,
);

router.post(
  "/session",
  requirePermission(
    PERMISSIONS.WEAVING_ATTENDANCE.MANAGE,
    PERMISSIONS.WEAVING_ATTENDANCE.OVERRIDE,
  ),
  ctrl.saveAttendanceSession,
);

router.get(
  "/summary",
  requirePermission(
    PERMISSIONS.WEAVING_ATTENDANCE.VIEW,
    PERMISSIONS.WEAVING_ATTENDANCE.MANAGE,
    PERMISSIONS.WEAVING_ATTENDANCE.OVERRIDE,
  ),
  ctrl.getAttendanceDashboardSummary,
);

module.exports = router;
