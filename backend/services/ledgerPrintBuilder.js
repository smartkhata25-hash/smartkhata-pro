// 📁 services/ledgerPrintBuilder.js

const { formatBusinessDate } = require("../utils/businessDate");

const formatDate = (date) => formatBusinessDate(date) || "-";

const safeNumber = (value) => {
  const num = Number(value);

  return Number.isFinite(num) ? num : 0;
};

const resolveSourceLabel = (sourceType) => {
  switch (sourceType) {
    case "opening_sale_invoice":
      return "Opening Balance";

    case "opening_refund_invoice":
      return "Opening Balance";

    case "sale_invoice":
      return "Sale Invoice";

    case "receive_payment":
      return "Receive Payment";

    case "receive_payment_discount":
      return "Receive Payment Discount";

    case "refund_invoice":
      return "Refund Invoice";

    case "purchase_invoice":
      return "Purchase Invoice";

    case "opening_purchase_invoice":
      return "Opening Balance";

    case "purchase_return":
      return "Purchase Return";

    case "opening_purchase_return":
      return "Opening Balance";

    case "pay_bill":
      return "Pay Bill";

    default:
      return "-";
  }
};

const buildCustomerLedgerPrint = ({
  customerName,
  startDate,
  endDate,
  openingBalance = 0,
  ledger = [],
}) => {
  const opening = safeNumber(openingBalance);

  let runningBalance = opening;
  let totalDebit = 0;
  let totalCredit = 0;

  const formattedRows = [];

  if (Array.isArray(ledger)) {
    for (const entry of ledger) {
      const debit = safeNumber(entry.debit);
      const credit = safeNumber(entry.credit);

      runningBalance += debit - credit;

      totalDebit += debit;
      totalCredit += credit;

      formattedRows.push({
        type: "entry",

        date: formatDate(entry.date),

        billNo: entry.billNo || "-",

        source: entry.sourceLabel || resolveSourceLabel(entry.sourceType),

        debit: debit > 0 ? debit : null,

        credit: credit > 0 ? credit : null,

        balance: Number(runningBalance.toFixed(2)),
      });
    }
  }

  const closingBalance =
    formattedRows.length > 0
      ? formattedRows[formattedRows.length - 1].balance
      : opening;

  return {
    documentTitle: "Customer Ledger",

    customer: {
      name: customerName || "-",
    },

    period: {
      from: startDate ? formatDate(startDate) : "All",
      to: endDate ? formatDate(endDate) : "All",
    },

    summary: {
      opening: Number(opening.toFixed(2)),
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      closingBalance: Number(closingBalance.toFixed(2)),
    },

    rows: formattedRows,
  };
};

module.exports = buildCustomerLedgerPrint;
