//Supplier Ledger Print Builder

// Helpers

const { formatBusinessDate } = require("../utils/businessDate");

const formatDate = (date) => formatBusinessDate(date) || "-";

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
  const openingInvoiceBalance = Array.isArray(ledger)
    ? ledger
        .filter((entry) =>
          ["opening_purchase_invoice", "opening_purchase_return"].includes(
            entry.sourceType,
          ),
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
          (entry.sourceType === "travel_vendor_return"
            ? "Travel Vendor Return/Credit"
            : entry.sourceType === "travel_vendor_cost"
            ? "Travel Vendor Cost"
            : entry.sourceType === "travel_refund"
              ? "Travel Vendor Recovery"
              : entry.sourceType === "purchase_invoice"
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

  // Closing Balance

  const closingBalance =
    formattedRows.length > 1
      ? formattedRows[formattedRows.length - 1].balance
      : opening;

  //Final Print Object

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
