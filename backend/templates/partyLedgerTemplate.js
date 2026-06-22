const { t } = require("../i18n/i18n");

// 📁 templates/partyLedgerTemplate.js

const formatMoney = (value) => {
  const num = Number(value || 0);

  if (num < 0) {
    return `(${Math.abs(num).toFixed(2)})`;
  }

  return num.toFixed(2);
};

const getRoleLabel = (role, lang) => {
  if (role === "customer") return t("customer", lang);
  if (role === "supplier") return t("supplier", lang);

  return lang === "ur" ? "کسٹمر + سپلائر" : "Customer + Supplier";
};

const generatePartyLedgerHTML = (data, pageSize = "A5") => {
  const lang = data?.lang || "ur";

  const {
    documentTitle = "Party Ledger",
    party = {},
    period = {},
    summary = {},
    rows = [],
  } = data || {};

  const isA5 = pageSize === "A5";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${documentTitle}</title>

<style>
@page {
  size: ${pageSize};
  margin: 5mm;
}

* {
  box-sizing: border-box;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${isA5 ? "11px" : "13px"};
  margin: 0;
  color: #000;
  background: #fff;
}

.container {
  width: 100%;
  margin: 0;
}

/* ===== HEADER ===== */

.header {
  text-align: center;
  margin-bottom: ${isA5 ? "6px" : "12px"};
}

.header h2 {
  margin: 0;
  font-size: ${isA5 ? "16px" : "21px"};
  font-weight: 900;
  text-transform: uppercase;
}

.sub-info {
  margin-top: 4px;
  font-size: ${isA5 ? "11px" : "13px"};
  font-weight: 700;
  line-height: 1.5;
}

/* ===== SUMMARY ===== */

.summary {
  margin-top: ${isA5 ? "6px" : "10px"};
  margin-bottom: ${isA5 ? "6px" : "12px"};
  padding: ${isA5 ? "4px" : "8px"};
  font-weight: 900;
  font-size: ${isA5 ? "12px" : "15px"};
  border: 2px solid #000;
  line-height: 1.6;
}

/* ===== TABLE ===== */

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 2px solid #000;
  page-break-inside: auto;
}

thead {
  display: table-header-group;
}

tfoot {
  display: table-row-group;
}

tr {
  page-break-inside: avoid;
  page-break-after: auto;
}

th {
  border: 2px solid #000;
  padding: ${isA5 ? "6px 4px" : "12px 8px"};
  text-align: center;
  vertical-align: middle;
  font-size: ${isA5 ? "12px" : "15px"};
  font-weight: 900;
}

td {
  border: 2px solid #000;
  padding: ${isA5 ? "6px 4px" : "10px 8px"};
  text-align: center;
  vertical-align: middle;
  font-size: ${isA5 ? "12px" : "16px"};
  font-weight: 700;
  word-wrap: break-word;
}

td.right {
  text-align: right;
  padding-right: ${isA5 ? "6px" : "10px"};
}

td.left {
  text-align: left;
  padding-left: ${isA5 ? "6px" : "8px"};
}

/* ===== ROW TYPES ===== */

.opening-row td {
  font-weight: 900;
  background: #f5f5f5;
}

.totals-row td {
  font-weight: 900;
  border-top: 3px solid #000;
  background: #f5f5f5;
}

/* ===== FOOTER ===== */

.footer {
  margin-top: ${isA5 ? "8px" : "14px"};
  text-align: center;
  font-size: ${isA5 ? "9px" : "11px"};
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
}
</style>
</head>

<body>
<div class="container">

  <div class="header">
    <h2>${lang === "ur" ? "پارٹی حساب" : "Party Ledger"}</h2>

    <div class="sub-info">
      ${t("common.party", lang)}: ${party.name || "-"}
      ${party.phone ? `&nbsp;&nbsp; | &nbsp;&nbsp; ${t("phone", lang)}: ${party.phone}` : ""}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${t("common.type", lang)}: ${getRoleLabel(party.role, lang)}
      <br/>
      ${t("common.from", lang)}: ${period.from || t("ledger.allDates", lang)}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${t("date.to", lang)}: ${period.to || t("ledger.allDates", lang)}
    </div>
  </div>

  <div class="summary">
    ${t("ledger.opening", lang)}: ${formatMoney(summary.opening)} |
    ${t("debit", lang)}: ${formatMoney(summary.totalDebit)} |
    ${t("credit", lang)}: ${formatMoney(summary.totalCredit)} |
    ${t("ledger.closing", lang)}: ${formatMoney(summary.closingBalance)}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:15%">${t("date", lang)}</th>
        <th style="width:15%">${t("billNo", lang)}</th>
        <th style="width:25%">${t("source", lang)}</th>
        <th style="width:15%">${t("debit", lang)}</th>
        <th style="width:15%">${t("credit", lang)}</th>
        <th style="width:15%">${t("balance", lang)}</th>
      </tr>
    </thead>

    <tbody>
      ${
        rows?.length
          ? rows
              .map(
                (row) => `
        <tr class="${row.type === "opening" ? "opening-row" : ""}">
          <td>${row.date || "-"}</td>
          <td>${row.billNo || "-"}</td>
          <td class="left">${row.source || "-"}</td>
          <td>${row.debit !== null && row.debit !== undefined ? formatMoney(row.debit) : "-"}</td>
          <td>${row.credit !== null && row.credit !== undefined ? formatMoney(row.credit) : "-"}</td>
          <td>${formatMoney(row.balance)}</td>
        </tr>
      `,
              )
              .join("")
          : `
        <tr>
          <td colspan="6">${t("ledger.noTransactions", lang)}</td>
        </tr>
      `
      }

      <tr class="totals-row">
        <td colspan="3" class="right">${t("totals", lang)}:</td>
        <td>${formatMoney(summary.totalDebit)}</td>
        <td>${formatMoney(summary.totalCredit)}</td>
        <td>${formatMoney(summary.closingBalance)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    ${t("app.name", lang)} • ${new Date().toLocaleDateString("en-GB")}
  </div>

</div>
</body>
</html>
`;
};

module.exports = generatePartyLedgerHTML;
