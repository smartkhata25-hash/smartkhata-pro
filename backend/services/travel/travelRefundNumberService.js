const Counter = require("../../models/Counter");

const generateTravelRefundNumber = async (userId, date = new Date(), session = null) => {
  const parsedDate = new Date(date);
  const year = Number.isNaN(parsedDate.getTime())
    ? new Date().getFullYear()
    : parsedDate.getFullYear();

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
