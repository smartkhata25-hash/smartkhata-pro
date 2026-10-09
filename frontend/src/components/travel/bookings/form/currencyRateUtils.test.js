import {
  calculateLocalTotals,
  captureCurrencyRateSnapshot,
  deriveVendorCostGroups,
  findMissingConversionRate,
  getInvoiceCurrencyRate,
  getMissingInvoiceCurrencyRateSides,
  normalizeDualCurrencyRates,
  resolveBookingCurrencyRateSnapshot,
  updateInvoiceCurrencyRate,
} from './bookingFormUtils';
import { getCalculatorRatesFromSettings } from '../../../../utils/umrahCalculator';

const settings = {
  baseCurrency: 'PKR',
  rates: [
    { currency: 'SAR', costRateToBase: 74, saleRateToBase: 76 },
    { currency: 'USD', costRateToBase: 278, saleRateToBase: 281 },
    { currency: 'AED', costRateToBase: 75, saleRateToBase: 77 },
  ],
};

const hotelItem = {
  itemType: 'hotel',
  vendorId: 'vendor-a',
  costCurrency: 'SAR',
  sellingCurrency: 'SAR',
  costPrice: 1200,
  sellingPrice: 2400,
  hotelDetails: { roomPricing: [] },
  paxPricing: [],
};

test('legacy one-rate settings normalize to equal dual rates', () => {
  expect(normalizeDualCurrencyRates({
    baseCurrency: 'PKR',
    rates: [{ currency: 'SAR', rateToBase: 75 }],
  })).toEqual([{ currency: 'SAR', costRateToBase: 75, saleRateToBase: 75 }]);
});

test('new invoice captures an independent settings snapshot once', () => {
  const captured = captureCurrencyRateSnapshot(settings);
  const changedSettings = { ...settings, rates: [{ currency: 'SAR', costRateToBase: 80, saleRateToBase: 82 }] };
  expect(getInvoiceCurrencyRate(captured, 'SAR', 'cost')).toBe(74);
  expect(getInvoiceCurrencyRate(captured, 'SAR', 'sale')).toBe(76);
  expect(captureCurrencyRateSnapshot(changedSettings)[0].costRateToBase).toBe(80);
  expect(captured[0].costRateToBase).toBe(74);
});

test('Cost and Sale overrides update only their selected side', () => {
  const captured = captureCurrencyRateSnapshot(settings);
  const costOverride = updateInvoiceCurrencyRate(captured, 'SAR', 'cost', 73);
  expect(getInvoiceCurrencyRate(costOverride, 'SAR', 'cost')).toBe(73);
  expect(getInvoiceCurrencyRate(costOverride, 'SAR', 'sale')).toBe(76);
  const saleOverride = updateInvoiceCurrencyRate(costOverride, 'SAR', 'sale', 78);
  expect(getInvoiceCurrencyRate(saleOverride, 'SAR', 'cost')).toBe(73);
  expect(getInvoiceCurrencyRate(saleOverride, 'SAR', 'sale')).toBe(78);
});

test('invoice summary uses Sale rate for sale and Cost rate for cost', () => {
  const form = {
    bookingItems: [hotelItem],
    currencyRateSnapshot: captureCurrencyRateSnapshot(settings),
    vendorPayments: [],
  };
  const totals = calculateLocalTotals(form, settings);
  expect(totals.cost).toBe(88800);
  expect(totals.selling).toBe(182400);
  expect(totals.profit).toBe(93600);
});

test('vendor cost groups always use the invoice Cost rate', () => {
  const form = {
    bookingItems: [hotelItem],
    currencyRateSnapshot: captureCurrencyRateSnapshot(settings),
  };
  expect(deriveVendorCostGroups(form, settings).groups[0].totalCostBase).toBe(88800);
});

test('edit hydration keeps saved snapshot instead of newer settings', () => {
  const booking = {
    currencyRateSnapshot: [{ currency: 'SAR', costRateToBase: 74, saleRateToBase: 76 }],
    bookingItems: [hotelItem],
  };
  const newer = {
    ...settings,
    rates: [{ currency: 'SAR', costRateToBase: 80, saleRateToBase: 82 }],
  };
  const snapshot = resolveBookingCurrencyRateSnapshot(booking, newer);
  expect(getInvoiceCurrencyRate(snapshot, 'SAR', 'cost')).toBe(74);
  expect(getInvoiceCurrencyRate(snapshot, 'SAR', 'sale')).toBe(76);
});

test('legacy booking derives separate historical rates before settings fallback', () => {
  const snapshot = resolveBookingCurrencyRateSnapshot({
    bookingItems: [{
      ...hotelItem,
      costPrice: 1000,
      sellingPrice: 1500,
      estimatedCostBase: 74000,
      estimatedSellingBase: 114000,
    }],
  }, {
    ...settings,
    rates: [{ currency: 'SAR', costRateToBase: 80, saleRateToBase: 82 }],
  });
  expect(getInvoiceCurrencyRate(snapshot, 'SAR', 'cost')).toBe(74);
  expect(getInvoiceCurrencyRate(snapshot, 'SAR', 'sale')).toBe(76);
});

test('missing rate protection is side-aware and ignores zero amounts', () => {
  const missingSale = [{ currency: 'SAR', costRateToBase: 74, saleRateToBase: 0 }];
  expect(findMissingConversionRate({ bookingItems: [hotelItem], currencyRateSnapshot: missingSale }, settings))
    .toEqual({ currency: 'SAR', side: 'sale' });
  expect(findMissingConversionRate({
    bookingItems: [{ ...hotelItem, sellingPrice: 0 }],
    currencyRateSnapshot: missingSale,
  }, settings)).toBeNull();
});

test('missing invoice rate detection is snapshot-first and side-aware', () => {
  expect(getMissingInvoiceCurrencyRateSides(
    [{ currency: 'SAR', costRateToBase: 74, saleRateToBase: 76 }],
    'SAR',
    'PKR'
  )).toEqual([]);
  expect(getMissingInvoiceCurrencyRateSides(
    [{ currency: 'SAR', costRateToBase: 0, saleRateToBase: 76 }],
    'SAR',
    'PKR'
  )).toEqual(['cost']);
  expect(getMissingInvoiceCurrencyRateSides(
    [{ currency: 'SAR', costRateToBase: 74, saleRateToBase: 0 }],
    'SAR',
    'PKR'
  )).toEqual(['sale']);
  expect(getMissingInvoiceCurrencyRateSides([], 'SAR', 'PKR')).toEqual(['cost', 'sale']);
  expect(getMissingInvoiceCurrencyRateSides([], 'PKR', 'PKR')).toEqual([]);
});

test('Umrah cost calculator deliberately uses Cost defaults, not Sale defaults', () => {
  expect(getCalculatorRatesFromSettings(settings)).toMatchObject({
    SAR_to_PKR: 74,
    USD_to_PKR: 278,
  });
});
