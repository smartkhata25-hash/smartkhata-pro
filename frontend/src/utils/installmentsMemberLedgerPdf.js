import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { formatInstallmentsDisplayRef } from './installmentsDisplay';
import { formatInstallmentsMoney } from './installmentsMoney';

const amount = (value) => formatInstallmentsMoney(value, { absolute: true });
const balanceAmount = (value) => formatInstallmentsMoney(value);
const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const movement = (entry) => {
  const debit = Number(entry.debit || 0);
  const credit = Number(entry.credit || 0);
  if (['customer_receipt', 'customer_advance'].includes(entry.sourceType)) return { moneyIn: credit, moneyOut: 0 };
  if (entry.sourceType === 'committee_savings_payout') return { moneyIn: 0, moneyOut: debit };
  if (entry.sourceType === 'payment_reversal') return { moneyIn: credit, moneyOut: debit };
  return { moneyIn: 0, moneyOut: 0 };
};

export const prepareInstallmentsMemberStatement = (statement) => {
  const entries = Array.isArray(statement?.entries) ? statement.entries : [];
  const closingBalance = Number(statement?.closingBalance || 0);
  const projectionAvailable = entries.every((entry) =>
    typeof entry.isOperationalEffective === 'boolean'
    && Number.isFinite(Number(entry.operationalRunningBalance))
  );
  const projectedClosing = entries.length
    ? Number(entries[entries.length - 1].operationalRunningBalance)
    : closingBalance;
  const reconciled = projectionAvailable && Math.abs(projectedClosing - closingBalance) < 0.005;

  if (!reconciled) {
    const error = new Error('Member ledger requires reconciliation before a customer statement can be generated.');
    error.code = 'INSTALLMENTS_LEDGER_RECONCILIATION_REQUIRED';
    throw error;
  }

  const rows = entries.filter((entry) => entry.isOperationalEffective !== false);
  let openingBalance = Number(statement?.openingBalance || 0);
  if (rows.length) {
    const first = rows[0];
    openingBalance = round(Number(first.operationalRunningBalance) - Number(first.debit || 0) + Number(first.credit || 0));
  } else if (entries.length) {
    openingBalance = closingBalance;
  }

  return { closingBalance, entries: rows, openingBalance };
};

export const canRenderInstallmentsMemberPdfText = (...values) =>
  !values.some((value) => /[\u0600-\u06ff]/.test(String(value || '')));

const safeFilePart = (value, fallback) => String(value || fallback)
  .trim()
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '') || fallback;

export const createInstallmentsMemberLedgerPdf = ({ statement, businessName, fromDate, toDate }) => {
  const normalized = prepareInstallmentsMemberStatement(statement);
  const member = statement?.member || {};
  const memberRef = formatInstallmentsDisplayRef(member.memberNumber, 'member') || member.memberNumber || 'Member';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(businessName || ''), 14, 16);
  doc.setFontSize(13);
  doc.text('Member Ledger Statement', 14, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Member: ${member.fullName || ''}`, 14, 30);
  doc.text(`Account Reference: ${memberRef}`, 14, 35);
  doc.text(`Statement Period: ${fromDate || 'Beginning'} to ${toDate || 'Current'}`, 14, 40);
  doc.text(`Generated: ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`, 14, 45);

  autoTable(doc, {
    head: [['Opening Balance', 'Closing Balance']],
    body: [[balanceAmount(normalized.openingBalance), balanceAmount(normalized.closingBalance)]],
    startY: 51,
    theme: 'grid',
    styles: { fontSize: 9, halign: 'right' },
    headStyles: { fillColor: [30, 64, 175] },
    margin: { left: 14, right: 14 },
  });

  autoTable(doc, {
    head: [['DATE', 'REF', 'MONEY IN', 'MONEY OUT', 'BALANCE']],
    body: normalized.entries.map((entry) => {
      const cash = movement(entry);
      return [
        entry.entryDate || '',
        formatInstallmentsDisplayRef(entry.referenceNumber, 'reference'),
        cash.moneyIn ? amount(cash.moneyIn) : '—',
        cash.moneyOut ? amount(cash.moneyOut) : '—',
        balanceAmount(entry.operationalRunningBalance),
      ];
    }),
    startY: (doc.lastAutoTable?.finalY || 62) + 7,
    theme: 'striped',
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    headStyles: { fillColor: [15, 118, 110] },
    margin: { left: 10, right: 10, top: 14, bottom: 14 },
  });

  const fileName = `${safeFilePart(member.memberNumber || member.fullName, 'Member')}-Ledger.pdf`;
  return { blob: doc.output('blob'), fileName, normalized };
};

export const downloadInstallmentsMemberLedgerPdf = (document) => {
  const url = window.URL.createObjectURL(document.blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = document.fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
