import {
  getTravelCurrencyOptions,
  getTravelVendorTypeOptions,
} from '../../../config/travelConfig';

export const currencyOptions = getTravelCurrencyOptions({ includeBlank: true });
export const vendorTypeOptions = getTravelVendorTypeOptions();

export const emptyVendorForm = {
  name: '',
  travelVendorType: 'other',
  phone: '',
  email: '',
  address: '',
  contactPerson: '',
  preferredCurrency: '',
  notes: '',
  travelServiceCategories: [],
  moduleScope: 'travel',
};

export const emptyHotelVendorForm = {
  ...emptyVendorForm,
  travelVendorType: 'hotel',
};

export const createEmptyQuickVendorForm = (name = '') => ({
  name,
  travelVendorType: 'other',
  phone: '',
  moduleScope: 'travel',
});

export const vendorFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.vendorName',
    placeholderKey: 'travel.placeholders.vendorName',
    required: true,
  },
  {
    name: 'travelVendorType',
    labelKey: 'travel.fields.vendorType',
    type: 'select',
    options: vendorTypeOptions,
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
  {
    name: 'phone',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
  {
    name: 'email',
    labelKey: 'travel.fields.email',
    placeholderKey: 'travel.placeholders.email',
    type: 'email',
  },
  {
    name: 'contactPerson',
    labelKey: 'travel.fields.contactPerson',
    placeholderKey: 'travel.placeholders.contactPerson',
  },
  {
    name: 'preferredCurrency',
    labelKey: 'travel.fields.preferredCurrency',
    placeholderKey: 'travel.placeholders.currency',
    type: 'select',
    options: currencyOptions,
  },
  {
    name: 'address',
    labelKey: 'travel.fields.address',
    placeholderKey: 'travel.placeholders.address',
    type: 'textarea',
  },
  {
    name: 'notes',
    labelKey: 'travel.fields.notes',
    placeholderKey: 'travel.placeholders.notes',
    type: 'textarea',
  },
];

export const quickVendorFields = vendorFields.filter((field) =>
  ['name', 'travelVendorType', 'phone'].includes(field.name)
);

export const normalizeCategoryIds = (categories = []) =>
  (categories || []).map((category) =>
    typeof category === 'object' ? String(category._id || category.id) : String(category)
  );
