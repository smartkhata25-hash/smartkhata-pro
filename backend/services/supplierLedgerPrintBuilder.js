/**
 * Supplier Ledger Print Builder
 * --------------------------------
 * Purpose:
 *  - Format raw supplier ledger data into print-ready structure
 *  - Calculate totals safely
 *  - Maintain running balance
 *  - Normalize values (no null / undefined leaks)
 *  - Keep structure consistent with Customer Ledger print
 */

/* ================================
   Helpers
================================ */

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

/* ================================
   Main Builder
================================ */

const buildSupplierLedgerPrint = ({
  supplierName,
  startDate,
  endDate,
  openingBalance = 0,
  ledger = [],
}) => {
  // 🔹 Normalize opening balance
  const opening = safeNumber(openingBalance);

  let runningBalance = opening;
  let totalDebit = 0;
  let totalCredit = 0;

  const formattedRows = [];

  /* ================================
     Opening Row
  ================================ */

  formattedRows.push({
    type: "opening",
    date: startDate ? formatDate(startDate) : "-",
    billNo: "-",
    source: "Opening Balance",
    debit: null,
    credit: null,
    balance: runningBalance,
  });

  /* ================================
     Ledger Entries
  ================================ */

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

        source:
          entry.sourceLabel ||
          (entry.sourceType === "purchase_invoice"
            ? "Purchase Invoice"
            : entry.sourceType === "pay_bill"
              ? "Payment"
              : entry.sourceType === "purchase_return"
                ? "Purchase Return"
                : "-"),

        debit: debit > 0 ? debit : null,
        credit: credit > 0 ? credit : null,
        balance: runningBalance,
      });
    }
  }

  /* ================================
     Closing Balance
  ================================ */

  const closingBalance =
    formattedRows.length > 1
      ? formattedRows[formattedRows.length - 1].balance
      : opening;

  /* ================================
     Final Print Object
  ================================ */

  return {
    documentTitle: "Supplier Ledger",

    supplier: {
      name: supplierName || "-",
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

module.exports = buildSupplierLedgerPrint;
