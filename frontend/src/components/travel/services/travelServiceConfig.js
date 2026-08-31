import {
  DEFAULT_TRAVEL_CURRENCY,
  getTravelCurrencyOptions,
} from '../../../config/travelConfig';

const currencyOptions = getTravelCurrencyOptions();

export const emptyCategoryForm = {
  name: '',
  code: '',
  description: '',
  iconKey: '',
  sortOrder: 0,
  isActive: true,
};

export const emptyServiceForm = {
  name: '',
  categoryId: '',
  code: '',
  description: '',
  defaultSellingPrice: '',
  defaultSellingCurrency: DEFAULT_TRAVEL_CURRENCY,
  defaultCost: '',
  defaultCostCurrency: DEFAULT_TRAVEL_CURRENCY,
  accountingMode: 'principal',
  isActive: true,
};

export const emptyQuickCategoryForm = {
  name: '',
};

export const createEmptyQuickServiceForm = (categoryId = '') => ({
  name: '',
  categoryId,
  defaultSellingPrice: '',
  defaultSellingCurrency: DEFAULT_TRAVEL_CURRENCY,
});

export const categoryFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.categoryName',
    placeholderKey: 'travel.placeholders.categoryName',
    required: true,
  },
  {
    name: 'code',
    labelKey: 'travel.fields.code',
    placeholderKey: 'travel.placeholders.code',
  },
  {
    name: 'iconKey',
    labelKey: 'travel.fields.iconKey',
    placeholderKey: 'travel.placeholders.iconKey',
  },
  {
    name: 'sortOrder',
    labelKey: 'travel.fields.sortOrder',
    type: 'number',
    inputMode: 'numeric',
  },
  {
    name: 'description',
    labelKey: 'travel.fields.description',
    placeholderKey: 'travel.placeholders.description',
    type: 'textarea',
  },
  {
    name: 'isActive',
    labelKey: 'travel.fields.isActive',
    type: 'checkbox',
    fullWidth: true,
  },
];

export const serviceFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.serviceName',
    placeholderKey: 'travel.placeholders.serviceName',
    required: true,
  },
  {
    name: 'code',
    labelKey: 'travel.fields.code',
    placeholderKey: 'travel.placeholders.code',
  },
  {
    name: 'defaultSellingPrice',
    labelKey: 'travel.fields.defaultSellingPrice',
    placeholderKey: 'travel.placeholders.amount',
    type: 'number',
    inputMode: 'decimal',
    min: 0,
    step: '0.01',
  },
  {
    name: 'defaultSellingCurrency',
    labelKey: 'travel.fields.defaultSellingCurrency',
    type: 'select',
    options: currencyOptions,
  },
  {
    name: 'defaultCost',
    labelKey: 'travel.fields.defaultCost',
    placeholderKey: 'travel.placeholders.amount',
    type: 'number',
    inputMode: 'decimal',
    min: 0,
    step: '0.01',
  },
  {
    name: 'defaultCostCurrency',
    labelKey: 'travel.fields.defaultCostCurrency',
    type: 'select',
    options: currencyOptions,
  },
  {
    name: 'accountingMode',
    labelKey: 'travel.fields.accountingMode',
    type: 'select',
    options: [
      { value: 'principal', labelKey: 'travel.accountingMode.principal' },
      { value: 'commission', labelKey: 'travel.accountingMode.commission' },
    ],
  },
  {
    name: 'description',
    labelKey: 'travel.fields.description',
    placeholderKey: 'travel.placeholders.description',
    type: 'textarea',
  },
  {
    name: 'isActive',
    labelKey: 'travel.fields.isActive',
    type: 'checkbox',
    fullWidth: true,
  },
];

export const quickServiceFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.serviceName',
    placeholderKey: 'travel.placeholders.serviceName',
    required: true,
  },
  {
    name: 'defaultSellingPrice',
    labelKey: 'travel.fields.defaultSellingPrice',
    placeholderKey: 'travel.placeholders.amount',
    type: 'number',
    inputMode: 'decimal',
    min: 0,
    step: '0.01',
  },
  {
    name: 'defaultSellingCurrency',
    labelKey: 'travel.fields.defaultSellingCurrency',
    type: 'select',
    options: currencyOptions,
  },
];

export const quickCategoryFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.categoryName',
    placeholderKey: 'travel.placeholders.categoryName',
    required: true,
  },
];

export const getCategoryId = (service) =>
  typeof service?.categoryId === 'object' ? service.categoryId?._id : service?.categoryId;
