const express = require("express");

const protect = require("../middleware/authMiddleware");
const { ownerOnly } = require("../middleware/permissionMiddleware");

const {
  createStaff,
  getStaffList,
  getStaffById,
  updateStaff,
  updateStaffPermissions,
  updateStaffStatus,
  resetStaffPassword,
  deleteStaff,
} = require("../controllers/staffController");

const router = express.Router();

router.use(protect);
router.use(ownerOnly);

router.route("/").get(getStaffList).post(createStaff);

router.put("/:id/permissions", updateStaffPermissions);
router.put("/:id/status", updateStaffStatus);
router.put("/:id/reset-password", resetStaffPassword);

router.route("/:id").get(getStaffById).put(updateStaff).delete(deleteStaff);

module.exports = router;
