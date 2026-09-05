const Counter = require("../../models/Counter");
const { getBusinessDateKey } = require("../../utils/businessDate");

const generateTravelRefundNumber = async (userId, date = new Date(), session = null) => {
  const year = getBusinessDateKey(date, { fallback: new Date() }).slice(0, 4);

  const counter = await Counter.findOneAndUpdate(
    {
      userId,
      type: `travel_refund_${year}`,
    },
    {
      $inc: {
        seq: 1,
      },
      $setOnInsert: {
        userId,
        type: `travel_refund_${year}`,
      },
    },
    {
      new: true,
      upsert: true,
      session,
      setDefaultsOnInsert: false,
    },
  );

  return `TRR-${year}-${String(counter.seq).padStart(5, "0")}`;
};

module.exports = {
  generateTravelRefundNumber,
};
