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

const LABELS = {
  en: {
    appName: "Smart Khata",
    customerTitle: "Customer Aging Ledger",
    partyTitle: "Party Aging Ledger",
    customer: "Customer",
    party: "Party",
    asOfDate: "As of Date",
    totalOutstanding: "Total Outstanding",
    billNo: "Bill No",
    invoiceDate: "Invoice Date",
    days: "Days",
    amount: "Amount",
    noRows: "No outstanding bills",
    totals: "Total",
  },

  ur: {
    appName: "سمارٹ کھاتہ",
    customerTitle: "کسٹمر ایجنگ لیجر",
    partyTitle: "پارٹی ایجنگ لیجر",
    customer: "کسٹمر",
    party: "پارٹی",
    asOfDate: "بتاریخ",
    totalOutstanding: "کل بقایا",
    billNo: "بل نمبر",
    invoiceDate: "انوائس تاریخ",
    days: "دن",
    amount: "رقم",
    noRows: "کوئی بقایا بل نہیں",
    totals: "کل",
  },
};

const formatAmount = (value) =>
  safeNumber(value).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const generateBillWiseAgingLedgerHTML = (data, pageSize = "A4") => {
  const lang = data?.lang === "ur" ? "ur" : "en";
  const labels = LABELS[lang] || LABELS.en;

  const isUrdu = lang === "ur";
  const dir = isUrdu ? "rtl" : "ltr";

  const safePageSize = pageSize === "A5" ? "A5" : "A4";

  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const summary = data?.summary || {};

  const entityType = data?.entityType === "party" ? "party" : "customer";

  const title =
    entityType === "party" ? labels.partyTitle : labels.customerTitle;

  const entityLabel = entityType === "party" ? labels.party : labels.customer;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8" />

  <title>${escapeHtml(title)}</title>

  <style>
    @page {
      size: ${safePageSize};
      margin: ${safePageSize === "A5" ? "8mm" : "10mm"};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;

      font-family:
        Arial,
        "Noto Nastaliq Urdu",
        sans-serif;

      color: #111827;
      background: #ffffff;

      font-size:
        ${safePageSize === "A5" ? "10px" : "11px"};

      direction: ${dir};
    }

   

    .header {
      display: grid;

      grid-template-columns:
        minmax(0, 1fr)
        minmax(180px, 1.2fr)
        minmax(0, 1fr);

      align-items: start;

      gap: 12px;

      border-bottom: 2px solid #1d4ed8;

      padding-bottom: 8px;
      margin-bottom: 12px;
    }

    .brand {
      font-size: 15px;
      font-weight: 800;
      color: #1e40af;
    }

    .title {
      font-size:
        ${safePageSize === "A5" ? "16px" : "19px"};

      font-weight: 800;
      text-align: center;
      color: #111827;
    }

    .meta {
      margin-top: 4px;

      color: #374151;

      line-height: 1.6;
    }

    .total-box {
      text-align: ${isUrdu ? "left" : "right"};
    }

    .total-box strong {
      display: inline-block;
      margin-top: 2px;

      font-size: 12px;
      color: #111827;
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
      break-inside: avoid;
    }

    th,
    td {
      border: 1px solid #d1d5db;

      padding:
        ${safePageSize === "A5" ? "5px" : "7px"};

      vertical-align: middle;

      text-align: center;
    }

    th {
      background: #f3f4f6;

      font-weight: 800;

      color: #111827;
    }

    td {
      color: #111827;
    }

    .bill-cell {
      direction: ltr;
      text-align: center;
    }

    .date-cell {
      direction: ltr;
      text-align: center;
      white-space: nowrap;
    }

    .days-cell {
      direction: ltr;
      text-align: center;
      white-space: nowrap;
    }

    .amount-cell {
      direction: ltr;
      text-align: center;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .totals-row {
      background: #f9fafb;
      font-weight: 800;
    }

    .totals-row td {
      border-top: 2px solid #9ca3af;
    }

    .empty-row td {
      padding: 14px;
      color: #6b7280;
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

 

  <div class="header">

    <div>
      <div class="brand">
        ${escapeHtml(labels.appName)}
      </div>

      <div class="meta">
        ${escapeHtml(entityLabel)}:
        ${escapeHtml(data?.entity?.name || "-")}
        <br />

        ${escapeHtml(labels.asOfDate)}:
        ${escapeHtml(data?.asOfDate || "-")}
      </div>
    </div>

    <div class="title">
      ${escapeHtml(title)}
    </div>

    <div class="meta total-box">
      ${escapeHtml(labels.totalOutstanding)}
      <br />

      <strong>
        Rs. ${formatAmount(summary.totalOutstanding)}
      </strong>
    </div>

  </div>

 

  <table>

    <thead>
      <tr>

        <th style="width: 24%;">
          ${escapeHtml(labels.billNo)}
        </th>

        <th style="width: 26%;">
          ${escapeHtml(labels.invoiceDate)}
        </th>

        <th style="width: 18%;">
          ${escapeHtml(labels.days)}
        </th>

        <th style="width: 32%;">
          ${escapeHtml(labels.amount)}
        </th>

      </tr>
    </thead>

    <tbody>

      ${
        rows.length > 0
          ? rows
              .map(
                (row) => `
                  <tr>

                    <td class="bill-cell">
                      ${escapeHtml(row.billNo || "-")}
                    </td>

                    <td class="date-cell">
                      ${escapeHtml(row.invoiceDate || "-")}
                    </td>

                    <td class="days-cell">
                      ${safeNumber(row.days)}
                    </td>

                    <td class="amount-cell">
                      ${formatAmount(row.outstanding)}
                    </td>

                  </tr>
                `,
              )
              .join("")
          : `
            <tr class="empty-row">
              <td colspan="4">
                ${escapeHtml(labels.noRows)}
              </td>
            </tr>
          `
      }

      ${
        rows.length > 0
          ? `
            <tr class="totals-row">

              <td colspan="3">
                ${escapeHtml(labels.totals)}
              </td>

              <td class="amount-cell">
                ${formatAmount(summary.totalOutstanding)}
              </td>

            </tr>
          `
          : ""
      }

    </tbody>

  </table>

</body>
</html>`;
};

module.exports = generateBillWiseAgingLedgerHTML;
