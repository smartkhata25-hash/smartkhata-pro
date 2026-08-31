import {
  DEFAULT_TRAVEL_CURRENCY,
  getHotelStarRatingOptions,
  getTravelCurrencyOptions,
} from '../../../config/travelConfig';

const currencyOptions = getTravelCurrencyOptions();
const starRatingOptions = getHotelStarRatingOptions();

export const emptyHotelForm = {
  name: '',
  city: '',
  country: '',
  starRating: '',
  vendorId: '',
  distanceText: '',
  defaultRate: '',
  currency: DEFAULT_TRAVEL_CURRENCY,
  contact: '',
  address: '',
  notes: '',
  isActive: true,
};

export const emptyQuickHotel = {
  name: '',
  city: '',
  defaultRate: '',
  currency: DEFAULT_TRAVEL_CURRENCY,
};

export const hotelFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.hotelName',
    placeholderKey: 'travel.placeholders.hotelName',
    required: true,
  },

  {
    name: 'city',
    labelKey: 'travel.fields.city',
    placeholderKey: 'travel.placeholders.city',
    required: true,
  },

  {
    name: 'country',
    labelKey: 'travel.fields.country',
    placeholderKey: 'travel.placeholders.country',
  },

  {
    name: 'starRating',
    labelKey: 'travel.fields.starRating',
    type: 'select',
    placeholderKey: 'travel.placeholders.starRating',
    options: starRatingOptions,
  },

  {
    name: 'distanceText',
    labelKey: 'travel.fields.distanceText',
    placeholderKey: 'travel.placeholders.distanceText',
  },

  {
    name: 'defaultRate',
    labelKey: 'travel.fields.defaultRate',
    placeholderKey: 'travel.placeholders.amount',
    type: 'number',
    inputMode: 'decimal',
    min: 0,
    step: '0.01',
  },

  {
    name: 'currency',
    labelKey: 'travel.fields.currency',
    type: 'select',
    options: currencyOptions,
  },

  {
    name: 'contact',
    labelKey: 'travel.fields.contact',
    placeholderKey: 'travel.placeholders.contact',
  },

  {
    name: 'address',
    labelKey: 'travel.fields.address',
    placeholderKey: 'travel.placeholders.address',
    type: 'textarea',
    fullWidth: true,
  },

  {
    name: 'notes',
    labelKey: 'travel.fields.notes',
    placeholderKey: 'travel.placeholders.notes',
    type: 'textarea',
    fullWidth: true,
  },

  {
    name: 'isActive',
    labelKey: 'travel.fields.isActive',
    type: 'checkbox',
    fullWidth: true,
  },
];

export const quickHotelFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.hotelName',
    placeholderKey: 'travel.placeholders.hotelName',
    required: true,
  },

  {
    name: 'city',
    labelKey: 'travel.fields.city',
    placeholderKey: 'travel.placeholders.city',
    required: true,
  },

  {
    name: 'defaultRate',
    labelKey: 'travel.fields.defaultRate',
    placeholderKey: 'travel.placeholders.amount',
    type: 'number',
    inputMode: 'decimal',
    min: 0,
    step: '0.01',
  },

  {
    name: 'currency',
    labelKey: 'travel.fields.currency',
    type: 'select',
    options: currencyOptions,
  },
];

export const getVendorId = (hotel) =>
  typeof hotel?.vendorId === 'object' ? hotel.vendorId?._id : hotel?.vendorId;
