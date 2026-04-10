const express = require("express");
const router = express.Router();

// 🔐 Auth Middleware
const { protect } = require("../middleware/authMiddleware");

// 📄 Controllers
const {
  getCustomerLedgerHtml,
  generateCustomerLedgerPdf,
} = require("../controllers/ledgerPrintController");

const {
  getCustomerDetailLedgerHtml,
  generateCustomerDetailLedgerPdf,
} = require("../controllers/detailLedgerPrintController");

/* =========================================================
   CUSTOMER LEDGER PRINT ROUTES
========================================================= */

// 🔹 HTML Preview
router.get("/customer-ledger/:customerId/html", protect, getCustomerLedgerHtml);

// 🔹 PDF Download
router.get(
  "/customer-ledger/:customerId/pdf",
  protect,
  generateCustomerLedgerPdf,
);

/* =========================================================
   CUSTOMER DETAILED LEDGER PRINT ROUTES
========================================================= */

// 🔹 HTML Preview
router.get(
  "/customer-detail-ledger/:customerId/html",
  protect,
  getCustomerDetailLedgerHtml,
);

// 🔹 PDF Download
router.get(
  "/customer-detail-ledger/:customerId/pdf",
  protect,
  generateCustomerDetailLedgerPdf,
);

module.exports = router;
