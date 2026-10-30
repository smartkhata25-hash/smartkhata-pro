const SIMPLE_DOCUMENT_PREFIXES = new Set([
  "ADJ", "COM", "CP", "EXP", "FT", "INV", "KC", "PAY", "PC", "PK", "PYO",
  "RCP", "RCV", "RR", "RRW", "SB", "SC", "SI", "SR", "SRN", "SUP", "TH",
  "WP", "WS", "YT",
]);
const YEAR_SEQUENCE_PREFIXES = new Set(["TR", "TRP", "TRR", "TVP", "TVR"]);
const compactDigits = (digits) => String(digits).replace(/^0+(?=\d)/, "");

const formatDocumentReference = (value) => {
  if (value === null || value === undefined) return "";
  const reference = String(value).trim();
  if (!reference) return "";
  const reversal = reference.match(/^REV-(.+)$/i);
  if (reversal) {
    const formatted = formatDocumentReference(reversal[1]);
    return formatted === reversal[1] ? reference : `REV-${formatted}`;
  }
  const opening = reference.match(/^OPEN-(SUP-)?(\d+)(.*)$/i);
  if (opening) return `OPEN-${opening[1] || ""}${compactDigits(opening[2])}${opening[3]}`;
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
const formatReferenceText = (value) => value === null || value === undefined
  ? ""
  : String(value).replace(REFERENCE_TOKEN, (candidate) => formatDocumentReference(candidate));

const formatReferencesForDisplay = (value) => {
  if (typeof value === "string") return formatReferenceText(value);
  if (Array.isArray(value)) return value.map(formatReferencesForDisplay);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, formatReferencesForDisplay(entry)]),
    );
  }
  return value;
};

module.exports = { formatDocumentReference, formatReferenceText, formatReferencesForDisplay };
