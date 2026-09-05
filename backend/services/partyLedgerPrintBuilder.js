// 📁 services/partyLedgerPrintBuilder.js

const { formatBusinessDate } = require("../utils/businessDate");

const formatDate = (date) => formatBusinessDate(date) || "-";

const safeNumber = (value) => {
  const num = Number(value);

  return Number.isFinite(num) ? num : 0;
};

const buildPartyLedgerPrint = ({
  partyName,
  partyPhone,
  role,
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

        source: entry.sourceLabel || entry.sourceType || "-",

        description: entry.description || "",

        paymentType: entry.paymentType || "",

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
    documentTitle: "Party Ledger",

    party: {
      name: partyName || "-",
      phone: partyPhone || "",
      role: role || "both",
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

module.exports = buildPartyLedgerPrint;
