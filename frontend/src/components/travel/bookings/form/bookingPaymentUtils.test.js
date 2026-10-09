import { prepareBookingForForm } from '../travelBookingConfig';
import {
  applyCustomerReceiptAmountChange,
  normalizeCustomerReceiptForPayload,
} from './bookingPaymentUtils';

describe('Travel booking customer receipt edit normalization', () => {
  test('a zero-paid credit invoice becomes a cash receipt when edited to a positive amount', () => {
    const hydrated = prepareBookingForForm({
      receivedAmount: 0,
      paymentType: 'credit',
      bookingItems: [],
    });
    const edited = applyCustomerReceiptAmountChange(hydrated, 5000);
    const payload = normalizeCustomerReceiptForPayload({
      ...edited,
      accountId: 'cash-account',
    });

    expect(hydrated.paymentType).toBe('cash');
    expect(edited.paymentType).toBe('cash');
    expect(payload.paymentType).toBe('cash');
    expect(payload.paymentType).not.toBe('credit');
  });

  test('an explicit online choice is preserved after received amount becomes positive', () => {
    const changed = applyCustomerReceiptAmountChange(
      { receivedAmount: 0, paymentType: 'credit' },
      5000
    );
    const payload = normalizeCustomerReceiptForPayload({
      ...changed,
      paymentType: 'online',
      accountId: 'bank-account',
    });

    expect(changed.paymentType).toBe('cash');
    expect(payload.paymentType).toBe('online');
  });

  test('zero received amount keeps credit-sale payload semantics', () => {
    const payload = normalizeCustomerReceiptForPayload({
      receivedAmount: 0,
      paymentType: 'credit',
      accountId: 'old-account',
    });

    expect(payload.paymentType).toBeUndefined();
    expect(payload.accountId).toBeUndefined();
  });

  test('existing vendor payment edit normalization remains unchanged', () => {
    const hydrated = prepareBookingForForm({
      bookingItems: [],
      vendorPayments: [{
        vendorId: 'vendor-1',
        paidAmount: 0,
        paymentType: 'credit',
      }],
    });

    expect(hydrated.vendorPayments[0].paymentType).toBe('cash');
  });

  test('receipt normalization preserves travelers and their assignments', () => {
    const state = {
      travelers: ['traveler-1', 'traveler-2'],
      bookingItems: [{ travelerIds: ['traveler-1'] }],
      receivedAmount: 0,
      paymentType: 'credit',
    };
    const payload = normalizeCustomerReceiptForPayload(
      applyCustomerReceiptAmountChange(state, 5000)
    );

    expect(payload.travelers).toEqual(state.travelers);
    expect(payload.bookingItems).toEqual(state.bookingItems);
    expect(payload.paymentType).toBe('cash');
  });
});
