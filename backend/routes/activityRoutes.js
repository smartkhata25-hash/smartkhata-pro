const express = require("express");

const protect = require("../middleware/authMiddleware");
const { ownerOnly } = require("../middleware/permissionMiddleware");

const {
  getActivities,
  getActivityById,
  getActivityStaffList,
  getActivitySummary,
} = require("../controllers/activityController");

const router = express.Router();

// صرف Business Owner Activity Logs دیکھ سکتا ہے
router.use(protect);
router.use(ownerOnly);

// Summary
router.get("/summary", getActivitySummary);

// Staff Filter List
router.get("/users", getActivityStaffList);

// Activity List
router.get("/", getActivities);

// Activity Detail
router.get("/:id", getActivityById);

module.exports = router;
