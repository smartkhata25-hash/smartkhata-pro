const {
  collectVendorCostRows,
  getVendorCostKey,
} = require("./travelInvoiceAccountingService");
const { roundMoney } = require("./travelAccountingMetricsService");

const getReferenceId = (value) => value?._id || value?.id || value || "";

const buildVendorPurchaseGroups = (booking = {}) => {
  const groups = new Map();

  collectVendorCostRows(booking).forEach((row) => {
    const key = getVendorCostKey(row);
    const current = groups.get(key) || {
      vendorKey: key,
      vendorType: row.vendorType === "party" ? "party" : "vendor",
      vendorId: row.vendorId || null,
      vendorPartyId: row.vendorPartyId || null,
      purchaseAmount: 0,
      paidAmount: 0,
      serviceLabels: [],
      serviceTypes: [],
    };

    current.purchaseAmount = roundMoney(current.purchaseAmount + Number(row.amount || 0));
    current.paidAmount = roundMoney(current.paidAmount + Number(row.paidAmount || 0));

    if (row.description && !current.serviceLabels.includes(row.description)) {
      current.serviceLabels.push(row.description);
    }

    if (row.serviceType && !current.serviceTypes.includes(row.serviceType)) {
      current.serviceTypes.push(row.serviceType);
    }

    groups.set(key, current);
  });

  if (Array.isArray(booking.vendorPayments)) {
    const paymentMap = new Map(
      booking.vendorPayments.map((payment) => [getVendorCostKey(payment), payment]),
    );

    groups.forEach((group, key) => {
      const payment = paymentMap.get(key);

      group.paidAmount = roundMoney(payment?.paidAmount || 0);
      group.paymentType = payment?.paymentType || "credit";
    });
  }

  return [...groups.values()]
    .filter((group) => group.purchaseAmount > 0)
    .map((group) => {
      const paidAmount = roundMoney(
        Math.min(Math.max(group.paidAmount, 0), group.purchaseAmount),
      );
      const payableAmount = roundMoney(
        Math.max(group.purchaseAmount - paidAmount, 0),
      );
      const paymentStatus =
        payableAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "due";

      return {
        ...group,
        paidAmount,
        payableAmount,
        paymentStatus,
      };
    });
};

const buildPurchaseRowKey = ({ bookingId, vendorType, vendorId, vendorPartyId }) => {
  const counterpartyId =
    vendorType === "party" ? getReferenceId(vendorPartyId) : getReferenceId(vendorId);

  return `${getReferenceId(bookingId)}:${vendorType || "vendor"}:${counterpartyId}`;
};

const calculateRemainingReturnAmount = ({
  purchaseAmount,
  priorVendorReturns = 0,
  priorRefundRecovery = 0,
}) =>
  roundMoney(
    Math.max(
      Number(purchaseAmount || 0) -
        Number(priorVendorReturns || 0) -
        Number(priorRefundRecovery || 0),
      0,
    ),
  );

module.exports = {
  buildPurchaseRowKey,
  buildVendorPurchaseGroups,
  calculateRemainingReturnAmount,
};
