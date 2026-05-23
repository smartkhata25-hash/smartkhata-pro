const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("./accountHelper");
const Account = require("../models/Account");

const createPaymentEntry = async ({
  userId,
  referenceId,
  sourceType,
  billNo,
  accountId,
  counterPartyAccountId,
  amount,
  paymentType,
  description = "",
  originModule = "",

  entryDate = new Date(),
  entryTime = new Date().toTimeString().slice(0, 8),
}) => {
  amount = Number(amount);

  if (!accountId || !counterPartyAccountId || !amount) {
    throw new Error("Missing required payment fields");
  }

  if (amount <= 0) {
    throw new Error("Invalid payment amount");
  }

  let lines = [];

  switch (sourceType) {
    case "receive_payment":
      lines = [
        {
          account: new mongoose.Types.ObjectId(accountId),
          type: "debit",
          amount,
          paymentType: paymentType || "cash",
        },
        {
          account: new mongoose.Types.ObjectId(counterPartyAccountId),
          type: "credit",
          amount,
          paymentType: paymentType || "cash",
        },
      ];
      break;

    case "pay_bill":
    case "purchase_payment":
      lines = [
        {
          account: new mongoose.Types.ObjectId(counterPartyAccountId),
          type: "debit",
          amount,
          paymentType: paymentType || "cash",
        },
        {
          account: new mongoose.Types.ObjectId(accountId),
          type: "credit",
          amount,
          paymentType: paymentType || "cash",
        },
      ];
      break;

    case "refund_payment":
      lines = [
        {
          account: new mongoose.Types.ObjectId(counterPartyAccountId),
          type: "debit",
          amount,
          paymentType: paymentType || "cash",
        },
        {
          account: new mongoose.Types.ObjectId(accountId),
          type: "credit",
          amount,
          paymentType: paymentType || "cash",
        },
      ];
      break;

    case "purchase_return_payment":
      lines = [
        {
          account: new mongoose.Types.ObjectId(accountId),
          type: "debit",
          amount,
          paymentType: paymentType || "cash",
        },
        {
          account: new mongoose.Types.ObjectId(counterPartyAccountId),
          type: "credit",
          amount,
          paymentType: paymentType || "cash",
        },
      ];
      break;

    default:
      throw new Error(`Unsupported payment sourceType: ${sourceType}`);
  }

  const journal = new JournalEntry({
    date: entryDate || new Date(),
    time: entryTime || new Date().toTimeString().slice(0, 8),
    sourceType,
    originModule,
    referenceId,
    billNo,
    createdBy: userId,
    description,

    customerId:
      sourceType === "receive_payment" || sourceType === "refund_payment"
        ? counterPartyAccountId
        : null,

    supplierId:
      sourceType === "pay_bill" ||
      sourceType === "purchase_payment" ||
      sourceType === "purchase_return_payment"
        ? counterPartyAccountId
        : null,

    lines,
  });

  await journal.save();

  const uniqueAccounts = [
    ...new Set(lines.map((line) => line.account.toString())),
  ];

  for (const accId of uniqueAccounts) {
    await recalculateAccountBalance(accId);
  }

  return journal;
};

const createDiscountEntry = async ({
  userId,
  referenceId,
  billNo,
  customerAccountId,
  discountAmount,
  description = "",
  originModule = "",

  sourceType = "sale_discount",

  // ✅ NEW
  discountAccountCode = "SALES_DISCOUNT",

  discountAccountName = "sales discount",

  entryDate = new Date(),

  entryTime = new Date().toTimeString().slice(0, 8),
}) => {
  discountAmount = Number(discountAmount);

  if (!customerAccountId || !discountAmount) {
    throw new Error("Missing required discount fields");
  }
  let salesDiscountAccount = await Account.findOne({
    code: discountAccountCode,
    userId,
  });

  if (!salesDiscountAccount) {
    salesDiscountAccount = await Account.create({
      userId,
      name: discountAccountName,
      type: "Expense",
      normalBalance: "debit",
      code: discountAccountCode,
      category: "discount",
      isSystem: true,
    });
  }

  let lines = [];

  if (sourceType === "purchase_discount") {
    lines = [
      {
        account: new mongoose.Types.ObjectId(customerAccountId),
        type: "debit",
        amount: discountAmount,
      },
      {
        account: new mongoose.Types.ObjectId(salesDiscountAccount._id),
        type: "credit",
        amount: discountAmount,
      },
    ];
  } else {
    lines = [
      {
        account: new mongoose.Types.ObjectId(salesDiscountAccount._id),
        type: "debit",
        amount: discountAmount,
      },
      {
        account: new mongoose.Types.ObjectId(customerAccountId),
        type: "credit",
        amount: discountAmount,
      },
    ];
  }

  const journal = new JournalEntry({
    date: entryDate || new Date(),
    time: entryTime || new Date().toTimeString().slice(0, 8),
    sourceType,
    originModule,
    referenceId,
    billNo,
    createdBy: userId,
    description,

    customerId: customerAccountId,

    lines,
  });

  await journal.save();

  const uniqueAccounts = [
    ...new Set(lines.map((line) => line.account.toString())),
  ];

  for (const accId of uniqueAccounts) {
    await recalculateAccountBalance(accId);
  }

  return journal;
};

const createReceivePaymentDiscountEntry = async ({
  userId,
  referenceId,
  billNo,
  customerAccountId,
  discountAmount,
  description = "",
  originModule = "",
}) => {
  discountAmount = Number(discountAmount);

  if (!customerAccountId || !discountAmount) {
    throw new Error("Missing required receive payment discount fields");
  }

  let discountAccount = await Account.findOne({
    code: "RECEIVE_PAYMENT_DISCOUNT",
    userId,
  });

  if (!discountAccount) {
    discountAccount = await Account.create({
      userId,
      name: "receive payment discount",
      type: "Expense",
      normalBalance: "debit",
      code: "RECEIVE_PAYMENT_DISCOUNT",
      category: "discount",
      isSystem: true,
    });
  }

  const lines = [
    {
      account: new mongoose.Types.ObjectId(discountAccount._id),
      type: "debit",
      amount: discountAmount,
    },
    {
      account: new mongoose.Types.ObjectId(customerAccountId),
      type: "credit",
      amount: discountAmount,
    },
  ];

  const journal = new JournalEntry({
    date: new Date(),
    time: new Date().toTimeString().slice(0, 8),
    sourceType: "receive_payment_discount",
    originModule,
    referenceId,
    billNo,
    createdBy: userId,
    description: "Receive Payment Discount",

    customerId: customerAccountId,

    lines,
  });

  await journal.save();

  const uniqueAccounts = [
    ...new Set(lines.map((line) => line.account.toString())),
  ];

  for (const accId of uniqueAccounts) {
    await recalculateAccountBalance(accId);
  }

  return journal;
};

module.exports = {
  createPaymentEntry,
  createDiscountEntry,
  createReceivePaymentDiscountEntry,
};
