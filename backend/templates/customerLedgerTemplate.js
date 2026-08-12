const { t } = require("../i18n/i18n");
// 📁 templates/customerLedgerTemplate.js

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const generateCustomerLedgerHTML = (data, pageSize = "A5") => {
  const lang = data?.lang || "ur";

  const {
    documentTitle,
    customer = {},
    period = {},
    summary = {},
    rows = [],
  } = data || {};

  const safePageSize = pageSize === "A4" ? "A4" : "A5";

  const customerName = escapeHtml(customer.name || "-");
  const periodFrom = escapeHtml(period.from || "All");
  const periodTo = escapeHtml(period.to || "All");

  const totalDebit = safeNumber(summary.totalDebit);
  const totalCredit = safeNumber(summary.totalCredit);
  const closingBalance = safeNumber(summary.closingBalance);
  const opening = safeNumber(summary.opening);

  return `
<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8" />

  <title>${escapeHtml(documentTitle || "Customer Ledger")}</title>

  <style>
    @page {
      size: ${safePageSize};
      margin: 10mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: Arial, "Noto Nastaliq Urdu", sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: 12px;
    }

    .page {
      width: 100%;
    }

    .title {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .sub-info {
      text-align: center;
      margin-bottom: 10px;
      font-size: 12px;
      line-height: 1.6;
    }

    .opening-info {
      margin-bottom: 8px;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      border: 1px solid #d1d5db;
      padding: 5px 6px;
      vertical-align: middle;
    }

    th {
      background: #f3f4f6;
      font-weight: 700;
      text-align: center;
    }

    td {
      text-align: right;
    }

    td:nth-child(1),
    td:nth-child(2),
    td:nth-child(3) {
      text-align: left;
    }

    .right {
      text-align: right !important;
    }

    .totals-row {
      font-weight: 700;
      background: #f9fafb;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>

<body>
  <div class="page">

    <div class="title">
      ${escapeHtml(t("ledger.customerLedger", lang) || documentTitle || "Customer Ledger")}
    </div>

    <div class="sub-info">
      ${escapeHtml(t("customer", lang))}: ${customerName}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${escapeHtml(t("common.from", lang))}: ${periodFrom}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${escapeHtml(t("common.to", lang))}: ${periodTo}
    </div>

    <div class="opening-info">
      ${escapeHtml(t("ledger.opening", lang))}: ${opening.toFixed(2)}
    </div>

    <table>
      <thead>
        <tr>
          <th>${escapeHtml(t("date", lang))}</th>
          <th>${escapeHtml(t("billNo", lang))}</th>
          <th>${escapeHtml(t("source", lang))}</th>
          <th>${escapeHtml(t("debit", lang))}</th>
          <th>${escapeHtml(t("credit", lang))}</th>
          <th>${escapeHtml(t("balance", lang))}</th>
        </tr>
      </thead>

      <tbody>
        ${
          Array.isArray(rows) && rows.length > 0
            ? rows
                .map((row) => {
                  const debit =
                    row.debit !== null && row.debit !== undefined
                      ? safeNumber(row.debit).toFixed(2)
                      : "-";

                  const credit =
                    row.credit !== null && row.credit !== undefined
                      ? safeNumber(row.credit).toFixed(2)
                      : "-";

                  const balance = safeNumber(row.balance).toFixed(2);

                  return `
                    <tr>
                      <td>${escapeHtml(row.date || "-")}</td>
                      <td>${escapeHtml(row.billNo || "-")}</td>
                      <td>${escapeHtml(row.source || "-")}</td>
                      <td>${debit}</td>
                      <td>${credit}</td>
                      <td>${balance}</td>
                    </tr>
                  `;
                })
                .join("")
            : `
              <tr>
                <td colspan="6" style="text-align:center;">
                  ${escapeHtml(t("ledger.noTransactions", lang))}
                </td>
              </tr>
            `
        }

        <tr class="totals-row">
          <td colspan="3" class="right">
            ${escapeHtml(t("totals", lang))}:
          </td>

          <td>${totalDebit.toFixed(2)}</td>
          <td>${totalCredit.toFixed(2)}</td>
          <td>${closingBalance.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

  </div>
</body>
</html>
`;
};

module.exports = generateCustomerLedgerHTML;
