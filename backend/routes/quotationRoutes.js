const express = require("express");

const controller = require("../controllers/quotationController");
const { protect } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");

const router = express.Router();

router.get("/", protect, requirePermission(PERMISSIONS.SALES.VIEW), controller.getQuotations);
router.get("/:id", protect, requirePermission(PERMISSIONS.SALES.VIEW), controller.getQuotationById);
router.post("/", protect, requirePermission(PERMISSIONS.SALES.CREATE), controller.createQuotation);
router.put("/:id", protect, requirePermission(PERMISSIONS.SALES.EDIT), controller.updateQuotation);
router.delete("/:id", protect, requirePermission(PERMISSIONS.SALES.DELETE), controller.deleteQuotation);

module.exports = router;
