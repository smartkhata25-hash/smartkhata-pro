//Supplier Detail Ledger Print Builder

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

const resolveSourceLabel = (type) => {
  switch (type) {
    case "purchase_invoice":
      return "Purchase Invoice";

    case "purchase_return":
      return "Purchase Return";

    case "payment":
      return "Payment";

    case "opening_balance":
      return "Opening Balance";

    default:
      return "-";
  }
};

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];

  return items.map((it) => ({
    productName: it.productName || "Product",
    quantity: safeNumber(it.quantity),
    rate: safeNumber(it.rate),
    total: safeNumber(it.total),
  }));
};

const buildSupplierDetailLedgerPrint = ({
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
            sum + safeNumber(entry.credit) - safeNumber(entry.debit),
          0,
        )
    : 0;

  const opening = openingInvoiceBalance || safeNumber(openingBalance);

  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const blocks = [];

  if (Array.isArray(ledger)) {
    for (const entry of ledger) {
      const debit = safeNumber(entry.debit);
      const credit = safeNumber(entry.credit);

      totalDebit += debit;
      totalCredit += credit;

      runningBalance += credit - debit;

      const block = {
        type: "entry",

        key: entry.referenceId || entry._id || Math.random().toString(),

        billNo: entry.billNo || "-",

        date: formatDate(entry.date),

        sourceType: entry.sourceType || "",

        sourceLabel: entry.sourceLabel || resolveSourceLabel(entry.sourceType),

        items: normalizeItems(entry.items),

        debit: debit > 0 ? debit : null,

        credit: credit > 0 ? credit : null,

        balance: runningBalance,
      };

      blocks.push(block);
    }
  }

  const closingBalance =
    blocks.length > 1 ? blocks[blocks.length - 1].balance : opening;

  return {
    documentTitle: "Supplier Detailed Ledger",

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

    blocks,
  };
};

module.exports = buildSupplierDetailLedgerPrint;
