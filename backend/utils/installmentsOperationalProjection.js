const InstallmentsInvoice = require('../models/InstallmentsInvoice');
const InstallmentsPaymentTransaction = require('../models/InstallmentsPaymentTransaction');
const { roundMoney } = require('./money');

const id = (value) => String(value?._id || value || '');

const projectInstallmentsLedgerEntries = async ({ entries, businessOwnerId, balanceKind }) => {
  const paymentIds = [...new Set(entries.map((entry) => id(entry.paymentTransactionId)).filter(Boolean))];
  const invoiceIds = [...new Set(entries.map((entry) => id(entry.invoiceId)).filter(Boolean))];
  const [payments, invoices] = await Promise.all([
    paymentIds.length
      ? InstallmentsPaymentTransaction.find({ _id: { $in: paymentIds }, businessOwnerId })
        .select('status correctedByTransactionId reversalOfTransactionId reversalTransactionId')
        .lean()
      : Promise.resolve([]),
    invoiceIds.length
      ? InstallmentsInvoice.find({ _id: { $in: invoiceIds }, businessOwnerId })
        .select('status accountingStatus')
        .lean()
      : Promise.resolve([]),
  ]);
  const paymentMap = new Map(payments.map((payment) => [id(payment), payment]));
  const invoiceMap = new Map(invoices.map((invoice) => [id(invoice), invoice]));

  const isEffective = (entry) => {
    const payment = paymentMap.get(id(entry.paymentTransactionId));
    const invoice = invoiceMap.get(id(entry.invoiceId));
    if (entry.sourceType === 'payment_reversal') {
      const original = paymentMap.get(id(payment?.reversalOfTransactionId));
      return !(payment?.reversalOfTransactionId && original && id(original.reversalTransactionId) === id(payment));
    }
    if (entry.sourceType === 'invoice_reversal') {
      return !(invoice && invoice.status === 'cancelled' && invoice.accountingStatus === 'reversed');
    }
    if (payment && payment.status === 'reversed' && (payment.correctedByTransactionId || payment.reversalTransactionId)) return false;
    if (['sale_invoice', 'purchase_invoice'].includes(entry.sourceType) && invoice && invoice.status === 'cancelled' && invoice.accountingStatus === 'reversed') return false;
    return true;
  };

  let operationalRunningBalance = 0;
  return entries.map((entry) => {
    const isOperationalEffective = isEffective(entry);
    const debit = Number(entry.debit || 0); const credit = Number(entry.credit || 0);
    const change = balanceKind === 'supplier' ? credit - debit : debit - credit;
    if (isOperationalEffective) operationalRunningBalance = roundMoney(operationalRunningBalance + change);
    return { ...entry, isOperationalEffective, operationalRunningBalance };
  });
};

module.exports = { projectInstallmentsLedgerEntries };
