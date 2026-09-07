const { ENTITY_TYPES, getBillWiseReceivableAging } = require("../services/billWiseAgingService");

const getUserId = (req) => req.user?.id || req.userId;

const sendAgingResponse = async (req, res, entityType) => {
  try {
    const idParam =
      entityType === ENTITY_TYPES.CUSTOMER ? req.params.customerId : req.params.partyId;

    const data = await getBillWiseReceivableAging({
      entityType,
      entityId: idParam,
      userId: getUserId(req),
      asOfDate: req.query.asOfDate,
    });

    return res.json(data);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Bill-wise aging failed",
    });
  }
};

const getCustomerBillWiseAging = (req, res) =>
  sendAgingResponse(req, res, ENTITY_TYPES.CUSTOMER);

const getPartyBillWiseAging = (req, res) =>
  sendAgingResponse(req, res, ENTITY_TYPES.PARTY);

module.exports = {
  getCustomerBillWiseAging,
  getPartyBillWiseAging,
};
