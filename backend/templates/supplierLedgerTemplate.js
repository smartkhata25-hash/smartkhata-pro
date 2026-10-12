const { t } = require("../i18n/i18n");
const { formatMoney } = require("../utils/money");
const {
  ledgerBusinessHeaderStyles,
  renderLedgerBusinessHeader,
} = require("./ledgerBusinessHeader");

/**
 * Supplier Ledger HTML Template
 * --------------------------------
 * Professional accounting layout
 * Supports A4 + A5
 */

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const generateSupplierLedgerHTML = (data, pageSize = "A5") => {
  const lang = data?.lang || "ur";
  const {
    documentTitle,
    supplier,
    period,
    summary,
    rows,
    header = null,
    showDescription = false,
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${documentTitle}</title>

<style>
${ledgerBusinessHeaderStyles}
@page {
  size: ${pageSize};
  margin: 5mm 5mm 5mm 5mm;
}

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
  margin: 0;
  color: #000;
}

.container {
  width: 100%;
  margin: 0;
}

.header {
  text-align: center;
  margin-bottom: ${pageSize === "A5" ? "6px" : "12px"};
}

.header h2 {
  margin: 0;
  font-size: ${pageSize === "A5" ? "16px" : "20px"};
  font-weight: 800;
}

.sub-info {
  margin-top: 4px;
  font-size: ${pageSize === "A5" ? "11px" : "13px"};
  font-weight: 600;
}

.summary {
  margin-top: ${pageSize === "A5" ? "6px" : "10px"};
  margin-bottom: ${pageSize === "A5" ? "6px" : "12px"};
  padding: ${pageSize === "A5" ? "4px" : "8px"};
  font-weight: 900;
  font-size: ${pageSize === "A5" ? "12px" : "15px"};
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 2px solid #000;
}

th {
  border: 2px solid #000;
  padding: ${pageSize === "A5" ? "6px 4px" : "12px 8px"};
  text-align: center;
  vertical-align: middle;
  font-size: ${pageSize === "A5" ? "12px" : "15px"};
  font-weight: 800;
}

td {
  border: 2px solid #000;
  padding: ${pageSize === "A5" ? "6px 4px" : "10px 8px"};
  text-align: center;
  vertical-align: middle;
  font-size: ${pageSize === "A5" ? "12px" : "16px"};
  font-weight: 600;
  word-wrap: break-word;
}

td.right {
  text-align: right;
  padding-right: ${pageSize === "A5" ? "6px" : "10px"};
  font-size: ${pageSize === "A5" ? "12px" : "17px"};
  font-weight: 700;
}

td.left {
  text-align: left;
  padding-left: ${pageSize === "A5" ? "6px" : "8px"};
  font-weight: 600;
}

.totals-row {
  font-weight: 800;
  border-top: 3px solid #000;
}

.source-description {
  margin-top: 2px;
  color: #666;
  font-size: ${pageSize === "A5" ? "10px" : "12px"};
  font-weight: 400;
  line-height: 1.35;
  white-space: pre-line;
}

.footer {
  margin-top: ${pageSize === "A5" ? "8px" : "14px"};
  text-align: center;
  font-size: ${pageSize === "A5" ? "9px" : "11px"};
  border-top: 1px solid #ccc;
  padding-top: 6px;
}
</style>
</head>

<body>
<div class="container">
  ${renderLedgerBusinessHeader(header)}

  <div class="header">
    <h2>${t("ledger.supplierLedger", lang)}</h2>

    <div class="sub-info">
      ${t("supplier", lang)}: ${supplier.name}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${t("ledger.period", lang)}: ${period.from} ${t("date.to", lang)} ${period.to}
    </div>
  </div>

  <div class="summary">
    ${t("ledger.opening", lang)}: ${formatMoney(summary.opening)} |
    ${t("ledger.totalDebit", lang)}: ${formatMoney(summary.totalDebit)} |
    ${t("ledger.totalCredit", lang)}: ${formatMoney(summary.totalCredit)} |
    ${t("ledger.closing", lang)}: ${
      summary.closingBalance < 0
        ? `(${formatMoney(Math.abs(summary.closingBalance))})`
        : formatMoney(summary.closingBalance)
    }
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
        <tr>
          <td>${row.date || "-"}</td>
          <td>${row.billNo || "-"}</td>
          <td>
            ${row.source || "-"}
            ${
              showDescription && String(row.description ?? "").trim()
                ? `<div class="source-description">${escapeHtml(String(row.description).trim())}</div>`
                : ""
            }
          </td>
          <td>${row.debit !== null ? formatMoney(row.debit) : "-"}</td>
          <td>${row.credit !== null ? formatMoney(row.credit) : "-"}</td>
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

module.exports = generateSupplierLedgerHTML;
