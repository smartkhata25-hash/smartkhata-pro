// 📁 templates/partyDetailLedgerTemplate.js

const { t } = require("../i18n/i18n");

/**
 * Party Detail Ledger HTML Template
 * ---------------------------------
 * Professional block-style ledger
 * Supports A4 + A5
 * Supports English + Urdu through i18n
 */

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const money = (value) => {
  const num = Number(value || 0);

  if (num < 0) {
    return `(${Math.abs(num).toFixed(2)})`;
  }

  return num.toFixed(2);
};

const showMoney = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return money(value);
};

const safeText = (value, fallback = "-") => {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : fallback;
};

const label = (key, lang, fallback) => {
  const value = t(key, lang);
  return value && value !== key ? value : fallback;
};

const getRoleLabel = (role, lang) => {
  if (role === "customer") return label("customer", lang, "Customer");
  if (role === "supplier") return label("supplier", lang, "Supplier");

  return lang === "ur" ? "کسٹمر + سپلائر" : "Customer + Supplier";
};

const getBlockClass = (nature) => {
  const allowed = [
    "opening",
    "sale",
    "purchase",
    "sale_return",
    "purchase_return",
    "cash_in",
    "cash_out",
    "discount",
    "other",
  ];

  return allowed.includes(nature) ? nature : "other";
};

const renderItemsTable = (items, lang, isA5) => {
  if (!Array.isArray(items) || items.length === 0) return "";

  return `
<table class="items-table">
  <thead>
    <tr>
      <th style="width:7%">${label("common.sr", lang, "Sr")}</th>
      <th style="width:48%">${label("inventory.product", lang, "Product")}</th>
      <th style="width:12%">${label("unit", lang, "Unit")}</th>
      <th style="width:11%">${label("qty", lang, "Qty")}</th>
      <th style="width:11%">${label("rate", lang, "Rate")}</th>
      <th style="width:11%">${label("total", lang, "Total")}</th>
    </tr>
  </thead>

  <tbody>
    ${items
      .map(
        (it, index) => `
      <tr>
        <td>${it.sr || index + 1}</td>
        <td class="left">${safeText(it.productName, "Product")}</td>
        <td>${safeText(it.unit, "-")}</td>
        <td>${Number(it.quantity || 0)}</td>
        <td class="right">${money(it.rate)}</td>
        <td class="right">${money(it.amount)}</td>
      </tr>
    `,
      )
      .join("")}
  </tbody>
</table>
`;
};

const renderBlock = (blk, lang, isA5) => {
  const blockClass = getBlockClass(blk.nature);
  const hasItems = Array.isArray(blk.items) && blk.items.length > 0;

  return `
<div class="block ${blockClass}">

  <div class="block-header">
    <div>
      <span class="source">${safeText(blk.sourceLabel || blk.title)}</span>
      <span class="bill">#${safeText(blk.billNo, "-")}</span>
    </div>

    <div class="date-line">
      ${label("date", lang, "Date")}: ${safeText(blk.date)}
      ${
        blk.time
          ? `&nbsp; | &nbsp; ${label("common.time", lang, "Time")}: ${safeText(
              blk.time,
            )}`
          : ""
      }
    </div>
  </div>

  ${
    blk.description
      ? `<div class="description">${label(
          "common.description",
          lang,
          "Description",
        )}: ${safeText(blk.description)}</div>`
      : ""
  }

  ${renderItemsTable(blk.items, lang, isA5)}

  ${
    hasItems
      ? `
      <div class="invoice-total">
        ${label("total", lang, "Total")}: ${money(blk.documentTotal)}
      </div>
    `
      : ""
  }

  <table class="totals-table">
    <tbody>
      <tr>
        <td class="right title-cell">${label("debit", lang, "Debit")}</td>
        <td class="right amount-cell">${showMoney(blk.debit)}</td>
      </tr>

      <tr>
        <td class="right title-cell">${label("credit", lang, "Credit")}</td>
        <td class="right amount-cell">${showMoney(blk.credit)}</td>
      </tr>

      <tr>
        <td class="right title-cell balance-title">${label(
          "balance",
          lang,
          "Balance",
        )}</td>
        <td class="right amount-cell balance-amount">${money(blk.balance)}</td>
      </tr>
    </tbody>
  </table>

</div>
`;
};

const generatePartyDetailLedgerHTML = (data, pageSize = "A4") => {
  const lang = data?.lang || "ur";
  const dir = lang === "ur" ? "rtl" : "ltr";
  const isA5 = pageSize === "A5";

  const {
    documentTitle = "Party Detail Ledger",
    party = {},
    period = {},
    summary = {},
    blocks = [],
    meta = {},
  } = data || {};

  const title = lang === "ur" ? "پارٹی تفصیلی حساب" : safeText(documentTitle);

  return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<title>${title}</title>

<style>
@page {
  size: ${pageSize};
  margin: ${isA5 ? "5mm" : "7mm"};
}

* {
  box-sizing: border-box;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${isA5 ? "10.5px" : "13px"};
  margin: 0;
  color: #000;
  background: #fff;
  direction: ${dir};
}

.container {
  width: 100%;
}

/* ===== HEADER ===== */

.header {
  text-align: center;
  margin-bottom: ${isA5 ? "7px" : "12px"};
  border-bottom: 2px solid #000;
  padding-bottom: ${isA5 ? "5px" : "8px"};
}

.header h2 {
  margin: 0;
  font-size: ${isA5 ? "16px" : "21px"};
  font-weight: 900;
  text-transform: uppercase;
}

.sub-info {
  margin-top: 5px;
  font-weight: 700;
  font-size: ${isA5 ? "10.5px" : "13px"};
  line-height: 1.6;
}

/* ===== SUMMARY ===== */

.summary {
  margin: ${isA5 ? "6px 0" : "10px 0"};
  padding: ${isA5 ? "5px" : "8px"};
  font-weight: 900;
  font-size: ${isA5 ? "11.5px" : "14px"};
  border: 2px solid #000;
  line-height: 1.7;
}

/* ===== BLOCK ===== */

.block {
  border: 2px solid #000;
  padding: ${isA5 ? "5px" : "9px"};
  margin-bottom: ${isA5 ? "6px" : "10px"};
  page-break-inside: avoid;
  break-inside: avoid;
}

.block.opening,
.block.sale,
.block.purchase,
.block.sale_return,
.block.purchase_return,
.block.cash_in,
.block.cash_out,
.block.discount,
.block.other {
  background: #fff;
}

/* ===== BLOCK HEADER ===== */

.block-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  font-weight: 900;
  margin-bottom: ${isA5 ? "4px" : "7px"};
  font-size: ${isA5 ? "11.5px" : "14px"};
}

.source {
  font-weight: 900;
}

.bill {
  margin-inline-start: 8px;
}

.date-line {
  white-space: nowrap;
  font-weight: 800;
}

.description {
  border: 1px solid #000;
  padding: ${isA5 ? "3px 4px" : "5px 6px"};
  margin-bottom: ${isA5 ? "4px" : "6px"};
  font-weight: 700;
}

/* ===== TABLE ===== */

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th {
  border: 1px solid #000;
  padding: ${isA5 ? "3px" : "6px"};
  text-align: center;
  font-weight: 900;
  font-size: ${isA5 ? "10px" : "12.5px"};
}

td {
  border: 1px solid #000;
  padding: ${isA5 ? "3px" : "6px"};
  text-align: center;
  font-weight: 700;
  font-size: ${isA5 ? "10px" : "12.5px"};
  word-wrap: break-word;
}

.left {
  text-align: ${lang === "ur" ? "right" : "left"};
}

.right {
  text-align: ${lang === "ur" ? "left" : "right"};
}

.items-table {
  margin-top: 4px;
}

.invoice-total {
  margin-top: 4px;
  text-align: ${lang === "ur" ? "left" : "right"};
  font-weight: 900;
  font-size: ${isA5 ? "10.5px" : "13px"};
}

/* ===== TOTALS ===== */

.totals-table {
  margin-top: ${isA5 ? "4px" : "6px"};
}

.totals-table td {
  font-weight: 900;
}

.title-cell {
  width: 70%;
}

.amount-cell {
  width: 30%;
}

.balance-title,
.balance-amount {
  background: #fff;
  font-size: ${isA5 ? "10.5px" : "13px"};
}

/* ===== FOOTER ===== */

.footer {
  margin-top: ${isA5 ? "8px" : "14px"};
  text-align: center;
  font-size: ${isA5 ? "8.5px" : "10.5px"};
  border-top: 1px solid #999;
  padding-top: 6px;
  font-weight: 700;
}

/* ===== PRINT ===== */

@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .block {
    page-break-inside: avoid;
  }
}
</style>
</head>

<body>
<div class="container">

  <div class="header">
    <h2>${title}</h2>

    <div class="sub-info">
      ${label("common.party", lang, "Party")}: ${safeText(party.name)}
      ${
        party.phone
          ? `&nbsp;&nbsp; | &nbsp;&nbsp; ${label(
              "phone",
              lang,
              "Phone",
            )}: ${safeText(party.phone)}`
          : ""
      }
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${label("common.type", lang, "Type")}: ${getRoleLabel(party.role, lang)}
      <br/>
      ${label("common.from", lang, "From")}: ${safeText(period.from, "All")}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${label("date.to", lang, "To")}: ${safeText(period.to, "All")}
    </div>
  </div>

  <div class="summary">
    ${label("ledger.opening", lang, "Opening")}: ${money(summary.opening)}
    &nbsp; | &nbsp;
    ${label("debit", lang, "Debit")}: ${money(summary.totalDebit)}
    &nbsp; | &nbsp;
    ${label("credit", lang, "Credit")}: ${money(summary.totalCredit)}
    &nbsp; | &nbsp;
    ${label("ledger.closing", lang, "Closing")}: ${money(
      summary.closingBalance,
    )}
    &nbsp; | &nbsp;
    ${label("status", lang, "Status")}: ${safeText(summary.balanceStatus)}
  </div>

  ${
    blocks.length
      ? blocks.map((blk) => renderBlock(blk, lang, isA5)).join("")
      : `<div class="block">${label(
          "ledger.noTransactions",
          lang,
          "No transactions found",
        )}</div>`
  }

  <div class="summary">
    ${label("totals", lang, "Totals")}:
    &nbsp;
    ${label("debit", lang, "Debit")}: ${money(summary.totalDebit)}
    &nbsp; | &nbsp;
    ${label("credit", lang, "Credit")}: ${money(summary.totalCredit)}
    &nbsp; | &nbsp;
    ${label("balance", lang, "Balance")}: ${money(summary.closingBalance)}
  </div>

  <div class="footer">
    ${label("app.name", lang, "SmartKhata")}
    • ${meta.generatedAt || new Date().toLocaleString("en-GB")}
  </div>

</div>
</body>
</html>
`;
};

module.exports = generatePartyDetailLedgerHTML;
