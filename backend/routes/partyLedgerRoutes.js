const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  getPartyLedger,
  getPartyBalance,
} = require("../controllers/partyLedgerController");

const {
  getPartyDetailedLedgerJson,
} = require("../controllers/partyDetailLedgerPrintController");

router.use(protect);

router.get("/balance/:partyId", getPartyBalance);

router.get("/:partyId/detailed-ledger", getPartyDetailedLedgerJson);

router.get("/:partyId", getPartyLedger);

module.exports = router;
