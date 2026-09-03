import { DEFAULT_TRAVEL_CURRENCY, getTravelCurrencyOptions } from '../../../config/travelConfig';

import { getLocalDateInputValue } from '../../../utils/localDateTime';

export const BOOKING_STATUSES = Object.freeze([
  'draft',
  'quotation',
  'confirmed',
  'processing',
  'completed',
  'cancelled',
]);

export const BOOKING_SERVICE_TYPES = Object.freeze([
  'air_ticket',
  'visit_visa',
  'hotel',
  'umrah_package',
  'transport',
  'appointment',
  'token',
  'insurance',
  'mixed',
]);

export const BOOKING_ITEM_TYPES = Object.freeze([
  'air_ticket',
  'visit_visa',
  'hotel',
  'umrah_package',
  'transport',
  'appointment',
  'token',
  'insurance',
  'service',
  'other',
]);

export const JOURNEY_TYPES = Object.freeze(['one_way', 'round_trip', 'multi_city']);

export const UMRAH_PACKAGE_MODES = Object.freeze([
  'complete_vendor_package',
  'custom_component_package',
]);

export const PAX_TYPES = Object.freeze(['adult', 'child', 'infant']);

export const HOTEL_ROOM_TYPES = Object.freeze([
  'single',
  'double',
  'twin',
  'triple',
  'quad',
  'quint',
  '5_sharing',
  '6_sharing',
  '7_sharing',
  '8_sharing',
  'family',
  'sharing',
  'custom',
]);

export const UMRAH_COMPONENT_TYPES = Object.freeze([
  'air_ticket',
  'visit_visa',
  'hotel',
  'transport',
  'appointment',
  'token',
  'insurance',
  'service',
  'other',
]);

export const bookingStatusOptions = BOOKING_STATUSES.map((value) => ({
  value,
  labelKey: `travel.booking.status.${value}`,
}));

export const bookingServiceTypeOptions = BOOKING_SERVICE_TYPES.map((value) => ({
  value,
  labelKey: `travel.booking.serviceTypes.${value}`,
}));

export const bookingItemTypeOptions = BOOKING_ITEM_TYPES.map((value) => ({
  value,
  labelKey: `travel.booking.itemTypes.${value}`,
}));

export const journeyTypeOptions = JOURNEY_TYPES.map((value) => ({
  value,
  labelKey: `travel.booking.journeyTypes.${value}`,
}));

export const umrahPackageModeOptions = UMRAH_PACKAGE_MODES.map((value) => ({
  value,
  labelKey: `travel.booking.packageModes.${value}`,
}));

export const paxTypeOptions = [
  {
    value: 'adult',
    label: 'Adult',
  },
  {
    value: 'child',
    label: 'Child',
  },
  {
    value: 'infant',
    label: 'Infant',
  },
];

export const hotelRoomTypeOptions = [
  {
    value: 'single',
    label: 'Single',
    occupancy: 1,
  },
  {
    value: 'double',
    label: 'Double',
    occupancy: 2,
  },
  {
    value: 'twin',
    label: 'Twin',
    occupancy: 2,
  },
  {
    value: 'triple',
    label: 'Triple',
    occupancy: 3,
  },
  {
    value: 'quad',
    label: 'Quad',
    occupancy: 4,
  },
  {
    value: 'quint',
    label: 'Quint / 5 Sharing',
    occupancy: 5,
  },
  {
    value: '5_sharing',
    label: '5 Sharing',
    occupancy: 5,
  },
  {
    value: '6_sharing',
    label: '6 Sharing',
    occupancy: 6,
  },
  {
    value: '7_sharing',
    label: '7 Sharing',
    occupancy: 7,
  },
  {
    value: '8_sharing',
    label: '8 Sharing',
    occupancy: 8,
  },
  {
    value: 'family',
    label: 'Family',
    occupancy: 0,
  },
  {
    value: 'sharing',
    label: 'Sharing',
    occupancy: 0,
  },
  {
    value: 'custom',
    label: 'Custom',
    occupancy: 0,
  },
];

export const travelBookingCurrencyOptions = getTravelCurrencyOptions();

export const TRAVEL_REMINDER_LEAD_PRESETS = Object.freeze([
  { value: '12h', labelKey: 'travel.reminders.timing.12h', minutes: 12 * 60 },
  { value: '24h', labelKey: 'travel.reminders.timing.24h', minutes: 24 * 60 },
  { value: '48h', labelKey: 'travel.reminders.timing.48h', minutes: 48 * 60 },
  { value: 'custom', labelKey: 'travel.reminders.timing.custom', minutes: 24 * 60 },
]);

export const DEFAULT_TRAVEL_BOOKING_REMINDER_SETTINGS = Object.freeze({
  inheritBusinessDefaults: true,
  enabled: true,
  leadPreset: '24h',
  leadMinutes: 24 * 60,
  emailEnabled: false,
  whatsappEnabled: true,
});

export const getReminderLeadPreset = (leadMinutes = 24 * 60) => {
  const minutes = Number(leadMinutes || 24 * 60);
  const preset = TRAVEL_REMINDER_LEAD_PRESETS.find(
    (option) => option.value !== 'custom' && option.minutes === minutes
  );

  return preset?.value || 'custom';
};

export const normalizeReminderSettingsForForm = (settings = {}) => {
  const leadMinutes = Number(settings.leadMinutes ?? settings.defaultLeadMinutes ?? 24 * 60);

  return {
    ...DEFAULT_TRAVEL_BOOKING_REMINDER_SETTINGS,
    inheritBusinessDefaults: settings.inheritBusinessDefaults !== false,
    enabled: settings.enabled ?? settings.automaticRemindersEnabled ?? true,
    leadMinutes: Number.isFinite(leadMinutes) && leadMinutes >= 0 ? Math.floor(leadMinutes) : 24 * 60,
    leadPreset: settings.leadPreset || getReminderLeadPreset(leadMinutes),
    emailEnabled: settings.emailEnabled === true,
    whatsappEnabled: settings.whatsappEnabled !== false,
  };
};

export const getRoomTypeOccupancy = (roomType) => {
  const option = hotelRoomTypeOptions.find((item) => item.value === roomType);

  return Number(option?.occupancy || 0);
};

export const createEmptyPaxPricingRow = (paxType = 'adult') => ({
  paxType,
  count: paxType === 'adult' ? 1 : 0,
  costPrice: '',
  sellingPrice: '',
});

export const createDefaultPaxPricing = () => [createEmptyPaxPricingRow('adult')];

export const createEmptyQuantityPricing = (itemType = 'service') => {
  const unitLabels = {
    transport: 'Vehicle',
    appointment: 'Person',
    token: 'Quantity',
    insurance: 'Person',
    service: 'Quantity',
    other: 'Quantity',
  };

  return {
    quantity: 1,
    unitLabel: unitLabels[itemType] || 'Quantity',
    costPrice: '',
    sellingPrice: '',
  };
};

export const createEmptyHotelRoomPricingRow = (roomType = 'double') => ({
  roomType,
  customRoomType: '',
  occupancy: getRoomTypeOccupancy(roomType),
  quantity: 1,
  costPrice: '',
  sellingPrice: '',
});

export const createEmptyTicketPassenger = (paxType = 'adult') => ({
  travelerId: '',
  paxType,
  passengerName: '',
  airline: '',
  airlineId: '',
  origin: '',
  originAirportId: '',
  destination: '',
  destinationAirportId: '',
  departureDateTime: '',
  returnOrigin: '',
  returnOriginAirportId: '',
  returnDestination: '',
  returnDestinationAirportId: '',
  returnDateTime: '',
  pnr: '',
  ticketNumber: '',
  travelClass: '',
  baggage: '',
});

export const createEmptyVisaTraveler = (paxType = 'adult') => ({
  travelerId: '',
  paxType,
  passengerName: '',
  passportNumber: '',
  reference: '',
});

export const defaultTicketDetails = {
  journeyType: 'one_way',
  sameFlightForAll: true,
  airline: '',
  airlineId: '',
  origin: '',
  originAirportId: '',
  destination: '',
  destinationAirportId: '',
  departureDateTime: '',
  returnOrigin: '',
  returnOriginAirportId: '',
  returnDestination: '',
  returnDestinationAirportId: '',
  returnDateTime: '',
  pnr: '',
  ticketNumber: '',
  travelClass: '',
  baggage: '',
  taxes: '',
  passengerTickets: [],
};

export const defaultVisaDetails = {
  travelerId: '',
  country: '',
  visaType: '',
  duration: '',
  passportNumber: '',
  reference: '',
  governmentFee: '',
  serviceFee: '',
  travelerVisas: [],
};

export const defaultHotelDetails = {
  hotelId: '',
  checkIn: '',
  checkOut: '',
  nights: '',
  chargePerRoom: false,
  rooms: 1,
  roomType: '',
  roomPricing: [],
  adults: 1,
  children: 0,
  confirmationNumber: '',
};

export const createEmptyUmrahHotelPricing = () => ({
  city: '',
  checkIn: '',
  checkOut: '',
  nights: '',
  normalNights: '',
  weekendNights: '',
  normalRate: '',
  weekendRate: '',
  normalSubtotal: '',
  weekendSubtotal: '',
  costSubtotal: '',
  sellingSubtotal: '',
  markWeekend: false,
  usesNightlyBreakdown: false,
  chargePerRoom: false,
  roomPricing: [createEmptyHotelRoomPricingRow('double')],
});

export const defaultUmrahDetails = {
  packageMode: 'complete_vendor_package',
  packageName: '',
  departureDate: '',
  returnDate: '',
  makkahHotelId: '',
  madinahHotelId: '',
  syncPassengerCountsToComponents: true,
  components: [],
  plannerInfo: null,
  pricingSummary: null,
};

export const defaultTransportDetails = {
  pickup: '',
  dropoff: '',
  dateTime: '',
  vehicleType: '',
};

export const getRecordId = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'object') {
    return value._id || value.id || '';
  }

  return value;
};

const usesPaxPricing = (itemType) =>
  ['air_ticket', 'visit_visa', 'umrah_package'].includes(itemType);

const usesQuantityPricing = (itemType) =>
  ['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(itemType);

export const createEmptyUmrahComponent = (componentType = 'other') => {
  const usePax = ['air_ticket', 'visit_visa'].includes(componentType);

  const useHotel = componentType === 'hotel';

  const useQuantity = !usePax && !useHotel;

  return {
    componentType,

    label: '',

    vendorId: '',

    vendorType: 'vendor',

    vendorPartyId: '',

    hotelId: '',

    serviceId: '',

    costPrice: '',

    costCurrency: DEFAULT_TRAVEL_CURRENCY,

    sellingPrice: '',

    sellingCurrency: DEFAULT_TRAVEL_CURRENCY,

    paxPricing: usePax ? createDefaultPaxPricing() : [],

    quantityPricing: useQuantity ? createEmptyQuantityPricing(componentType) : null,

    hotelPricing: useHotel ? createEmptyUmrahHotelPricing() : null,

    vendorPaidAmount: '',

    estimatedVendorPaidBase: 0,

    notes: '',
  };
};

export const createEmptyBookingItem = (itemType = 'air_ticket') => {
  const usePax = usesPaxPricing(itemType);

  const useQuantity = usesQuantityPricing(itemType);

  const useHotel = itemType === 'hotel';

  return {
    itemType,

    serviceId: '',

    travelerIds: [],

    vendorId: '',

    vendorType: 'vendor',

    vendorPartyId: '',

    title: '',

    description: '',

    costPrice: '',

    costCurrency: DEFAULT_TRAVEL_CURRENCY,

    sellingPrice: '',

    sellingCurrency: DEFAULT_TRAVEL_CURRENCY,

    paxPricing: usePax ? createDefaultPaxPricing() : [],

    quantityPricing: useQuantity ? createEmptyQuantityPricing(itemType) : null,

    vendorPaidAmount: '',

    estimatedVendorPaidBase: 0,

    ticketDetails: {
      ...defaultTicketDetails,
      passengerTickets: [],
    },

    visaDetails: {
      ...defaultVisaDetails,
      travelerVisas: [],
    },

    hotelDetails: {
      ...defaultHotelDetails,

      roomPricing: useHotel ? [createEmptyHotelRoomPricingRow('double')] : [],
    },

    umrahDetails: {
      ...defaultUmrahDetails,
      components: [],
    },

    transportDetails: {
      ...defaultTransportDetails,
    },
  };
};

export const createInitialBookingForm = (serviceType = 'air_ticket') => {
  const initialItemType = serviceType === 'mixed' ? 'air_ticket' : serviceType;

  return {
    serviceType,

    status: 'draft',

    invoiceDate: getLocalDateInputValue(),

    accountingPosted: false,

    accountingStatus: 'unposted',

    customerId: '',

    customerType: 'customer',

    customerPartyId: '',

    travelers: [],

    bookingItems: [createEmptyBookingItem(initialItemType)],

    travelStartDate: '',

    travelEndDate: '',

    discountAmount: '',

    receivedAmount: '',

    paymentType: 'cash',

    accountId: '',

    vendorPaidTotal: 0,

    vendorPaymentType: 'cash',

    vendorPaymentAccountId: '',

    attachments: [],

    keepAttachmentKeys: [],

    notes: '',

    internalNotes: '',

    reminderSettings: {
      ...DEFAULT_TRAVEL_BOOKING_REMINDER_SETTINGS,
    },
  };
};

export const normalizeDateForInput = (value, includeTime = false) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  if (!includeTime) {
    return getLocalDateInputValue(date);
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 16);
};

const preparePaxPricingForForm = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  return rows.map((row) => ({
    paxType: row?.paxType || 'adult',

    count: row?.count ?? 0,

    costPrice: row?.costPrice ?? '',

    sellingPrice: row?.sellingPrice ?? '',
  }));
};

const prepareQuantityPricingForForm = (pricing) => {
  if (!pricing || typeof pricing !== 'object') {
    return null;
  }

  return {
    quantity: pricing.quantity ?? 0,

    unitLabel: pricing.unitLabel || 'Quantity',

    costPrice: pricing.costPrice ?? '',

    sellingPrice: pricing.sellingPrice ?? '',
  };
};

const prepareHotelRoomPricingForForm = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  return rows.map((row) => ({
    roomType: row?.roomType || 'double',

    customRoomType: row?.customRoomType || '',

    occupancy: row?.occupancy ?? getRoomTypeOccupancy(row?.roomType || 'double'),

    quantity: row?.quantity ?? 1,

    costPrice: row?.costPrice ?? '',

    sellingPrice: row?.sellingPrice ?? '',
  }));
};

const prepareTicketPassengerForForm = (passenger = {}) => ({
  ...createEmptyTicketPassenger(passenger.paxType || 'adult'),

  ...passenger,

  travelerId: getRecordId(passenger.travelerId),

  airlineId: getRecordId(passenger.airlineId),

  originAirportId: getRecordId(passenger.originAirportId),

  destinationAirportId: getRecordId(passenger.destinationAirportId),

  returnOriginAirportId: getRecordId(passenger.returnOriginAirportId),

  returnDestinationAirportId: getRecordId(passenger.returnDestinationAirportId),

  paxType: passenger.paxType || 'adult',

  passengerName: passenger.passengerName || '',

  departureDateTime: normalizeDateForInput(passenger.departureDateTime, true),

  returnDateTime: normalizeDateForInput(passenger.returnDateTime, true),
});

const prepareVisaTravelerForForm = (traveler = {}) => ({
  ...createEmptyVisaTraveler(traveler.paxType || 'adult'),

  ...traveler,

  travelerId: getRecordId(traveler.travelerId),

  paxType: traveler.paxType || 'adult',

  passengerName: traveler.passengerName || '',

  passportNumber: traveler.passportNumber || '',

  reference: traveler.reference || '',
});

const prepareUmrahHotelPricingForForm = (pricing) => {
  if (!pricing || typeof pricing !== 'object') {
    return null;
  }

  return {
    city: pricing.city || '',

    checkIn: normalizeDateForInput(pricing.checkIn),

    checkOut: normalizeDateForInput(pricing.checkOut),

    nights: pricing.nights ?? '',

    normalNights: pricing.normalNights ?? '',

    weekendNights: pricing.weekendNights ?? '',

    normalRate: pricing.normalRate ?? '',

    weekendRate: pricing.weekendRate ?? '',

    normalSubtotal: pricing.normalSubtotal ?? '',

    weekendSubtotal: pricing.weekendSubtotal ?? '',

    costSubtotal: pricing.costSubtotal ?? '',

    sellingSubtotal: pricing.sellingSubtotal ?? '',

    markWeekend: pricing.markWeekend === true || pricing.markWeekend === 'true',

    usesNightlyBreakdown:
      pricing.usesNightlyBreakdown === true || pricing.usesNightlyBreakdown === 'true',

    chargePerRoom: Boolean(pricing.chargePerRoom),

    roomPricing: prepareHotelRoomPricingForForm(pricing.roomPricing),
  };
};

const prepareUmrahComponentForForm = (component = {}) => ({
  ...createEmptyUmrahComponent(component.componentType || 'other'),

  ...component,

  vendorId: getRecordId(component.vendorId),

  vendorType: component.vendorType === 'party' || component.vendorPartyId ? 'party' : 'vendor',

  vendorPartyId: getRecordId(component.vendorPartyId),

  hotelId: getRecordId(component.hotelId),

  serviceId: getRecordId(component.serviceId),

  costPrice: component.costPrice ?? '',

  costCurrency: component.costCurrency || DEFAULT_TRAVEL_CURRENCY,

  sellingPrice: component.sellingPrice ?? '',

  sellingCurrency: component.sellingCurrency || component.costCurrency || DEFAULT_TRAVEL_CURRENCY,

  paxPricing: Array.isArray(component.paxPricing)
    ? preparePaxPricingForForm(component.paxPricing)
    : [],

  quantityPricing: prepareQuantityPricingForForm(component.quantityPricing),

  hotelPricing: prepareUmrahHotelPricingForForm(component.hotelPricing),

  vendorPaidAmount: component.vendorPaidAmount ?? '',

  estimatedVendorPaidBase: Number(component.estimatedVendorPaidBase || 0),

  notes: component.notes || '',
});

const prepareBookingItemForForm = (item = {}) => {
  const itemType = item.itemType || 'service';

  return {
    ...createEmptyBookingItem(itemType),

    ...item,

    serviceId: getRecordId(item.serviceId),

    vendorId: getRecordId(item.vendorId),

    vendorType: item.vendorType === 'party' || item.vendorPartyId ? 'party' : 'vendor',

    vendorPartyId: getRecordId(item.vendorPartyId),

    travelerIds: (item.travelerIds || []).map((traveler) => getRecordId(traveler)).filter(Boolean),

    costPrice: item.costPrice ?? '',

    costCurrency: item.costCurrency || DEFAULT_TRAVEL_CURRENCY,

    sellingPrice: item.sellingPrice ?? '',

    sellingCurrency: item.sellingCurrency || item.costCurrency || DEFAULT_TRAVEL_CURRENCY,

    paxPricing: Array.isArray(item.paxPricing) ? preparePaxPricingForForm(item.paxPricing) : [],

    quantityPricing: prepareQuantityPricingForForm(item.quantityPricing),

    vendorPaidAmount: item.vendorPaidAmount ?? '',

    estimatedVendorPaidBase: Number(item.estimatedVendorPaidBase || 0),

    ticketDetails: {
      ...defaultTicketDetails,

      ...(item.ticketDetails || {}),

      sameFlightForAll: item.ticketDetails?.sameFlightForAll !== false,

      airlineId: getRecordId(item.ticketDetails?.airlineId),

      originAirportId: getRecordId(item.ticketDetails?.originAirportId),

      destinationAirportId: getRecordId(item.ticketDetails?.destinationAirportId),

      returnOriginAirportId: getRecordId(item.ticketDetails?.returnOriginAirportId),

      returnDestinationAirportId: getRecordId(item.ticketDetails?.returnDestinationAirportId),

      departureDateTime: normalizeDateForInput(item.ticketDetails?.departureDateTime, true),

      returnDateTime: normalizeDateForInput(item.ticketDetails?.returnDateTime, true),

      passengerTickets: Array.isArray(item.ticketDetails?.passengerTickets)
        ? item.ticketDetails.passengerTickets.map(prepareTicketPassengerForForm)
        : [],
    },

    visaDetails: {
      ...defaultVisaDetails,

      ...(item.visaDetails || {}),

      travelerId: getRecordId(item.visaDetails?.travelerId),

      travelerVisas: Array.isArray(item.visaDetails?.travelerVisas)
        ? item.visaDetails.travelerVisas.map(prepareVisaTravelerForForm)
        : [],
    },

    hotelDetails: {
      ...defaultHotelDetails,

      ...(item.hotelDetails || {}),

      hotelId: getRecordId(item.hotelDetails?.hotelId),

      checkIn: normalizeDateForInput(item.hotelDetails?.checkIn),

      checkOut: normalizeDateForInput(item.hotelDetails?.checkOut),

      chargePerRoom: Boolean(item.hotelDetails?.chargePerRoom),

      roomPricing: prepareHotelRoomPricingForForm(item.hotelDetails?.roomPricing),
    },

    umrahDetails: {
      ...defaultUmrahDetails,

      ...(item.umrahDetails || {}),

      departureDate: normalizeDateForInput(item.umrahDetails?.departureDate),

      returnDate: normalizeDateForInput(item.umrahDetails?.returnDate),

      makkahHotelId: getRecordId(item.umrahDetails?.makkahHotelId),

      madinahHotelId: getRecordId(item.umrahDetails?.madinahHotelId),

      syncPassengerCountsToComponents: item.umrahDetails?.syncPassengerCountsToComponents !== false,

      components: (item.umrahDetails?.components || []).map((component) =>
        prepareUmrahComponentForForm(component)
      ),

      plannerInfo: item.umrahDetails?.plannerInfo || null,

      pricingSummary: item.umrahDetails?.pricingSummary || null,
    },

    transportDetails: {
      ...defaultTransportDetails,

      ...(item.transportDetails || {}),

      dateTime: normalizeDateForInput(item.transportDetails?.dateTime, true),
    },
  };
};

export const prepareBookingForForm = (booking = null) => {
  if (!booking) {
    return createInitialBookingForm();
  }

  const serviceType = booking.serviceType || 'mixed';

  const bookingItems =
    Array.isArray(booking.bookingItems) && booking.bookingItems.length > 0
      ? booking.bookingItems.map((item) => prepareBookingItemForForm(item))
      : [createEmptyBookingItem(serviceType === 'mixed' ? 'air_ticket' : serviceType)];

  return {
    serviceType,

    status: booking.status || 'draft',

    invoiceNumber: booking.invoiceNumber || booking.bookingNumber || '',

    invoiceDate:
      normalizeDateForInput(booking.invoiceDate) ||
      normalizeDateForInput(booking.createdAt) ||
      getLocalDateInputValue(),

    accountingPosted: Boolean(booking.accountingPosted),

    accountingStatus: booking.accountingStatus || 'unposted',

    customerId: getRecordId(booking.customerId),

    customerType: booking.customerType === 'party' || booking.customerPartyId ? 'party' : 'customer',

    customerPartyId: getRecordId(booking.customerPartyId),

    travelers: (booking.travelers || []).map((traveler) => getRecordId(traveler)).filter(Boolean),

    bookingItems,

    travelStartDate: normalizeDateForInput(booking.travelStartDate),

    travelEndDate: normalizeDateForInput(booking.travelEndDate),

    discountAmount: booking.discountAmount ?? '',

    receivedAmount: booking.receivedAmount ?? '',

    paymentType: booking.paymentType || 'cash',

    accountId: getRecordId(booking.accountId),

    vendorPaidTotal: Number(booking.vendorPaidTotal || 0),

    vendorPaymentType: booking.vendorPaymentType || 'cash',

    vendorPaymentAccountId: getRecordId(booking.vendorPaymentAccountId),

    attachments: Array.isArray(booking.attachments) ? booking.attachments : [],

    keepAttachmentKeys: (booking.attachments || [])
      .map((attachment) => attachment?.key)
      .filter(Boolean),

    notes: booking.notes || '',

    internalNotes: booking.internalNotes || '',

    reminderSettings: normalizeReminderSettingsForForm(booking.reminderSettings),
  };
};

export const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatBookingMoney = (amount, currency = DEFAULT_TRAVEL_CURRENCY) =>
  `${currency || DEFAULT_TRAVEL_CURRENCY} ${Number(amount || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

export const getCustomerName = (customer) =>
  typeof customer === 'object' ? customer?.name || '-' : '-';

export const getTravelerName = (traveler) =>
  typeof traveler === 'object' ? traveler?.fullName || '-' : '-';

export const getVendorName = (vendor) => (typeof vendor === 'object' ? vendor?.name || '-' : '-');

export const getHotelName = (hotel) => {
  if (!hotel || typeof hotel !== 'object') {
    return '-';
  }

  return [hotel.name, hotel.city].filter(Boolean).join(', ') || '-';
};
