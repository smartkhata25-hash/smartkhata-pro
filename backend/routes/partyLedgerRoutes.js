const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const { getPartyLedger } = require("../controllers/partyLedgerController");

const {
  getPartyDetailedLedgerJson,
} = require("../controllers/partyDetailLedgerPrintController");

/* =========================================================
   PROTECT ALL ROUTES
========================================================= */

router.use(protect);

/* =========================================================
   PARTY LEDGER
========================================================= */

// Standard Party Ledger
router.get("/:partyId", getPartyLedger);

/* =========================================================
   PARTY DETAIL LEDGER
========================================================= */

// Detailed Party Ledger JSON
router.get("/:partyId/detailed-ledger", getPartyDetailedLedgerJson);

module.exports = router;
