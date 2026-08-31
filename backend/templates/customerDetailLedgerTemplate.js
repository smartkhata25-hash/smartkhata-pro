// Customer Detailed Ledger HTML Template

const { t } = require("../i18n/i18n");

const escapeHtml = (value, fallback = "-") => {
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

const money = (value) => {
  const num = safeNumber(value);

  if (num < 0) {
    return `(${Math.abs(num).toFixed(2)})`;
  }

  return num.toFixed(2);
};

const getSourceLabel = (sourceType, fallback, lang) => {
  switch (sourceType) {
    case "travel_booking":
      return fallback || "Travel Invoice";

    case "travel_refund":
      return fallback || "Travel Refund";

    case "opening_sale_invoice":
    case "opening_refund_invoice":
    case "opening_balance":
      return t("ledger.openingBalance", lang);

    case "sale_invoice":
      return t("saleInvoice", lang);

    case "refund_invoice":
      return t("refund.new", lang);

    case "receive_payment":
      return t("receivePayment", lang);

    case "receive_payment_discount":
      return t("ledger.receivePaymentDiscount", lang);

    default:
      return fallback || "-";
  }
};

const generateCustomerDetailLedgerHTML = (data, pageSize = "A4") => {
  const {
    documentTitle,
    customer = {},
    period = {},
    summary = {},
    blocks = [],
  } = data || {};

  const lang = data?.lang || "ur";
  const isUrdu = lang === "ur";
  const dir = isUrdu ? "rtl" : "ltr";

  const safePageSize = pageSize === "A5" ? "A5" : "A4";

  const title =
    documentTitle && documentTitle !== "Customer Detailed Ledger"
      ? documentTitle
      : t("ledger.customerDetailed", lang);

  return `
<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8" />

  <title>${escapeHtml(title)}</title>

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
      line-height: 1.6;
    }

    .summary {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }

    .summary td {
      border: 1px solid #d1d5db;
      padding: 6px;
      text-align: center;
      font-weight: 600;
    }

    .ledger-block {
      border: 1px solid #d1d5db;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }

    .block-header {
      background: #f3f4f6;
      padding: 6px 8px;
      font-weight: 700;
      border-bottom: 1px solid #d1d5db;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      border: 1px solid #e5e7eb;
      padding: 5px 6px;
    }

    th {
      background: #f9fafb;
      font-weight: 700;
      text-align: center;
    }

    .amount-table td:first-child {
      font-weight: 600;
    }

    .amount-table td:last-child {
      text-align: right;
      width: 35%;
    }

    .no-records {
      text-align: center;
      padding: 18px;
      border: 1px solid #d1d5db;
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
      ${escapeHtml(title)}
    </div>

    <div class="sub-info">
      ${escapeHtml(t("customer", lang))}: ${escapeHtml(customer.name)}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${escapeHtml(t("common.from", lang))}: ${escapeHtml(period.from || "All")}
      &nbsp;&nbsp; | &nbsp;&nbsp;
      ${escapeHtml(t("common.to", lang))}: ${escapeHtml(period.to || "All")}
    </div>

    <table class="summary">
      <tr>
        <td>
          ${escapeHtml(t("ledger.opening", lang))}<br />
          ${money(summary.opening)}
        </td>

        <td>
          ${escapeHtml(t("debit", lang))}<br />
          ${money(summary.totalDebit)}
        </td>

        <td>
          ${escapeHtml(t("credit", lang))}<br />
          ${money(summary.totalCredit)}
        </td>

        <td>
          ${escapeHtml(t("ledger.closing", lang))}<br />
          ${money(summary.closingBalance)}
        </td>
      </tr>
    </table>

    ${
      Array.isArray(blocks) && blocks.length > 0
        ? blocks
            .map((blk) => {
              const sourceLabel = getSourceLabel(
                blk.sourceType,
                blk.sourceLabel,
                lang,
              );

              return `
                <div class="ledger-block">

                  <div class="block-header">
                    ${escapeHtml(sourceLabel)}
                    &nbsp; #${escapeHtml(blk.billNo)}
                    &nbsp; — &nbsp;
                    ${escapeHtml(blk.date)}
                  </div>

                  ${
                    Array.isArray(blk.items) && blk.items.length > 0
                      ? `
                        <table>
                          <thead>
                            <tr>
                              <th>${escapeHtml(t("inventory.product", lang))}</th>
                              <th>${escapeHtml(t("qty", lang))}</th>
                              <th>${escapeHtml(t("rate", lang))}</th>
                              <th>${escapeHtml(t("total", lang))}</th>
                            </tr>
                          </thead>

                          <tbody>
                            ${blk.items
                              .map(
                                (item) => `
                                  <tr>
                                    <td>${escapeHtml(item.productName)}</td>
                                    <td>${safeNumber(item.quantity)}</td>
                                    <td>${money(item.rate)}</td>
                                    <td>${money(item.total)}</td>
                                  </tr>
                                `,
                              )
                              .join("")}
                          </tbody>
                        </table>
                      `
                      : ""
                  }

                  <table class="amount-table">
                    <tbody>
                      <tr>
                        <td>${escapeHtml(t("debit", lang))}</td>
                        <td>
                          ${
                            blk.debit !== null && blk.debit !== undefined
                              ? money(blk.debit)
                              : "-"
                          }
                        </td>
                      </tr>

                      <tr>
                        <td>${escapeHtml(t("credit", lang))}</td>
                        <td>
                          ${
                            blk.credit !== null && blk.credit !== undefined
                              ? money(blk.credit)
                              : "-"
                          }
                        </td>
                      </tr>

                      <tr>
                        <td>${escapeHtml(t("balance", lang))}</td>
                        <td>${money(blk.balance)}</td>
                      </tr>
                    </tbody>
                  </table>

                </div>
              `;
            })
            .join("")
        : `
          <div class="no-records">
            ${escapeHtml(t("ledger.noTransactions", lang))}
          </div>
        `
    }

  </div>
</body>
</html>
`;
};

module.exports = generateCustomerDetailLedgerHTML;
