const Invoice = require('../models/InstallmentsInvoice');

const id = (value) => String(value?._id || value || '');

const resolvePublicInvoiceNumber = async (invoice, businessOwnerId, session = null, cache = new Map()) => {
  if (!invoice) return '';
  if (invoice.publicInvoiceNumber) return invoice.publicInvoiceNumber;
  const invoiceId = id(invoice);
  if (cache.has(invoiceId)) return cache.get(invoiceId);

  const seen = new Set();
  let current = invoice;
  while (current?.correctsInvoiceId && !seen.has(id(current))) {
    seen.add(id(current));
    let query = Invoice.findOne({ _id: id(current.correctsInvoiceId), businessOwnerId }).select('invoiceNumber publicInvoiceNumber correctsInvoiceId');
    if (session) query = query.session(session);
    current = await query.lean();
  }
  const publicNumber = current?.publicInvoiceNumber || current?.invoiceNumber || invoice.invoiceNumber || '';
  cache.set(invoiceId, publicNumber);
  return publicNumber;
};

const decorateInvoiceReferences = async (invoices, businessOwnerId) => {
  const cache = new Map();
  return Promise.all(invoices.map(async (invoice) => ({ ...invoice, publicInvoiceNumber: await resolvePublicInvoiceNumber(invoice, businessOwnerId, null, cache) })));
};

const decorateLedgerReferences = async (entries, businessOwnerId) => {
  const invoiceIds = [...new Set(entries.map((entry) => id(entry.invoiceId)).filter(Boolean))];
  if (!invoiceIds.length) return entries;
  const invoices = await Invoice.find({ _id: { $in: invoiceIds }, businessOwnerId }).select('invoiceNumber publicInvoiceNumber correctsInvoiceId').lean();
  const decorated = await decorateInvoiceReferences(invoices, businessOwnerId);
  const invoiceMap = new Map(decorated.map((invoice) => [id(invoice), invoice]));
  return entries.map((entry) => {
    const invoice = invoiceMap.get(id(entry.invoiceId));
    if (!invoice || !invoice.publicInvoiceNumber || invoice.publicInvoiceNumber === invoice.invoiceNumber) return entry;
    return {
      ...entry,
      referenceNumber: String(entry.referenceNumber || '').replace(invoice.invoiceNumber, invoice.publicInvoiceNumber),
      description: String(entry.description || '').replace(invoice.invoiceNumber, invoice.publicInvoiceNumber),
    };
  });
};

module.exports = { decorateInvoiceReferences, decorateLedgerReferences, resolvePublicInvoiceNumber };
