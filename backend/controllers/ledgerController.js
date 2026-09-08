const {
  getCustomerLedgerCore,
} = require("../services/customerLedgerCoreService");

const getUserId = (req) => req.user?.id || req.userId;

const getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, moduleScope } = req.query;

    const data = await getCustomerLedgerCore({
      customerId,
      userId: getUserId(req),
      startDate,
      endDate,
      moduleScope,
      allowAccountIdFallback: true,
    });

    return res.json({
      customerId: data.customerId,
      customerName: data.customerName,
      isActive: data.isActive,
      hiddenReason: data.hiddenReason,
      openingBalance: data.openingBalance,
      ledger: data.ledger,
    });
  } catch (err) {
    console.error("Ledger fetch error:", err);

    return res.status(err.statusCode || 500).json({
      message: err.message || "Server error",
      error: err.message,
    });
  }
};

const getCustomerBalance = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { moduleScope } = req.query;

    const data = await getCustomerLedgerCore({
      accountId,
      userId: getUserId(req),
      moduleScope,
    });

    return res.json({
      customerId: data.customerId,
      accountId: data.accountId,
      balance: data.closingBalance,
    });
  } catch (err) {
    console.error("Customer balance fetch error:", err);

    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to fetch customer balance",
      error: err.message,
    });
  }
};

module.exports = {
  getCustomerLedger,
  getCustomerBalance,
};
