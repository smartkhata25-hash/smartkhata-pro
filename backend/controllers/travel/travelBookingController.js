module.exports = {
  ...require("./bookings/bookingQueryController"),
  ...require("./bookings/bookingWriteController"),
  ...require("./bookings/bookingStatusController"),
  ...require("./bookings/bookingDashboardController"),
};
