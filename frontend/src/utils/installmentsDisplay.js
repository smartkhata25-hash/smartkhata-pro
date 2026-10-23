const stripSequencePadding = (digits) => String(digits).replace(/^0+(?=\d)/, '');

const numericReferenceTypes = new Set(['member', 'supplier', 'committee', 'record']);

/**
 * Formats a confirmed Committee & Installments record reference for display.
 * The stored value is never changed. Callers must not use this for arbitrary text.
 */
export const formatInstallmentsDisplayRef = (value, referenceType = 'reference') => {
  if (value === null || value === undefined) return '';
  const ref = String(value).trim();
  if (!ref) return '';

  if (numericReferenceTypes.has(referenceType)) {
    const numeric = ref.match(/^(\d+)(-\d{2,4})?$/);
    if (numeric) return `${stripSequencePadding(numeric[1])}${numeric[2] || ''}`;
  }

  const invoicePayment = ref.match(/^(INV|RCP|PAY|PYO|COM|SUP)-(\d+)(.*)$/i);
  if (invoicePayment) return `${invoicePayment[1]}-${stripSequencePadding(invoicePayment[2])}${invoicePayment[3]}`;

  const reversal = ref.match(/^REV-(INV|RCP|PAY|PYO)-(\d+)(.*)$/i);
  if (reversal) return `REV-${reversal[1]}-${stripSequencePadding(reversal[2])}${reversal[3]}`;

  const opening = ref.match(/^OPEN-(SUP-)?(\d+)(.*)$/i);
  if (opening) return `OPEN-${opening[1] || ''}${stripSequencePadding(opening[2])}${opening[3]}`;

  return ref;
};

export default formatInstallmentsDisplayRef;
