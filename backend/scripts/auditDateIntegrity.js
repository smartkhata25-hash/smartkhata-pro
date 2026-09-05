const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const Invoice = require("../models/Invoice");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const RefundInvoice = require("../models/RefundInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");
const ReceivePayment = require("../models/ReceivePayment");
const PayBill = require("../models/PayBill");
const TravelBooking = require("../models/TravelBooking");
const TravelRefund = require("../models/TravelRefund");
const TravelVendorReturn = require("../models/TravelVendorReturn");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");
const { getBusinessDateKey } = require("../utils/businessDate");

const SAMPLE_LIMIT = 25;

const idString = (value) => (value ? String(value) : "");

const getOwner = (doc) =>
  doc.createdBy || doc.userId || doc.businessOwnerId || doc.ownerId || null;

const dateKey = (value) => {
  try {
    return getBusinessDateKey(value, { allowEmpty: true });
  } catch {
    return "";
  }
};

const pushSample = (samples, sample) => {
  if (samples.length < SAMPLE_LIMIT) {
    samples.push(sample);
  }
};

const getReferenceMatch = (docId) => ({
  $or: [{ referenceId: docId }, { invoiceId: docId }],
});

const getSourceBaseFilter = (sourceTypes = [], originModules = []) => {
  const filter = {
    isDeleted: false,
  };

  if (sourceTypes.length) {
    filter.sourceType = { $in: sourceTypes };
  }

  if (originModules.length) {
    filter.originModule = { $in: originModules };
  }

  return filter;
};

const auditJournalAlignment = async ({
  label,
  Model,
  sourceDateField,
  sourceTypes = [],
  originModules = [],
  extraSourceFilter = {},
}) => {
  const result = {
    label,
    checked: 0,
    missingJournal: 0,
    mismatchedDate: 0,
    invalidSourceDate: 0,
    samples: [],
  };

  const cursor = Model.find({
    isDeleted: { $ne: true },
    ...extraSourceFilter,
  })
    .select(`_id billNo invoiceNumber returnNumber refundNumber ${sourceDateField} createdBy userId`)
    .lean()
    .cursor();

  for await (const doc of cursor) {
    result.checked += 1;
    const owner = getOwner(doc);
    const sourceKey = dateKey(doc[sourceDateField]);

    if (!sourceKey) {
      result.invalidSourceDate += 1;
      pushSample(result.samples, {
        issue: "invalid_source_date",
        id: idString(doc._id),
        billNo: doc.billNo || doc.invoiceNumber || doc.returnNumber || doc.refundNumber || "",
      });
      continue;
    }

    const journalFilter = {
      ...getSourceBaseFilter(sourceTypes, originModules),
      ...getReferenceMatch(doc._id),
    };

    if (owner) {
      journalFilter.createdBy = owner;
    }

    const journals = await JournalEntry.find(journalFilter)
      .select("_id date time billNo sourceType originModule")
      .lean();

    if (!journals.length) {
      result.missingJournal += 1;
      pushSample(result.samples, {
        issue: "missing_journal",
        id: idString(doc._id),
        billNo: doc.billNo || doc.invoiceNumber || doc.returnNumber || doc.refundNumber || "",
        sourceDate: sourceKey,
      });
      continue;
    }

    journals.forEach((journal) => {
      const journalKey = dateKey(journal.date);

      if (journalKey !== sourceKey) {
        result.mismatchedDate += 1;
        pushSample(result.samples, {
          issue: "journal_date_mismatch",
          id: idString(doc._id),
          journalId: idString(journal._id),
          billNo: doc.billNo || doc.invoiceNumber || doc.returnNumber || doc.refundNumber || journal.billNo || "",
          sourceDate: sourceKey,
          journalDate: journalKey,
          sourceType: journal.sourceType,
          originModule: journal.originModule,
        });
      }
    });
  }

  return result;
};

const auditInventoryAlignment = async ({
  label,
  Model,
  sourceDateField,
  invoiceModel,
  ownerField,
  extraSourceFilter = {},
}) => {
  const result = {
    label,
    checked: 0,
    missingInventory: 0,
    mismatchedDate: 0,
    samples: [],
  };

  const cursor = Model.find({
    isDeleted: { $ne: true },
    ...extraSourceFilter,
  })
    .select(`_id billNo ${sourceDateField} ${ownerField}`)
    .lean()
    .cursor();

  for await (const doc of cursor) {
    result.checked += 1;
    const sourceKey = dateKey(doc[sourceDateField]);
    const inventoryFilter = {
      invoiceId: doc._id,
      invoiceModel,
    };

    if (doc[ownerField]) {
      inventoryFilter.userId = doc[ownerField];
    }

    const rows = await InventoryTransaction.find(inventoryFilter)
      .select("_id date type note")
      .lean();

    if (!rows.length) {
      continue;
    }

    rows.forEach((row) => {
      const rowKey = dateKey(row.date);

      if (rowKey !== sourceKey) {
        result.mismatchedDate += 1;
        pushSample(result.samples, {
          issue: "inventory_date_mismatch",
          id: idString(doc._id),
          inventoryId: idString(row._id),
          billNo: doc.billNo || "",
          sourceDate: sourceKey,
          inventoryDate: rowKey,
          type: row.type,
        });
      }
    });
  }

  return result;
};

const printResult = (result) => {
  console.log(`\n${result.label}`);
  console.log(`  checked: ${result.checked}`);

  Object.entries(result)
    .filter(([key]) => !["label", "checked", "samples"].includes(key))
    .forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

  if (result.samples.length) {
    console.log("  samples:");
    result.samples.forEach((sample) => {
      console.log(`    - ${JSON.stringify(sample)}`);
    });
  }
};

const hasIssue = (result) =>
  Object.entries(result).some(
    ([key, value]) =>
      !["label", "checked", "samples"].includes(key) && Number(value) > 0,
  );

const run = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.DB_URI;

  if (!mongoUri) {
    console.error("MONGO_URI or DB_URI is required. No audit was run.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUri);

  const results = [];

  results.push(
    await auditJournalAlignment({
      label: "Sales invoices -> journals",
      Model: Invoice,
      sourceDateField: "invoiceDate",
      sourceTypes: ["sale_invoice", "opening_sale_invoice", "sale_discount", "receive_payment"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Purchase invoices -> journals",
      Model: PurchaseInvoice,
      sourceDateField: "invoiceDate",
      sourceTypes: ["purchase_invoice", "opening_purchase_invoice", "purchase_discount", "pay_bill"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Receive payments -> journals",
      Model: ReceivePayment,
      sourceDateField: "date",
      sourceTypes: ["receive_payment", "receive_payment_discount"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Pay bills -> journals",
      Model: PayBill,
      sourceDateField: "date",
      sourceTypes: ["pay_bill", "purchase_discount"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Refund invoices -> journals",
      Model: RefundInvoice,
      sourceDateField: "invoiceDate",
      sourceTypes: ["refund_invoice", "opening_refund_invoice", "refund_payment"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Purchase returns -> journals",
      Model: PurchaseReturn,
      sourceDateField: "returnDate",
      sourceTypes: ["purchase_return", "opening_purchase_return", "purchase_return_payment"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Travel bookings -> journals",
      Model: TravelBooking,
      sourceDateField: "invoiceDate",
      originModules: ["travel_invoice"],
      extraSourceFilter: { accountingPosted: true },
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Travel refunds -> journals",
      Model: TravelRefund,
      sourceDateField: "refundDate",
      originModules: ["travel_refund"],
    }),
  );

  results.push(
    await auditJournalAlignment({
      label: "Travel vendor returns -> journals",
      Model: TravelVendorReturn,
      sourceDateField: "returnDate",
      originModules: ["travel_vendor_return"],
    }),
  );

  results.push(
    await auditInventoryAlignment({
      label: "Sales invoices -> inventory",
      Model: Invoice,
      sourceDateField: "invoiceDate",
      invoiceModel: "Invoice",
      ownerField: "createdBy",
    }),
  );

  results.push(
    await auditInventoryAlignment({
      label: "Purchase invoices -> inventory",
      Model: PurchaseInvoice,
      sourceDateField: "invoiceDate",
      invoiceModel: "PurchaseInvoice",
      ownerField: "userId",
    }),
  );

  results.push(
    await auditInventoryAlignment({
      label: "Refund invoices -> inventory",
      Model: RefundInvoice,
      sourceDateField: "invoiceDate",
      invoiceModel: "RefundInvoice",
      ownerField: "createdBy",
    }),
  );

  results.push(
    await auditInventoryAlignment({
      label: "Purchase returns -> inventory",
      Model: PurchaseReturn,
      sourceDateField: "returnDate",
      invoiceModel: "PurchaseReturn",
      ownerField: "createdBy",
    }),
  );

  results.forEach(printResult);

  const issueCount = results.filter(hasIssue).length;
  console.log(`\nDate integrity dry-run complete. Sections with issues: ${issueCount}`);
  process.exitCode = issueCount > 0 ? 1 : 0;
};

run()
  .catch((error) => {
    console.error("Date integrity dry-run failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
