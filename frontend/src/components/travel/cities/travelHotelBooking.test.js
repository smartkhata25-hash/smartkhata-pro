import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createEmptyBookingItem, prepareBookingForForm } from '../bookings/travelBookingConfig';
import {
  calculateLocalTotals,
  deriveVendorCostGroups,
} from '../bookings/form/bookingFormUtils';
import TravelCityAutocomplete from './TravelCityAutocomplete';
import {
  applyHotelCityChange,
  applyHotelSelection,
  appendHotelBookingItem,
  buildCitySuggestions,
  filterHotelsByCity,
  getNormalizedCityKey,
} from './travelCityUtils';

const hotelA = { _id: 'hotel-a', name: 'Hotel A', city: 'Makkah', isActive: true };
const hotelB = { _id: 'hotel-b', name: 'Hotel B', city: 'Madinah', isActive: true };

const hotelItem = ({ city, vendorId, cost, selling, confirmationNumber = '' }) => ({
  ...createEmptyBookingItem('hotel'),
  itemType: 'hotel',
  vendorId,
  costCurrency: 'PKR',
  sellingCurrency: 'PKR',
  hotelDetails: {
    ...createEmptyBookingItem('hotel').hotelDetails,
    city,
    nights: 1,
    chargePerRoom: true,
    confirmationNumber,
    roomPricing: [{ roomType: 'double', quantity: 1, costPrice: cost, sellingPrice: selling }],
  },
});

test('multiple Hotel items are blank independent booking items under one Invoice customer', () => {
  const first = hotelItem({ city: 'Makkah', vendorId: 'vendor-a', cost: 10000, selling: 15000 });
  let form = {
    customerId: 'customer-1',
    bookingItems: [first],
  };
  form = appendHotelBookingItem(form, createEmptyBookingItem);
  form = appendHotelBookingItem(form, createEmptyBookingItem);

  expect(form.bookingItems).toHaveLength(3);
  expect(form.bookingItems.every((item) => item.itemType === 'hotel')).toBe(true);
  expect(form.bookingItems[0].hotelDetails.city).toBe('Makkah');
  expect(form.bookingItems[1].hotelDetails).toEqual(expect.objectContaining({ city: '', hotelId: '' }));
  form.bookingItems[1].hotelDetails.city = 'Madinah';
  expect(form.bookingItems[2].hotelDetails.city).toBe('');
  expect(form.customerId).toBe('customer-1');
});

test('City normalization, legacy Hotel cities, filtering, auto-fill, and mismatch clearing work', () => {
  expect(getNormalizedCityKey('  MAKkah  ')).toBe('makkah');
  const suggestions = buildCitySuggestions(
    [{ _id: 'city-1', name: 'Makkah' }],
    [hotelA, hotelB, { _id: 'legacy', city: 'Dubai', isActive: true }]
  );
  expect(suggestions.map((city) => city.name)).toEqual(['Dubai', 'Madinah', 'Makkah']);
  expect(filterHotelsByCity([hotelA, hotelB], ' makkah ')).toEqual([hotelA]);
  expect(filterHotelsByCity([hotelA, hotelB], '')).toEqual([hotelA, hotelB]);
  expect(applyHotelSelection({ city: '' }, hotelB)).toEqual(expect.objectContaining({ city: 'Madinah', hotelId: 'hotel-b' }));
  expect(applyHotelCityChange({ city: 'Makkah', hotelId: 'hotel-a', nights: 5 }, 'Madinah', [hotelA, hotelB])).toEqual(
    expect.objectContaining({ city: 'Madinah', hotelId: '', nights: 5 })
  );
});

test('City Quick Add handles Enter once and selects the persisted response', async () => {
  let resolveCreate;
  const onCreate = jest.fn(() => new Promise((resolve) => { resolveCreate = resolve; }));
  const onChange = jest.fn();
  render(<TravelCityAutocomplete value="" onChange={onChange} cities={[]} hotels={[]} onCreate={onCreate} />);
  const input = screen.getByPlaceholderText('City');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Taif' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onCreate).toHaveBeenCalledWith('Taif');
  resolveCreate({ _id: 'city-taif', name: 'Taif' });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('Taif', expect.objectContaining({ _id: 'city-taif' })));
});

test('different Hotel vendors remain separate while same vendors aggregate and totals stay additive', () => {
  const items = [
    hotelItem({ city: 'Makkah', vendorId: 'vendor-a', cost: 10000, selling: 15000 }),
    hotelItem({ city: 'Madinah', vendorId: 'vendor-b', cost: 20000, selling: 25000 }),
  ];
  const different = deriveVendorCostGroups({ bookingItems: items });
  expect(different.groups.map((group) => [group.vendorId, group.totalCostBase])).toEqual([
    ['vendor-a', 10000],
    ['vendor-b', 20000],
  ]);
  const totals = calculateLocalTotals({ bookingItems: items, discountAmount: 0, receivedAmount: 0, vendorPayments: [] });
  expect(totals).toEqual(expect.objectContaining({ selling: 40000, cost: 30000, profit: 10000 }));

  const sameVendor = deriveVendorCostGroups({
    bookingItems: items.map((item) => ({ ...item, vendorId: 'vendor-a' })),
  });
  expect(sameVendor.groups).toHaveLength(1);
  expect(sameVendor.groups[0].totalCostBase).toBe(30000);
});

test('Edit hydration preserves independent Hotel city, vendor, pricing and optional confirmation', () => {
  const sourceItems = [
    hotelItem({ city: 'Makkah', vendorId: 'vendor-a', cost: 10000, selling: 15000, confirmationNumber: 'A1' }),
    hotelItem({ city: 'Madinah', vendorId: 'vendor-b', cost: 20000, selling: 25000 }),
    hotelItem({ city: 'Jeddah', vendorId: 'vendor-c', cost: 3000, selling: 5000 }),
  ];
  const hydrated = prepareBookingForForm({ customerId: 'customer-1', bookingItems: sourceItems });
  expect(hydrated.bookingItems.map((item) => item.hotelDetails.city)).toEqual(['Makkah', 'Madinah', 'Jeddah']);
  expect(hydrated.bookingItems.map((item) => item.vendorId)).toEqual(['vendor-a', 'vendor-b', 'vendor-c']);
  expect(hydrated.bookingItems[0].hotelDetails.confirmationNumber).toBe('A1');
  expect(hydrated.bookingItems[1].hotelDetails.confirmationNumber).toBe('');
});
