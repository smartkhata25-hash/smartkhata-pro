import {
  createTravelBookingFormFingerprint,
  getTravelDocumentSaveChoices,
  getTravelInvoicePdfFileName,
} from './travelBookingDocumentActions';

test('fingerprint detects invoice edits but ignores server accounting metadata', () => {
  const source = {
    customerId: 'customer-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accountingStatus: 'posted',
    bookingItems: [{ title: 'Ticket', sellingPrice: 100 }],
  };

  expect(createTravelBookingFormFingerprint(source)).toBe(
    createTravelBookingFormFingerprint({
      ...source,
      updatedAt: '2026-02-01T00:00:00.000Z',
      accountingStatus: 'reposted',
    })
  );
  expect(createTravelBookingFormFingerprint(source)).not.toBe(
    createTravelBookingFormFingerprint({
      ...source,
      bookingItems: [{ title: 'Ticket', sellingPrice: 125 }],
    })
  );
});

test('new and ordinary edited invoices retain all explicit save choices', () => {
  expect(getTravelDocumentSaveChoices().map((choice) => choice.status)).toEqual([
    'draft',
    'quotation',
    'confirmed',
  ]);
  expect(
    getTravelDocumentSaveChoices({ isEditMode: true }).map((choice) => choice.status)
  ).toEqual(['draft', 'quotation', 'confirmed']);
});

test('posted edits expose one explicit repost choice using the saved status', () => {
  expect(
    getTravelDocumentSaveChoices({
      isEditMode: true,
      postedInvoiceEditing: true,
      currentStatus: 'completed',
    })
  ).toEqual([{ status: 'completed', label: 'Update & Repost', requiresRepost: true }]);
});

test('PDF filename uses the official invoice number', () => {
  expect(getTravelInvoicePdfFileName({ _id: 'id-1', invoiceNumber: 'TRV-100' })).toBe(
    'TravelInvoice-TRV-100.pdf'
  );
});
