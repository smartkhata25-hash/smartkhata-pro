const PeriodLock = require("../models/PeriodLock");
const { getBusinessDateKey } = require("./businessDate");

const isPeriodLocked = async (userId, date) => {
  let dateKey = "";

  try {
    dateKey = getBusinessDateKey(date || new Date());
  } catch {
    return false;
  }

  const [year, monthNumber] = dateKey.split("-").map(Number);
  const month = monthNumber - 1;

  const lock = await PeriodLock.findOne({
    userId,
    year,
    month,
  });

  return !!lock;
};

module.exports = { isPeriodLocked };
