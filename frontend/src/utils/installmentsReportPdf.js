import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { formatInstallmentsDisplayRef } from './installmentsDisplay';
import { formatInstallmentsMoney } from './installmentsMoney';

const rows = (value) => Array.isArray(value) ? value : [];
const amount = (value) => value === null || value === undefined ? 'Not allocated' : formatInstallmentsMoney(value);
const text = (value) => String(value ?? '');
const titleCase = (value) => text(value).replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

const reportTitles = {
  profit: 'Installments Profit Report',
  collections: 'Installments Collections Report',
  expenses: 'Installments Expenses Report',
  balances: 'Installments Receivables & Payables Report',
  savings: 'Installments Savings Report',
};

const tableData = (tab, data, balanceType = 'all') => {
  if (tab === 'profit') return [
    { title: 'Sales', head: ['Date', 'Invoice', 'Member', 'Supplier', 'Product', 'Qty', 'Sales', 'Cost', 'Profit'], body: rows(data.sales).map((row) => [row.invoiceDate, formatInstallmentsDisplayRef(row.invoiceNumber, 'invoice'), row.member?.fullName, row.supplier?.name, row.productName, row.quantity, amount(row.saleAmount), amount(row.purchaseCost), amount(row.grossProfit)]) },
    { title: 'Product Profitability', head: ['Product', 'Category', 'Qty', 'Sales', 'Cost', 'Profit', 'Margin %'], body: rows(data.products).map((row) => [row.productName, row.category, row.quantity, amount(row.totalSales), amount(row.purchaseCost), amount(row.grossProfit), text(row.grossMarginPercent)]) },
    { title: 'Operating Expenses', head: ['Date', 'Title', 'Category', 'Account', 'Amount'], body: rows(data.expenses).map((row) => [row.date, row.title, row.category?.name, rows(row.paidFrom).map((account) => account.name).join(', '), amount(row.amount)]) },
  ];
  if (tab === 'collections') return [
    { title: 'Collection Schedule', head: ['Due Date', 'Member', 'Committee', 'Scheduled', 'Applied', 'Remaining', 'Status'], body: rows(data.schedules).map((row) => [row.dueDate, row.member?.fullName, formatInstallmentsDisplayRef(row.committee?.committeeNumber, 'committee'), amount(row.scheduledAmount), amount(row.appliedAmount), amount(row.remaining), row.status]) },
    { title: 'Effective Receipts', head: ['Date', 'Reference', 'Member', 'Committee', 'Account', 'Amount'], body: rows(data.receipts).map((row) => [row.transactionDate, formatInstallmentsDisplayRef(row.referenceNumber, 'reference'), row.memberId?.fullName, formatInstallmentsDisplayRef(row.committeeId?.committeeNumber, 'committee'), row.accountId?.name, amount(row.amount)]) },
  ];
  if (tab === 'expenses') return [
    { title: 'Expenses by Title', head: ['Title', 'Count', 'Amount'], body: rows(data.byTitle).map((row) => [row.label, row.count, amount(row.amount)]) },
    { title: 'Expense Entries', head: ['Date', 'Title', 'Category', 'Account', 'Amount'], body: rows(data.rows).map((row) => [row.date, row.title, row.category?.name, rows(row.paidFrom).map((account) => account.name).join(', '), amount(row.amount)]) },
  ];
  if (tab === 'balances') return [
    ...(balanceType !== 'payable' ? [{ title: 'Member Receivables', head: ['Member', 'Number', 'Mobile', 'Receivable'], body: rows(data.members).filter((row) => Number(row.receivable) > 0).map((row) => [row.fullName, row.memberNumber, row.mobile, amount(row.receivable)]) }] : []),
    ...(balanceType !== 'receivable' ? [{ title: 'Supplier Payables', head: ['Supplier', 'Number', 'Phone', 'Payable'], body: rows(data.suppliers).filter((row) => Number(row.payable) > 0).map((row) => [row.name, row.supplierNumber, row.phone, amount(row.payable)]) }] : []),
  ];
  if (tab === 'savings') return [{ title: 'Committee Savings', head: ['Member', 'Committee', 'Contributions', 'Payouts', 'Applied Advance', 'Available', 'Status'], body: rows(data.rows).map((row) => [row.member?.fullName, formatInstallmentsDisplayRef(row.committeeNumber, 'committee'), amount(row.contributions), amount(row.payouts), amount(row.appliedAdvance), amount(row.availableSavings), row.closureType === 'settled' ? 'completed' : row.status]) }];
  return [];
};

export const exportInstallmentsReportPdf = ({ tab, data, filters = {}, balanceType = 'all' }) => {
  if (!data || !reportTitles[tab]) return false;
  const doc = new jsPDF({ orientation: tab === 'savings' ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(reportTitles[tab], 14, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const period = filters.fromDate && filters.toDate ? `${filters.fromDate} to ${filters.toDate}` : 'Current verified balances';
  doc.text(`Period: ${period}`, 14, 23);
  doc.text(`Generated: ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`, 14, 28);
  let startY = 34;
  const summary = data.summary && typeof data.summary === 'object'
    ? Object.entries(data.summary).filter(([, value]) => ['number', 'string'].includes(typeof value)).map(([key, value]) => [titleCase(key), typeof value === 'number' ? amount(value) : text(value)])
    : [];
  if (summary.length) {
    autoTable(doc, { head: [['Summary', 'Value']], body: summary, startY, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [7, 86, 199] }, margin: { left: 14, right: 14 } });
    startY = (doc.lastAutoTable?.finalY || startY) + 8;
  }
  tableData(tab, data, balanceType).filter((table) => table.body.length).forEach((table) => {
    if (startY > doc.internal.pageSize.getHeight() - 35) { doc.addPage(); startY = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(table.title, 14, startY);
    autoTable(doc, { head: [table.head], body: table.body, startY: startY + 3, theme: 'striped', pageBreak: 'auto', rowPageBreak: 'avoid', styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' }, headStyles: { fillColor: [15, 118, 110] }, margin: { left: 10, right: 10, top: 14, bottom: 14 } });
    startY = (doc.lastAutoTable?.finalY || startY) + 8;
  });
  const range = filters.fromDate && filters.toDate ? `${filters.fromDate}_${filters.toDate}` : 'current';
  doc.save(`SmartKhaata-Installments-${tab}-${range}.pdf`);
  return true;
};

