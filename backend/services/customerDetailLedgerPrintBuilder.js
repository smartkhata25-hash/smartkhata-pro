// Customer Detail Ledger Print Builder

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

// Source Label Resolver
const resolveSourceLabel = (type) => {
  switch (type) {
    case "opening_sale_invoice":
      return "Opening Sale Invoice";

    case "sale_invoice":
      return "Sale Invoice";

    case "refund_invoice":
      return "Refund Invoice";

    case "receive_payment":
      return "Receive Payment";

    case "opening_balance":
      return "Opening Balance";

    default:
      return "-";
  }
};

// Normalize Items

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];

  return items.map((it) => ({
    productName: it.productName || "Product",
    quantity: safeNumber(it.quantity),
    rate: safeNumber(it.rate),
    total: safeNumber(it.total),
  }));
};

/* ================================
   Main Builder
================================ */

const buildCustomerDetailLedgerPrint = ({
  customerName,
  startDate,
  endDate,
  openingBalance = 0,
  customerOpeningBalance = 0,
  ledger = [],
}) => {
  const opening = safeNumber(customerOpeningBalance || openingBalance);

  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const blocks = [];

  /* ================================
     Ledger Blocks
  ================================ */

  if (Array.isArray(ledger)) {
    for (const entry of ledger) {
      const debit = safeNumber(entry.debit);
      const credit = safeNumber(entry.credit);

      totalDebit += debit;
      totalCredit += credit;

      runningBalance += debit - credit;

      const block = {
        type: "entry",

        key: entry.referenceId || entry._id || Math.random().toString(),

        billNo: entry.billNo || "-",

        date: formatDate(entry.date),

        sourceType: entry.sourceType || "",

        sourceLabel: entry.sourceLabel || "",

        items: normalizeItems(entry.items),

        debit: debit > 0 ? debit : null,

        credit: credit > 0 ? credit : null,

        balance: runningBalance,
      };

      blocks.push(block);
    }
  }

  /* ================================
     Closing Balance
  ================================ */

  const closingBalance =
    blocks.length > 1 ? blocks[blocks.length - 1].balance : opening;

  /* ================================
     Final Print Object
  ================================ */

  return {
    documentTitle: "Customer Detailed Ledger",

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

    blocks,
  };
};

module.exports = buildCustomerDetailLedgerPrint;
