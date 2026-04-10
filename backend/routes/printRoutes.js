const express = require("express");
const router = express.Router();

const printController = require("../controllers/printController");

const {
  getSupplierLedgerHtml,
  generateSupplierLedgerPdf,
} = require("../controllers/supplierLedgerPrintController");

const {
  getSupplierDetailLedgerHtml,
  generateSupplierDetailLedgerPdf,
} = require("../controllers/supplierDetailLedgerPrintController");

const {
  getAgingReportHtml,
  generateAgingReportPdf,
} = require("../controllers/agingPrintController");

const {
  getReceivePaymentHtml,
  generateReceivePaymentPdf,
  previewReceivePaymentHtml,
  previewReceivePaymentPdf,
} = require("../controllers/receivePaymentPrintController");

const authMiddleware = require("../middleware/authMiddleware");

/* =========================================================
   ✅ SALE INVOICE PRINT
========================================================= */

router.get("/sale/:id", authMiddleware, printController.getSaleInvoicePrint);

router.get(
  "/sale-return/:id",
  authMiddleware,
  printController.getSaleReturnPrint,
);

router.post("/sale-preview", authMiddleware, printController.salePreview);

router.post(
  "/sale-return-preview",
  authMiddleware,
  printController.saleReturnPreview,
);

router.post("/sale-pdf", authMiddleware, printController.generateSalePdf);

router.post(
  "/sale-return-pdf",
  authMiddleware,
  printController.generateSaleReturnPdf,
);

router.get(
  "/sale-html/:id",
  authMiddleware,
  printController.getSaleInvoiceHtml,
);

router.get(
  "/sale-return-html/:id",
  authMiddleware,
  printController.getSaleReturnHtml,
);

router.post(
  "/preview-settings-html",
  authMiddleware,
  printController.generatePreviewSettingsHtml,
);

/* =========================================================
   📘 SUPPLIER LEDGER PRINT
========================================================= */

router.get(
  "/supplier-ledger/:supplierId/html",
  authMiddleware,
  getSupplierLedgerHtml,
);

router.get(
  "/supplier-ledger/:supplierId/pdf",
  authMiddleware,
  generateSupplierLedgerPdf,
);

/* =========================================================
   📊 SUPPLIER DETAIL LEDGER PRINT
========================================================= */

router.get(
  "/supplier-detail-ledger/:supplierId/html",
  authMiddleware,
  getSupplierDetailLedgerHtml,
);

router.get(
  "/supplier-detail-ledger/:supplierId/pdf",
  authMiddleware,
  generateSupplierDetailLedgerPdf,
);

/* =========================================================
   📈 CUSTOMER AGING REPORT PRINT
========================================================= */

router.get("/aging-report/html", authMiddleware, getAgingReportHtml);

router.get("/aging-report/pdf", authMiddleware, generateAgingReportPdf);

/* =========================================================
   💰 RECEIVE PAYMENT PREVIEW (NO AUTH)
   ⚠️ IMPORTANT: preview routes always FIRST
========================================================= */

router.get("/receive-payment/preview/html", previewReceivePaymentHtml);

router.get("/receive-payment/preview/pdf", previewReceivePaymentPdf);

/* =========================================================
   💰 RECEIVE PAYMENT RECEIPT PRINT (SAVED)
========================================================= */

router.get("/receive-payment/:id/html", authMiddleware, getReceivePaymentHtml);

router.get(
  "/receive-payment/:id/pdf",
  authMiddleware,
  generateReceivePaymentPdf,
);

module.exports = router;
