// 📁 services/ledgerPrintBuilder.js

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

const buildCustomerLedgerPrint = ({
  customerName,
  startDate,
  endDate,
  openingBalance = 0,
  ledger = [],
}) => {
  const openingInvoiceBalance = Array.isArray(ledger)
    ? ledger
        .filter((entry) =>
          ["opening_sale_invoice", "opening_refund_invoice"].includes(
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

  // Ledger Rows

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
          (entry.sourceType === "opening_sale_invoice"
            ? "Opening Balance"
            : entry.sourceType === "sale_invoice"
              ? "Sale Invoice"
              : entry.sourceType === "receive_payment"
                ? "Receive Payment"
                : entry.sourceType === "refund_invoice"
                  ? "Refund Balance"
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

  // Final Print Object

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
      opening,
      totalDebit,
      totalCredit,
      closingBalance,
    },

    rows: formattedRows,
  };
};

module.exports = buildCustomerLedgerPrint;
