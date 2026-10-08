import { customerFields, buildCustomerOpeningPayload } from '../customers/travelCustomerFormConfig';
import { travelerFields, cleanTravelerPayload, prepareTravelerForm } from '../travelers/travelTravelerFormConfig';
import { vendorFields, buildVendorOpeningPayload } from '../vendors/travelVendorConfig';
import { hotelFields } from '../hotels/travelHotelConfig';

const names = (fields) => fields.map((field) => field.name);

describe('shared Travel master forms', () => {
  test('Customer full form and opening conversion remain complete', () => {
    expect(names(customerFields)).toEqual(expect.arrayContaining(['name', 'phone', 'moduleScope', 'openingBalanceAmount', 'openingBalanceDirection', 'email', 'address']));
    expect(buildCustomerOpeningPayload({ openingBalanceAmount: '25', openingBalanceDirection: 'credit' }).openingBalance).toBe(-25);
  });

  test('Traveler full form and date normalization remain complete', () => {
    expect(names(travelerFields)).toEqual(expect.arrayContaining(['fullName', 'fatherOrHusbandName', 'dateOfBirth', 'cnic', 'passportNumber', 'passportIssueDate', 'passportExpiryDate', 'email', 'notes', 'isActive']));
    expect(prepareTravelerForm({ dateOfBirth: '2000-01-02T00:00:00.000Z' }).dateOfBirth).toBe('2000-01-02');
    expect(cleanTravelerPayload({ dateOfBirth: '' }).dateOfBirth).toBeNull();
  });

  test('Vendor and Hotel full forms retain accounting and relation fields', () => {
    expect(names(vendorFields)).toEqual(expect.arrayContaining(['name', 'travelVendorType', 'moduleScope', 'openingBalanceAmount', 'openingBalanceDirection', 'preferredCurrency', 'notes']));
    expect(buildVendorOpeningPayload({ openingBalanceAmount: '40', openingBalanceDirection: 'advance' }).openingBalance).toBe(-40);
    expect(names(hotelFields)).toEqual(expect.arrayContaining(['name', 'city', 'country', 'starRating', 'distanceText', 'defaultRate', 'currency', 'contact', 'address', 'notes', 'isActive']));
  });
});
