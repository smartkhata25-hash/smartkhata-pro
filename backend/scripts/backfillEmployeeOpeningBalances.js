/*
 * Controlled employee opening-balance migration.
 * Dry run (default): node scripts/backfillEmployeeOpeningBalances.js --user=<id> --opening-date=YYYY-MM-DD
 * Apply:             node scripts/backfillEmployeeOpeningBalances.js --user=<id> --opening-date=YYYY-MM-DD --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const { reconcileEmployeeOpeningBalance } = require("../services/employee/employeeAccountingService");

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const userId = args.get("user");
const openingDate = args.get("opening-date");
const apply = args.get("apply") === "true";

if (!mongoose.isValidObjectId(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(openingDate || "")) {
  throw new Error("Provide --user=<ObjectId> and an explicit --opening-date=YYYY-MM-DD.");
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const employees = await Employee.find({
    userId,
    "openingBalance.amount": { $gt: 0 },
    openingJournalId: null,
  });
  console.log(`${apply ? "Applying" : "Dry run:"} ${employees.length} employee opening balance(s).`);
  for (const employee of employees) {
    console.log(`${employee._id} ${employee.name}: ${employee.openingBalance.type} ${employee.openingBalance.amount}`);
    if (!apply) continue;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        employee.openingBalance.recordedAt = new Date(`${openingDate}T00:00:00.000Z`);
        await reconcileEmployeeOpeningBalance({
          userId,
          moduleScope: employee.moduleScope,
          employee,
          previousOpeningBalance: employee.openingBalance,
          allowLegacyBackfill: true,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
  }
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
