import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import en from '../../../../i18n/en.json';
import MatchingTravelersModal from './MatchingTravelersModal';
import {
  canUseCustomerAsTraveler,
  getSelectedCustomerTravelerId,
  itemContainsTraveler,
  normalizeTravelerName,
  resolveCustomerTraveler,
} from './customerTravelerUtils';

const customer = { _id: 'customer-1', name: '  Muhammad   Arshad ' };
const linkedTraveler = {
  _id: 'traveler-linked',
  fullName: 'Muhammad Arshad',
  customerId: { _id: customer._id },
  isActive: true,
};

test('Travel Booking displays Travelers instead of Item Travelers', () => {
  expect(en['travel.booking.fields.itemTravelers']).toBe('Travelers');
  expect(en['travel.booking.fields.itemTravelers']).not.toContain('Item');
});

test('normalizes exact names without allowing partial matches', () => {
  expect(normalizeTravelerName(customer.name)).toBe('muhammad arshad');
  expect(normalizeTravelerName('muhammad arshad')).toBe(normalizeTravelerName(customer.name));
  expect(normalizeTravelerName('Arshad')).not.toBe(normalizeTravelerName(customer.name));
});

test('reuses an explicitly linked Traveler without creating another record', async () => {
  const fetchTravelers = jest.fn().mockResolvedValueOnce([linkedTraveler]);
  const createTraveler = jest.fn();
  const result = await resolveCustomerTraveler({
    customer,
    fetchTravelers,
    createTraveler,
    canCreate: true,
  });

  expect(result).toMatchObject({ status: 'resolved', traveler: linkedTraveler, source: 'customer-link' });
  expect(fetchTravelers).toHaveBeenCalledWith(
    expect.objectContaining({ customerId: customer._id, status: 'active' }),
    { forceRefresh: true }
  );
  expect(createTraveler).not.toHaveBeenCalled();
});

test('reuses one normalized exact-name match', async () => {
  const exactTraveler = { _id: 'traveler-name', fullName: 'muhammad arshad', isActive: true };
  const fetchTravelers = jest.fn()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([exactTraveler, { _id: 'partial', fullName: 'Arshad' }]);
  const createTraveler = jest.fn();
  const result = await resolveCustomerTraveler({ customer, fetchTravelers, createTraveler, canCreate: true });

  expect(result).toMatchObject({ status: 'resolved', traveler: exactTraveler, source: 'exact-name' });
  expect(createTraveler).not.toHaveBeenCalled();
});

test('creates one linked Traveler only when fresh lookups find no match', async () => {
  const created = { _id: 'traveler-new', fullName: 'Muhammad Arshad', customerId: customer._id };
  const fetchTravelers = jest.fn().mockResolvedValue([]);
  const createTraveler = jest.fn().mockResolvedValue(created);
  const result = await resolveCustomerTraveler({ customer, fetchTravelers, createTraveler, canCreate: true });

  expect(fetchTravelers).toHaveBeenCalledTimes(2);
  expect(createTraveler).toHaveBeenCalledTimes(1);
  expect(createTraveler).toHaveBeenCalledWith({
    fullName: 'Muhammad Arshad',
    customerId: customer._id,
  });
  expect(result).toMatchObject({ status: 'resolved', traveler: created, source: 'created' });
});

test('multiple exact-name matches require selection and never create a third Traveler', async () => {
  const matches = [
    { _id: 'traveler-a', fullName: 'Muhammad Arshad', passportNumber: 'A1' },
    { _id: 'traveler-b', fullName: 'muhammad  arshad', passportNumber: 'B2' },
  ];
  const fetchTravelers = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(matches);
  const createTraveler = jest.fn();
  const result = await resolveCustomerTraveler({ customer, fetchTravelers, createTraveler, canCreate: true });

  expect(result).toMatchObject({ status: 'choose', matches });
  expect(createTraveler).not.toHaveBeenCalled();
});

test('permission denial never calls create and selected occurrence checks are item-specific', async () => {
  const createTraveler = jest.fn();
  const result = await resolveCustomerTraveler({
    customer,
    fetchTravelers: jest.fn().mockResolvedValue([]),
    createTraveler,
    canCreate: false,
  });

  expect(result.status).toBe('forbidden');
  expect(createTraveler).not.toHaveBeenCalled();
  expect(itemContainsTraveler({ travelerIds: ['traveler-a'] }, 'traveler-a')).toBe(true);
  expect(itemContainsTraveler({ travelerIds: [] }, 'traveler-a')).toBe(false);
});

test('checkbox state is item-specific, follows a changed Customer, and excludes Travel Parties', () => {
  const itemOne = { travelerIds: [] };
  const itemTwo = { travelerIds: [linkedTraveler._id] };

  expect(canUseCustomerAsTraveler({ customerType: 'customer', customerId: customer._id })).toBe(true);
  expect(canUseCustomerAsTraveler({ customerType: 'party', customerPartyId: 'party-1' })).toBe(false);
  expect(canUseCustomerAsTraveler({ customerType: 'customer', customerId: '' })).toBe(false);
  expect(getSelectedCustomerTravelerId({ item: itemOne, customerId: customer._id, travelers: [linkedTraveler] })).toBe('');
  expect(getSelectedCustomerTravelerId({ item: itemTwo, customerId: customer._id, travelers: [linkedTraveler] })).toBe(linkedTraveler._id);
  expect(getSelectedCustomerTravelerId({ item: itemTwo, customerId: 'customer-2', travelers: [linkedTraveler] })).toBe('');
  expect(itemTwo.travelerIds).toEqual([linkedTraveler._id]);
});

test('matching modal selects the chosen record while Cancel makes no selection', () => {
  const onSelect = jest.fn();
  const onCancel = jest.fn();
  const travelers = [
    { _id: 'traveler-a', fullName: 'Muhammad Arshad', passportNumber: 'A1' },
    { _id: 'traveler-b', fullName: 'Muhammad Arshad', passportNumber: 'B2' },
  ];
  render(
    <MatchingTravelersModal
      open
      customerName="Muhammad Arshad"
      travelers={travelers}
      onSelect={onSelect}
      onCancel={onCancel}
    />
  );

  expect(screen.getByText('Matching Travelers Found')).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Passport No: B2/).closest('button'));
  expect(onSelect).toHaveBeenCalledWith(travelers[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
