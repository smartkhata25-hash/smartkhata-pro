const { TRAVEL_VENDOR_TYPES } = require("../config/travelConfig");

module.exports = {
  ...require("./travel/travelerController"),
  ...require("./travel/travelServiceCategoryController"),
  ...require("./travel/travelServiceController"),
  ...require("./travel/travelHotelController"),
  TRAVEL_VENDOR_TYPES,
};
