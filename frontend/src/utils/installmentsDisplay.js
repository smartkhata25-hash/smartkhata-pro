import { formatDocumentReference } from './referenceDisplay';

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

  return formatDocumentReference(ref);
};

export default formatInstallmentsDisplayRef;
