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
            ${
              item.details?.length
                ? `<ul>${item.details
                    .map((detail) => `<li>${escapeHtml(detail)}</li>`)
                    .join("")}</ul>`
                : ""
            }
          </td>
          <td class="right">${escapeHtml(item.amount)}</td>
        </tr>
      `,
    )
    .join("");

const renderTravelInvoiceHtml = (data, options = {}) => `
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
      .page { width: 100%; }
      .topline { height: 4px; background: #0891b2; margin-bottom: 18px; }
      .header {
        align-items: flex-start;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        gap: 24px;
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
      ul { margin: 4px 0 0 16px; padding: 0; }
      .totals {
        margin-left: auto;
        margin-top: 14px;
        width: 280px;
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
    <main class="page">
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
          <h2>${escapeHtml(data.documentInfo.invoiceNumber)}</h2>
          <p class="muted">Booking: ${escapeHtml(data.documentInfo.bookingNumber)}</p>
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
          <span class="label">Invoice Details</span>
          <p class="value">${escapeHtml(data.documentInfo.date)}</p>
          <p class="muted">${escapeHtml(data.documentInfo.serviceType)}</p>
          <p class="muted">${escapeHtml(data.documentInfo.status)}</p>
        </div>
      </section>

      ${
        data.travelers?.length
          ? `<section class="section">
              <h3>Travelers</h3>
              <table>
                <thead>
                  <tr><th>Name</th><th>Passport</th><th>Mobile</th></tr>
                </thead>
                <tbody>
                  ${data.travelers
                    .map(
                      (traveler) => `
                        <tr>
                          <td>${escapeHtml(traveler.name)}</td>
                          <td>${escapeHtml(traveler.passportNumber)}</td>
                          <td>${escapeHtml(traveler.mobile)}</td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </section>`
          : ""
      }

      <section class="section">
        <h3>Booked Services</h3>
        <table>
          <thead>
            <tr><th class="center" style="width: 44px;">#</th><th>Service</th><th class="right" style="width: 130px;">Amount</th></tr>
          </thead>
          <tbody>
            ${renderRows(data.items)}
          </tbody>
        </table>
      </section>

      <section class="totals">
        <div class="total-line"><span>Sale</span><strong>${escapeHtml(data.totals.sale)}</strong></div>
        ${
          data.totals.discount
            ? `<div class="total-line"><span>Discount</span><strong>${escapeHtml(data.totals.discount)}</strong></div>`
            : ""
        }
        <div class="total-line strong"><span>Net Sale</span><strong>${escapeHtml(data.totals.netSale)}</strong></div>
        ${
          data.totals.received
            ? `<div class="total-line"><span>Received</span><strong>${escapeHtml(data.totals.received)}</strong></div>`
            : ""
        }
        ${
          data.totals.refunded
            ? `<div class="total-line"><span>Refunded</span><strong>${escapeHtml(data.totals.refunded)}</strong></div>`
            : ""
        }
        ${
          data.totals.due
            ? `<div class="total-line"><span>Customer Due</span><strong>${escapeHtml(data.totals.due)}</strong></div>`
            : ""
        }
      </section>

      ${
        data.notes
          ? `<section class="section box"><span class="label">Notes</span><p>${escapeHtml(data.notes)}</p></section>`
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
  renderTravelInvoiceHtml,
};
