// 📁 services/partyDetailLedgerPrintBuilder.js

/* =========================================================
   PARTY DETAIL LEDGER PRINT BUILDER
   ---------------------------------------------------------
   Purpose:
   - Controller کے raw data کو print/PDF friendly format میں بدلنا
   - Opening, entries, items, totals, running balance سب safely بنانا
   - Sale + Purchase + Returns + Payments سب support کرنا
========================================================= */

const formatDate = (date) => {
  if (!date) return "-";

  const d = new Date(date);

  if (isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("en-GB");
};

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

  if (["sale_invoice", "opening_sale_invoice"].includes(type)) {
    return "sale";
  }

  if (["purchase_invoice", "opening_purchase_invoice"].includes(type)) {
    return "purchase";
  }

  if (["refund_invoice", "opening_refund_invoice"].includes(type)) {
    return "sale_return";
  }

  if (["purchase_return", "opening_purchase_return"].includes(type)) {
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
  const rate = safeNumber(item.rate || item.price);
  const amount =
    safeNumber(item.amount || item.total) || round2(quantity * rate);

  return {
    sr: item.sr || index + 1,
    productName: item.productName || "Product",
    unit: item.unit || "PCS",
    ctn: safeNumber(item.ctn || item.carton || 1),
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
  totalDebit = 0,
  totalCredit = 0,
  closingBalance = 0,

  ledger = [],
}) => {
  const opening = round2(openingBalance);

  let runningBalance = opening;

  let calculatedDebit = 0;
  let calculatedCredit = 0;

  const blocks = [];

  /* =========================================================
     OPENING BLOCK
  ========================================================= */

  blocks.push({
    type: "opening",
    nature: "opening",
    key: "opening-balance",

    date: startDate ? formatDate(startDate) : "-",
    rawDate: startDate || null,
    time: "",

    billNo: "-",
    title: "Opening Balance",
    sourceType: "opening_balance",
    sourceLabel: "Opening Balance",

    description: "",
    paymentType: "",

    debit: null,
    credit: null,
    balance: opening,

    documentTotal: null,
    items: [],
  });

  /* =========================================================
     LEDGER BLOCKS
  ========================================================= */

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
          : itemTotal || round2(debit || credit);

      blocks.push({
        type: "entry",
        nature: getEntryNature(row.sourceType),

        key:
          row.key ||
          `${row.referenceId || row.invoiceId || row._id || "entry"}-${
            blocks.length
          }`,

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
        balance:
          row.balance !== undefined ? round2(row.balance) : runningBalance,

        documentTotal,
        itemTotal,

        items,

        attachmentUrl: row.attachmentUrl || "",
        attachmentType: row.attachmentType || "",
      });
    }
  }

  /* =========================================================
     FINAL SUMMARY
  ========================================================= */

  const finalDebit =
    totalDebit !== undefined && totalDebit !== null
      ? round2(totalDebit)
      : round2(calculatedDebit);

  const finalCredit =
    totalCredit !== undefined && totalCredit !== null
      ? round2(totalCredit)
      : round2(calculatedCredit);

  const finalClosing =
    closingBalance !== undefined && closingBalance !== null
      ? round2(closingBalance)
      : blocks.length > 1
        ? round2(blocks[blocks.length - 1].balance)
        : opening;

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
      totalEntries: Math.max(blocks.length - 1, 0),
      hasItems: blocks.some(
        (b) => Array.isArray(b.items) && b.items.length > 0,
      ),
    },
  };
};

module.exports = buildPartyDetailLedgerPrint;
