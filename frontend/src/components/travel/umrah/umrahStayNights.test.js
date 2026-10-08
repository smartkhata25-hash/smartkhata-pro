import { prepareBookingForForm } from '../bookings/travelBookingConfig';
import { compactPayload } from '../bookings/form/bookingFormUtils';
import {
  buildUmrahStayNightsPrefill,
  parseOptionalStayNights,
  resolveUmrahCityNights,
} from './umrahStayNights';

describe('Umrah stay nights', () => {
  test('accepts optional whole non-negative nights only', () => {
    expect(parseOptionalStayNights('')).toBeNull();
    expect(parseOptionalStayNights(0)).toBe(0);
    expect(parseOptionalStayNights('3')).toBe(3);
    expect(parseOptionalStayNights(-1)).toBeNull();
    expect(parseOptionalStayNights(2.5)).toBeNull();
    expect(parseOptionalStayNights('abc')).toBeNull();
  });

  test('explicit values win over legacy component values', () => {
    const details = {
      makkahNights: 4,
      components: [{ componentType: 'hotel', hotelPricing: { city: 'makkah', nights: 3 } }],
    };
    expect(resolveUmrahCityNights(details, 'makkah')).toBe(4);
    expect(resolveUmrahCityNights({ ...details, makkahNights: null }, 'makkah')).toBeNull();
  });

  test('resolves legacy component and pricing-summary nights', () => {
    const details = {
      components: [{ componentType: 'hotel', hotelPricing: { city: 'Mecca', nights: 3 } }],
      pricingSummary: { hotels: { madinah: { totalNights: 2 } } },
    };
    expect(resolveUmrahCityNights(details, 'makkah')).toBe(3);
    expect(resolveUmrahCityNights(details, 'madinah')).toBe(2);
  });

  test('Calculator prefill adds city totals without changing other data', () => {
    const existing = { components: [{ componentType: 'hotel' }], pricingSummary: { pax: 2 }, plannerInfo: { durationDays: 7 } };
    const result = {
      ...existing,
      ...buildUmrahStayNightsPrefill({ totalNights: 3 }, { totalNights: 2 }),
    };
    expect(result).toEqual(expect.objectContaining({ makkahNights: 3, madinahNights: 2 }));
    expect(result.components).toBe(existing.components);
    expect(result.pricingSummary).toBe(existing.pricingSummary);
    expect(result.plannerInfo).toBe(existing.plannerInfo);
  });

  test('edit hydration restores explicit values and legacy fallbacks', () => {
    const explicit = prepareBookingForForm({
      serviceType: 'umrah_package',
      bookingItems: [{ itemType: 'umrah_package', umrahDetails: { makkahNights: 3, madinahNights: 2 } }],
    });
    expect(explicit.bookingItems[0].umrahDetails).toEqual(expect.objectContaining({ makkahNights: 3, madinahNights: 2 }));

    const legacy = prepareBookingForForm({
      serviceType: 'umrah_package',
      bookingItems: [{
        itemType: 'umrah_package',
        umrahDetails: { components: [
          { componentType: 'hotel', hotelPricing: { city: 'makkah', nights: 3 } },
          { componentType: 'hotel', hotelPricing: { city: 'madinah', nights: 2 } },
        ] },
      }],
    });
    expect(legacy.bookingItems[0].umrahDetails).toEqual(expect.objectContaining({ makkahNights: 3, madinahNights: 2 }));
  });

  test('manual values remain in the compact booking payload', () => {
    const payload = compactPayload({
      bookingItems: [{
        itemType: 'umrah_package',
        umrahDetails: { makkahNights: '3', madinahNights: '2' },
      }],
    });
    expect(payload.bookingItems[0].umrahDetails).toEqual({ makkahNights: '3', madinahNights: '2' });
  });
});
