const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const money = (value = 0) =>
  Number(value || 0).toLocaleString("en-GB", {
    maximumFractionDigits: 2,
  });

const renderAmount = (value = 0, className = "") =>
  `<span class="amount ${Number(value || 0) === 0 ? "zero" : ""} ${className}">${money(
    value,
  )}</span>`;

const renderRow = (row, index) => `
  <tr>
    <td class="center serial">${index + 1}</td>
    <td class="employee-cell">
      <div class="employee-name">${escapeHtml(row.employeeName || "-")}</div>
      <div class="employee-meta">${escapeHtml(row.employeeNo || "-")}</div>
    </td>
    <td class="center department-cell">${escapeHtml(row.departmentName || "-")}</td>
    <td class="financial-cell">${renderAmount(row.salary)}</td>
    <td class="financial-cell">${renderAmount(row.plus)}</td>
    <td class="financial-cell">${renderAmount(row.deduction)}</td>
    <td class="financial-cell">${renderAmount(row.loan)}</td>
    <td class="financial-cell">${renderAmount(row.kharcha)}</td>
    <td class="financial-cell payable-cell">
      ${renderAmount(row.payable, "payable")}
      <div class="paid">Paid: ${money(row.paidAmount)}</div>
    </td>
    <td class="sign-cell"></td>
  </tr>
`;

const renderTotalsRow = (label, totals, className = "unit-total") => `
  <tr class="${className}">
    <td class="total-label" colspan="3">${escapeHtml(label)}</td>
    <td class="financial-cell">${renderAmount(totals.salary)}</td>
    <td class="financial-cell">${renderAmount(totals.plus)}</td>
    <td class="financial-cell">${renderAmount(totals.deduction)}</td>
    <td class="financial-cell">${renderAmount(totals.loan)}</td>
    <td class="financial-cell">${renderAmount(totals.kharcha)}</td>
    <td class="financial-cell payable-cell">${renderAmount(totals.payable, "payable")}</td>
    <td class="center"></td>
  </tr>
`;

const renderGroup = (group) => `
  <tbody class="unit-block">
    <tr class="unit-heading">
      <td colspan="10">${escapeHtml(group.unitName || "No Unit")}</td>
    </tr>
    ${group.rows.map((row, index) => renderRow(row, index)).join("")}
    ${renderTotalsRow(`${group.unitName || "Unit"} Total`, group.totals)}
  </tbody>
`;

const buildSalaryClosingReportHtml = (report) => {
  const business = report.business || {};

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Salary Closing Sheet</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: 11px;
    }
    .sheet { width: 100%; }
    .header {
      border: 1px solid #111827;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 8px;
    }
    .top-line {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }
    .business h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.15;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .business div {
      margin-top: 2px;
      color: #374151;
      font-weight: 700;
    }
    .report-title {
      text-align: center;
      min-width: 270px;
    }
    .report-title h2 {
      margin: 0;
      font-size: 17px;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .report-title .grand-payable {
      margin-top: 4px;
      font-size: 18px;
      font-weight: 900;
      text-align: center;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
      border-top: 1px solid #d1d5db;
      padding-top: 7px;
    }
    .meta-item {
      color: #4b5563;
      font-weight: 700;
    }
    .meta-item strong {
      display: block;
      margin-top: 2px;
      color: #111827;
      font-size: 12px;
      font-weight: 900;
    }
    .early-close {
      margin-top: 7px;
      border: 1px solid #f59e0b;
      background: #fffbeb;
      color: #78350f;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 10.5px;
      font-weight: 800;
    }
    .early-close strong {
      color: #111827;
      font-weight: 900;
    }
    .warning {
      border: 1px solid #f59e0b;
      background: #fffbeb;
      color: #92400e;
      padding: 7px 9px;
      margin-bottom: 8px;
      font-weight: 800;
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th {
      border: 1px solid #111827;
      background: #111827;
      color: #ffffff;
      padding: 5px 4px;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      text-align: center;
    }
    td {
      border: 1px solid #9ca3af;
      padding: 5px 4px;
      vertical-align: middle;
      font-size: 11px;
      text-align: center;
    }
    .serial { width: 34px; }
    .employee { width: 155px; }
    .department { width: 96px; }
    .financial { width: 78px; }
    .payable-col { width: 95px; }
    .sign-col { width: 112px; }
    .center { text-align: center; }
    .employee,
    .employee-cell {
      text-align: left;
    }
    .financial-cell,
    .payable-cell,
    .sign-cell,
    .department-cell {
      text-align: center;
    }
    .employee-name {
      font-weight: 900;
      font-size: 11.5px;
      line-height: 1.2;
      text-align: left;
    }
    .employee-meta {
      margin-top: 2px;
      color: #4b5563;
      font-size: 9.5px;
      font-weight: 700;
      text-align: left;
    }
    .amount {
      display: inline-block;
      width: 100%;
      text-align: center;
      font-weight: 800;
      color: #111827;
    }
    .amount.zero {
      color: #6b7280;
      font-weight: 700;
    }
    .amount.payable {
      font-size: 13px;
      font-weight: 900;
      color: #000000;
    }
    .paid {
      margin-top: 2px;
      color: #4b5563;
      font-size: 9px;
      font-weight: 700;
      text-align: center;
    }
    .sign-cell {
      height: 34px;
      background: #ffffff;
      text-align: center;
    }
    .total-label {
      text-align: left;
    }
    .unit-heading td {
      background: #e5e7eb;
      color: #111827;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      padding: 6px 5px;
    }
    .unit-total td {
      background: #f3f4f6;
      font-weight: 900;
      border-top: 2px solid #111827;
    }
    .grand-total td {
      background: #ffffff;
      border-top: 3px solid #111827;
      border-bottom: 3px solid #111827;
      font-weight: 900;
      font-size: 12px;
    }
    .grand-total .amount.payable {
      font-size: 16px;
    }
    @media screen {
      body { background: #f8fafc; padding: 14px; }
      .sheet {
        background: #ffffff;
        max-width: 1280px;
        margin: 0 auto;
        padding: 12px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.10);
        border-radius: 8px;
      }
    }
    @media print {
      body { padding: 0; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    ${
      report.status?.draftCount
        ? `<div class="warning">${report.status.draftCount} payrolls are still Draft. Finalize payroll before printing the official Salary Closing Sheet.</div>`
        : ""
    }
    <section class="header">
      <div class="top-line">
        <div class="business">
          <h1>${escapeHtml(business.name || "Smart Khata")}</h1>
          ${business.address ? `<div>${escapeHtml(business.address)}</div>` : ""}
          ${business.mobile ? `<div>${escapeHtml(business.mobile)}</div>` : ""}
        </div>
        <div class="report-title">
          <h2>Salary Closing Sheet</h2>
          <div class="grand-payable">Total Payable: ${money(report.summary?.payable || 0)}</div>
        </div>
      </div>
      <div class="meta">
        <div class="meta-item">Period<strong>${escapeHtml(report.cycle?.periodLabel || "")}</strong></div>
        <div class="meta-item">Closing<strong>${escapeHtml(String(report.cycle?.segmentNo || 1))}</strong></div>
        <div class="meta-item">Unit<strong>${escapeHtml(report.selection?.unitName || "All Units")}</strong></div>
        <div class="meta-item">Employees<strong>${money(report.summary?.employees || 0)}</strong></div>
      </div>
      <div class="early-close">
        Original Cycle: <strong>${escapeHtml(report.cycle?.originalPeriodLabel || report.cycle?.periodLabel || "")}</strong>
        &nbsp; | &nbsp; Due Date: <strong>${escapeHtml(report.cycle?.dueDateLabel || "")}</strong>
      </div>
      ${
        report.cycle?.earlyClosed
          ? `<div class="early-close">
              Status: <strong>Early Closed</strong>
              &nbsp; | &nbsp; Through: <strong>${escapeHtml(report.cycle.earlyCloseThroughDateLabel || report.cycle.earlyCloseThroughDate || "")}</strong>
              &nbsp; | &nbsp; Original Cycle: <strong>${escapeHtml(report.cycle.originalPeriodLabel || "")}</strong>
              ${
                report.cycle.earlyCloseReason
                  ? `&nbsp; | &nbsp; Reason: <strong>${escapeHtml(report.cycle.earlyCloseReason)}</strong>`
                  : ""
              }
            </div>`
          : ""
      }
    </section>

    <table>
      <thead>
        <tr>
          <th class="serial">#</th>
          <th class="employee">Employee</th>
          <th class="department">Department</th>
          <th class="financial">Salary</th>
          <th class="financial">Plus</th>
          <th class="financial">Deduction</th>
          <th class="financial">Loan</th>
          <th class="financial">Kharcha</th>
          <th class="payable-col">Payable</th>
          <th class="sign-col">Sign / Thumb</th>
        </tr>
      </thead>
      ${report.groups.map(renderGroup).join("")}
      <tbody>
        ${renderTotalsRow("Grand Total", report.summary || {}, "grand-total")}
      </tbody>
    </table>
  </main>
</body>
</html>`;
};

module.exports = {
  buildSalaryClosingReportHtml,
};
