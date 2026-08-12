// 📁 templates/partyDetailLedgerTemplate.js

const { t } = require("../i18n/i18n");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const money = (value) => {
  const num = safeNumber(value);
  return num.toFixed(2);
};

const showMoney = (value) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return money(value);
};

const safeText = (value, fallback = "-") => {
  const text = String(value ?? "").trim();

  return text ? escapeHtml(text) : escapeHtml(fallback);
};

const label = (key, lang, fallback) => {
  const value = t(key, lang);

  if (!value || value === key) {
    return escapeHtml(fallback);
  }

  return escapeHtml(value);
};

const getRoleLabel = (role, lang) => {
  if (role === "customer") {
    return label("customer", lang, "Customer");
  }

  if (role === "supplier") {
    return label("supplier", lang, "Supplier");
  }

  return lang === "ur" ? "کسٹمر + سپلائر" : "Customer + Supplier";
};

const getBalanceStatusLabel = (status, lang) => {
  if (status === "Receivable") {
    return label("ledger.receivable", lang, "Receivable");
  }

  if (status === "Payable") {
    return label("ledger.payable", lang, "Payable");
  }

  return label("ledger.settled", lang, "Settled");
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

const renderItemsTable = (items, lang) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:7%">
            ${label("common.sr", lang, "Sr")}
          </th>

          <th style="width:48%">
            ${label("inventory.product", lang, "Product")}
          </th>

          <th style="width:12%">
            ${label("unit", lang, "Unit")}
          </th>

          <th style="width:11%">
            ${label("qty", lang, "Qty")}
          </th>

          <th style="width:11%">
            ${label("rate", lang, "Rate")}
          </th>

          <th style="width:11%">
            ${label("total", lang, "Total")}
          </th>
        </tr>
      </thead>

      <tbody>
        ${items
          .map(
            (item, index) => `
              <tr>
                <td>${safeNumber(item.sr || index + 1)}</td>

                <td class="left">
                  ${safeText(item.productName, "Product")}
                </td>

                <td>
                  ${safeText(item.unit, "-")}
                </td>

                <td>
                  ${safeNumber(item.quantity)}
                </td>

                <td class="right">
                  ${money(item.rate)}
                </td>

                <td class="right">
                  ${money(item.amount)}
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const renderBlock = (block, lang) => {
  const blockClass = getBlockClass(block.nature);

  const hasItems = Array.isArray(block.items) && block.items.length > 0;

  return `
    <div class="block ${blockClass}">

      <div class="block-header">

        <div>
          <span class="source">
            ${safeText(
              block.sourceLabel || block.title || block.sourceType,
              "-",
            )}
          </span>

          <span class="bill">
            #${safeText(block.billNo, "-")}
          </span>
        </div>

        <div class="date-line">
          ${label("date", lang, "Date")}:
          ${safeText(block.date)}

          ${
            block.time
              ? `
                &nbsp; | &nbsp;
                ${label("common.time", lang, "Time")}:
                ${safeText(block.time)}
              `
              : ""
          }
        </div>

      </div>

      ${
        block.description
          ? `
            <div class="description">
              ${label("common.description", lang, "Description")}:
              ${safeText(block.description)}
            </div>
          `
          : ""
      }

      ${renderItemsTable(block.items, lang)}

      ${
        hasItems
          ? `
            <div class="invoice-total">
              ${label("total", lang, "Total")}:
              ${money(block.documentTotal)}
            </div>
          `
          : ""
      }

      <table class="totals-table">
        <tbody>

          <tr>
            <td class="right title-cell">
              ${label("debit", lang, "Debit")}
            </td>

            <td class="right amount-cell">
              ${showMoney(block.debit)}
            </td>
          </tr>

          <tr>
            <td class="right title-cell">
              ${label("credit", lang, "Credit")}
            </td>

            <td class="right amount-cell">
              ${showMoney(block.credit)}
            </td>
          </tr>

          <tr>
            <td class="right title-cell balance-title">
              ${label("balance", lang, "Balance")}
            </td>

            <td class="right amount-cell balance-amount">
              ${money(block.balance)}
            </td>
          </tr>

        </tbody>
      </table>

    </div>
  `;
};

const generatePartyDetailLedgerHTML = (data, pageSize = "A4") => {
  const lang = data?.lang || "ur";

  const dir = lang === "ur" ? "rtl" : "ltr";

  const safePageSize = pageSize === "A5" ? "A5" : "A4";

  const isA5 = safePageSize === "A5";

  const {
    documentTitle = "Party Detail Ledger",
    party = {},
    period = {},
    summary = {},
    blocks = [],
    meta = {},
  } = data || {};

  const title =
    lang === "ur"
      ? "پارٹی تفصیلی حساب"
      : safeText(documentTitle, "Party Detail Ledger");

  return `
<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>

<meta charset="UTF-8" />

<title>${title}</title>

<style>

@page {
  size: ${safePageSize};
  margin: ${isA5 ? "5mm" : "7mm"};
}

* {
  box-sizing: border-box;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${isA5 ? "10.5px" : "13px"};
  margin: 0;
  padding: 0;
  color: #000;
  background: #fff;
  direction: ${dir};
}

.container {
  width: 100%;
}

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

.summary {
  margin: ${isA5 ? "6px 0" : "10px 0"};
  padding: ${isA5 ? "5px" : "8px"};
  font-weight: 900;
  font-size: ${isA5 ? "11.5px" : "14px"};
  border: 2px solid #000;
  line-height: 1.7;
}

.block {
  border: 2px solid #000;
  padding: ${isA5 ? "5px" : "9px"};
  margin-bottom: ${isA5 ? "6px" : "10px"};
  page-break-inside: avoid;
  break-inside: avoid;
  background: #fff;
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

thead {
  display: table-header-group;
}

tr {
  page-break-inside: avoid;
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
  overflow-wrap: anywhere;
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
  font-size: ${isA5 ? "10.5px" : "13px"};
}

.footer {
  margin-top: ${isA5 ? "8px" : "14px"};
  text-align: center;
  font-size: ${isA5 ? "8.5px" : "10.5px"};
  border-top: 1px solid #999;
  padding-top: 6px;
  font-weight: 700;
}

@media print {

  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .block {
    page-break-inside: avoid;
    break-inside: avoid;
  }

}

</style>
</head>

<body>

<div class="container">

  <div class="header">

    <h2>${title}</h2>

    <div class="sub-info">

      ${label("common.party", lang, "Party")}:
      ${safeText(party.name)}

      ${
        party.phone
          ? `
            &nbsp;&nbsp; | &nbsp;&nbsp;
            ${label("phone", lang, "Phone")}:
            ${safeText(party.phone)}
          `
          : ""
      }

      &nbsp;&nbsp; | &nbsp;&nbsp;

      ${label("common.type", lang, "Type")}:
      ${getRoleLabel(party.role, lang)}

      <br/>

      ${label("common.from", lang, "From")}:
      ${safeText(period.from, "All")}

      &nbsp;&nbsp; | &nbsp;&nbsp;

      ${label("date.to", lang, "To")}:
      ${safeText(period.to, "All")}

    </div>

  </div>

  <div class="summary">

    ${label("ledger.opening", lang, "Opening")}:
    ${money(summary.opening)}

    &nbsp; | &nbsp;

    ${label("debit", lang, "Debit")}:
    ${money(summary.totalDebit)}

    &nbsp; | &nbsp;

    ${label("credit", lang, "Credit")}:
    ${money(summary.totalCredit)}

    &nbsp; | &nbsp;

    ${label("ledger.closing", lang, "Closing")}:
    ${money(summary.closingBalance)}

    &nbsp; | &nbsp;

    ${label("status", lang, "Status")}:
    ${getBalanceStatusLabel(summary.balanceStatus, lang)}

  </div>

  ${
    Array.isArray(blocks) && blocks.length > 0
      ? blocks.map((block) => renderBlock(block, lang)).join("")
      : `
        <div class="block">
          ${label("ledger.noTransactions", lang, "No transactions found")}
        </div>
      `
  }

  <div class="summary">

    ${label("totals", lang, "Totals")}:

    &nbsp;

    ${label("debit", lang, "Debit")}:
    ${money(summary.totalDebit)}

    &nbsp; | &nbsp;

    ${label("credit", lang, "Credit")}:
    ${money(summary.totalCredit)}

    &nbsp; | &nbsp;

    ${label("balance", lang, "Balance")}:
    ${money(summary.closingBalance)}

  </div>

  <div class="footer">

    ${label("app.name", lang, "SmartKhata")}

    •

    ${safeText(meta.generatedAt || new Date().toLocaleString("en-GB"))}

  </div>

</div>

</body>
</html>
`;
};

module.exports = generatePartyDetailLedgerHTML;
