const mongoose = require("mongoose");

const TravelBooking = require("../../../models/TravelBooking");
const {
  getTravelDashboardAccountingTotals,
} = require("../../../services/travel/travelAccountingMetricsService");
const {
  ONE_DAY_MS,
  getUserId,
  sendError,
} = require("../../../services/travel/travelBookingService");

exports.getTravelDashboardSummary = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(getUserId(req)));
    const now = new Date();
    const next30Days = new Date(now.getTime() + 30 * ONE_DAY_MS);

    const [summary] = await TravelBooking.aggregate([
      {
        $match: {
          userId,
          isActive: true,
          isDeleted: false,
          isVoided: { $ne: true },
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          upcomingDepartures: [
            {
              $match: {
                status: { $ne: "cancelled" },
                travelStartDate: { $gte: now, $lte: next30Days },
              },
            },
            { $count: "count" },
          ],
          pendingVisas: [
            {
              $match: {
                status: { $nin: ["completed", "cancelled"] },
              },
            },
            { $unwind: "$bookingItems" },
            {
              $match: {
                "bookingItems.itemType": "visit_visa",
              },
            },
            { $count: "count" },
          ],
          itemCounts: [
            { $unwind: "$bookingItems" },
            {
              $match: {
                status: { $ne: "cancelled" },
              },
            },
            {
              $group: {
                _id: "$bookingItems.itemType",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const itemCounts = new Map(
      (summary?.itemCounts || []).map((row) => [
        row._id,
        Number(row.count || 0),
      ]),
    );
    const [accounting, upcomingBookings] = await Promise.all([
      getTravelDashboardAccountingTotals(userId),
      TravelBooking.find({
        userId,
        isActive: true,
        isDeleted: false,
        isVoided: { $ne: true },
        status: { $ne: "cancelled" },
        travelStartDate: { $gte: now, $lte: next30Days },
      })
        .select(
          "_id bookingNumber invoiceNumber status serviceType customerId travelStartDate travelEndDate",
        )
        .populate("customerId", "name phone")
        .sort({ travelStartDate: 1, updatedAt: -1 })
        .limit(5)
        .lean(),
    ]);
    const upcomingCount = Number(summary?.upcomingDepartures?.[0]?.count || 0);

    res.setHeader("Cache-Control", "private, no-cache");

    return res.json({
      totalBookings: Number(summary?.total?.[0]?.count || 0),
      tickets: Number(itemCounts.get("air_ticket") || 0),
      visaCases: Number(itemCounts.get("visit_visa") || 0),
      umrahBookings: Number(itemCounts.get("umrah_package") || 0),
      hotelBookings: Number(itemCounts.get("hotel") || 0),
      upcomingDepartures: upcomingCount,
      totalSales: accounting.totalSales,
      netTravelRevenue: accounting.netTravelRevenue,
      netTravelCost: accounting.netTravelCost,
      received: accounting.received,
      refundPaid: accounting.refundPaid,
      vendorPayments: accounting.vendorPayments,
      vendorReturnCashReceived: accounting.vendorReturnCashReceived,
      travelExpensePaid: accounting.travelExpensePaid,
      travelCashIn: accounting.travelCashIn,
      travelCashOut: accounting.travelCashOut,
      netTravelCashMovement: accounting.netTravelCashMovement,
      customerDue: accounting.customerDue,
      customerCredit: accounting.customerCredit,
      totalReceivable: accounting.totalReceivable,
      receivableDetails: accounting.receivableDetails || [],

      vendorPayable: accounting.vendorPayable,
      vendorCredit: accounting.vendorCredit,
      totalPayable: accounting.totalPayable,
      payableDetails: accounting.payableDetails || [],
      grossProfit: accounting.grossProfit,
      travelExpenses: accounting.travelExpenses,
      netProfit: accounting.netProfit,
      cashInHand: accounting.cashInHand,
      bankBalance: accounting.bankBalance,
      cashAccounts: accounting.cashAccounts,
      bankAccounts: accounting.bankAccounts,
      pendingVisas: Number(summary?.pendingVisas?.[0]?.count || 0),
      missingDocuments: 0,
      upcomingTrips: upcomingCount,
      upcomingBookings: upcomingBookings.map((booking) => ({
        _id: booking._id,
        bookingNumber: booking.bookingNumber || "",
        invoiceNumber: booking.invoiceNumber || "",
        status: booking.status || "",
        serviceType: booking.serviceType || "",
        travelStartDate: booking.travelStartDate || null,
        travelEndDate: booking.travelEndDate || null,
        customer: booking.customerId
          ? {
              _id: booking.customerId._id,
              name: booking.customerId.name || "",
              phone: booking.customerId.phone || "",
            }
          : null,
      })),
    });
  } catch (error) {
    return sendError(res, error, "Travel dashboard summary failed");
  }
};
