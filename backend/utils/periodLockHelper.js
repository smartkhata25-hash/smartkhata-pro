const PeriodLock = require("../models/PeriodLock");

const isPeriodLocked = async (userId, date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();

  const lock = await PeriodLock.findOne({
    userId,
    year,
    month,
  });

  return !!lock;
};

module.exports = { isPeriodLocked };
