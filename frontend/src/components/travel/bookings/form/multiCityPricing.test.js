import {
  calculateBookingItemSourceTotals,
  deriveVendorCostGroups,
  sanitizeDraftState,
} from './bookingFormUtils';
import {
  appendMultiCitySector,
  createEmptyMultiCitySector,
  insertMultiCityPricingRow,
  prepareBookingForForm,
  removeMultiCityPricingRowAt,
  removeMultiCitySectorAt,
} from '../travelBookingConfig';

const vendorA = '64f000000000000000000001';
const vendorB = '64f000000000000000000002';

const multiCityItem = {
  itemType: 'air_ticket',
  title: 'Multi-city ticket',
  costCurrency: 'PKR',
  sellingCurrency: 'PKR',
  paxPricing: [{ paxType: 'adult', count: 99, costPrice: 999, sellingPrice: 999 }],
  ticketDetails: {
    journeyType: 'multi_city',
    sectors: [
      {
        vendorId: vendorA,
        paxPricing: [
          { paxType: 'adult', count: 2, costPrice: 100, sellingPrice: 150 },
          { paxType: 'child', count: 1, costPrice: 60, sellingPrice: 90 },
        ],
      },
      {
        vendorId: vendorB,
        paxPricing: [{ paxType: 'adult', count: 1, costPrice: 200, sellingPrice: 260 }],
      },
      {
        vendorId: vendorA,
        paxPricing: [
          { paxType: 'infant', count: 1, costPrice: 25, sellingPrice: 40, vendorId: vendorB },
        ],
      },
    ],
  },
};

test('multi-city totals use sector pricing once and ignore legacy item pax pricing', () => {
  expect(calculateBookingItemSourceTotals(multiCityItem)).toEqual({
    cost: 485,
    selling: 690,
  });
});

test('multi-city vendor allocation uses row override then sector default', () => {
  const allocation = deriveVendorCostGroups(
    { bookingItems: [multiCityItem] },
    { baseCurrency: 'PKR', rates: [] }
  );
  const byVendor = Object.fromEntries(
    allocation.groups.map((group) => [group.vendorId, group.totalCostBase])
  );

  expect(byVendor).toEqual({ [vendorA]: 260, [vendorB]: 225 });
  expect(allocation.unassignedCostBase).toBe(0);

  const converted = deriveVendorCostGroups(
    {
      bookingItems: [{ ...multiCityItem, costCurrency: 'USD', sellingCurrency: 'USD' }],
    },
    {
      baseCurrency: 'PKR',
      rates: [{ currency: 'USD', costRateToBase: 280.123456, saleRateToBase: 281.654321 }],
    }
  );
  expect(converted.groups.reduce((sum, group) => sum + group.totalCostBase, 0)).toBe(
    135859.88
  );
});

test('draft cloning keeps sector rows independent', () => {
  const state = { bookingItems: [multiCityItem], vendorPayments: [] };
  const clone = sanitizeDraftState(state);

  clone.bookingItems[0].ticketDetails.sectors[0].paxPricing[0].count = 7;
  expect(state.bookingItems[0].ticketDetails.sectors[0].paxPricing[0].count).toBe(2);
});

test('three sectors and repeated passenger rows can be added and removed without data loss', () => {
  const first = {
    ...createEmptyMultiCitySector('LHE'),
    destination: 'DXB',
    destinationAirportId: 'airport-dxb',
    airline: 'PIA',
  };
  let sectors = appendMultiCitySector([first]);
  sectors[1] = { ...sectors[1], destination: 'JED', airline: 'Flydubai' };
  sectors = appendMultiCitySector(sectors);
  sectors[2] = { ...sectors[2], destination: 'LHE', airline: 'Saudia' };

  expect(sectors).toHaveLength(3);
  expect(sectors[1].origin).toBe('DXB');
  expect(sectors[1].originAirportId).toBe('airport-dxb');

  sectors = insertMultiCityPricingRow(sectors, 0, 'adult');
  sectors = insertMultiCityPricingRow(sectors, 0, 'child');
  sectors = insertMultiCityPricingRow(sectors, 0, 'infant');
  expect(sectors[0].paxPricing.map((row) => row.paxType)).toEqual([
    'adult',
    'adult',
    'child',
    'infant',
  ]);

  sectors = removeMultiCityPricingRowAt(sectors, 0, 1);
  expect(sectors[0].airline).toBe('PIA');
  expect(sectors[2].airline).toBe('Saudia');
  expect(sectors[0].paxPricing.map((row) => row.paxType)).toEqual([
    'adult',
    'child',
    'infant',
  ]);

  sectors = removeMultiCitySectorAt(sectors, 1);
  expect(sectors.map((sector) => sector.airline)).toEqual(['PIA', 'Saudia']);
});

test('saved multi-city sectors hydrate with stable form keys and populated ids', () => {
  const prepared = prepareBookingForForm({
    serviceType: 'air_ticket',
    bookingItems: [
      {
        itemType: 'air_ticket',
        ticketDetails: {
          journeyType: 'multi_city',
          sectors: [
            {
              _id: '64f000000000000000000010',
              airlineId: { _id: '64f000000000000000000020', name: 'Airline' },
              originAirportId: { _id: '64f000000000000000000030', code: 'LHE' },
              destinationAirportId: { _id: '64f000000000000000000040', code: 'DXB' },
              paxPricing: [{ _id: '64f000000000000000000050', paxType: 'adult', count: 1 }],
            },
          ],
        },
      },
    ],
  });
  const sector = prepared.bookingItems[0].ticketDetails.sectors[0];

  expect(sector.uiKey).toBe('64f000000000000000000010');
  expect(sector.airlineId).toBe('64f000000000000000000020');
  expect(sector.originAirportId).toBe('64f000000000000000000030');
  expect(sector.paxPricing[0].uiKey).toBe('64f000000000000000000050');
});

test('legacy multi-city records hydrate a non-destructive fallback sector', () => {
  const prepared = prepareBookingForForm({
    serviceType: 'air_ticket',
    bookingItems: [{
      itemType: 'air_ticket',
      vendorId: vendorA,
      paxPricing: [{ paxType: 'adult', count: 2, costPrice: 100, sellingPrice: 150 }],
      ticketDetails: {
        journeyType: 'multi_city',
        airline: 'PIA',
        origin: 'LHE',
        destination: 'DXB',
        departureDateTime: '2026-11-01T10:00:00.000Z',
      },
    }],
  });
  const sector = prepared.bookingItems[0].ticketDetails.sectors[0];

  expect(sector.legacyFallback).toBe(true);
  expect(sector.origin).toBe('LHE');
  expect(sector.destination).toBe('DXB');
  expect(sector.vendorId).toBe(vendorA);
  expect(sector.paxPricing[0]).toMatchObject({ count: 2, costPrice: 100, sellingPrice: 150 });
});
