import { createBookingCustomerQuick, createBookingTravelerQuick, createBookingVendorQuick, createUmrahHotelQuick } from './travelQuickAdd';
import { normalizeHotelForCalculator } from '../../../utils/umrahCalculator';

describe('Travel Quick Add payloads', () => {
  test('creates a Customer from the trimmed name and Travel defaults', async () => {
    const createCustomer = jest.fn().mockResolvedValue({ _id: 'c1', name: 'Ali' });
    await createBookingCustomerQuick({ query: '  Ali  ', createCustomer });
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(createCustomer).toHaveBeenCalledWith({ name: 'Ali', moduleScope: 'travel' });
  });

  test('resolves duplicate Customer responses to the existing record', async () => {
    const existing = { _id: 'c1', name: 'Ali' };
    const createCustomer = jest.fn().mockResolvedValue({ duplicate: true, customerId: 'c1' });
    const fetchCustomers = jest.fn().mockResolvedValue([existing]);
    await expect(createBookingCustomerQuick({ query: 'Ali', createCustomer, fetchCustomers })).resolves.toEqual(existing);
    expect(fetchCustomers).toHaveBeenCalledWith({}, { forceRefresh: true });
  });

  test('creates Traveler and Vendor with minimum safe payloads', async () => {
    const createTraveler = jest.fn().mockResolvedValue({ _id: 't1' });
    const createVendor = jest.fn().mockResolvedValue({ _id: 'v1' });
    await createBookingTravelerQuick({ query: ' Ahmed ', createTraveler });
    await createBookingVendorQuick({ query: ' ABC Travels ', createVendor });
    expect(createTraveler).toHaveBeenCalledWith({ fullName: 'Ahmed' });
    expect(createVendor).toHaveBeenCalledWith({ name: 'ABC Travels', moduleScope: 'travel' });
  });

  test.each(['Makkah', 'Madinah'])('creates a %s Hotel with contextual city', async (city) => {
    const createHotel = jest.fn().mockResolvedValue({ _id: city });
    await createUmrahHotelQuick({ query: ' Al Noor Hotel ', city, createHotel });
    expect(createHotel).toHaveBeenCalledWith({ name: 'Al Noor Hotel', city });
  });

  test('does not call APIs for blank queries', async () => {
    const createCustomer = jest.fn();
    await expect(createBookingCustomerQuick({ query: '   ', createCustomer })).resolves.toBeNull();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  test('selecting a created Hotel preserves nights and weekend nights', () => {
    const current = { hotelId: '', name: '', city: 'makkah', nights: 8, weekendNights: 2, weekendPrice: 140 };
    const next = normalizeHotelForCalculator(
      { _id: 'h1', name: 'Al Noor', defaultRate: 100, currency: 'SAR' },
      'makkah',
      undefined,
      current
    );
    expect(next).toEqual(expect.objectContaining({ hotelId: 'h1', nights: 8, weekendNights: 2, weekendPrice: 140 }));
  });
});
