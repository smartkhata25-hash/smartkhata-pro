const express = require("express");

const {
  getCustomerBillWiseAging,
  getPartyBillWiseAging,
} = require("../controllers/billWiseAgingController");
const {
  generateCustomerBillWiseAgingPdf,
  generatePartyBillWiseAgingPdf,
  getCustomerBillWiseAgingHtml,
  getPartyBillWiseAgingHtml,
} = require("../controllers/billWiseAgingPrintController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/customer/:customerId", protect, getCustomerBillWiseAging);
router.get("/customer/:customerId/html", protect, getCustomerBillWiseAgingHtml);
router.get("/customer/:customerId/pdf", protect, generateCustomerBillWiseAgingPdf);

router.get("/party/:partyId", protect, getPartyBillWiseAging);
router.get("/party/:partyId/html", protect, getPartyBillWiseAgingHtml);
router.get("/party/:partyId/pdf", protect, generatePartyBillWiseAgingPdf);

module.exports = router;
