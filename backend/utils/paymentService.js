const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");

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
}) => {
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
    date: new Date(),
    time: new Date().toTimeString().slice(0, 8),
    sourceType,
    referenceId,
    billNo,
    createdBy: userId,
    description,
    customerId: counterPartyAccountId,

    lines,
  });

  await journal.save();

  return journal;
};

module.exports = {
  createPaymentEntry,
};
