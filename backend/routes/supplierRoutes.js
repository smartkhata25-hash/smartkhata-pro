// backend/routes/supplierRoutes.js

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/supplierController");
const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

// ✅ Apply protect middleware to all routes
router.use(protect);

// ✅ Supplier CRUD Routes
router.route("/").post(ctrl.createSupplier).get(ctrl.getSuppliers);
router.post("/import", upload.single("file"), ctrl.importSuppliers);
router.route("/:id").put(ctrl.updateSupplier).delete(ctrl.deleteSupplier);

// 🧾 Ledger route removed from here

module.exports = router;
