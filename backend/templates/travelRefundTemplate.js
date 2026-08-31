const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const renderRows = (items = []) =>
  items
    .map(
      (item) => `
        <tr>
          <td class="center">${escapeHtml(item.index)}</td>
          <td>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted">${escapeHtml(item.type)}</div>
          </td>
          <td class="right">${escapeHtml(item.originalAmount)}</td>
          <td class="right">${escapeHtml(item.refundAmount)}</td>
        </tr>
      `,
    )
    .join("");

const totalLine = (label, value, strong = false) =>
  value
    ? `<div class="total-line${strong ? " strong" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    : "";

const renderTravelRefundHtml = (data, options = {}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.documentTitle)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        line-height: 1.45;
      }
      .topline { height: 4px; background: #0891b2; margin-bottom: 18px; }
      .header {
        align-items: flex-start;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        gap: 24px;
        justify-content: space-between;
        padding-bottom: 14px;
      }
      h1, h2, h3, p { margin: 0; }
      h1 { color: #0f172a; font-size: 24px; letter-spacing: 0; }
      h2 { color: #0e7490; font-size: 18px; margin-top: 2px; }
      .company { font-size: 20px; font-weight: 800; }
      .muted { color: #64748b; }
      .right { text-align: right; }
      .center { text-align: center; }
      .section { margin-top: 16px; }
      .grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .box {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px;
      }
      .label {
        color: #64748b;
        display: block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .value { font-size: 13px; font-weight: 800; margin-top: 2px; }
      table {
        border-collapse: collapse;
        margin-top: 8px;
        width: 100%;
      }
      th {
        background: #ecfeff;
        color: #155e75;
        font-size: 11px;
        text-align: left;
      }
      th, td {
        border: 1px solid #e2e8f0;
        padding: 8px;
        vertical-align: top;
      }
      .totals {
        margin-left: auto;
        margin-top: 14px;
        width: 310px;
      }
      .total-line {
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        padding: 7px 0;
      }
      .total-line.strong {
        border-bottom: 2px solid #0891b2;
        color: #0e7490;
        font-size: 14px;
        font-weight: 800;
      }
      .notes { white-space: pre-wrap; }
      .footer {
        border-top: 1px solid #e2e8f0;
        color: #64748b;
        margin-top: 28px;
        padding-top: 12px;
      }
    </style>
    ${
      options.autoPrint
        ? '<script>window.addEventListener("load", function () { window.print(); });</script>'
        : ""
    }
  </head>
  <body>
    <main>
      <div class="topline"></div>

      <section class="header">
        <div>
          ${
            data.header
              ? `<p class="company">${escapeHtml(data.header.companyName)}</p>
                 <p class="muted">${escapeHtml(data.header.address)}</p>
                 <p class="muted">${escapeHtml(data.header.phone)}</p>
                 <p class="muted">${escapeHtml(data.header.taxNumber)}</p>`
              : ""
          }
        </div>
        <div class="right">
          <h1>${escapeHtml(data.documentTitle)}</h1>
          <h2>${escapeHtml(data.documentInfo.number)}</h2>
          <p class="muted">${escapeHtml(data.documentInfo.date)} ${escapeHtml(data.documentInfo.time)}</p>
        </div>
      </section>

      <section class="section grid">
        <div class="box">
          <span class="label">Customer</span>
          <p class="value">${escapeHtml(data.customer.name)}</p>
          <p class="muted">${escapeHtml(data.customer.phone)}</p>
          <p class="muted">${escapeHtml(data.customer.email)}</p>
        </div>
        <div class="box">
          <span class="label">Refund Details</span>
          <p class="value">${escapeHtml(data.documentInfo.originalInvoice)}</p>
          <p class="muted">Method: ${escapeHtml(data.payment.method)}</p>
          <p class="muted">Account: ${escapeHtml(data.payment.account)}</p>
        </div>
      </section>

      <section class="section">
        <h3>Refunded Services</h3>
        <table>
          <thead>
            <tr>
              <th class="center" style="width: 40px;">#</th>
              <th>Service</th>
              <th class="right">Original</th>
              <th class="right">Refund</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(data.items)}
          </tbody>
        </table>
      </section>

      <section class="totals">
        ${totalLine("Gross Refund", data.totals.grossRefundAmount)}
        ${totalLine("Penalty", data.totals.penaltyAmount)}
        ${totalLine("Customer Refund", data.totals.customerRefundAmount, true)}
        ${totalLine("Paid Back", data.totals.paidBackAmount)}
      </section>

      ${
        data.notes
          ? `<section class="section box"><span class="label">Notes</span><p class="notes">${escapeHtml(data.notes)}</p></section>`
          : ""
      }

      ${
        data.footer
          ? `<footer class="footer">
              <p>${escapeHtml(data.footer.message)}</p>
              ${data.footer.showStamp ? "<p>Authorized Signature ____________________</p>" : ""}
            </footer>`
          : ""
      }
    </main>
  </body>
</html>
`;

module.exports = {
  renderTravelRefundHtml,
};
