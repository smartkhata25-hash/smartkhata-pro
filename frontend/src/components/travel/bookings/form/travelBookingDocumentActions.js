export const TRAVEL_DOCUMENT_ACTIONS = Object.freeze({
  PRINT: 'print',
  PDF: 'pdf',
});

const normalizeFingerprintValue = (value) => {
  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      name: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified,
    };
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFingerprintValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (!['updatedAt', 'accountingStatus'].includes(key)) {
          result[key] = normalizeFingerprintValue(value[key]);
        }
        return result;
      }, {});
  }

  return value;
};

export const createTravelBookingFormFingerprint = (formState = {}) =>
  JSON.stringify(normalizeFingerprintValue(formState));

export const getTravelDocumentSaveChoices = ({
  isEditMode = false,
  postedInvoiceEditing = false,
  currentStatus = 'draft',
} = {}) => {
  if (isEditMode && postedInvoiceEditing) {
    return [
      {
        status: ['confirmed', 'processing', 'completed'].includes(currentStatus)
          ? currentStatus
          : 'confirmed',
        label: 'Update & Repost',
        requiresRepost: true,
      },
    ];
  }

  return [
    { status: 'draft', label: 'Save Draft' },
    { status: 'quotation', label: 'Save Quotation' },
    { status: 'confirmed', label: 'Confirm Invoice' },
  ];
};

export const getTravelInvoicePdfFileName = (booking = {}) =>
  `TravelInvoice-${booking.invoiceNumber || booking.bookingNumber || booking._id || 'Invoice'}.pdf`;
