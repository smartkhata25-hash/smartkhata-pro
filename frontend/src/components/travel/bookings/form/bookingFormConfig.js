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

export const customerQuickFields = [
  {
    name: 'name',
    labelKey: 'travel.booking.fields.customerName',
    placeholderKey: 'travel.booking.placeholders.customerName',
    required: true,
  },
  {
    name: 'phone',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
];

export const customerDetailFields = [
  ...customerQuickFields,
  {
    name: 'email',
    labelKey: 'travel.fields.email',
    placeholderKey: 'travel.placeholders.email',
    type: 'email',
  },
  {
    name: 'address',
    labelKey: 'travel.fields.address',
    placeholderKey: 'travel.placeholders.address',
    type: 'textarea',
  },
  {
    name: 'moduleScope',
    labelKey: 'travel.booking.fields.moduleScope',
    type: 'select',
    options: [
      { value: 'travel', labelKey: 'travel.booking.moduleScope.travel' },
      { value: 'both', labelKey: 'travel.booking.moduleScope.both' },
    ],
  },
];

export const travelerQuickFields = [
  {
    name: 'fullName',
    labelKey: 'travel.fields.fullName',
    placeholderKey: 'travel.placeholders.fullName',
    required: true,
  },
  {
    name: 'passportNumber',
    labelKey: 'travel.fields.passportNumber',
    placeholderKey: 'travel.placeholders.passportNumber',
  },
  {
    name: 'mobile',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
];

export const travelerDetailFields = [
  ...travelerQuickFields,
  {
    name: 'gender',
    labelKey: 'travel.fields.gender',
    type: 'select',
    placeholderKey: 'travel.placeholders.gender',
    options: [
      { value: '', labelKey: 'travel.placeholders.gender' },
      { value: 'male', labelKey: 'travel.gender.male' },
      { value: 'female', labelKey: 'travel.gender.female' },
      { value: 'other', labelKey: 'travel.gender.other' },
    ],
  },
  {
    name: 'nationality',
    labelKey: 'travel.fields.nationality',
    placeholderKey: 'travel.placeholders.nationality',
  },
  {
    name: 'passportCountry',
    labelKey: 'travel.fields.passportCountry',
    placeholderKey: 'travel.placeholders.passportCountry',
  },
  {
    name: 'notes',
    labelKey: 'travel.fields.notes',
    placeholderKey: 'travel.placeholders.notes',
    type: 'textarea',
  },
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
