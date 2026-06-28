// 📁 services/partyLedgerPrintBuilder.js

/**
 * Party Ledger Print Builder
 * --------------------------------
 * Purpose:
 *  - Format party ledger for print
 *  - Calculate running balance
 *  - Support customer + supplier transactions
 *  - Keep structure same as Customer/Supplier Ledger
 */

const formatDate = (date) => {
  if (!date) return "-";

  const d = new Date(date);

  if (isNaN(d)) return "-";

  return d.toLocaleDateString("en-GB");
};

const safeNumber = (value) => {
  const num = Number(value);

  return isNaN(num) ? 0 : num;
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
  const openingInvoiceBalance = Array.isArray(ledger)
    ? ledger
        .filter((entry) =>
          [
            "opening_sale_invoice",
            "opening_refund_invoice",
            "opening_purchase_invoice",
            "opening_purchase_return",
          ].includes(entry.sourceType),
        )
        .reduce(
          (sum, entry) =>
            sum + safeNumber(entry.debit) - safeNumber(entry.credit),
          0,
        )
    : 0;

  const opening = openingInvoiceBalance || safeNumber(openingBalance);

  let runningBalance = 0;

  let totalDebit = 0;
  let totalCredit = 0;

  const formattedRows = [];

  /* ==============================
     Ledger Rows
  ============================== */

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

        balance: runningBalance,
      });
    }
  }

  /* ==============================
     Closing Balance
  ============================== */

  const closingBalance =
    formattedRows.length > 1
      ? formattedRows[formattedRows.length - 1].balance
      : opening;

  /* ==============================
     Final Print Object
  ============================== */

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
      opening,

      totalDebit,

      totalCredit,

      closingBalance,
    },

    rows: formattedRows,
  };
};

module.exports = buildPartyLedgerPrint;
