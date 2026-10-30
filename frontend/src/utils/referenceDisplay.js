const SIMPLE_DOCUMENT_PREFIXES = new Set([
  'ADJ', 'COM', 'CP', 'EXP', 'FT', 'INV', 'KC', 'PAY', 'PC', 'PK', 'PYO',
  'RCP', 'RCV', 'RR', 'RRW', 'SB', 'SC', 'SI', 'SR', 'SRN', 'SUP', 'TH',
  'WP', 'WS', 'YT',
]);

const YEAR_SEQUENCE_PREFIXES = new Set(['TR', 'TRP', 'TRR', 'TVP', 'TVR']);
const compactDigits = (digits) => String(digits).replace(/^0+(?=\d)/, '');

// Only Smart Khata-generated reference families are formatted. Unknown values
// remain unchanged so account, phone, date, and user-entered values stay intact.
export const formatDocumentReference = (value) => {
  if (value === null || value === undefined) return '';
  const reference = String(value).trim();
  if (!reference) return '';

  const reversal = reference.match(/^REV-(.+)$/i);
  if (reversal) {
    const formatted = formatDocumentReference(reversal[1]);
    return formatted === reversal[1] ? reference : `REV-${formatted}`;
  }

  const opening = reference.match(/^OPEN-(SUP-)?(\d+)(.*)$/i);
  if (opening) return `OPEN-${opening[1] || ''}${compactDigits(opening[2])}${opening[3]}`;

  const yearSequence = reference.match(/^([A-Z]+)-(\d{4})-(\d+)(.*)$/i);
  if (yearSequence && YEAR_SEQUENCE_PREFIXES.has(yearSequence[1].toUpperCase())) {
    return `${yearSequence[1]}-${yearSequence[2]}-${compactDigits(yearSequence[3])}${yearSequence[4]}`;
  }

  const simple = reference.match(/^([A-Z]+)-(\d+)(.*)$/i);
  if (simple && SIMPLE_DOCUMENT_PREFIXES.has(simple[1].toUpperCase())) {
    return `${simple[1]}-${compactDigits(simple[2])}${simple[3]}`;
  }
  return reference;
};

const REFERENCE_TOKEN = /\b(?:REV-)?[A-Z]+(?:-\d{4})?-\d+(?:-[A-Z0-9]+)*\b/gi;

export const formatReferenceText = (value) => value === null || value === undefined
  ? ''
  : String(value).replace(REFERENCE_TOKEN, (candidate) => formatDocumentReference(candidate));

