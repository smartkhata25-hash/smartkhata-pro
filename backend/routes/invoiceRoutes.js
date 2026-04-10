const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoiceController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.get("/by-bill/:billNo", protect, invoiceController.getInvoiceByBillNo);

router.post(
  "/",
  protect,
  upload.single("attachment"),
  invoiceController.createInvoice,
);

router.get("/", protect, invoiceController.getInvoices);

router.get("/search", protect, invoiceController.searchInvoices);

router.get("/last-bill-no", protect, invoiceController.getLastInvoiceNo);

router.get("/navigate", protect, invoiceController.navigateInvoice);

router.get("/:id", protect, invoiceController.getInvoiceById);

router.put("/:id/payment", protect, invoiceController.recordPayment);

router.put(
  "/:id",
  protect,
  upload.single("attachment"),
  invoiceController.updateInvoice,
);

router.delete("/:id", protect, invoiceController.deleteInvoice);

module.exports = router;
