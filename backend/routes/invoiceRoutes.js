const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoiceController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware"); // ✅ attachment middleware

// ✅ نیا: آخری بل نمبر لائیں
router.get("/last-bill-no", protect, invoiceController.getLastBillNo);

// ✅ نیا: بل نمبر سے انوائس لائیں
router.get("/by-bill/:billNo", protect, invoiceController.getInvoiceByBillNo); // ✅ یہ لائن نئی شامل کی گئی ہے

// ✅ انوائس بنائیں
router.post(
  "/",
  protect,
  upload.single("attachment"),
  invoiceController.createInvoice
);

// ✅ تمام انوائسز لائیں
router.get("/", protect, invoiceController.getInvoices);

// ✅ ایک انوائس لائیں
router.get("/:id", protect, invoiceController.getInvoiceById);

// ✅ ادائیگی ریکارڈ کریں
router.put("/:id/payment", protect, invoiceController.recordPayment);

// ✅ انوائس اپڈیٹ کریں (نیا route)
router.put(
  "/:id",
  protect,
  upload.single("attachment"),
  invoiceController.updateInvoice
);

// ✅ انوائس delete کریں
router.delete("/:id", protect, invoiceController.deleteInvoice);

module.exports = router;
