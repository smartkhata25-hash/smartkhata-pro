const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Account = require("../models/Account");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../utils/moduleScope");

const uniqueIds = (values = []) => [
  ...new Set(values.filter(Boolean).map((value) => String(value))),
];

const repairAccountScopes = async ({ label, accountIds }) => {
  const ids = uniqueIds(accountIds);

  if (ids.length === 0) {
    return { label, matched: 0, modified: 0 };
  }

  const result = await Account.updateMany(
    {
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      moduleScope: { $ne: MODULE_SCOPES.TRAVEL },
    },
    {
      $set: {
        moduleScope: MODULE_SCOPES.TRAVEL,
      },
    },
  );

  return {
    label,
    matched: result.matchedCount || 0,
    modified: result.modifiedCount || 0,
  };
};

const run = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.DB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI or DB_URI");
  }

  await mongoose.connect(mongoUri);

  const travelCustomers = await Customer.find(
    applyModuleScopeFilter(
      {
        account: { $ne: null },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("account")
    .lean();

  const travelVendors = await Supplier.find(
    applySupplierModuleScopeFilter(
      {
        account: { $ne: null },
        isDeleted: false,
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("account")
    .lean();

  const customerResult = await repairAccountScopes({
    label: "travelCustomers",
    accountIds: travelCustomers.map((customer) => customer.account),
  });

  const vendorResult = await repairAccountScopes({
    label: "travelVendors",
    accountIds: travelVendors.map((vendor) => vendor.account),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: {
          travelCustomers: travelCustomers.length,
          travelVendors: travelVendors.length,
        },
        repairs: [customerResult, vendorResult],
      },
      null,
      2,
    ),
  );
};

run()
  .catch((error) => {
    console.error("Travel counterparty account scope repair failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
