import { prepareBookingForForm } from '../travelBookingConfig';
import {
  applyCustomerReceiptAmountChange,
  buildInvoiceExtraPaymentWarnings,
  calculateInvoicePaymentSummary,
  normalizeCustomerReceiptForPayload,
} from './bookingPaymentUtils';
import { calculateLocalTotals } from './bookingFormUtils';

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

describe('Travel invoice-only payment summary', () => {
  const summaryForReceipt = (received) => calculateInvoicePaymentSummary({
    localTotals: { net: 50000, received, cost: 12000, profit: 38000 },
  });

  test.each([
    [0, 50000, 0],
    [20000, 30000, 0],
    [50000, 0, 0],
    [70000, 0, 20000],
  ])('invoice total 50,000 and receipt %s gives due %s and extra %s', (received, due, extra) => {
    const summary = summaryForReceipt(received);
    expect(summary.customerDue).toBe(due);
    expect(summary.extraCustomerPayment).toBe(extra);
  });

  test('discounted net sale is the single invoice total', () => {
    const localTotals = calculateLocalTotals({
      bookingItems: [{
        itemType: 'service',
        sellingCurrency: 'PKR',
        costCurrency: 'PKR',
        quantityPricing: { quantity: 1, sellingPrice: 50000, costPrice: 10000 },
      }],
      discountAmount: 2000,
      receivedAmount: 0,
      vendorPayments: [],
    });
    const summary = calculateInvoicePaymentSummary({ localTotals });
    expect(localTotals.selling).toBe(50000);
    expect(summary.invoiceTotal).toBe(48000);
    expect(summary.customerDue).toBe(48000);
  });

  test('existing selling-minus-cost loss remains visible as negative estimated profit', () => {
    const summary = calculateInvoicePaymentSummary({
      localTotals: { net: 8000, received: 0, cost: 10000, profit: -2000 },
    });
    expect(summary.estimatedProfit).toBe(-2000);
  });

  test('historical customer and vendor balances cannot affect invoice-specific due amounts', () => {
    const summary = calculateInvoicePaymentSummary({
      localTotals: {
        net: 10000,
        received: 0,
        cost: 5000,
        profit: 5000,
        previousCustomerBalance: -8000,
        customerBalance: 2000,
      },
      vendorGroups: [{
        key: 'vendor:nct',
        vendorType: 'vendor',
        vendorId: 'nct',
        totalCostBase: 5000,
        previousBalance: -4000,
      }],
      vendorPayments: [],
    });
    expect(summary.customerDue).toBe(10000);
    expect(summary.extraCustomerPayment).toBe(0);
    expect(summary.vendorDue).toBe(5000);
    expect(summary.extraVendorPayment).toBe(0);
  });

  test('multiple vendor and vendor-party payments remain independent', () => {
    const summary = calculateInvoicePaymentSummary({
      localTotals: { net: 20000, received: 0, cost: 13000, profit: 7000 },
      vendorGroups: [
        { key: 'vendor:a', vendorType: 'vendor', vendorId: 'a', totalCostBase: 5000 },
        { key: 'party:b', vendorType: 'party', vendorPartyId: 'b', totalCostBase: 8000 },
      ],
      vendorPayments: [
        { vendorType: 'vendor', vendorId: 'a', paidAmount: 7000 },
        { vendorType: 'party', vendorPartyId: 'b', paidAmount: 3000 },
      ],
    });
    expect(summary.vendorPaidNow).toBe(10000);
    expect(summary.vendorDue).toBe(5000);
    expect(summary.extraVendorPayment).toBe(2000);
    expect(summary.vendorBalances[0]).toEqual(expect.objectContaining({ invoiceVendorDue: 0, extraVendorPayment: 2000 }));
    expect(summary.vendorBalances[1]).toEqual(expect.objectContaining({ invoiceVendorDue: 5000, extraVendorPayment: 0 }));
  });

  test('warnings open only for current-invoice customer or vendor excess payments', () => {
    const ordinary = calculateInvoicePaymentSummary({
      localTotals: { net: 50000, received: 50000 },
      vendorGroups: [{ key: 'vendor:a', vendorId: 'a', totalCostBase: 5000 }],
      vendorPayments: [{ vendorId: 'a', paidAmount: 5000 }],
    });
    expect(buildInvoiceExtraPaymentWarnings(ordinary)).toEqual([]);

    const excess = calculateInvoicePaymentSummary({
      localTotals: { net: 50000, received: 70000 },
      vendorGroups: [{ key: 'vendor:a', vendorId: 'a', totalCostBase: 5000 }],
      vendorPayments: [{ vendorId: 'a', paidAmount: 7000 }],
    });
    expect(buildInvoiceExtraPaymentWarnings(excess, {
      customerName: 'Customer One',
      vendorNames: { 'vendor:a': 'Vendor A' },
    })).toEqual([
      expect.objectContaining({ key: 'customer', due: 0, extraPayment: 20000 }),
      expect.objectContaining({ key: 'vendor:a', due: 0, extraPayment: 2000 }),
    ]);
  });
});
