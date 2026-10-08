export const emptyCustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  moduleScope: 'travel',
  openingBalanceAmount: '',
  openingBalanceDirection: 'receivable',
};

export const quickCustomerFields = [
  {
    name: 'name',
    labelKey: 'travel.fields.customerName',
    placeholderKey: 'travel.placeholders.customerName',
    required: true,
  },
  {
    name: 'phone',
    labelKey: 'travel.fields.mobile',
    placeholderKey: 'travel.placeholders.mobile',
  },
];

export const customerFields = [
  ...quickCustomerFields,
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
    name: 'openingBalanceAmount',
    labelKey: 'travel.openingBalance.amount',
    placeholderKey: 'travel.openingBalance.amountPlaceholder',
    type: 'number',
    step: '0.01',
    min: '0',
  },
  {
    name: 'openingBalanceDirection',
    labelKey: 'travel.openingBalance.direction',
    type: 'select',
    options: [
      { value: 'receivable', labelKey: 'travel.openingBalance.customerReceivable' },
      { value: 'credit', labelKey: 'travel.openingBalance.customerCredit' },
    ],
  },
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
];

const getOpeningBalanceAmount = (openingBalance = 0) => {
  const amount = Math.abs(Number(openingBalance || 0));
  return amount || '';
};

export const withCustomerOpeningFormValues = (customer = {}) => ({
  ...customer,
  openingBalanceAmount: getOpeningBalanceAmount(customer.openingBalance),
  openingBalanceDirection: Number(customer.openingBalance || 0) < 0 ? 'credit' : 'receivable',
});

export const buildCustomerOpeningPayload = (values = {}) => {
  const amount = Math.abs(Number(values.openingBalanceAmount || 0));
  const direction = values.openingBalanceDirection || 'receivable';

  return {
    ...values,
    openingBalance: direction === 'credit' ? -amount : amount,
    openingBalanceAmount: amount,
    openingBalanceDirection: direction,
  };
};
