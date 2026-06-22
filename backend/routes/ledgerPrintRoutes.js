const express = require("express");
const router = express.Router();

// 🔐 Auth Middleware
const { protect } = require("../middleware/authMiddleware");

// 📄 Customer Ledger Controllers
const {
  getCustomerLedgerHtml,
  generateCustomerLedgerPdf,
} = require("../controllers/ledgerPrintController");

// 📄 Customer Detail Ledger Controllers
const {
  getCustomerDetailLedgerHtml,
  generateCustomerDetailLedgerPdf,
} = require("../controllers/detailLedgerPrintController");

// 📄 Party Ledger Controllers
const {
  getPartyLedgerHtml,
  generatePartyLedgerPdf,
} = require("../controllers/partyLedgerPrintController");

// 📄 Party Detail Ledger Controllers
const {
  getPartyDetailLedgerHtml,
  generatePartyDetailLedgerPdf,
} = require("../controllers/partyDetailLedgerPrintController");

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

/* =========================================================
   PARTY LEDGER PRINT ROUTES
========================================================= */

// 🔹 HTML Preview
router.get("/party-ledger/:partyId/html", protect, getPartyLedgerHtml);

// 🔹 PDF Download
router.get("/party-ledger/:partyId/pdf", protect, generatePartyLedgerPdf);

/* =========================================================
   PARTY DETAILED LEDGER PRINT ROUTES
========================================================= */

// 🔹 HTML Preview
router.get(
  "/party-detail-ledger/:partyId/html",
  protect,
  getPartyDetailLedgerHtml,
);

// 🔹 PDF Download
router.get(
  "/party-detail-ledger/:partyId/pdf",
  protect,
  generatePartyDetailLedgerPdf,
);

module.exports = router;
