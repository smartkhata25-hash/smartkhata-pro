const { t } = require("../i18n/i18n");

// 📁 templates/partyLedgerTemplate.js

const escapeHtml = (value, fallback = "") => {
  const text = String(value ?? "").trim() || fallback;

  return text
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

const formatMoney = (value) => {
  const num = safeNumber(value);

  return num.toFixed(2);
};

const getRoleLabel = (role, lang) => {
  if (role === "customer") {
    return t("customer", lang);
  }

  if (role === "supplier") {
    return t("supplier", lang);
  }

  return lang === "ur" ? "کسٹمر + سپلائر" : "Customer + Supplier";
};

const generatePartyLedgerHTML = (data, pageSize = "A5") => {
  const lang = data?.lang || "ur";
  const dir = lang === "ur" ? "rtl" : "ltr";

  const {
    documentTitle = "Party Ledger",
    party = {},
    period = {},
    summary = {},
    rows = [],
  } = data || {};

  const safePageSize = pageSize === "A4" ? "A4" : "A5";

  const isA5 = safePageSize === "A5";

  const title = lang === "ur" ? "پارٹی حساب" : documentTitle || "Party Ledger";

  return `
<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
<meta charset="UTF-8" />

<title>${escapeHtml(title)}</title>

<style>
@page {
  size: ${safePageSize};
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
  direction: ${dir};
}

.container {
  width: 100%;
  margin: 0;
}

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

.summary {
  margin-top: ${isA5 ? "6px" : "10px"};
  margin-bottom: ${isA5 ? "6px" : "12px"};
  padding: ${isA5 ? "4px" : "8px"};
  font-weight: 900;
  font-size: ${isA5 ? "12px" : "15px"};
  border: 2px solid #000;
  line-height: 1.6;
}

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
  text-align: ${lang === "ur" ? "left" : "right"};
  padding-right: ${isA5 ? "6px" : "10px"};
}

td.left {
  text-align: ${lang === "ur" ? "right" : "left"};
  padding-left: ${isA5 ? "6px" : "8px"};
}

.opening-row td {
  font-weight: 900;
  background: #f5f5f5;
}

.totals-row td {
  font-weight: 900;
  border-top: 3px solid #000;
  background: #f5f5f5;
}

.footer {
  margin-top: ${isA5 ? "8px" : "14px"};
  text-align: center;
  font-size: ${isA5 ? "9px" : "11px"};
  border-top: 1px solid #999;
  padding-top: 6px;
  font-weight: 700;
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
<div class="container">

  <div class="header">

    <h2>${escapeHtml(title)}</h2>

    <div class="sub-info">

      ${escapeHtml(t("common.party", lang))}:
      ${escapeHtml(party.name, "-")}

      ${
        party.phone
          ? `
            &nbsp;&nbsp; | &nbsp;&nbsp;
            ${escapeHtml(t("phone", lang))}:
            ${escapeHtml(party.phone)}
          `
          : ""
      }

      &nbsp;&nbsp; | &nbsp;&nbsp;

      ${escapeHtml(t("common.type", lang))}:
      ${escapeHtml(getRoleLabel(party.role, lang))}

      <br/>

      ${escapeHtml(t("common.from", lang))}:
      ${escapeHtml(period.from || t("ledger.allDates", lang))}

      &nbsp;&nbsp; | &nbsp;&nbsp;

      ${escapeHtml(t("date.to", lang))}:
      ${escapeHtml(period.to || t("ledger.allDates", lang))}

    </div>
  </div>

  <div class="summary">

    ${escapeHtml(t("ledger.opening", lang))}:
    ${formatMoney(summary.opening)}

    |

    ${escapeHtml(t("debit", lang))}:
    ${formatMoney(summary.totalDebit)}

    |

    ${escapeHtml(t("credit", lang))}:
    ${formatMoney(summary.totalCredit)}

    |

    ${escapeHtml(t("ledger.closing", lang))}:
    ${formatMoney(summary.closingBalance)}

  </div>

  <table>

    <thead>
      <tr>
        <th style="width:15%">
          ${escapeHtml(t("date", lang))}
        </th>

        <th style="width:15%">
          ${escapeHtml(t("billNo", lang))}
        </th>

        <th style="width:25%">
          ${escapeHtml(t("source", lang))}
        </th>

        <th style="width:15%">
          ${escapeHtml(t("debit", lang))}
        </th>

        <th style="width:15%">
          ${escapeHtml(t("credit", lang))}
        </th>

        <th style="width:15%">
          ${escapeHtml(t("balance", lang))}
        </th>
      </tr>
    </thead>

    <tbody>

      ${
        Array.isArray(rows) && rows.length > 0
          ? rows
              .map((row) => {
                const isOpening = [
                  "opening_sale_invoice",
                  "opening_refund_invoice",
                  "opening_purchase_invoice",
                  "opening_purchase_return",
                  "opening_balance",
                ].includes(row.sourceType);

                return `
                  <tr class="${isOpening ? "opening-row" : ""}">

                    <td>
                      ${escapeHtml(row.date || "-")}
                    </td>

                    <td>
                      ${escapeHtml(row.billNo || "-")}
                    </td>

                    <td class="left">
                      ${escapeHtml(row.source || "-")}
                    </td>

                    <td>
                      ${
                        row.debit !== null && row.debit !== undefined
                          ? formatMoney(row.debit)
                          : "-"
                      }
                    </td>

                    <td>
                      ${
                        row.credit !== null && row.credit !== undefined
                          ? formatMoney(row.credit)
                          : "-"
                      }
                    </td>

                    <td>
                      ${formatMoney(row.balance)}
                    </td>

                  </tr>
                `;
              })
              .join("")
          : `
            <tr>
              <td colspan="6">
                ${escapeHtml(t("ledger.noTransactions", lang))}
              </td>
            </tr>
          `
      }

      <tr class="totals-row">

        <td colspan="3" class="right">
          ${escapeHtml(t("totals", lang))}:
        </td>

        <td>
          ${formatMoney(summary.totalDebit)}
        </td>

        <td>
          ${formatMoney(summary.totalCredit)}
        </td>

        <td>
          ${formatMoney(summary.closingBalance)}
        </td>

      </tr>

    </tbody>
  </table>

  <div class="footer">
    ${escapeHtml(t("app.name", lang))}
    •
    ${escapeHtml(new Date().toLocaleDateString("en-GB"))}
  </div>

</div>
</body>
</html>
`;
};

module.exports = generatePartyLedgerHTML;
