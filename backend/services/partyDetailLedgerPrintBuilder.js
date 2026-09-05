// 📁 services/partyDetailLedgerPrintBuilder.js

const { formatBusinessDate } = require("../utils/businessDate");

const formatDate = (date) => formatBusinessDate(date) || "-";

const formatTime = (time) => {
  if (!time) return "";
  return String(time);
};

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const round2 = (value) => Number(safeNumber(value).toFixed(2));

const getBalanceStatus = (balance) => {
  const amount = safeNumber(balance);

  if (amount > 0) return "Receivable";
  if (amount < 0) return "Payable";

  return "Settled";
};

const getRoleLabel = (role) => {
  if (role === "customer") return "Customer";
  if (role === "supplier") return "Supplier";

  return "Customer + Supplier";
};

const getEntryNature = (sourceType = "") => {
  const type = String(sourceType || "").toLowerCase();

  if (
    [
      "opening_balance",
      "opening_sale_invoice",
      "opening_refund_invoice",
      "opening_purchase_invoice",
      "opening_purchase_return",
    ].includes(type)
  ) {
    return "opening";
  }

  if (type === "sale_invoice") {
    return "sale";
  }

  if (type === "purchase_invoice") {
    return "purchase";
  }

  if (type === "refund_invoice") {
    return "sale_return";
  }

  if (type === "purchase_return") {
    return "purchase_return";
  }

  if (["receive_payment", "refund_payment"].includes(type)) {
    return "cash_in";
  }

  if (
    ["pay_bill", "purchase_payment", "purchase_return_payment"].includes(type)
  ) {
    return "cash_out";
  }

  if (
    ["sale_discount", "purchase_discount", "receive_payment_discount"].includes(
      type,
    )
  ) {
    return "discount";
  }

  return "other";
};

const normalizeItem = (item = {}, index = 0) => {
  const quantity = safeNumber(item.quantity);
  const rate = safeNumber(item.rate ?? item.price);

  const rawAmount = item.amount ?? item.total;

  const amount =
    rawAmount !== undefined && rawAmount !== null
      ? safeNumber(rawAmount)
      : round2(quantity * rate);

  return {
    sr: item.sr || index + 1,

    productName: item.productName || "Product",

    unit: item.unit || "PCS",

    ctn: safeNumber(item.ctn ?? item.carton ?? 1),

    quantity: round2(quantity),

    rate: round2(rate),

    amount: round2(amount),
  };
};

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => normalizeItem(item, index));
};

const buildEntryTitle = (row = {}) => {
  const bill = row.billNo ? `#${row.billNo}` : "";

  const source = row.sourceLabel || row.sourceType || "Entry";

  return `${source} ${bill}`.trim();
};

const buildPartyDetailLedgerPrint = ({
  partyId,
  partyName,
  partyPhone,
  role,

  startDate,
  endDate,

  openingBalance = 0,

  totalDebit,
  totalCredit,
  closingBalance,

  ledger = [],
}) => {
  const opening = round2(openingBalance);

  let runningBalance = opening;

  let calculatedDebit = 0;
  let calculatedCredit = 0;

  const blocks = [];

  if (Array.isArray(ledger)) {
    for (const row of ledger) {
      const debit = round2(row.debit);
      const credit = round2(row.credit);

      runningBalance = round2(runningBalance + debit - credit);

      calculatedDebit += debit;
      calculatedCredit += credit;

      const items = normalizeItems(row.items);

      const itemTotal = round2(
        items.reduce((sum, item) => sum + safeNumber(item.amount), 0),
      );

      const documentTotal =
        row.documentTotal !== undefined && row.documentTotal !== null
          ? round2(row.documentTotal)
          : itemTotal !== 0
            ? itemTotal
            : round2(debit || credit);

      const rowBalance =
        row.balance !== undefined && row.balance !== null
          ? round2(row.balance)
          : runningBalance;

      blocks.push({
        type: "entry",

        nature: getEntryNature(row.sourceType),

        key:
          row.key ||
          `${
            row.referenceId || row.invoiceId || row._id || "entry"
          }-${blocks.length}`,

        _id: row._id || null,

        referenceId: row.referenceId || null,

        invoiceId: row.invoiceId || null,

        invoiceModel: row.invoiceModel || "",

        rawDate: row.date || null,

        date: formatDate(row.date),

        time: formatTime(row.time),

        billNo: row.billNo || "-",

        title: buildEntryTitle(row),

        sourceType: row.sourceType || "",

        sourceLabel: row.sourceLabel || row.sourceType || "-",

        originModule: row.originModule || "",

        partyText: row.partyText || partyName || "-",

        description: row.description || "",

        paymentType: row.paymentType || "",

        debit: debit > 0 ? debit : null,

        credit: credit > 0 ? credit : null,

        balance: rowBalance,

        documentTotal,

        itemTotal,

        items,

        attachmentUrl: row.attachmentUrl || "",

        attachmentType: row.attachmentType || "",
      });
    }
  }

  const finalDebit =
    totalDebit !== undefined && totalDebit !== null
      ? round2(totalDebit)
      : round2(calculatedDebit);

  const finalCredit =
    totalCredit !== undefined && totalCredit !== null
      ? round2(totalCredit)
      : round2(calculatedCredit);

  const calculatedClosing =
    blocks.length > 0 ? round2(blocks[blocks.length - 1].balance) : opening;

  const finalClosing =
    closingBalance !== undefined && closingBalance !== null
      ? round2(closingBalance)
      : calculatedClosing;

  return {
    documentTitle: "Party Detail Ledger",

    party: {
      id: partyId || "",

      name: partyName || "-",

      phone: partyPhone || "",

      role: role || "both",

      roleLabel: getRoleLabel(role),
    },

    period: {
      from: startDate ? formatDate(startDate) : "All",

      to: endDate ? formatDate(endDate) : "All",

      rawFrom: startDate || "",

      rawTo: endDate || "",
    },

    summary: {
      opening,

      totalDebit: finalDebit,

      totalCredit: finalCredit,

      closingBalance: finalClosing,

      balanceStatus: getBalanceStatus(finalClosing),
    },

    blocks,

    meta: {
      generatedAt: new Date().toLocaleString("en-GB"),

      totalBlocks: blocks.length,

      totalEntries: blocks.length,

      hasItems: blocks.some(
        (block) => Array.isArray(block.items) && block.items.length > 0,
      ),
    },
  };
};

module.exports = buildPartyDetailLedgerPrint;
