require("dotenv").config();
const mongoose = require("mongoose");
const WeavingAttendanceCorrection = require("../models/WeavingAttendanceCorrection");
const WeavingPayrollOperation = require("../models/WeavingPayrollOperation");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([
    WeavingPayrollOperation.createIndexes(),
    WeavingAttendanceCorrection.createIndexes(),
  ]);
  console.log("Weaving Payroll Phase 1 indexes are ready.");
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
