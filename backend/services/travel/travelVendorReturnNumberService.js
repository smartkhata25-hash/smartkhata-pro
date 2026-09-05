const Counter = require("../../models/Counter");
const { getBusinessDateKey } = require("../../utils/businessDate");

const generateTravelVendorReturnNumber = async (
  userId,
  date = new Date(),
  session = null,
) => {
  const year = getBusinessDateKey(date, { fallback: new Date() }).slice(0, 4);

  const counter = await Counter.findOneAndUpdate(
    {
      userId,
      type: `travel_vendor_return_${year}`,
    },
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        userId,
        type: `travel_vendor_return_${year}`,
      },
    },
    {
      new: true,
      upsert: true,
      session,
      setDefaultsOnInsert: false,
    },
  );

  return `TVR-${year}-${String(counter.seq).padStart(5, "0")}`;
};

module.exports = {
  generateTravelVendorReturnNumber,
};
