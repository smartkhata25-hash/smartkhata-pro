import {
  FaHotel,
  FaKaaba,
  FaPassport,
  FaPlaneDeparture,
  FaRoute,
  FaTags,
} from 'react-icons/fa';

export const serviceTypeCards = [
  { value: 'air_ticket', labelKey: 'travel.booking.serviceTypes.air_ticket', icon: FaPlaneDeparture },
  { value: 'visit_visa', labelKey: 'travel.booking.serviceTypes.visit_visa', icon: FaPassport },
  { value: 'hotel', labelKey: 'travel.booking.serviceTypes.hotel', icon: FaHotel },
  { value: 'umrah_package', labelKey: 'travel.booking.serviceTypes.umrah_package', icon: FaKaaba },
  { value: 'transport', labelKey: 'travel.booking.serviceTypes.transport', icon: FaRoute },
  { value: 'mixed', labelKey: 'travel.booking.serviceTypes.mixed', icon: FaTags },
];

export const componentTypeOptions = [
  'visa',
  'ticket',
  'makkah_hotel',
  'madinah_hotel',
  'transport',
  'ziyarat',
  'meals',
  'other',
].map((value) => ({
  value,
  labelKey: `travel.booking.componentTypes.${value}`,
}));

export const mixedBookingItemTypes = [
  'air_ticket',
  'visit_visa',
  'hotel',
  'umrah_package',
  'transport',
  'service',
];
