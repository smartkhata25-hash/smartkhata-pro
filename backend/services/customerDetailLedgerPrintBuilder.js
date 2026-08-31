// Customer Detail Ledger Print Builder

const formatDate = (date) => {
  if (!date) return "-";

  const d = new Date(date);

  if (isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("en-GB");
};

const safeNumber = (value) => {
  const num = Number(value);

  return Number.isFinite(num) ? num : 0;
};

const resolveSourceLabel = (type) => {
  switch (type) {
    case "travel_booking":
      return "Travel Invoice";

    case "travel_refund":
      return "Travel Refund";

    case "opening_sale_invoice":
      return "Opening Balance";

    case "opening_refund_invoice":
      return "Opening Balance";

    case "sale_invoice":
      return "Sale Invoice";

    case "refund_invoice":
      return "Refund Invoice";

    case "receive_payment":
      return "Receive Payment";

    case "receive_payment_discount":
      return "Receive Payment Discount";

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

const buildCustomerDetailLedgerPrint = ({
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

  const blocks = [];

  if (Array.isArray(ledger)) {
    for (const entry of ledger) {
      const debit = safeNumber(entry.debit);
      const credit = safeNumber(entry.credit);

      totalDebit += debit;
      totalCredit += credit;

      runningBalance += debit - credit;

      blocks.push({
        type: "entry",

        key:
          entry.referenceId ||
          entry._id ||
          `${entry.date || ""}-${entry.billNo || ""}-${blocks.length}`,

        billNo: entry.billNo || "-",

        date: formatDate(entry.date),

        sourceType: entry.sourceType || "",

        sourceLabel: entry.sourceLabel || resolveSourceLabel(entry.sourceType),

        items: normalizeItems(entry.items),

        debit: debit > 0 ? debit : null,

        credit: credit > 0 ? credit : null,

        balance: Number(runningBalance.toFixed(2)),
      });
    }
  }

  const closingBalance =
    blocks.length > 0 ? blocks[blocks.length - 1].balance : opening;

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
      opening: Number(opening.toFixed(2)),
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      closingBalance: Number(closingBalance.toFixed(2)),
    },

    blocks,
  };
};

module.exports = buildCustomerDetailLedgerPrint;
