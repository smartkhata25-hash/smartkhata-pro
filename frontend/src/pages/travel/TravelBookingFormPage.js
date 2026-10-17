import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  FaChevronDown,
  FaChevronUp,
  FaClipboardList,
  FaCoins,
  FaExchangeAlt,
  FaFilePdf,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaPaperclip,
  FaPlaneArrival,
  FaPlaneDeparture,
  FaPlus,
  FaPrint,
  FaRoute,
  FaSave,
  FaTimes,
  FaTrash,
  FaUniversity,
  FaUserTie,
  FaWallet,
} from 'react-icons/fa';

import {
  createTraveler,
  createTravelCity,
  createTravelBooking,
  createTravelCustomer,
  createTravelHotel,
  createTravelService,
  createTravelServiceCategory,
  createTravelVendor,
  fetchTravelAirlines,
  fetchTravelAirports,
  fetchTravelBookingById,
  fetchTravelCustomers,
  fetchTravelCurrencySettings,
  fetchTravelHotels,
  fetchTravelCities,
  fetchTravelParties,
  fetchTravelPaymentAccounts,
  fetchTravelServiceCategories,
  fetchTravelServices,
  fetchTravelers,
  fetchTravelVendors,
  getTravelBookingPdfUrl,
  getTravelBookingPrintUrl,
  updateTravelCurrencyDefaultRate,
  updateTravelBooking,
} from '../../services/travelMasterService';
import { fetchTravelReminderSettings } from '../../services/travelReminderService';

import { t } from '../../i18n/i18n';
import useFormPersist from '../../hooks/useFormPersist';
import { hasPermission } from '../../utils/permissionHelper';
import { formatMoneyDisplay } from '../../utils/money';
import {
  downloadBackendPdf,
  openBackendPrintWindow,
  reserveBackendPrintWindow,
} from '../../utils/backendPrintDocument';

import {
  TravelActionButton,
  TravelCompactAutocomplete,
  TravelErrorModal,
} from '../../components/travel/master/TravelMasterUI';
import { TravelBookingReminderControls } from '../../components/travel/reminders/TravelReminderCenter';

import {
  appendMultiCitySector,
  bookingItemTypeOptions,
  createEmptyBookingItem,
  createEmptyHotelRoomPricingRow,
  createEmptyMultiCitySector,
  createEmptyPaxPricingRow,
  createEmptyTicketPassenger,
  createEmptyUmrahComponent,
  createEmptyVisaTraveler,
  createInitialBookingForm,
  hotelRoomTypeOptions,
  JOURNEY_TYPES,
  insertMultiCityPricingRow,
  prepareBookingForForm,
  removeMultiCityPricingRowAt,
  removeMultiCitySectorAt,
  normalizeReminderSettingsForForm,
  travelBookingCurrencyOptions,
  UMRAH_COMPONENT_TYPES,
  umrahPackageModeOptions,
} from '../../components/travel/bookings/travelBookingConfig';

import {
  createEmptyQuickServiceForm,
  emptyCategoryForm,
  emptyQuickCategoryForm,
  emptyServiceForm,
  quickCategoryFields,
  quickServiceFields,
  serviceFields,
} from '../../components/travel/services/travelServiceConfig';

import {
  emptyHotelForm,
  emptyQuickHotel,
  quickHotelFields,
} from '../../components/travel/hotels/travelHotelConfig';
import TravelHotelFormModal from '../../components/travel/hotels/TravelHotelFormModal';
import TravelCityAutocomplete from '../../components/travel/cities/TravelCityAutocomplete';
import {
  applyHotelCityChange,
  applyHotelSelection,
  appendHotelBookingItem,
  filterHotelsByCity,
} from '../../components/travel/cities/travelCityUtils';

import {
  buildVendorOpeningPayload,
  emptyVendorForm,
} from '../../components/travel/vendors/travelVendorConfig';
import TravelVendorFormModal from '../../components/travel/vendors/TravelVendorFormModal';
import TravelCustomerFormModal from '../../components/travel/customers/TravelCustomerFormModal';
import {
  buildCustomerOpeningPayload,
  emptyCustomerForm,
} from '../../components/travel/customers/travelCustomerFormConfig';
import TravelTravelerFormModal from '../../components/travel/travelers/TravelTravelerFormModal';
import {
  cleanTravelerPayload,
  emptyTravelerForm,
} from '../../components/travel/travelers/travelTravelerFormConfig';
import {
  createBookingCustomerQuick,
  createBookingTravelerQuick,
  createBookingVendorQuick,
} from '../../components/travel/quickAdd/travelQuickAdd';

import BookingRelationModal from '../../components/travel/bookings/form/BookingRelationModal';
import MatchingTravelersModal from '../../components/travel/bookings/form/MatchingTravelersModal';
import TravelerDuplicateConfirmationModal from '../../components/travel/bookings/form/TravelerDuplicateConfirmationModal';
import TravelCurrencyRateModal from '../../components/travel/bookings/form/TravelCurrencyRateModal';
import TravelBookingDocumentButtons from '../../components/travel/bookings/form/TravelBookingDocumentButtons';
import {
  createTravelBookingFormFingerprint,
  getTravelDocumentSaveChoices,
  getTravelInvoicePdfFileName,
  TRAVEL_DOCUMENT_ACTIONS,
} from '../../components/travel/bookings/form/travelBookingDocumentActions';
import {
  applyCustomerReceiptAmountChange,
  buildInvoiceExtraPaymentWarnings,
  calculateInvoicePaymentSummary,
  normalizeCustomerReceiptForPayload,
} from '../../components/travel/bookings/form/bookingPaymentUtils';
import {
  appendTravelerOccurrence,
  buildTravelerOccurrences,
  getTravelerAddDecision,
  removeTravelerOccurrence,
  updateTravelerDetailOccurrence,
} from '../../components/travel/bookings/form/travelerOccurrenceUtils';
import {
  canUseCustomerAsTraveler,
  getSelectedCustomerTravelerId,
  itemContainsTraveler,
  resolveCustomerTraveler,
} from '../../components/travel/bookings/form/customerTravelerUtils';

import {
  calculateBookingItemSourceTotals,
  calculateLocalTotals,
  calculateUmrahComponentSourceTotals,
  captureCurrencyRateSnapshot,
  compactPayload,
  deriveVendorCostGroups,
  findMissingConversionRate,
  getInvoiceCurrencyRate,
  getMissingInvoiceCurrencyRateSides,
  getVendorCounterpartyKey,
  isRowVendorMode,
  normalizeDualCurrencyRates,
  sanitizeDraftState,
  updateInvoiceCurrencyRate,
  upsertRecord,
} from '../../components/travel/bookings/form/bookingFormUtils';

import { DEFAULT_TRAVEL_CURRENCY } from '../../config/travelConfig';

const MAX_ATTACHMENTS = 3;

const sectionClasses =
  'relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm';

const sectionBodyClasses = 'p-3 sm:p-4';

const fieldClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const selectClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const safeParseStoredUser = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawUser = window.localStorage?.getItem('user');

    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.error('Travel booking draft user parse failed:', error);
    return null;
  }
};

const getTravelBookingDraftKey = () => {
  if (typeof window === 'undefined') {
    return 'travel_booking_draft_v1:server';
  }

  const user = safeParseStoredUser();

  const tenantId =
    user?.businessOwnerId ||
    user?.businessOwner ||
    user?.ownerId ||
    user?._id ||
    window.localStorage?.getItem('userId') ||
    'anonymous';

  const actorId = user?._id || user?.id || window.localStorage?.getItem('userId') || 'anonymous';

  return `travel_booking_draft_v1:${tenantId}:${actorId}`;
};

const getRecordId = (record) =>
  typeof record === 'object' ? record?._id || record?.id || '' : record || '';

const buildCounterpartyOption = (record, type) => {
  const sourceId = getRecordId(record);

  return {
    ...record,
    _id: sourceId ? `${type}:${sourceId}` : '',
    sourceId,
    counterpartyType: type,
    entityType: type,
  };
};

const getCounterpartySelection = (value, record, fallbackType = 'vendor') => {
  if (record?.counterpartyType) {
    return {
      type: record.counterpartyType,
      id: record.sourceId || getRecordId(record),
    };
  }

  const rawValue = String(value || '');
  const [type, ...idParts] = rawValue.split(':');
  const id = idParts.join(':');

  if (id && ['customer', 'vendor', 'party'].includes(type)) {
    return { type, id };
  }

  return {
    type: fallbackType,
    id: getRecordId(value),
  };
};

const getCustomerCounterpartyValue = (formState = {}) =>
  formState.customerType === 'party' && getRecordId(formState.customerPartyId)
    ? `party:${getRecordId(formState.customerPartyId)}`
    : getRecordId(formState.customerId)
      ? `customer:${getRecordId(formState.customerId)}`
      : '';

const getVendorCounterpartyValue = (source = {}) =>
  source.vendorType === 'party' && getRecordId(source.vendorPartyId)
    ? `party:${getRecordId(source.vendorPartyId)}`
    : getRecordId(source.vendorId)
      ? `vendor:${getRecordId(source.vendorId)}`
      : '';

const applyVendorCounterpartyToItem = (item = {}, selection = {}) => {
  if (!selection.id) {
    return {
      ...item,
      vendorType: 'vendor',
      vendorId: '',
      vendorPartyId: '',
    };
  }

  if (selection.type === 'party') {
    return {
      ...item,
      vendorType: 'party',
      vendorId: '',
      vendorPartyId: selection.id,
    };
  }

  return {
    ...item,
    vendorType: 'vendor',
    vendorId: selection.id,
    vendorPartyId: '',
  };
};

const getCustomerLabel = (customer) => customer?.name || '-';

const getCustomerMeta = (customer) =>
  [
    customer?.counterpartyType === 'party' ? t('travel.counterparty.party') : '',
    customer?.phone,
    customer?.email,
  ]
    .filter(Boolean)
    .join(' | ');

const getServiceLabel = (service) => service?.name || service?.code || '-';

const getVendorLabel = (vendor) => vendor?.name || '-';

const getTravelerLabel = (traveler) => traveler?.fullName || traveler?.name || '-';

const getTravelerMeta = (traveler) =>
  [traveler?.passportNumber, traveler?.mobile].filter(Boolean).join(' | ');

const getHotelLabel = (hotel) => [hotel?.name, hotel?.city].filter(Boolean).join(', ') || '-';

const getAirlineLabel = (airline) =>
  [airline?.name, airline?.iataCode ? `(${airline.iataCode})` : ''].filter(Boolean).join(' ') ||
  '-';

const getAirlineText = (airline) => airline?.name || airline?.iataCode || '';

const getAirlineMeta = (airline) =>
  [airline?.iataCode, airline?.icaoCode, airline?.country].filter(Boolean).join(' | ');

const getAirportLabel = (airport) =>
  [airport?.iataCode, [airport?.city, airport?.country].filter(Boolean).join(', ') || airport?.name]
    .filter(Boolean)
    .join(' - ') || '-';

const getAirportMeta = (airport) =>
  [airport?.name, airport?.countryCode].filter(Boolean).join(' | ');

const getAirportText = (airport) => airport?.iataCode || airport?.name || '';

const isRecordActive = (record) => record?.isDeleted !== true && record?.isActive !== false;

const getVendorMeta = (vendor) =>
  [
    vendor?.counterpartyType === 'party' ? t('travel.counterparty.party') : '',
    vendor?.phone,
    vendor?.travelVendorType ? t(`travel.vendorTypes.${vendor.travelVendorType}`) : '',
  ]
    .filter(Boolean)
    .join(' | ');

const numberValue = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const hasRecordReference = (value) => Boolean(getRecordId(value));

const mergeReferenceRecords = (current = [], loaded = []) => {
  const loadedRecords = Array.isArray(loaded) ? loaded : [];
  const loadedIds = new Set(loadedRecords.map((record) => String(record?._id || record?.id || '')));

  return [
    ...loadedRecords,
    ...(Array.isArray(current) ? current : []).filter(
      (record) => !loadedIds.has(String(record?._id || record?.id || ''))
    ),
  ];
};

const getBookingOptionalReferenceKeys = (bookingState = {}) => {
  const keys = new Set();
  const bookingItems = Array.isArray(bookingState.bookingItems) ? bookingState.bookingItems : [];

  const addFlightReferenceKeys = (details = {}) => {
    if (!details || typeof details !== 'object') {
      return;
    }

    if (hasRecordReference(details.airlineId)) {
      keys.add('airlines');
    }

    if (
      hasRecordReference(details.originAirportId) ||
      hasRecordReference(details.destinationAirportId) ||
      hasRecordReference(details.returnOriginAirportId) ||
      hasRecordReference(details.returnDestinationAirportId)
    ) {
      keys.add('airports');
    }
  };

  bookingItems.forEach((item = {}) => {
    const itemType = item.itemType || '';

    if (Array.isArray(item.travelerIds) && item.travelerIds.length > 0) {
      keys.add('travelers');
    }

    if (itemType === 'air_ticket') {
      keys.add('airlines');
      keys.add('airports');
    }

    if (itemType === 'visit_visa') {
      keys.add('travelers');
    }

    if (itemType === 'hotel' || hasRecordReference(item.hotelDetails?.hotelId)) {
      keys.add('hotels');
      keys.add('cities');
    }

    addFlightReferenceKeys(item.ticketDetails);

    (item.ticketDetails?.passengerTickets || []).forEach(addFlightReferenceKeys);

    if (itemType === 'umrah_package') {
      keys.add('airlines');
      keys.add('hotels');
    }

    const umrahDetails = item.umrahDetails || {};

    if (
      hasRecordReference(umrahDetails.makkahHotelId) ||
      hasRecordReference(umrahDetails.madinahHotelId)
    ) {
      keys.add('hotels');
    }

    (umrahDetails.components || []).forEach((component = {}) => {
      if (component.componentType === 'hotel' || hasRecordReference(component.hotelId)) {
        keys.add('hotels');
      }
    });
  });

  return Array.from(keys);
};

const clearUmrahHotelPricingBreakdown = (pricing = {}) => {
  const next = {
    ...pricing,
    usesNightlyBreakdown: false,
    markWeekend: false,
  };

  [
    'normalNights',
    'weekendNights',
    'normalRate',
    'weekendRate',
    'normalSubtotal',
    'weekendSubtotal',
    'costSubtotal',
    'sellingSubtotal',
  ].forEach((field) => {
    delete next[field];
  });

  return next;
};

const formatMoney = (amount, currency = DEFAULT_TRAVEL_CURRENCY) =>
  `${currency || DEFAULT_TRAVEL_CURRENCY} ${formatMoneyDisplay(amount)}`;

const applyServiceDefaults = (item, service) => {
  const defaultCost =
    item.costPrice !== '' && item.costPrice !== undefined
      ? item.costPrice
      : service?.defaultCost || '';

  const defaultSelling =
    item.sellingPrice !== '' && item.sellingPrice !== undefined
      ? item.sellingPrice
      : service?.defaultSellingPrice || '';

  const currency =
    item.costCurrency ||
    item.sellingCurrency ||
    service?.defaultCostCurrency ||
    service?.defaultSellingCurrency ||
    DEFAULT_TRAVEL_CURRENCY;

  let paxPricing = Array.isArray(item.paxPricing) ? item.paxPricing.map((row) => ({ ...row })) : [];

  if (
    ['air_ticket', 'visit_visa', 'umrah_package'].includes(item.itemType) &&
    paxPricing.length === 0
  ) {
    paxPricing = [
      {
        ...createEmptyPaxPricingRow('adult'),
        costPrice: defaultCost,
        sellingPrice: defaultSelling,
      },
    ];
  }

  const adultIndex = paxPricing.findIndex((row) => row?.paxType === 'adult');

  if (['air_ticket', 'visit_visa', 'umrah_package'].includes(item.itemType) && adultIndex >= 0) {
    paxPricing[adultIndex] = {
      ...paxPricing[adultIndex],

      costPrice:
        paxPricing[adultIndex]?.costPrice !== '' && paxPricing[adultIndex]?.costPrice !== undefined
          ? paxPricing[adultIndex].costPrice
          : defaultCost,

      sellingPrice:
        paxPricing[adultIndex]?.sellingPrice !== '' &&
        paxPricing[adultIndex]?.sellingPrice !== undefined
          ? paxPricing[adultIndex].sellingPrice
          : defaultSelling,
    };
  }

  const usesQuantity = [
    'transport',
    'appointment',
    'token',
    'insurance',
    'service',
    'other',
  ].includes(item.itemType);

  const quantityPricing = usesQuantity
    ? {
        quantity: item.quantityPricing?.quantity ?? 1,

        unitLabel: item.quantityPricing?.unitLabel || 'Quantity',

        costPrice:
          item.quantityPricing?.costPrice !== '' && item.quantityPricing?.costPrice !== undefined
            ? item.quantityPricing.costPrice
            : defaultCost,

        sellingPrice:
          item.quantityPricing?.sellingPrice !== '' &&
          item.quantityPricing?.sellingPrice !== undefined
            ? item.quantityPricing.sellingPrice
            : defaultSelling,
      }
    : item.quantityPricing || null;

  return {
    ...item,

    serviceId: service?._id || '',

    title: item.title || service?.name || '',

    costPrice: defaultCost,

    sellingPrice: defaultSelling,

    costCurrency: currency,

    sellingCurrency: currency,

    paxPricing,

    quantityPricing,
  };
};

const getDefaultServiceTitle = (item) =>
  item.title || item.description || t(`travel.booking.itemTypes.${item.itemType || 'service'}`);

const FieldLabel = ({ children }) => (
  <span className="mb-1 block text-xs font-extrabold text-slate-500">{children}</span>
);

const TextField = ({
  labelKey,
  value,
  onChange,
  type = 'text',
  disabled = false,
  min,
  step,
  inputMode,
}) => (
  <label className="min-w-0">
    <FieldLabel>{t(labelKey)}</FieldLabel>

    <input
      type={type}
      value={value ?? ''}
      disabled={disabled}
      min={min}
      step={step}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass}
    />
  </label>
);

const MoneyField = ({
  labelKey,
  value,
  onChange,
  disabled = false,
  accent = false,
  currency = DEFAULT_TRAVEL_CURRENCY,
  side,
  baseCurrency = DEFAULT_TRAVEL_CURRENCY,
  onRateClick,
}) => (
  <label className="min-w-0">
    <FieldLabel>{t(labelKey)}</FieldLabel>

    <div className="relative">
      <FaCoins
        aria-hidden="true"
        className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs ${
          accent ? 'text-amber-500' : 'text-slate-400'
        }`}
      />

      <input
        type="number"
        min="0"
        step="0.01"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          if (onRateClick && Number(nextValue) > 0) {
            onRateClick({
              currency,
              side,
              sourceAmount: Number(nextValue),
              required: true,
            });
          }
        }}
        className={`${fieldClass} pl-8 ${onRateClick && currency !== baseCurrency ? 'pr-10' : ''} ${
          accent
            ? 'border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-100'
            : ''
        }`}
      />

      {onRateClick && currency !== baseCurrency && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRateClick({ currency, side, sourceAmount: Number(value || 0) })}
          className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-cyan-600 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:text-slate-300"
          title={`${side === 'cost' ? 'Cost' : 'Sale'} conversion rate`}
          aria-label={`${side === 'cost' ? 'Cost' : 'Sale'} conversion rate for ${currency}`}
        >
          <FaExchangeAlt aria-hidden="true" />
        </button>
      )}
    </div>
  </label>
);

const CurrencySelect = ({ value, onChange, disabled = false }) => (
  <select
    value={value || DEFAULT_TRAVEL_CURRENCY}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    className={selectClass}
  >
    {travelBookingCurrencyOptions.map((option) => (
      <option key={option.value} value={option.value}>
        {t(option.labelKey)}
      </option>
    ))}
  </select>
);

const SectionHeader = ({ icon: Icon, title, tone = 'cyan', action = null }) => {
  const tones = {
    cyan: 'from-cyan-50 via-white to-sky-50 text-cyan-700 border-cyan-100',
    emerald: 'from-emerald-50 via-white to-teal-50 text-emerald-700 border-emerald-100',
    amber: 'from-amber-50 via-white to-orange-50 text-amber-700 border-amber-100',
    violet: 'from-violet-50 via-white to-indigo-50 text-violet-700 border-violet-100',
  };

  const toneClass = tones[tone] || tones.cyan;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-r px-3 py-2.5 sm:px-4 ${toneClass}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
          <Icon aria-hidden="true" />
        </span>

        <h2 className="truncate text-sm font-black text-slate-900">{title}</h2>
      </div>

      {action}
    </div>
  );
};

const MiniTotal = ({ labelKey, label = '', value, accent = 'text-slate-900', icon: Icon = FaCoins }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3 py-2.5 shadow-sm">
    <div className="flex items-center gap-2">
      <Icon aria-hidden="true" className="flex-shrink-0 text-xs text-slate-400" />

      <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
        {label || t(labelKey)}
      </p>
    </div>

    <p className={`mt-1 truncate text-sm font-black ${accent}`}>{value}</p>
  </div>
);

const TravelBookingFormPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const routePrefillAppliedRef = useRef(false);
  const lazyReferenceLoadedRef = useRef({});
  const quickAddLocksRef = useRef(new Set());
  const customerTravelerLocksRef = useRef(new Set());
  const hotelModalDraftRef = useRef(null);
  const extraPaymentConfirmationRef = useRef(false);
  const lastSavedFingerprintRef = useRef('');
  const pendingSubmitOptionsRef = useRef(null);
  const bookingSubmitLockRef = useRef(false);
  const documentActionLockRef = useRef(false);

  const isEditMode = Boolean(id);

  const canCreate = hasPermission('travel.bookings.create');
  const canEdit = hasPermission('travel.bookings.edit');
  const canManageTravelers = hasPermission('travel.travelers.manage');
  const canManageServices = hasPermission('travel.services.manage');
  const canManageHotels = hasPermission('travel.hotels.manage');
  const canManageVendors = hasPermission('travel.vendors.manage');
  const canManageSettings = hasPermission('travel.settings');

  const [formState, setFormState] = useState(() => createInitialBookingForm('air_ticket'));
  const [showServiceAndTitle, setShowServiceAndTitle] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [documentActionLoading, setDocumentActionLoading] = useState(false);
  const [documentPrompt, setDocumentPrompt] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [parties, setParties] = useState([]);
  const [travelers, setTravelers] = useState([]);
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [cities, setCities] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [airports, setAirports] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [currencySettings, setCurrencySettings] = useState(null);
  const [reminderBusinessSettings, setReminderBusinessSettings] = useState(null);

  const [expandedItems, setExpandedItems] = useState({});
  const [openRowVendorKeys, setOpenRowVendorKeys] = useState({});
  const [collapsedSectorKeys, setCollapsedSectorKeys] = useState({});
  const [reminderPanelOpen, setReminderPanelOpen] = useState(false);

  const [modal, setModal] = useState(null);
  const [modalValues, setModalValues] = useState({});
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [advanceConfirmationStatus, setAdvanceConfirmationStatus] = useState('');
  const [repostConfirmation, setRepostConfirmation] = useState(null);
  const [duplicateTravelerPrompt, setDuplicateTravelerPrompt] = useState(null);
  const [matchingTravelersPrompt, setMatchingTravelersPrompt] = useState(null);
  const [customerTravelerBusy, setCustomerTravelerBusy] = useState({});
  const [resolvedCustomerTravelerIds, setResolvedCustomerTravelerIds] = useState({});
  const [rateModal, setRateModal] = useState(null);
  const [rateModalSaving, setRateModalSaving] = useState(false);
  const [rateModalError, setRateModalError] = useState('');

  const postedInvoiceEditing = Boolean(isEditMode && formState.accountingPosted);
  const accountingLocked = Boolean(formState.accountingPosted && !isEditMode);

  const persistedDraftState = useMemo(() => sanitizeDraftState(formState), [formState]);

  const draftKey = useMemo(() => (!isEditMode ? getTravelBookingDraftKey() : null), [isEditMode]);

  const { clear: clearDraft } = useFormPersist(
    draftKey,
    persistedDraftState,
    (restored) =>
      setFormState((current) => ({
        ...current,
        ...(restored || {}),
      })),
    {
      enabled: !isEditMode,
      expiryHours: 12,
      delay: 600,

      shouldSave: (value) =>
        Boolean(
          value?.customerId ||
          value?.customerPartyId ||
          value?.notes ||
          value?.receivedAmount ||
          value?.vendorPayments?.some((payment) => payment?.paidAmount || payment?.accountId) ||
          value?.bookingItems?.some(
            (item) =>
              item.title ||
              item.serviceId ||
              item.costPrice ||
              item.sellingPrice ||
              item.vendorPaidAmount ||
              item.vendorPartyId ||
              item.paxPricing?.some(
                (row) => row?.costPrice || row?.sellingPrice || row?.vendorId || row?.vendorPartyId
              )
          )
        ),
    }
  );

  const ensureReferenceLoaded = useCallback(async (key, options = {}) => {
    if (!key) {
      return;
    }

    if (!options.forceRefresh && lazyReferenceLoadedRef.current[key]) {
      return;
    }

    lazyReferenceLoadedRef.current[key] = true;

    try {
      if (key === 'travelers') {
        const data = await fetchTravelers({}, options);
        setTravelers((current) => mergeReferenceRecords(current, data));
      }

      if (key === 'hotels') {
        const data = await fetchTravelHotels({}, options);
        setHotels((current) => mergeReferenceRecords(current, data));
      }

      if (key === 'cities') {
        const data = await fetchTravelCities({}, options);
        setCities((current) => mergeReferenceRecords(current, data));
      }

      if (key === 'airlines') {
        const data = await fetchTravelAirlines({}, options);
        setAirlines((current) => mergeReferenceRecords(current, data));
      }

      if (key === 'airports') {
        const data = await fetchTravelAirports({}, options);
        setAirports((current) => mergeReferenceRecords(current, data));
      }
    } catch (error) {
      lazyReferenceLoadedRef.current[key] = false;
      console.error('Travel invoice optional reference failed:', key, error);
    }
  }, []);

  const ensureReferencesLoaded = useCallback(
    (keys = [], options = {}) => {
      const uniqueKeys = [...new Set((keys || []).filter(Boolean))];

      if (uniqueKeys.length === 0) {
        return Promise.resolve();
      }

      return Promise.all(uniqueKeys.map((key) => ensureReferenceLoaded(key, options))).then(
        () => undefined
      );
    },
    [ensureReferenceLoaded]
  );

  const routePrefill = location.state?.travelBookingPrefill || null;

  useEffect(() => {
    if (isEditMode || !routePrefill || routePrefillAppliedRef.current) {
      return;
    }

    routePrefillAppliedRef.current = true;
    clearDraft();

    const preparedPrefill = prepareBookingForForm(routePrefill);

    setFormState(preparedPrefill);
    void ensureReferencesLoaded(getBookingOptionalReferenceKeys(preparedPrefill));
  }, [clearDraft, ensureReferencesLoaded, isEditMode, routePrefill]);

  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setFormError('');

      const [
        customerData,
        partyData,
        categoryData,
        serviceData,
        vendorData,
        accountData,
        currencyData,
        reminderSettingsData,
      ] = await Promise.all([
        fetchTravelCustomers(),
        fetchTravelParties(),
        fetchTravelServiceCategories(),
        fetchTravelServices(),
        fetchTravelVendors(),
        fetchTravelPaymentAccounts(),
        fetchTravelCurrencySettings(),
        fetchTravelReminderSettings(),
      ]);

      setCustomers(Array.isArray(customerData) ? customerData : []);
      setParties(Array.isArray(partyData) ? partyData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setServices(Array.isArray(serviceData) ? serviceData : []);
      setVendors(Array.isArray(vendorData) ? vendorData : []);
      setPaymentAccounts(Array.isArray(accountData) ? accountData : []);
      setCurrencySettings(currencyData || null);
      setReminderBusinessSettings(reminderSettingsData || null);
      Object.assign(lazyReferenceLoadedRef.current, {
        customers: true,
        parties: true,
        categories: true,
        services: true,
        vendors: true,
        paymentAccounts: true,
      });
      setFormState((current) => {
        const currencyRateSnapshot =
          !isEditMode && !(current.currencyRateSnapshot || []).length
            ? captureCurrencyRateSnapshot(currencyData)
            : current.currencyRateSnapshot;
        const currentReminder = normalizeReminderSettingsForForm(current.reminderSettings);

        if (currentReminder.inheritBusinessDefaults === false) {
          return { ...current, currencyRateSnapshot };
        }

        return {
          ...current,
          currencyRateSnapshot,
          reminderSettings: normalizeReminderSettingsForForm({
            inheritBusinessDefaults: true,
            automaticRemindersEnabled: reminderSettingsData?.automaticRemindersEnabled,
            defaultLeadMinutes: reminderSettingsData?.defaultLeadMinutes,
            emailEnabled: reminderSettingsData?.emailEnabled,
            whatsappEnabled: reminderSettingsData?.whatsappEnabled,
          }),
        };
      });
    } catch (error) {
      console.error('Travel invoice references failed:', error);
      setFormError(t('travel.booking.alerts.referencesFailed'));
    } finally {
      setLoading(false);
    }
  }, [isEditMode]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    const loadBooking = async () => {
      try {
        setLoading(true);
        setFormError('');

        const [booking, latestReminderSettings, latestCurrencySettings] = await Promise.all([
          fetchTravelBookingById(id),
          fetchTravelReminderSettings(),
          fetchTravelCurrencySettings(),
        ]);

        const preparedBooking = prepareBookingForForm(booking, latestCurrencySettings);

        const bookingReminder = normalizeReminderSettingsForForm(preparedBooking.reminderSettings);

        const finalBooking =
          bookingReminder.inheritBusinessDefaults !== false
            ? {
                ...preparedBooking,
                reminderSettings: normalizeReminderSettingsForForm({
                  inheritBusinessDefaults: true,
                  automaticRemindersEnabled: latestReminderSettings?.automaticRemindersEnabled,
                  defaultLeadMinutes: latestReminderSettings?.defaultLeadMinutes,
                  emailEnabled: latestReminderSettings?.emailEnabled,
                  whatsappEnabled: latestReminderSettings?.whatsappEnabled,
                }),
              }
            : preparedBooking;

        setReminderBusinessSettings(latestReminderSettings || null);
        setCurrencySettings(latestCurrencySettings || null);
        setFormState(finalBooking);
        lastSavedFingerprintRef.current = createTravelBookingFormFingerprint(finalBooking);

        void ensureReferencesLoaded(getBookingOptionalReferenceKeys(finalBooking));
      } catch (error) {
        console.error('Travel invoice load failed:', error);
        setFormError(t('travel.booking.alerts.loadOneFailed'));
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [ensureReferencesLoaded, id, isEditMode]);

  const vendorCostSummary = useMemo(
    () => deriveVendorCostGroups(formState, currencySettings),
    [currencySettings, formState]
  );

  const effectiveVendorPayments = useMemo(
    () =>
      vendorCostSummary.groups.map((group) => {
        const current = (formState.vendorPayments || []).find(
          (payment) => getVendorCounterpartyKey(payment) === group.key
        );

        return {
          vendorType: group.vendorType,
          vendorId: group.vendorId,
          vendorPartyId: group.vendorPartyId,
          paidAmount: current?.paidAmount ?? '',
          paymentType: current?.paymentType || 'cash',
          accountId: current?.accountId || '',
        };
      }),
    [formState.vendorPayments, vendorCostSummary.groups]
  );

  const localTotals = useMemo(
    () =>
      calculateLocalTotals(
        { ...formState, vendorPayments: effectiveVendorPayments },
        currencySettings
      ),
    [currencySettings, effectiveVendorPayments, formState]
  );

  const baseCurrency = currencySettings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY;
  const defaultCurrencyRates = useMemo(
    () => normalizeDualCurrencyRates(currencySettings),
    [currencySettings]
  );

  const buildCurrencyRateModal = ({
    currency,
    side,
    sourceAmount = 0,
    required = false,
    nextSide = null,
    snapshot = formState.currencyRateSnapshot,
  }) => {
    const code = String(currency || baseCurrency).toUpperCase();
    const defaultRow = defaultCurrencyRates.find((row) => row.currency === code);
    return {
      currency: code,
      side,
      sourceAmount,
      required,
      nextSide,
      currentInvoiceRate: getInvoiceCurrencyRate(snapshot, code, side, baseCurrency),
      currentDefaultRate:
        side === 'cost' ? defaultRow?.costRateToBase || 0 : defaultRow?.saleRateToBase || 0,
    };
  };

  const openCurrencyRateModal = ({
    currency,
    side,
    sourceAmount = 0,
    required = false,
    nextSide = null,
  }) => {
    const code = String(currency || baseCurrency).toUpperCase();
    if (code === String(baseCurrency).toUpperCase() || rateModal) return;
    const currentInvoiceRate = getInvoiceCurrencyRate(
      formState.currencyRateSnapshot,
      code,
      side,
      baseCurrency
    );
    if (required && currentInvoiceRate > 0) return;
    setRateModalError('');
    setRateModal(buildCurrencyRateModal({
      currency: code,
      side,
      sourceAmount,
      required,
      nextSide,
    }));
  };

  const promptForMissingCurrencyRates = (currency) => {
    if (rateModal) return;
    const missingSides = getMissingInvoiceCurrencyRateSides(
      formState.currencyRateSnapshot,
      currency,
      baseCurrency
    );
    if (!missingSides.length) return;
    openCurrencyRateModal({
      currency,
      side: missingSides[0],
      required: true,
      nextSide: missingSides[1] || null,
    });
  };

  const applyCurrencyRate = async (rate, makeDefault) => {
    if (!rateModal || rateModalSaving) return;
    try {
      setRateModalSaving(true);
      setRateModalError('');
      if (makeDefault) {
        const savedSettings = await updateTravelCurrencyDefaultRate(
          rateModal.currency,
          rateModal.side,
          rate
        );
        setCurrencySettings(savedSettings);
      }
      const nextSnapshot = updateInvoiceCurrencyRate(
        formState.currencyRateSnapshot,
        rateModal.currency,
        rateModal.side,
        rate
      );
      setFormState((current) => ({
        ...current,
        currencyRateSnapshot: updateInvoiceCurrencyRate(
          current.currencyRateSnapshot,
          rateModal.currency,
          rateModal.side,
          rate
        ),
      }));
      if (rateModal.nextSide) {
        setRateModal(buildCurrencyRateModal({
          currency: rateModal.currency,
          side: rateModal.nextSide,
          required: true,
          snapshot: nextSnapshot,
        }));
      } else {
        setRateModal(null);
      }
    } catch (error) {
      console.error('Travel invoice conversion rate update failed:', error);
      setRateModalError(
        error?.response?.data?.message || 'Conversion rate could not be updated.'
      );
    } finally {
      setRateModalSaving(false);
    }
  };

  const activeCustomers = useMemo(() => customers.filter(isRecordActive), [customers]);

  const activeParties = useMemo(() => parties.filter(isRecordActive), [parties]);

  const customerCounterparties = useMemo(
    () => [
      ...activeCustomers.map((customerRecord) =>
        buildCounterpartyOption(customerRecord, 'customer')
      ),
      ...activeParties
        .filter((party) => ['customer', 'both'].includes(party.role || 'both'))
        .map((party) => buildCounterpartyOption(party, 'party')),
    ],
    [activeCustomers, activeParties]
  );

  const activeTravelers = useMemo(() => travelers.filter(isRecordActive), [travelers]);

  const activeServices = useMemo(() => services.filter(isRecordActive), [services]);

  const activeHotels = useMemo(() => hotels.filter(isRecordActive), [hotels]);

  const activeCities = useMemo(() => cities.filter(isRecordActive), [cities]);

  const activeAirlines = useMemo(() => airlines.filter(isRecordActive), [airlines]);

  const activeAirports = useMemo(() => airports.filter(isRecordActive), [airports]);

  const activeVendors = useMemo(() => vendors.filter(isRecordActive), [vendors]);

  const vendorCounterparties = useMemo(
    () => [
      ...activeVendors.map((vendorRecord) => buildCounterpartyOption(vendorRecord, 'vendor')),
      ...activeParties
        .filter((party) => ['supplier', 'both'].includes(party.role || 'both'))
        .map((party) => buildCounterpartyOption(party, 'party')),
    ],
    [activeVendors, activeParties]
  );

  const totals = useMemo(() => {
    const invoiceSummary = calculateInvoicePaymentSummary({
      localTotals,
      vendorGroups: vendorCostSummary.groups,
      vendorPayments: effectiveVendorPayments,
    });
    return {
      ...localTotals,
      ...invoiceSummary,
      vendorPaid: invoiceSummary.vendorPaidNow,
    };
  }, [effectiveVendorPayments, localTotals, vendorCostSummary.groups]);

  const advanceWarnings = useMemo(() => {
    const customerName = customerCounterparties.find(
      (record) => record._id === getCustomerCounterpartyValue(formState)
    )?.name || 'Customer';
    const vendorNames = Object.fromEntries(
      vendorCounterparties.map((record) => [record._id, getVendorLabel(record)])
    );
    return buildInvoiceExtraPaymentWarnings(totals, { customerName, vendorNames });
  }, [customerCounterparties, formState, totals, vendorCounterparties]);

  const modalFields = useMemo(() => {
    if (!modal) {
      return [];
    }

    if (modal.type === 'service') {
      return modal.mode === 'details' ? serviceFields : quickServiceFields;
    }

    if (modal.type === 'category') {
      return modal.mode === 'details' ? [] : quickCategoryFields;
    }

    if (modal.type === 'hotel') {
      return modal.mode === 'details' ? [] : quickHotelFields;
    }

    return [];
  }, [modal]);

  const updateRoot = (field, value) => {
    setFormState((current) =>
      field === 'receivedAmount'
        ? applyCustomerReceiptAmountChange(current, value)
        : {
            ...current,
            [field]: value,
          }
    );
  };

  const updateVendorPayment = (vendorKey, field, value) => {
    setFormState((current) => {
      const existing = (current.vendorPayments || []).find(
        (payment) => getVendorCounterpartyKey(payment) === vendorKey
      );
      const group = vendorCostSummary.groups.find((candidate) => candidate.key === vendorKey);

      if (!group) {
        return current;
      }

      const nextPayment = {
        vendorType: group.vendorType,
        vendorId: group.vendorId,
        vendorPartyId: group.vendorPartyId,
        paidAmount: existing?.paidAmount ?? '',
        paymentType: existing?.paymentType || 'cash',
        accountId: existing?.accountId || '',
        [field]: value,
      };

      return {
        ...current,
        vendorPayments: [
          ...(current.vendorPayments || []).filter(
            (payment) => getVendorCounterpartyKey(payment) !== vendorKey
          ),
          nextPayment,
        ],
      };
    });
  };

  const updateReminderSettings = (value) => {
    setFormState((current) => ({
      ...current,
      reminderSettings: normalizeReminderSettingsForForm(value),
    }));
  };

  const updateItem = (index, updater) => {
    setFormState((current) => {
      const bookingItems = [...(current.bookingItems || [])];

      const currentItem = bookingItems[index] || createEmptyBookingItem();

      bookingItems[index] = typeof updater === 'function' ? updater(currentItem) : updater;

      return {
        ...current,

        serviceType:
          bookingItems.length === 1 ? bookingItems[0]?.itemType || current.serviceType : 'mixed',

        bookingItems,
      };
    });
  };

  const updateItemCurrency = (itemIndex, currency) => {
    updateItem(itemIndex, (currentItem) => ({
      ...currentItem,
      costCurrency: currency,
      sellingCurrency: currency,
    }));
    promptForMissingCurrencyRates(currency);
  };

  const updateUmrahComponentCurrency = (itemIndex, componentIndex, currency) => {
    updateItem(itemIndex, (currentItem) => {
      const nextUmrah = { ...(currentItem.umrahDetails || {}) };
      const nextComponents = [...(nextUmrah.components || [])];
      nextComponents[componentIndex] = {
        ...nextComponents[componentIndex],
        costCurrency: currency,
        sellingCurrency: currency,
      };
      return {
        ...currentItem,
        umrahDetails: { ...nextUmrah, components: nextComponents },
      };
    });
    promptForMissingCurrencyRates(currency);
  };

  const updateItemField = (index, field, value) => {
    updateItem(index, (item) => {
      if (field === 'itemType') {
        const nextItem = {
          ...item,
          itemType: value,
        };

        if (
          ['air_ticket', 'visit_visa', 'umrah_package'].includes(value) &&
          (!Array.isArray(nextItem.paxPricing) || nextItem.paxPricing.length === 0)
        ) {
          nextItem.paxPricing = [
            {
              ...createEmptyPaxPricingRow('adult'),
              costPrice: nextItem.costPrice ?? '',
              sellingPrice: nextItem.sellingPrice ?? '',
            },
          ];
        }

        if (
          value === 'hotel' &&
          (!Array.isArray(nextItem.hotelDetails?.roomPricing) ||
            nextItem.hotelDetails.roomPricing.length === 0)
        ) {
          nextItem.hotelDetails = {
            ...(nextItem.hotelDetails || {}),

            chargePerRoom: false,

            roomPricing: [
              {
                ...createEmptyHotelRoomPricingRow('double'),
                occupancy: 2,
              },
            ],
          };
        }

        if (
          ['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(value)
        ) {
          nextItem.quantityPricing = {
            quantity: nextItem.quantityPricing?.quantity ?? 1,

            unitLabel: nextItem.quantityPricing?.unitLabel || 'Quantity',

            costPrice: nextItem.quantityPricing?.costPrice ?? nextItem.costPrice ?? '',

            sellingPrice: nextItem.quantityPricing?.sellingPrice ?? nextItem.sellingPrice ?? '',
          };
        }

        return nextItem;
      }

      return {
        ...item,
        [field]: value,
      };
    });
  };

  const updatePaxPricingRow = (itemIndex, rowIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const rows = Array.isArray(item.paxPricing) ? item.paxPricing.map((row) => ({ ...row })) : [];

      if (!rows[rowIndex]) {
        return item;
      }

      rows[rowIndex] = { ...rows[rowIndex], [field]: value };

      return {
        ...item,
        paxPricing: rows,
      };
    });
  };

  const addPaxPricingRow = (itemIndex, rowIndex, paxType) => {
    updateItem(itemIndex, (item) => {
      const rows = Array.isArray(item.paxPricing) ? item.paxPricing.map((row) => ({ ...row })) : [];
      const insertAt = Number.isInteger(rowIndex) ? rowIndex + 1 : rows.length;
      rows.splice(insertAt, 0, { ...createEmptyPaxPricingRow(paxType), count: 1 });

      return {
        ...item,
        paxPricing: rows,
      };
    });
  };

  const removePaxPricingRow = (itemIndex, rowIndex) => {
    updateItem(itemIndex, (item) => {
      const rows = (item.paxPricing || []).filter((_, index) => index !== rowIndex);
      return {
        ...item,
        paxPricing: rows.length ? rows : [createEmptyPaxPricingRow('adult')],
      };
    });
  };

  const updatePaxRowVendorCounterparty = (itemIndex, rowIndex, value, record) => {
    const selection = getCounterpartySelection(value, record, 'vendor');

    updateItem(itemIndex, (item) => {
      const rows = (item.paxPricing || []).map((row, index) =>
        index === rowIndex ? applyVendorCounterpartyToItem(row, selection) : { ...row }
      );
      const rowModeActive = rows.some((row) => Boolean(row.vendorId || row.vendorPartyId));

      return {
        ...item,
        ...(rowModeActive ? { vendorType: 'vendor', vendorId: '', vendorPartyId: '' } : {}),
        paxPricing: rows,
      };
    });
  };

  const updateJourneyType = (itemIndex, journeyType) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = { ...(item.ticketDetails || {}), journeyType };

      if (journeyType === 'multi_city' && !(ticketDetails.sectors || []).length) {
        const firstSector = {
          ...createEmptyMultiCitySector(),
          airline: ticketDetails.airline || '',
          airlineId: ticketDetails.airlineId || '',
          origin: ticketDetails.origin || '',
          originAirportId: ticketDetails.originAirportId || '',
          destination: ticketDetails.destination || '',
          destinationAirportId: ticketDetails.destinationAirportId || '',
          departureDateTime: ticketDetails.departureDateTime || '',
          vendorType: item.vendorType || 'vendor',
          vendorId: item.vendorId || '',
          vendorPartyId: item.vendorPartyId || '',
          paxPricing: (item.paxPricing || []).map((row) => ({ ...row })),
        };
        const secondSector = createEmptyMultiCitySector(firstSector.destination || '');
        ticketDetails.sectors = [firstSector, secondSector];
      }

      return { ...item, ticketDetails };
    });
  };

  const updateMultiCitySector = (itemIndex, sectorIndex, updates) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = { ...(item.ticketDetails || {}) };
      const sectors = (ticketDetails.sectors || []).map((sector, index) =>
        index === sectorIndex
          ? { ...sector, legacyFallback: false, ...updates }
          : { ...sector }
      );
      return { ...item, ticketDetails: { ...ticketDetails, sectors } };
    });
  };

  const addMultiCitySector = (itemIndex) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = { ...(item.ticketDetails || {}) };
      const sectors = appendMultiCitySector(ticketDetails.sectors || []);
      return { ...item, ticketDetails: { ...ticketDetails, sectors } };
    });
  };

  const removeMultiCitySector = (itemIndex, sectorIndex) => {
    updateItem(itemIndex, (item) => ({
      ...item,
      ticketDetails: {
        ...(item.ticketDetails || {}),
        sectors: removeMultiCitySectorAt(item.ticketDetails?.sectors || [], sectorIndex),
      },
    }));
  };

  const updateMultiCitySectorVendor = (itemIndex, sectorIndex, value, record) => {
    updateMultiCitySector(
      itemIndex,
      sectorIndex,
      applyVendorCounterpartyToItem(
        {},
        getCounterpartySelection(value, record, 'vendor')
      )
    );
  };

  const updateMultiCityPricingRow = (itemIndex, sectorIndex, rowIndex, updates) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = { ...(item.ticketDetails || {}) };
      const sectors = (ticketDetails.sectors || []).map((sector, index) => {
        if (index !== sectorIndex) return { ...sector };
        const paxPricing = (sector.paxPricing || []).map((row, priceIndex) =>
          priceIndex === rowIndex ? { ...row, ...updates } : { ...row }
        );
        return { ...sector, legacyFallback: false, paxPricing };
      });
      return { ...item, ticketDetails: { ...ticketDetails, sectors } };
    });
  };

  const addMultiCityPricingRow = (itemIndex, sectorIndex, paxType, rowIndex = null) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = { ...(item.ticketDetails || {}) };
      const sectors = insertMultiCityPricingRow(
        ticketDetails.sectors || [],
        sectorIndex,
        paxType,
        rowIndex
      );
      return { ...item, ticketDetails: { ...ticketDetails, sectors } };
    });
  };

  const removeMultiCityPricingRow = (itemIndex, sectorIndex, rowIndex) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = { ...(item.ticketDetails || {}) };
      const sectors = removeMultiCityPricingRowAt(
        ticketDetails.sectors || [],
        sectorIndex,
        rowIndex
      );
      return { ...item, ticketDetails: { ...ticketDetails, sectors } };
    });
  };

  const updateMultiCityRowVendor = (itemIndex, sectorIndex, rowIndex, value, record) => {
    updateMultiCityPricingRow(
      itemIndex,
      sectorIndex,
      rowIndex,
      applyVendorCounterpartyToItem({}, getCounterpartySelection(value, record, 'vendor'))
    );
  };

  const updateQuantityPricing = (itemIndex, field, value) => {
    updateItem(itemIndex, (item) => ({
      ...item,

      quantityPricing: {
        ...(item.quantityPricing || {
          quantity: 1,
          unitLabel: 'Quantity',
          costPrice: '',
          sellingPrice: '',
        }),

        [field]: value,
      },
    }));
  };

  const updateHotelRoomPricingRow = (itemIndex, roomIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const hotelDetails = {
        ...(item.hotelDetails || {}),
      };

      const roomPricing = Array.isArray(hotelDetails.roomPricing)
        ? hotelDetails.roomPricing.map((row) => ({ ...row }))
        : [];

      if (!roomPricing[roomIndex]) {
        return item;
      }

      const nextRoom = {
        ...roomPricing[roomIndex],
        [field]: value,
      };

      if (field === 'roomType') {
        const occupancyMap = {
          single: 1,
          double: 2,
          twin: 2,
          triple: 3,
          quad: 4,
          quint: 5,
          '5_sharing': 5,
          '6_sharing': 6,
          '7_sharing': 7,
          '8_sharing': 8,
        };

        if (occupancyMap[value]) {
          nextRoom.occupancy = occupancyMap[value];
        } else if (['family', 'sharing', 'custom'].includes(value)) {
          nextRoom.occupancy = '';
        }
      }

      roomPricing[roomIndex] = nextRoom;

      return {
        ...item,

        hotelDetails: {
          ...hotelDetails,
          roomPricing,
        },
      };
    });
  };

  const addHotelRoomPricingRow = (itemIndex) => {
    updateItem(itemIndex, (item) => ({
      ...item,

      hotelDetails: {
        ...(item.hotelDetails || {}),

        chargePerRoom: item.hotelDetails?.chargePerRoom === true,

        roomPricing: [
          ...(item.hotelDetails?.roomPricing || []),

          {
            ...createEmptyHotelRoomPricingRow('double'),
            occupancy: 2,
          },
        ],
      },
    }));
  };

  const removeHotelRoomPricingRow = (itemIndex, roomIndex) => {
    updateItem(itemIndex, (item) => ({
      ...item,

      hotelDetails: {
        ...(item.hotelDetails || {}),

        roomPricing: (item.hotelDetails?.roomPricing || []).filter(
          (_, index) => index !== roomIndex
        ),
      },
    }));
  };

  const calculateHotelNightsForForm = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) {
      return '';
    }

    const start = new Date(`${checkIn}T00:00:00`);
    const end = new Date(`${checkOut}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return '';
    }

    return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  };

  const updateHotelDate = (itemIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const hotelDetails = {
        ...(item.hotelDetails || {}),
        [field]: value,
      };

      hotelDetails.nights = calculateHotelNightsForForm(
        hotelDetails.checkIn,
        hotelDetails.checkOut
      );

      return {
        ...item,
        hotelDetails,
      };
    });
  };

  const createCityInline = async (name) => {
    try {
      const saved = await createTravelCity({ name });
      setCities((current) => upsertRecord(current, saved));
      return saved;
    } catch (error) {
      setFormError(error?.response?.data?.message || t('travel.cities.createFailed'));
      throw error;
    }
  };

  const updateHotelCity = (itemIndex, city) => {
    updateItem(itemIndex, (item) => ({
      ...item,
      hotelDetails: applyHotelCityChange(item.hotelDetails || {}, city, activeHotels),
    }));
  };

  const selectHotelForItem = (itemIndex, hotel) => {
    updateItem(itemIndex, (item) => ({
      ...item,
      hotelDetails: applyHotelSelection(item.hotelDetails || {}, hotel),
    }));
  };

  const updateItemDetails = (index, group, field, value) => {
    updateItem(index, (item) => ({
      ...item,

      [group]: {
        ...(item[group] || {}),
        [field]: value,
      },
    }));
  };

  const updateItemDetailFields = (index, group, updates = {}) => {
    updateItem(index, (item) => ({
      ...item,

      [group]: {
        ...(item[group] || {}),
        ...updates,
      },
    }));
  };

  const updateTicketMasterSelection = (itemIndex, idField, textField, record, getText) => {
    updateItemDetailFields(itemIndex, 'ticketDetails', {
      [idField]: record ? getRecordId(record) : '',
      [textField]: record ? getText(record) : '',
    });
  };

  const updateUmrahComponent = (itemIndex, componentIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      if (field === 'componentType') {
        const currentComponent = components[componentIndex];

        const nextComponent = {
          ...createEmptyUmrahComponent(value),

          label: currentComponent.label || '',

          vendorId: currentComponent.vendorId || '',

          hotelId: value === 'hotel' ? currentComponent.hotelId || '' : '',

          serviceId: ['service', 'other'].includes(value) ? currentComponent.serviceId || '' : '',

          costCurrency:
            currentComponent.costCurrency ||
            currentComponent.sellingCurrency ||
            DEFAULT_TRAVEL_CURRENCY,

          sellingCurrency:
            currentComponent.costCurrency ||
            currentComponent.sellingCurrency ||
            DEFAULT_TRAVEL_CURRENCY,

          vendorPaidAmount: '',

          notes: currentComponent.notes || '',
        };

        if (
          ['air_ticket', 'visit_visa'].includes(value) &&
          umrahDetails.syncPassengerCountsToComponents !== false &&
          Array.isArray(item.paxPricing) &&
          item.paxPricing.length > 0
        ) {
          nextComponent.paxPricing = item.paxPricing.map((row) => ({
            paxType: row.paxType,

            count: row.count ?? 0,

            costPrice: '',

            sellingPrice: '',
          }));
        }

        components[componentIndex] = nextComponent;
      } else {
        components[componentIndex] = {
          ...components[componentIndex],

          [field]: value,
        };
      }

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const updateUmrahComponentPaxRow = (itemIndex, componentIndex, paxType, field, value) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      const component = {
        ...components[componentIndex],
      };

      const rows = Array.isArray(component.paxPricing)
        ? component.paxPricing.map((row) => ({ ...row }))
        : [];

      const rowIndex = rows.findIndex((row) => row?.paxType === paxType);

      if (rowIndex === -1) {
        rows.push({
          ...createEmptyPaxPricingRow(paxType),

          [field]: value,
        });
      } else {
        rows[rowIndex] = {
          ...rows[rowIndex],

          [field]: value,
        };
      }

      components[componentIndex] = {
        ...component,

        paxPricing: rows,
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const addUmrahComponentPaxRow = (itemIndex, componentIndex, paxType) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      const component = {
        ...components[componentIndex],
      };

      const rows = Array.isArray(component.paxPricing)
        ? component.paxPricing.map((row) => ({ ...row }))
        : [];

      if (rows.some((row) => row?.paxType === paxType)) {
        return item;
      }

      components[componentIndex] = {
        ...component,

        paxPricing: [...rows, createEmptyPaxPricingRow(paxType)],
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const removeUmrahComponentPaxRow = (itemIndex, componentIndex, paxType) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      components[componentIndex] = {
        ...components[componentIndex],

        paxPricing: (components[componentIndex].paxPricing || []).filter(
          (row) => row?.paxType !== paxType
        ),
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const updateUmrahQuantityPricing = (itemIndex, componentIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      components[componentIndex] = {
        ...components[componentIndex],

        quantityPricing: {
          ...(components[componentIndex].quantityPricing || {
            quantity: 1,
            unitLabel: 'Quantity',
            costPrice: '',
            sellingPrice: '',
          }),

          [field]: value,
        },
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const updateUmrahHotelPricingField = (itemIndex, componentIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      components[componentIndex] = {
        ...components[componentIndex],

        hotelPricing: clearUmrahHotelPricingBreakdown({
          ...(components[componentIndex].hotelPricing || {
            nights: '',
            chargePerRoom: false,
            roomPricing: [],
          }),

          [field]: value,
        }),
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const updateUmrahHotelRoomRow = (itemIndex, componentIndex, roomIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      const component = {
        ...components[componentIndex],
      };

      const hotelPricing = {
        ...(component.hotelPricing || {
          nights: '',
          chargePerRoom: false,
          roomPricing: [],
        }),
      };

      const roomPricing = Array.isArray(hotelPricing.roomPricing)
        ? hotelPricing.roomPricing.map((row) => ({ ...row }))
        : [];

      if (!roomPricing[roomIndex]) {
        return item;
      }

      const nextRoom = {
        ...roomPricing[roomIndex],

        [field]: value,
      };

      if (field === 'roomType') {
        const occupancyMap = {
          single: 1,
          double: 2,
          twin: 2,
          triple: 3,
          quad: 4,
          quint: 5,
          '5_sharing': 5,
          '6_sharing': 6,
          '7_sharing': 7,
          '8_sharing': 8,
        };

        if (occupancyMap[value]) {
          nextRoom.occupancy = occupancyMap[value];
        } else if (['family', 'sharing', 'custom'].includes(value)) {
          nextRoom.occupancy = '';
        }
      }

      roomPricing[roomIndex] = nextRoom;

      components[componentIndex] = {
        ...component,

        hotelPricing: clearUmrahHotelPricingBreakdown({
          ...hotelPricing,

          roomPricing,
        }),
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const addUmrahHotelRoomRow = (itemIndex, componentIndex) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      const component = {
        ...components[componentIndex],
      };

      const hotelPricing = {
        ...(component.hotelPricing || {
          nights: '',
          chargePerRoom: false,
          roomPricing: [],
        }),
      };

      components[componentIndex] = {
        ...component,

        hotelPricing: clearUmrahHotelPricingBreakdown({
          ...hotelPricing,

          roomPricing: [
            ...(hotelPricing.roomPricing || []),

            {
              ...createEmptyHotelRoomPricingRow('double'),

              occupancy: 2,
            },
          ],
        }),
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const removeUmrahHotelRoomRow = (itemIndex, componentIndex, roomIndex) => {
    updateItem(itemIndex, (item) => {
      const umrahDetails = {
        ...(item.umrahDetails || {}),
      };

      const components = [...(umrahDetails.components || [])];

      if (!components[componentIndex]) {
        return item;
      }

      const component = {
        ...components[componentIndex],
      };

      const hotelPricing = {
        ...(component.hotelPricing || {}),
      };

      components[componentIndex] = {
        ...component,

        hotelPricing: clearUmrahHotelPricingBreakdown({
          ...hotelPricing,

          roomPricing: (hotelPricing.roomPricing || []).filter((_, index) => index !== roomIndex),
        }),
      };

      return {
        ...item,

        umrahDetails: {
          ...umrahDetails,

          components,
        },
      };
    });
  };

  const addUmrahComponent = (itemIndex) => {
    updateItem(itemIndex, (item) => ({
      ...item,

      umrahDetails: {
        ...(item.umrahDetails || {}),

        packageMode: item.umrahDetails?.packageMode || 'custom_component_package',

        components: [
          ...(item.umrahDetails?.components || []),
          createEmptyUmrahComponent('service'),
        ],
      },
    }));
  };

  const removeUmrahComponent = (itemIndex, componentIndex) => {
    updateItem(itemIndex, (item) => ({
      ...item,

      umrahDetails: {
        ...(item.umrahDetails || {}),

        components: (item.umrahDetails?.components || []).filter(
          (_, index) => index !== componentIndex
        ),
      },
    }));
  };

  const addBookingItem = (itemType = 'service') => {
    setFormState((current) => ({
      ...current,

      serviceType: 'mixed',

      bookingItems: [...(current.bookingItems || []), createEmptyBookingItem(itemType)],
    }));
  };

  const addAnotherHotel = () => {
    const newIndex = (formState.bookingItems || []).length;
    setFormState((current) => appendHotelBookingItem(current, createEmptyBookingItem));
    setExpandedItems((current) => ({ ...current, [newIndex]: true }));
    void ensureReferencesLoaded(['hotels', 'cities']);
    window.setTimeout(() => {
      document.getElementById(`travel-booking-item-${newIndex}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);
  };

  const removeBookingItem = (index) => {
    setFormState((current) => {
      if ((current.bookingItems || []).length <= 1) {
        return current;
      }

      const bookingItems = current.bookingItems.filter((_, itemIndex) => itemIndex !== index);

      return {
        ...current,

        serviceType:
          bookingItems.length === 1 ? bookingItems[0]?.itemType || current.serviceType : 'mixed',

        bookingItems,
      };
    });
  };

  const updateItemVendorCounterparty = (itemIndex, value, record) => {
    const selection = getCounterpartySelection(value, record, 'vendor');

    updateItem(itemIndex, (item) => applyVendorCounterpartyToItem(item, selection));
  };

  const updateUmrahComponentVendorCounterparty = (itemIndex, componentIndex, value, record) => {
    const selection = getCounterpartySelection(value, record, 'vendor');

    setFormState((current) => {
      const bookingItems = [...(current.bookingItems || [])];
      const item = bookingItems[itemIndex];

      if (!item) {
        return current;
      }

      const components = [...(item.umrahDetails?.components || [])];

      if (!components[componentIndex]) {
        return current;
      }

      components[componentIndex] = applyVendorCounterpartyToItem(
        components[componentIndex],
        selection
      );

      bookingItems[itemIndex] = {
        ...item,
        umrahDetails: {
          ...(item.umrahDetails || {}),
          components,
        },
      };

      return {
        ...current,
        bookingItems,
      };
    });
  };

  const addItemTravelerOccurrence = (
    itemIndex,
    travelerId,
    travelerRecord = null,
    { skipIfPresent = false, expectedCustomerId = '' } = {}
  ) => {
    setFormState((current) => {
      if (
        expectedCustomerId &&
        (current.customerType !== 'customer' ||
          String(getRecordId(current.customerId)) !== String(expectedCustomerId))
      ) {
        return current;
      }

      const bookingItems = [...(current.bookingItems || [])];
      const item = bookingItems[itemIndex];
      if (!item) return current;
      const traveler = travelerRecord || activeTravelers.find(
        (record) => String(record._id) === String(travelerId)
      );
      const passengerName = traveler?.fullName || traveler?.name || '';

      const rootTravelers = (current.travelers || []).some(
        (idValue) => String(idValue) === String(travelerId)
      )
        ? current.travelers
        : [...(current.travelers || []), travelerId];

      if (skipIfPresent && itemContainsTraveler(item, travelerId)) {
        return rootTravelers === current.travelers
          ? current
          : { ...current, travelers: rootTravelers };
      }

      bookingItems[itemIndex] = appendTravelerOccurrence(
        item,
        travelerId,
        (id) => ({ ...createEmptyTicketPassenger('adult'), travelerId: id, passengerName }),
        (id) => ({
          ...createEmptyVisaTraveler('adult'),
          travelerId: id,
          passengerName,
          passportNumber: traveler?.passportNumber || '',
        })
      );

      return {
        ...current,
        travelers: rootTravelers,
        bookingItems,
      };
    });
  };

  const requestAddItemTraveler = (itemIndex, travelerId, travelerRecord = null) => {
    const item = formState.bookingItems?.[itemIndex];
    if (!item || !travelerId) return;
    const decision = getTravelerAddDecision(item.travelerIds, travelerId);

    if (!decision.duplicate) {
      addItemTravelerOccurrence(itemIndex, travelerId, travelerRecord);
      return;
    }

    const traveler = travelerRecord || activeTravelers.find(
      (record) => String(record._id) === String(travelerId)
    );
    setDuplicateTravelerPrompt({
      itemIndex,
      travelerId,
      travelerRecord: traveler || null,
      travelerName: traveler ? getTravelerLabel(traveler) : String(travelerId),
    });
  };

  const removeItemTravelerOccurrence = (itemIndex, absoluteIndex) => {
    setFormState((current) => {
      const bookingItems = [...(current.bookingItems || [])];
      if (!bookingItems[itemIndex]) return current;
      bookingItems[itemIndex] = removeTravelerOccurrence(bookingItems[itemIndex], absoluteIndex);
      return { ...current, bookingItems };
    });
  };

  const assignCustomerTravelerToItem = (itemIndex, customerId, traveler) => {
    if (!traveler?._id) return;

    setTravelers((current) => upsertRecord(current, traveler));
    setResolvedCustomerTravelerIds((current) => ({
      ...current,
      [String(customerId)]: traveler._id,
    }));
    addItemTravelerOccurrence(itemIndex, traveler._id, traveler, {
      skipIfPresent: true,
      expectedCustomerId: customerId,
    });
  };

  const handleEnsureCustomerTraveler = async (itemIndex) => {
    if (
      accountingLocked ||
      !canUseCustomerAsTraveler(formState)
    ) {
      return;
    }

    const customerId = getRecordId(formState.customerId);
    const requestKey = `${itemIndex}:${customerId}`;
    const customerLockKey = String(customerId);
    if (customerTravelerLocksRef.current.has(customerLockKey)) return;

    const customer = activeCustomers.find(
      (record) => String(getRecordId(record)) === String(customerId)
    );
    if (!customer) {
      setFormError(t('travel.booking.customerTraveler.customerUnavailable'));
      return;
    }
    if (!String(customer.name || '').trim()) {
      setFormError(t('travel.booking.customerTraveler.customerNameRequired'));
      return;
    }

    customerTravelerLocksRef.current.add(customerLockKey);
    setCustomerTravelerBusy((current) => ({ ...current, [requestKey]: true }));
    setFormError('');

    try {
      const result = await resolveCustomerTraveler({
        customer,
        loadedTravelers: activeTravelers,
        fetchTravelers,
        createTraveler,
        canCreate: canManageTravelers,
      });

      if (result.status === 'forbidden') {
        setFormError(t('travel.booking.customerTraveler.createPermissionDenied'));
        return;
      }
      if (result.status === 'invalid-name') {
        setFormError(t('travel.booking.customerTraveler.customerNameRequired'));
        return;
      }
      if (result.status !== 'resolved' && result.status !== 'choose') {
        setFormError(t('travel.booking.customerTraveler.customerUnavailable'));
        return;
      }

      if (result.status === 'choose') {
        setTravelers((current) => mergeReferenceRecords(current, result.matches));
        setMatchingTravelersPrompt({
          itemIndex,
          customerId,
          customerName: String(customer.name || '').trim(),
          travelers: result.matches,
        });
        return;
      }

      assignCustomerTravelerToItem(itemIndex, customerId, result.traveler);
    } catch (error) {
      console.error('Customer traveler resolution failed:', error);
      setFormError(
        error?.response?.data?.message || t('travel.booking.customerTraveler.resolveFailed')
      );
    } finally {
      customerTravelerLocksRef.current.delete(customerLockKey);
      setCustomerTravelerBusy((current) => ({ ...current, [requestKey]: false }));
    }
  };

  const getCustomerTravelerSelection = (item = {}) => {
    if (!canUseCustomerAsTraveler(formState)) return '';

    const customerId = getRecordId(formState.customerId);
    if (!customerId) return '';

    return getSelectedCustomerTravelerId({
      item,
      customerId,
      resolvedTravelerId: resolvedCustomerTravelerIds[String(customerId)],
      travelers: activeTravelers,
    });
  };

  const selectServiceForItem = (itemIndex, service) => {
    updateItem(itemIndex, (item) => applyServiceDefaults(item, service));
  };

  const toggleItemDetails = (index) => {
    if (!expandedItems[index]) {
      const item = formState.bookingItems?.[index];
      const keys = ['travelers', ...getBookingOptionalReferenceKeys({ bookingItems: [item] })];

      void ensureReferencesLoaded(keys);
    }

    setExpandedItems((current) => ({
      ...current,
      [index]: !current[index],
    }));
  };

  const openModal = (type, mode = 'quick', context = {}) => {
    const defaults = {
      customer:
        { ...emptyCustomerForm, name: context.query || '' },

      traveler: { ...emptyTravelerForm, fullName: context.query || '' },

      service:
        mode === 'details'
          ? {
              ...emptyServiceForm,
              name: context.query || '',
              categoryId: categories[0]?._id || '',
            }
          : createEmptyQuickServiceForm(categories[0]?._id || ''),

      category:
        mode === 'details'
          ? {
              ...emptyCategoryForm,
              name: context.query || '',
            }
          : {
              ...emptyQuickCategoryForm,
              name: context.query || '',
            },

      hotel:
        mode === 'details'
          ? {
              ...emptyHotelForm,
              name: context.query || '',
              city: context.city || '',
            }
          : {
              ...emptyQuickHotel,
              name: context.query || '',
              city: context.city || '',
            },

      vendor:
        { ...emptyVendorForm, name: context.query || '' },
    };

    setModal({
      type,
      mode,
      context,
    });

    setModalValues(defaults[type] || {});

    setModalError('');
  };

  const closeModal = () => {
    setModal(null);
    setModalValues({});
    setModalError('');
  };

  const handleModalChange = (name, value) => {
    setModalValues((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const assignCreatedRecord = (type, record, context = modal?.context || {}) => {
    if (!record?._id) {
      return;
    }

    const itemIndex = context.itemIndex;

    const componentIndex = context.componentIndex;
    const rowIndex = context.rowIndex;
    const sectorIndex = context.sectorIndex;
    const sectorRowIndex = context.sectorRowIndex;

    if (type === 'customer') {
      setCustomers((current) => upsertRecord(current, record));

      setFormState((current) => ({
        ...current,
        customerType: 'customer',
        customerId: record._id,
        customerPartyId: '',
      }));
    }

    if (type === 'traveler') {
      setTravelers((current) => upsertRecord(current, record));
      if (Number.isInteger(itemIndex)) {
        requestAddItemTraveler(itemIndex, record._id, record);
      }
    }

    if (type === 'service') {
      setServices((current) => upsertRecord(current, record));

      if (Number.isInteger(itemIndex) && Number.isInteger(rowIndex)) {
        updatePaxRowVendorCounterparty(
          itemIndex,
          rowIndex,
          `vendor:${record._id}`,
          buildCounterpartyOption(record, 'vendor')
        );
      } else if (Number.isInteger(itemIndex) && Number.isInteger(componentIndex)) {
        updateUmrahComponent(itemIndex, componentIndex, 'serviceId', record._id);
      } else if (Number.isInteger(itemIndex)) {
        selectServiceForItem(itemIndex, record);
      }
    }

    if (type === 'hotel') {
      setHotels((current) => upsertRecord(current, record));

      if (Number.isInteger(itemIndex) && Number.isInteger(componentIndex)) {
        updateUmrahComponent(itemIndex, componentIndex, 'hotelId', record._id);
      } else if (Number.isInteger(itemIndex)) {
        if (!context.group || context.group === 'hotelDetails') {
          selectHotelForItem(itemIndex, record);
        } else {
          updateItemDetails(
            itemIndex,
            context.group,
            context.field || 'hotelId',
            record._id
          );
        }
      }
    }

    if (type === 'vendor') {
      setVendors((current) => upsertRecord(current, record));

      if (
        Number.isInteger(itemIndex) &&
        Number.isInteger(sectorIndex) &&
        Number.isInteger(sectorRowIndex)
      ) {
        updateMultiCityRowVendor(
          itemIndex,
          sectorIndex,
          sectorRowIndex,
          `vendor:${record._id}`,
          buildCounterpartyOption(record, 'vendor')
        );
      } else if (Number.isInteger(itemIndex) && Number.isInteger(sectorIndex)) {
        updateMultiCitySectorVendor(
          itemIndex,
          sectorIndex,
          `vendor:${record._id}`,
          buildCounterpartyOption(record, 'vendor')
        );
      } else if (Number.isInteger(itemIndex) && Number.isInteger(rowIndex)) {
        updatePaxRowVendorCounterparty(
          itemIndex,
          rowIndex,
          `vendor:${record._id}`,
          buildCounterpartyOption(record, 'vendor')
        );
      } else if (Number.isInteger(itemIndex) && Number.isInteger(componentIndex)) {
        updateUmrahComponentVendorCounterparty(
          itemIndex,
          componentIndex,
          `vendor:${record._id}`,
          buildCounterpartyOption(record, 'vendor')
        );
      } else if (Number.isInteger(itemIndex)) {
        updateItemVendorCounterparty(
          itemIndex,
          `vendor:${record._id}`,
          buildCounterpartyOption(record, 'vendor')
        );
      }
    }

    if (type === 'category') {
      setCategories((current) => upsertRecord(current, record));

      setModalValues((current) => ({
        ...current,
        categoryId: record._id,
      }));
    }
  };

  const quickAddRecord = async (type, query, context = {}) => {
    const name = String(query || '').trim();
    if (!name) return null;

    const lockKey = `${type}:${JSON.stringify(context)}:${name.toLowerCase()}`;
    if (quickAddLocksRef.current.has(lockKey)) return null;

    quickAddLocksRef.current.add(lockKey);
    setFormError('');

    try {
      let saved;

      if (type === 'customer') {
        saved = await createBookingCustomerQuick({
          query: name,
          customers,
          createCustomer: createTravelCustomer,
          fetchCustomers: async (...args) => {
            const refreshed = await fetchTravelCustomers(...args);
            setCustomers(Array.isArray(refreshed) ? refreshed : []);
            return refreshed;
          },
        });
        if (!saved) throw new Error(t('travel.booking.alerts.customerDuplicate'));
      } else if (type === 'traveler') {
        saved = await createBookingTravelerQuick({ query: name, createTraveler });
      } else if (type === 'vendor') {
        saved = await createBookingVendorQuick({ query: name, createVendor: createTravelVendor });
      } else {
        return null;
      }

      assignCreatedRecord(type, saved, context);
      return saved;
    } catch (error) {
      console.error(`Travel invoice ${type} quick add failed:`, error);
      setFormError(error?.response?.data?.message || error.message || t('travel.alerts.quickAddFailed'));
      throw error;
    } finally {
      quickAddLocksRef.current.delete(lockKey);
    }
  };

  const quickAddHotelVendor = async (query) => {
    const saved = await quickAddRecord('vendor', query);
    if (saved?._id) {
      setModalValues((current) => ({ ...current, vendorId: saved._id }));
    }
    return saved;
  };

  const openHotelVendorDetails = (query) => {
    hotelModalDraftRef.current = { modal, values: modalValues };
    openModal('vendor', 'details', { query, parentHotel: true });
  };

  const submitModal = async (event) => {
    event.preventDefault();

    if (!modal) {
      return;
    }

    try {
      setModalSaving(true);
      setModalError('');

      let saved = null;

      if (modal.type === 'customer') {
        saved = await createTravelCustomer({
          ...buildCustomerOpeningPayload(modalValues),
          moduleScope: modalValues.moduleScope || 'travel',
        });

        if (saved?.duplicate) {
          setModalError(t('travel.booking.alerts.customerDuplicate'));
          return;
        }
      }

      if (modal.type === 'traveler') {
        saved = await createTraveler(cleanTravelerPayload(modalValues));
      }

      if (modal.type === 'service') {
        if (!modalValues.categoryId) {
          setModalError(t('travel.alerts.categoryRequired'));
          return;
        }

        saved = await createTravelService(modalValues);
      }

      if (modal.type === 'category') {
        saved = await createTravelServiceCategory(modalValues);
      }

      if (modal.type === 'hotel') {
        saved = await createTravelHotel(modalValues);
      }

      if (modal.type === 'vendor') {
        saved = await createTravelVendor(buildVendorOpeningPayload(modalValues));
      }

      if (modal.type === 'vendor' && modal.context?.parentHotel && hotelModalDraftRef.current) {
        setVendors((current) => upsertRecord(current, saved));
        const parent = hotelModalDraftRef.current;
        hotelModalDraftRef.current = null;
        setModal(parent.modal);
        setModalValues({ ...parent.values, vendorId: saved._id });
        setModalError('');
        return;
      }

      assignCreatedRecord(modal.type, saved, modal.context);

      closeModal();
    } catch (error) {
      console.error('Travel invoice modal save failed:', error);

      setModalError(error?.response?.data?.message || t('travel.alerts.quickAddFailed'));
    } finally {
      setModalSaving(false);
    }
  };

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    setFormState((current) => ({
      ...current,

      attachments: [...(current.attachments || []), ...files].slice(0, MAX_ATTACHMENTS),
    }));

    event.target.value = '';
  };

  const removeAttachment = (index) => {
    setFormState((current) => ({
      ...current,

      attachments: (current.attachments || []).filter(
        (_, attachmentIndex) => attachmentIndex !== index
      ),
    }));
  };

  const handleClearDraft = () => {
    if (!window.confirm(t('travel.booking.actions.clearDraftConfirm'))) {
      return;
    }

    clearDraft();

    setFormState({
      ...createInitialBookingForm('air_ticket'),
      currencyRateSnapshot: captureCurrencyRateSnapshot(currencySettings),
    });

    setExpandedItems({});
    setFormError('');
  };

  const validateBooking = (status) => {
    const isConfirming = ['confirmed', 'processing', 'completed'].includes(status);
    if (!formState.customerId && !formState.customerPartyId) {
      return 'Customer is required.';
    }

    if (!Array.isArray(formState.bookingItems) || formState.bookingItems.length === 0) {
      return 'At least one invoice item is required.';
    }

    if (['quotation', 'confirmed', 'processing', 'completed'].includes(status)) {
      const missingRate = findMissingConversionRate(formState, currencySettings);
      if (missingRate) {
        const label = missingRate.side === 'cost' ? 'Cost' : 'Sale';
        return `${label} conversion rate for ${missingRate.currency} is not configured.`;
      }
    }

    for (let index = 0; index < formState.bookingItems.length; index += 1) {
      const item = formState.bookingItems[index];

      const useComponents =
        item.itemType === 'umrah_package' &&
        item.umrahDetails?.packageMode === 'custom_component_package' &&
        Array.isArray(item.umrahDetails?.components) &&
        item.umrahDetails.components.length > 0;

      if (useComponents) {
        for (
          let componentIndex = 0;
          componentIndex < item.umrahDetails.components.length;
          componentIndex += 1
        ) {
          const component = item.umrahDetails.components[componentIndex];

          const componentTotals = calculateUmrahComponentSourceTotals(component);

          if (
            isConfirming &&
            numberValue(componentTotals.cost) > 0 &&
            !component.vendorId &&
            !component.vendorPartyId
          ) {
            return `Vendor is required in Umrah component ${componentIndex + 1}.`;
          }
        }

        continue;
      }

      const calculatedItemTotals = calculateBookingItemSourceTotals(item);
      const isMultiCityTicket =
        item.itemType === 'air_ticket' && item.ticketDetails?.journeyType === 'multi_city';

      if (isMultiCityTicket) {
        const sectors = Array.isArray(item.ticketDetails?.sectors)
          ? item.ticketDetails.sectors
          : [];
        const legacyOnly =
          sectors.length === 1 && sectors[0]?.legacyFallback === true && isEditMode;

        if (isConfirming && sectors.length < 2 && !legacyOnly) {
          return `At least two sectors are required in Multi-City item ${index + 1}.`;
        }

        let previousDeparture = null;
        for (let sectorIndex = 0; sectorIndex < sectors.length; sectorIndex += 1) {
          const sector = sectors[sectorIndex];
          if (legacyOnly && sector.legacyFallback === true) {
            continue;
          }
          const origin = sector.originAirportId || String(sector.origin || '').trim();
          const destination =
            sector.destinationAirportId || String(sector.destination || '').trim();

          if (isConfirming && !sector.airlineId && !String(sector.airline || '').trim()) {
            return `Airline is required in sector ${sectorIndex + 1}.`;
          }
          if (isConfirming && (!origin || !destination)) {
            return `Origin and destination are required in sector ${sectorIndex + 1}.`;
          }
          if (isConfirming && String(origin) === String(destination)) {
            return `Origin and destination must differ in sector ${sectorIndex + 1}.`;
          }
          if (isConfirming && !sector.departureDateTime) {
            return `Departure date and time are required in sector ${sectorIndex + 1}.`;
          }
          if (
            isConfirming &&
            previousDeparture &&
            new Date(sector.departureDateTime).getTime() <= previousDeparture
          ) {
            return 'Multi-City sector departures must be in chronological order.';
          }
          if (sector.departureDateTime) {
            previousDeparture = new Date(sector.departureDateTime).getTime();
          }

          const sectorRows = Array.isArray(sector.paxPricing) ? sector.paxPricing : [];
          if (
            isConfirming &&
            sectorRows.reduce((sum, row) => sum + numberValue(row.count), 0) <= 0
          ) {
            return `At least one passenger is required in sector ${sectorIndex + 1}.`;
          }
          for (let rowIndex = 0; rowIndex < sectorRows.length; rowIndex += 1) {
            const row = sectorRows[rowIndex];
            if (
              isConfirming &&
              numberValue(row.count) > 0 &&
              numberValue(row.sellingPrice) <= 0
            ) {
              return `Selling Price is required in sector ${sectorIndex + 1}, row ${rowIndex + 1}.`;
            }
            if (
              isConfirming &&
              numberValue(row.count) > 0 &&
              numberValue(row.costPrice) > 0 &&
              !row.vendorId &&
              !row.vendorPartyId &&
              !sector.vendorId &&
              !sector.vendorPartyId
            ) {
              return `Vendor is required for every cost row in sector ${sectorIndex + 1}.`;
            }
          }
        }
      }

      if (
        (!isMultiCityTicket && ['air_ticket', 'visit_visa'].includes(item.itemType)) ||
        (item.itemType === 'umrah_package' &&
          item.umrahDetails?.packageMode !== 'custom_component_package')
      ) {
        const paxRows = Array.isArray(item.paxPricing) ? item.paxPricing : [];

        const totalPax = paxRows.reduce((sum, row) => sum + numberValue(row?.count), 0);

        if (totalPax <= 0) {
          return `At least one passenger is required in item ${index + 1}.`;
        }

        const invalidPaxRow = paxRows.find(
          (row) => numberValue(row?.count) > 0 && numberValue(row?.sellingPrice) <= 0
        );

        if (invalidPaxRow) {
          const label =
            invalidPaxRow.paxType === 'child'
              ? 'Child'
              : invalidPaxRow.paxType === 'infant'
                ? 'Infant'
                : 'Adult';

          return `${label} Selling Price is required in item ${index + 1}.`;
        }

        if (isConfirming && isRowVendorMode(item)) {
          const missingVendorRow = paxRows.find(
            (row) =>
              numberValue(row?.count) > 0 &&
              numberValue(row?.costPrice) > 0 &&
              !row?.vendorId &&
              !row?.vendorPartyId
          );

          if (missingVendorRow) {
            return `Every cost-bearing passenger row needs a vendor in item ${index + 1}.`;
          }
        }
      }

      if (
        isConfirming &&
        numberValue(calculatedItemTotals.cost) > 0 &&
        !isMultiCityTicket &&
        !isRowVendorMode(item) &&
        !item.vendorId &&
        !item.vendorPartyId
      ) {
        return `Vendor is required for cost in item ${index + 1}.`;
      }

      if (item.itemType === 'hotel') {
        const roomRows = Array.isArray(item.hotelDetails?.roomPricing)
          ? item.hotelDetails.roomPricing
          : [];

        if (roomRows.length === 0) {
          return `At least one room pricing row is required in Hotel item ${index + 1}.`;
        }

        if (numberValue(item.hotelDetails?.nights) <= 0) {
          return `Valid Check-in and Check-out dates are required in Hotel item ${index + 1}.`;
        }

        const chargePerRoom = item.hotelDetails?.chargePerRoom === true;

        for (let roomIndex = 0; roomIndex < roomRows.length; roomIndex += 1) {
          const room = roomRows[roomIndex];

          if (numberValue(room?.sellingPrice) <= 0) {
            return `Selling Price is required in Hotel room ${roomIndex + 1}.`;
          }

          if (chargePerRoom && numberValue(room?.quantity) <= 0) {
            return `Rooms quantity is required in Hotel room ${roomIndex + 1}.`;
          }

          if (!chargePerRoom && numberValue(room?.occupancy) <= 0) {
            return `Persons/occupancy is required in Hotel room ${roomIndex + 1}.`;
          }
        }
      }

      if (
        ['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(
          item.itemType
        )
      ) {
        if (numberValue(item.quantityPricing?.quantity) <= 0) {
          return `Quantity is required in item ${index + 1}.`;
        }

        if (numberValue(item.quantityPricing?.sellingPrice) <= 0) {
          return `Selling Price is required in item ${index + 1}.`;
        }
      }
    }

    if (numberValue(formState.receivedAmount) > 0 && !formState.accountId) {
      return 'Customer payment account is required.';
    }

    for (const payment of effectiveVendorPayments) {
      const paidAmount = numberValue(payment.paidAmount);

      if (paidAmount > 0 && (!payment.paymentType || !payment.accountId)) {
        return 'Payment type and account are required for each vendor payment.';
      }
    }

    return '';
  };

  const buildPayload = (status) => {
    const attachments = formState.attachments || [];

    const newAttachments = attachments.filter(
      (attachment) => typeof File !== 'undefined' && attachment instanceof File
    );

    const keepAttachmentKeys = attachments
      .filter((attachment) => !(typeof File !== 'undefined' && attachment instanceof File))
      .map((attachment) => attachment?.key)
      .filter(Boolean);

    const source = {
      ...formState,

      attachments: undefined,
      keepAttachmentKeys: undefined,
      invoiceNumber: undefined,
      accountingPosted: undefined,
      accountingStatus: undefined,

      status,

      vendorPaidTotal: totals.vendorPaid,

      vendorPayments: effectiveVendorPayments,

      vendorPaymentAccountId: undefined,

      vendorPaymentType: undefined,

      serviceType:
        formState.bookingItems.length === 1
          ? formState.bookingItems[0]?.itemType || formState.serviceType
          : 'mixed',

      bookingItems: (formState.bookingItems || []).map((item) => {
        const rowModeActive = isRowVendorMode(item);

        return {
          ...item,
          ...(rowModeActive ? { vendorType: 'vendor', vendorId: '', vendorPartyId: '' } : {}),
          vendorPaidAmount: 0,
          estimatedVendorPaidBase: 0,
          paxPricing: (item.paxPricing || []).map((row) => {
            const payloadRow = { ...row };
            delete payloadRow.uiKey;
            return payloadRow;
          }),
          ticketDetails: {
            ...(item.ticketDetails || {}),
            sectors: (
              item.ticketDetails?.sectors?.length === 1 &&
              item.ticketDetails.sectors[0]?.legacyFallback === true
                ? []
                : item.ticketDetails?.sectors || []
            ).map((sector) => {
              const payloadSector = {
                ...sector,
                paxPricing: (sector.paxPricing || []).map((row) => {
                  const payloadRow = { ...row };
                  delete payloadRow.uiKey;
                  return payloadRow;
                }),
              };
              delete payloadSector.uiKey;
              delete payloadSector.legacyFallback;
              return payloadSector;
            }),
          },
          umrahDetails: {
            ...(item.umrahDetails || {}),
            components: (item.umrahDetails?.components || []).map((component) => ({
              ...component,
              vendorPaidAmount: 0,
              estimatedVendorPaidBase: 0,
            })),
          },
          title: item.title || getDefaultServiceTitle(item),
          travelerIds:
            item.travelerIds?.length || !['air_ticket', 'visit_visa'].includes(item.itemType)
              ? item.travelerIds
              : formState.travelers,
        };
      }),
    };

    const payload = compactPayload(normalizeCustomerReceiptForPayload(source));

    payload.keepAttachmentKeys = keepAttachmentKeys;

    if (newAttachments.length) {
      payload.attachments = newAttachments;
    }

    return payload;
  };

  const closeReservedPrintWindow = (options = {}) => {
    const targetWindow = options?.targetWindow;
    if (targetWindow && !targetWindow.closed) {
      targetWindow.close();
    }
  };

  const performInvoiceDocumentAction = async (
    action,
    bookingId,
    bookingRecord = {},
    targetWindow = null
  ) => {
    if (!bookingId || !action || documentActionLockRef.current) return false;

    try {
      documentActionLockRef.current = true;
      setDocumentActionLoading(true);
      setFormError('');

      if (action === TRAVEL_DOCUMENT_ACTIONS.PRINT) {
        await openBackendPrintWindow({
          url: getTravelBookingPrintUrl(bookingId),
          targetWindow,
        });
      } else {
        await downloadBackendPdf({
          url: getTravelBookingPdfUrl(bookingId),
          fileName: getTravelInvoicePdfFileName({ ...bookingRecord, _id: bookingId }),
        });
      }

      return true;
    } catch (error) {
      closeReservedPrintWindow({ targetWindow });
      setFormError(
        error?.message ||
          (action === TRAVEL_DOCUMENT_ACTIONS.PRINT
            ? 'Unable to open the invoice print window.'
            : 'Unable to download the invoice PDF.')
      );
      return false;
    } finally {
      documentActionLockRef.current = false;
      setDocumentActionLoading(false);
    }
  };

  const hasUnsavedInvoiceChanges = Boolean(
    isEditMode &&
      lastSavedFingerprintRef.current &&
      createTravelBookingFormFingerprint(formState) !== lastSavedFingerprintRef.current
  );

  const handleDocumentRequest = (action) => {
    if (saving || loading || documentActionLoading) return;

    if (isEditMode && !hasUnsavedInvoiceChanges) {
      void performInvoiceDocumentAction(action, id, formState);
      return;
    }

    setDocumentPrompt({ action });
  };

  const handleDocumentSaveChoice = (status) => {
    if (!documentPrompt || saving || documentActionLoading) return;

    let targetWindow = null;
    if (documentPrompt.action === TRAVEL_DOCUMENT_ACTIONS.PRINT) {
      try {
        targetWindow = reserveBackendPrintWindow();
      } catch (error) {
        setFormError(error?.message || 'Print window blocked');
        return;
      }
    }

    const options = {
      documentAction: documentPrompt.action,
      targetWindow,
    };
    setDocumentPrompt(null);
    void submitBooking(status, false, false, options);
  };

  const submitBooking = async (
    status,
    advanceConfirmed = false,
    repostConfirmed = false,
    options = {}
  ) => {
    pendingSubmitOptionsRef.current = options;

    if (isEditMode && !canEdit) {
      closeReservedPrintWindow(options);
      setFormError(t('travel.alerts.permissionDenied'));
      return;
    }

    if (!isEditMode && !canCreate) {
      closeReservedPrintWindow(options);
      setFormError(t('travel.alerts.permissionDenied'));
      return;
    }

    const validationError = validateBooking(status);

    if (validationError) {
      closeReservedPrintWindow(options);
      setFormError(validationError);
      return;
    }

    if (
      !advanceConfirmed &&
      ['confirmed', 'processing', 'completed'].includes(status) &&
      advanceWarnings.length > 0
    ) {
      setAdvanceConfirmationStatus(status);
      return;
    }

    if (postedInvoiceEditing && !repostConfirmed) {
      setRepostConfirmation({ status, advanceConfirmed });
      return;
    }

    if (bookingSubmitLockRef.current) {
      closeReservedPrintWindow(options);
      return;
    }

    try {
      bookingSubmitLockRef.current = true;
      setSaving(true);
      setFormError('');

      const payload = buildPayload(status);

      if (postedInvoiceEditing) {
        payload.repostAccounting = true;
        payload.expectedUpdatedAt = formState.updatedAt;
      }

      const saved = isEditMode
        ? await updateTravelBooking(id, payload)
        : await createTravelBooking(payload);

      clearDraft();
      lastSavedFingerprintRef.current = createTravelBookingFormFingerprint(formState);

      if (options.documentAction) {
        await performInvoiceDocumentAction(
          options.documentAction,
          saved._id,
          saved,
          options.targetWindow
        );
        navigate(`/travel/bookings/${saved._id}/edit`, { replace: !isEditMode });
      } else {
        navigate(`/travel/bookings/${saved._id}`);
      }

      pendingSubmitOptionsRef.current = null;
      return saved;
    } catch (error) {
      closeReservedPrintWindow(options);
      console.error('Travel invoice save failed:', error);

      setFormError(error?.response?.data?.message || t('travel.booking.alerts.saveFailed'));
    } finally {
      bookingSubmitLockRef.current = false;
      setSaving(false);
    }
  };

  const confirmExtraPaymentAndSave = () => {
    if (extraPaymentConfirmationRef.current || !advanceConfirmationStatus) return;
    extraPaymentConfirmationRef.current = true;
    const status = advanceConfirmationStatus;
    setAdvanceConfirmationStatus('');
    const options = pendingSubmitOptionsRef.current || {};
    void submitBooking(status, true, false, options).finally(() => {
      extraPaymentConfirmationRef.current = false;
    });
  };

  const renderTravelerPicker = (item, index) => {
    const customerId = canUseCustomerAsTraveler(formState)
      ? getRecordId(formState.customerId)
      : '';
    const lockKey = customerId ? `${index}:${customerId}` : '';
    const customerTravelerSelected = Boolean(getCustomerTravelerSelection(item));
    const resolvingCustomerTraveler = Boolean(lockKey && customerTravelerBusy[lockKey]);

    return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-slate-500">
          {t('travel.booking.fields.itemTravelers')}
        </span>

        {customerId && (
          <label className={`inline-flex items-center gap-2 text-xs font-bold ${accountingLocked ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-600'}`}>
            <input
              type="checkbox"
              checked={customerTravelerSelected}
              disabled={accountingLocked || resolvingCustomerTraveler}
              onChange={(event) => {
                if (event.target.checked && !customerTravelerSelected) {
                  void handleEnsureCustomerTraveler(index);
                }
              }}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed"
            />
            <span>{t('travel.booking.customerTraveler.sameCustomer')}</span>
            {resolvingCustomerTraveler && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" aria-label={t('travel.booking.customerTraveler.resolving')} />
            )}
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {buildTravelerOccurrences(item.travelerIds || []).map((occurrence) => {
          const { travelerId, absoluteIndex } = occurrence;
          const traveler = activeTravelers.find(
            (record) => String(record._id) === String(travelerId)
          );

          return (
            <button
              type="button"
              key={occurrence.key}
              disabled={accountingLocked}
              onClick={() => removeItemTravelerOccurrence(index, absoluteIndex)}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-gradient-to-r from-cyan-50 to-sky-50 px-3 py-1 text-xs font-bold text-cyan-800 transition hover:shadow-sm disabled:opacity-70"
            >
              {traveler ? getTravelerLabel(traveler) : travelerId}
              {occurrence.occurrence > 0 ? ` · ${occurrence.occurrence + 1}` : ''}

              {!accountingLocked && <FaTimes aria-hidden="true" className="text-[10px]" />}
            </button>
          );
        })}
      </div>

      {!accountingLocked && (
        <TravelCompactAutocomplete
          value=""
          records={activeTravelers}
          getLabel={getTravelerLabel}
          getMeta={getTravelerMeta}
          placeholderKey="travel.booking.placeholders.selectTraveler"
          onChange={(value, record) => value && requestAddItemTraveler(index, value, record)}
          onQuickAdd={
            canManageTravelers
              ? (query) =>
                  quickAddRecord('traveler', query, {
                    query,
                    itemIndex: index,
                  })
              : null
          }
          onAddDetails={
            canManageTravelers
              ? (query) =>
                  openModal('traveler', 'details', {
                    query,
                    itemIndex: index,
                  })
              : null
          }
        />
      )}
    </div>
    );
  };

  const renderUmrahComponents = (item, itemIndex) => {
    const details = item.umrahDetails || {};

    if (details.packageMode !== 'custom_component_package') {
      return null;
    }

    const components = details.components || [];

    const renderComponentPaxPricing = (component, componentIndex) => {
      const rows = Array.isArray(component.paxPricing) ? component.paxPricing : [];

      const adultRow =
        rows.find((row) => row?.paxType === 'adult') || createEmptyPaxPricingRow('adult');

      const childRow = rows.find((row) => row?.paxType === 'child');

      const infantRow = rows.find((row) => row?.paxType === 'infant');

      const renderRow = (row, paxType) => {
        const label = paxType === 'child' ? 'Child' : paxType === 'infant' ? 'Infant' : 'Adult';

        return (
          <div
            key={paxType}
            className="grid grid-cols-[80px_80px_minmax(120px,1fr)_minmax(120px,1fr)_40px] items-end gap-2 rounded-lg border border-slate-200 bg-white p-2"
          >
            <div className="pb-2">
              <span className="text-xs font-black text-slate-700">{label}</span>
            </div>

            <label>
              <FieldLabel>Qty</FieldLabel>

              <input
                type="number"
                min="0"
                step="1"
                value={row?.count ?? ''}
                disabled={accountingLocked}
                onChange={(event) =>
                  updateUmrahComponentPaxRow(
                    itemIndex,
                    componentIndex,
                    paxType,
                    'count',
                    event.target.value
                  )
                }
                className={fieldClass}
              />
            </label>

            <MoneyField
              labelKey="travel.booking.fields.costPrice"
              value={row?.costPrice}
              disabled={accountingLocked}
              currency={component.costCurrency}
              side="cost"
              baseCurrency={baseCurrency}
              onRateClick={openCurrencyRateModal}
              onChange={(value) =>
                updateUmrahComponentPaxRow(itemIndex, componentIndex, paxType, 'costPrice', value)
              }
            />

            <MoneyField
              labelKey="travel.booking.fields.sellingPrice"
              value={row?.sellingPrice}
              disabled={accountingLocked}
              currency={component.sellingCurrency}
              side="sale"
              baseCurrency={baseCurrency}
              onRateClick={openCurrencyRateModal}
              onChange={(value) =>
                updateUmrahComponentPaxRow(
                  itemIndex,
                  componentIndex,
                  paxType,
                  'sellingPrice',
                  value
                )
              }
            />

            <div className="flex h-10 items-center justify-center">
              {!accountingLocked && paxType !== 'adult' && (
                <button
                  type="button"
                  onClick={() => removeUmrahComponentPaxRow(itemIndex, componentIndex, paxType)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"
                >
                  <FaTrash aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      };

      return (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-slate-800">Passenger Pricing</p>

            {!accountingLocked && (
              <div className="flex gap-2">
                {!childRow && (
                  <button
                    type="button"
                    onClick={() => addUmrahComponentPaxRow(itemIndex, componentIndex, 'child')}
                    className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-bold text-violet-700"
                  >
                    + Child
                  </button>
                )}

                {!infantRow && (
                  <button
                    type="button"
                    onClick={() => addUmrahComponentPaxRow(itemIndex, componentIndex, 'infant')}
                    className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-bold text-amber-700"
                  >
                    + Infant
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[600px] space-y-2">
              {renderRow(adultRow, 'adult')}

              {childRow && renderRow(childRow, 'child')}

              {infantRow && renderRow(infantRow, 'infant')}
            </div>
          </div>
        </div>
      );
    };

    const renderComponentQuantityPricing = (component, componentIndex) => {
      const pricing = component.quantityPricing || {
        quantity: 1,
        unitLabel: 'Quantity',
        costPrice: '',
        sellingPrice: '',
      };

      return (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3 sm:grid-cols-3">
          <label>
            <FieldLabel>{pricing.unitLabel || 'Quantity'}</FieldLabel>

            <input
              type="number"
              min="0"
              step="1"
              value={pricing.quantity ?? ''}
              disabled={accountingLocked}
              onChange={(event) =>
                updateUmrahQuantityPricing(
                  itemIndex,
                  componentIndex,
                  'quantity',
                  event.target.value
                )
              }
              className={fieldClass}
            />
          </label>

          <MoneyField
            labelKey="travel.booking.fields.costPrice"
            value={pricing.costPrice}
            disabled={accountingLocked}
            currency={component.costCurrency}
            side="cost"
            baseCurrency={baseCurrency}
            onRateClick={openCurrencyRateModal}
            onChange={(value) =>
              updateUmrahQuantityPricing(itemIndex, componentIndex, 'costPrice', value)
            }
          />

          <MoneyField
            labelKey="travel.booking.fields.sellingPrice"
            value={pricing.sellingPrice}
            disabled={accountingLocked}
            currency={component.sellingCurrency}
            side="sale"
            baseCurrency={baseCurrency}
            onRateClick={openCurrencyRateModal}
            onChange={(value) =>
              updateUmrahQuantityPricing(itemIndex, componentIndex, 'sellingPrice', value)
            }
          />
        </div>
      );
    };

    const renderComponentHotelPricing = (component, componentIndex) => {
      const hotelPricing = component.hotelPricing || {
        nights: '',
        chargePerRoom: false,
        roomPricing: [],
      };

      const roomRows = Array.isArray(hotelPricing.roomPricing) ? hotelPricing.roomPricing : [];

      const chargePerRoom = hotelPricing.chargePerRoom === true;
      const showSavedBreakdown = hotelPricing.usesNightlyBreakdown === true;

      return (
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/30 p-3">
          {showSavedBreakdown && (
            <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-amber-100 bg-white p-2 text-xs font-bold text-slate-700 sm:grid-cols-4">
              <span>Normal: {hotelPricing.normalNights || 0} night(s)</span>
              <span>Weekend: {hotelPricing.weekendNights || 0} night(s)</span>
              <span>
                Normal Rate: {formatMoney(hotelPricing.normalRate, component.sellingCurrency)}
              </span>
              <span>
                Total: {formatMoney(hotelPricing.sellingSubtotal, component.sellingCurrency)}
              </span>
            </div>
          )}

          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label>
              <FieldLabel>Nights</FieldLabel>

              <input
                type="number"
                min="0"
                step="1"
                value={hotelPricing.nights ?? ''}
                disabled={accountingLocked}
                onChange={(event) =>
                  updateUmrahHotelPricingField(
                    itemIndex,
                    componentIndex,
                    'nights',
                    event.target.value
                  )
                }
                className={fieldClass}
              />
            </label>

            <label className="flex items-end">
              <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg border border-violet-200 bg-white px-3">
                <input
                  type="checkbox"
                  checked={chargePerRoom}
                  disabled={accountingLocked}
                  onChange={(event) =>
                    updateUmrahHotelPricingField(
                      itemIndex,
                      componentIndex,
                      'chargePerRoom',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4 accent-violet-600"
                />

                <span className="text-xs font-extrabold text-slate-700">Charge Per Room</span>
              </span>
            </label>

            {!accountingLocked && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => addUmrahHotelRoomRow(itemIndex, componentIndex)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white"
                >
                  <FaPlus aria-hidden="true" />
                  Add Room Type
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 overflow-x-auto">
            <div className="min-w-[720px] space-y-2">
              {roomRows.map((room, roomIndex) => {
                const customOccupancy = ['family', 'sharing', 'custom'].includes(room.roomType);

                return (
                  <div
                    key={roomIndex}
                    className="grid grid-cols-[140px_90px_90px_minmax(120px,1fr)_minmax(120px,1fr)_40px] items-end gap-2 rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <label>
                      <FieldLabel>Room Type</FieldLabel>

                      <select
                        value={room.roomType || 'double'}
                        disabled={accountingLocked}
                        onChange={(event) =>
                          updateUmrahHotelRoomRow(
                            itemIndex,
                            componentIndex,
                            roomIndex,
                            'roomType',
                            event.target.value
                          )
                        }
                        className={selectClass}
                      >
                        {hotelRoomTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <FieldLabel>Persons</FieldLabel>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={room.occupancy ?? ''}
                        disabled={accountingLocked || chargePerRoom || !customOccupancy}
                        onChange={(event) =>
                          updateUmrahHotelRoomRow(
                            itemIndex,
                            componentIndex,
                            roomIndex,
                            'occupancy',
                            event.target.value
                          )
                        }
                        className={fieldClass}
                      />
                    </label>

                    <label>
                      <FieldLabel>Rooms</FieldLabel>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={room.quantity ?? ''}
                        disabled={accountingLocked || !chargePerRoom}
                        onChange={(event) =>
                          updateUmrahHotelRoomRow(
                            itemIndex,
                            componentIndex,
                            roomIndex,
                            'quantity',
                            event.target.value
                          )
                        }
                        className={fieldClass}
                      />
                    </label>

                    <MoneyField
                      labelKey="travel.booking.fields.costPrice"
                      value={room.costPrice}
                      disabled={accountingLocked}
                      currency={component.costCurrency}
                      side="cost"
                      baseCurrency={baseCurrency}
                      onRateClick={openCurrencyRateModal}
                      onChange={(value) =>
                        updateUmrahHotelRoomRow(
                          itemIndex,
                          componentIndex,
                          roomIndex,
                          'costPrice',
                          value
                        )
                      }
                    />

                    <MoneyField
                      labelKey="travel.booking.fields.sellingPrice"
                      value={room.sellingPrice}
                      disabled={accountingLocked}
                      currency={component.sellingCurrency}
                      side="sale"
                      baseCurrency={baseCurrency}
                      onRateClick={openCurrencyRateModal}
                      onChange={(value) =>
                        updateUmrahHotelRoomRow(
                          itemIndex,
                          componentIndex,
                          roomIndex,
                          'sellingPrice',
                          value
                        )
                      }
                    />

                    <div className="flex h-10 items-center justify-center">
                      {!accountingLocked && (
                        <button
                          type="button"
                          onClick={() =>
                            removeUmrahHotelRoomRow(itemIndex, componentIndex, roomIndex)
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"
                        >
                          <FaTrash aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {room.roomType === 'custom' && (
                      <div className="col-span-full">
                        <TextField
                          labelKey="travel.booking.fields.roomType"
                          value={room.customRoomType}
                          disabled={accountingLocked}
                          onChange={(value) =>
                            updateUmrahHotelRoomRow(
                              itemIndex,
                              componentIndex,
                              roomIndex,
                              'customRoomType',
                              value
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="col-span-full mt-1 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/60 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-900">Umrah Package Components</p>

            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              Ticket/Visa passenger wise, Hotel stay wise اور باقی quantity wise
            </p>
          </div>

          {!accountingLocked && (
            <button
              type="button"
              onClick={() => addUmrahComponent(itemIndex)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-xs font-extrabold text-white shadow-sm"
            >
              <FaPlus aria-hidden="true" />
              Add Component
            </button>
          )}
        </div>

        {components.length === 0 ? (
          <div className="rounded-lg border border-dashed border-violet-200 bg-white px-3 py-4 text-center text-xs font-semibold text-slate-500">
            No package components added.
          </div>
        ) : (
          <div className="space-y-3">
            {components.map((component, componentIndex) => {
              const componentTotals = calculateUmrahComponentSourceTotals(component);

              const usesPax = ['air_ticket', 'visit_visa'].includes(component.componentType);

              const usesHotel = component.componentType === 'hotel';

              const usesQuantity = [
                'transport',
                'appointment',
                'token',
                'insurance',
                'service',
                'other',
              ].includes(component.componentType);

              return (
                <div
                  key={`${itemIndex}-${componentIndex}`}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label>
                      <FieldLabel>Component</FieldLabel>

                      <select
                        value={component.componentType || 'service'}
                        disabled={accountingLocked}
                        onChange={(event) =>
                          updateUmrahComponent(
                            itemIndex,
                            componentIndex,
                            'componentType',
                            event.target.value
                          )
                        }
                        className={selectClass}
                      >
                        {UMRAH_COMPONENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`travel.booking.itemTypes.${type}`)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <TextField
                      labelKey="travel.booking.fields.itemTitle"
                      value={component.label}
                      disabled={accountingLocked}
                      onChange={(value) =>
                        updateUmrahComponent(itemIndex, componentIndex, 'label', value)
                      }
                    />

                    <TravelCompactAutocomplete
                      labelKey="travel.booking.fields.vendor"
                      value={getVendorCounterpartyValue(component)}
                      records={vendorCounterparties}
                      disabled={accountingLocked}
                      getLabel={getVendorLabel}
                      getMeta={getVendorMeta}
                      placeholderKey="travel.placeholders.vendorName"
                      onChange={(value, record) =>
                        updateUmrahComponentVendorCounterparty(
                          itemIndex,
                          componentIndex,
                          value,
                          record
                        )
                      }
                      onQuickAdd={
                        canManageVendors
                          ? (query) =>
                              quickAddRecord('vendor', query, {
                                query,
                                itemIndex,
                                componentIndex,
                              })
                          : null
                      }
                      onAddDetails={
                        canManageVendors
                          ? (query) =>
                              openModal('vendor', 'details', {
                                query,
                                itemIndex,
                                componentIndex,
                              })
                          : null
                      }
                    />

                    <div className="flex items-end justify-end">
                      {!accountingLocked && (
                        <button
                          type="button"
                          onClick={() => removeUmrahComponent(itemIndex, componentIndex)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-xs text-white sm:h-9 sm:w-9 sm:text-sm"
                        >
                          <FaTrash aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {usesHotel && (
                      <TravelCompactAutocomplete
                        labelKey="travel.booking.fields.hotel"
                        value={getRecordId(component.hotelId) || ''}
                        records={activeHotels.filter((hotel) => {
                          const city = String(hotel?.city || '').toLowerCase();
                          const componentCity = String(
                            component.hotelPricing?.city || ''
                          ).toLowerCase();

                          if (componentCity === 'makkah') {
                            return city.includes('makkah') || city.includes('mecca');
                          }

                          if (componentCity === 'madinah') {
                            return (
                              city.includes('madinah') ||
                              city.includes('madina') ||
                              city.includes('medina')
                            );
                          }

                          return true;
                        })}
                        disabled={accountingLocked}
                        getLabel={getHotelLabel}
                        getMeta={(hotel) => hotel?.country || ''}
                        placeholderKey="travel.placeholders.hotelName"
                        onChange={(value) =>
                          updateUmrahComponent(itemIndex, componentIndex, 'hotelId', value)
                        }
                      />
                    )}

                    {['service', 'other'].includes(component.componentType) && (
                      <TravelCompactAutocomplete
                        labelKey="travel.booking.fields.service"
                        value={getRecordId(component.serviceId) || ''}
                        records={activeServices}
                        disabled={accountingLocked}
                        getLabel={getServiceLabel}
                        getMeta={(service) => service?.code || ''}
                        placeholderKey="travel.placeholders.serviceName"
                        onChange={(value) =>
                          updateUmrahComponent(itemIndex, componentIndex, 'serviceId', value)
                        }
                      />
                    )}

                    <label>
                      <FieldLabel>{t('travel.fields.currency')}</FieldLabel>

                      <CurrencySelect
                        value={component.costCurrency}
                        disabled={accountingLocked}
                        onChange={(value) =>
                          updateUmrahComponentCurrency(itemIndex, componentIndex, value)
                        }
                      />
                    </label>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Component Cost
                      </p>

                      <p className="text-sm font-black text-slate-800">
                        {formatMoney(componentTotals.cost, component.costCurrency)}
                      </p>
                    </div>

                    <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase text-cyan-500">
                        Component Sale
                      </p>

                      <p className="text-sm font-black text-cyan-700">
                        {formatMoney(componentTotals.selling, component.sellingCurrency)}
                      </p>
                    </div>
                  </div>

                  {usesPax && renderComponentPaxPricing(component, componentIndex)}

                  {usesHotel && renderComponentHotelPricing(component, componentIndex)}

                  {usesQuantity && renderComponentQuantityPricing(component, componentIndex)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const updateTicketPassengerDetails = (itemIndex, absoluteIndex, updates = {}) => {
    updateItem(itemIndex, (item) => {
      const ticketDetails = {
        ...(item.ticketDetails || {}),
      };

      const travelerId = item.travelerIds?.[absoluteIndex];
      if (!travelerId) return item;

      const traveler = activeTravelers.find((record) => String(record._id) === String(travelerId));
      const passengerTickets = updateTravelerDetailOccurrence(
        item.travelerIds || [],
        ticketDetails.passengerTickets || [],
        absoluteIndex,
        updates,
        (id) => ({
          ...createEmptyTicketPassenger('adult'),
          travelerId: id,
          passengerName: traveler?.fullName || traveler?.name || '',
        })
      );

      return {
        ...item,

        ticketDetails: {
          ...ticketDetails,

          passengerTickets,
        },
      };
    });
  };

  const updateTicketPassengerDetail = (itemIndex, absoluteIndex, field, value) => {
    updateTicketPassengerDetails(itemIndex, absoluteIndex, {
      [field]: value,
    });
  };

  const updatePassengerTicketMasterSelection = (
    itemIndex,
    absoluteIndex,
    idField,
    textField,
    record,
    getText
  ) => {
    updateTicketPassengerDetails(itemIndex, absoluteIndex, {
      [idField]: record ? getRecordId(record) : '',
      [textField]: record ? getText(record) : '',
    });
  };

  const updateVisaTravelerDetail = (itemIndex, absoluteIndex, field, value) => {
    updateItem(itemIndex, (item) => {
      const visaDetails = {
        ...(item.visaDetails || {}),
      };

      const travelerId = item.travelerIds?.[absoluteIndex];
      if (!travelerId) return item;

      const traveler = activeTravelers.find((record) => String(record._id) === String(travelerId));
      const travelerVisas = updateTravelerDetailOccurrence(
        item.travelerIds || [],
        visaDetails.travelerVisas || [],
        absoluteIndex,
        { [field]: value },
        (id) => ({
          ...createEmptyVisaTraveler('adult'),
          travelerId: id,
          passengerName: traveler?.fullName || traveler?.name || '',
          passportNumber: traveler?.passportNumber || '',
        })
      );

      return {
        ...item,

        visaDetails: {
          ...visaDetails,

          travelerVisas,
        },
      };
    });
  };

  const renderMultiCitySectors = (item, itemIndex) => {
    const sectors = Array.isArray(item.ticketDetails?.sectors)
      ? item.ticketDetails.sectors
      : [];
    const totals = calculateBookingItemSourceTotals(item);

    return (
      <div className="space-y-3 rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/60 via-white to-blue-50/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-slate-900">
              <FaRoute className="text-cyan-600" aria-hidden="true" />
              Multi-City Sectors
            </p>
            <p className="text-[11px] font-semibold text-slate-500">
              Each sector has independent passenger pricing and vendor allocation.
            </p>
          </div>

          {!accountingLocked && (
            <button
              type="button"
              onClick={() => addMultiCitySector(itemIndex)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 text-xs font-extrabold text-white shadow-sm"
              title="Add new sector"
              aria-label="Add new sector"
            >
              <FaPlus aria-hidden="true" />
              Add Sector
            </button>
          )}
        </div>

        {sectors.map((sector, sectorIndex) => {
          const sectorKey = sector._id || sector.uiKey || `sector-${sectorIndex}`;
          const collapsed = Boolean(collapsedSectorKeys[sectorKey]);
          const rows = Array.isArray(sector.paxPricing) ? sector.paxPricing : [];
          const sectorTotals = rows.reduce(
            (result, row) => {
              const count = numberValue(row.count);
              result.cost += count * numberValue(row.costPrice);
              result.selling += count * numberValue(row.sellingPrice);
              return result;
            },
            { cost: 0, selling: 0 }
          );

          return (
            <section key={sectorKey} className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-xs font-black text-white">
                    {sectorIndex + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800">
                      Sector {sectorIndex + 1} — {sector.origin || 'Origin'} → {sector.destination || 'Destination'}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      Cost {formatMoney(sectorTotals.cost, item.costCurrency)} · Sale {formatMoney(sectorTotals.selling, item.sellingCurrency)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedSectorKeys((current) => ({
                        ...current,
                        [sectorKey]: !current[sectorKey],
                      }))
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-100 bg-white text-cyan-700"
                    title={collapsed ? 'Expand sector' : 'Collapse sector'}
                    aria-label={collapsed ? `Expand sector ${sectorIndex + 1}` : `Collapse sector ${sectorIndex + 1}`}
                  >
                    {collapsed ? <FaChevronDown aria-hidden="true" /> : <FaChevronUp aria-hidden="true" />}
                  </button>
                  {!accountingLocked && (
                    <button
                      type="button"
                      onClick={() => removeMultiCitySector(itemIndex, sectorIndex)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"
                      title="Delete sector"
                      aria-label={`Delete sector ${sectorIndex + 1}`}
                    >
                      <FaTrash aria-hidden="true" />
                    </button>
                  )}
                </div>
              </header>

              {!collapsed && (
                <div className="space-y-3 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <TravelCompactAutocomplete
                      labelKey="travel.booking.fields.airline"
                      value={sector.airlineId || ''}
                      records={activeAirlines}
                      getLabel={getAirlineLabel}
                      getMeta={getAirlineMeta}
                      placeholderKey="travel.airlines.search"
                      emptyKey="travel.airlines.empty"
                      disabled={accountingLocked}
                      onChange={(value, airline) =>
                        updateMultiCitySector(itemIndex, sectorIndex, {
                          airlineId: value ? getRecordId(airline) : '',
                          airline: value ? getAirlineText(airline) : '',
                        })
                      }
                    />
                    {!sector.airlineId && (
                      <TextField
                        labelKey="travel.booking.fields.airlineText"
                        value={sector.airline}
                        disabled={accountingLocked}
                        onChange={(value) => updateMultiCitySector(itemIndex, sectorIndex, { airline: value })}
                      />
                    )}

                    <div className="relative">
                      <FaPlaneDeparture className="pointer-events-none absolute right-2 top-1 text-cyan-500" aria-hidden="true" />
                      <TravelCompactAutocomplete
                        labelKey="travel.booking.fields.originAirport"
                        value={sector.originAirportId || ''}
                        records={activeAirports}
                        getLabel={getAirportLabel}
                        getMeta={getAirportMeta}
                        placeholderKey="travel.airports.search"
                        emptyKey="travel.airports.empty"
                        disabled={accountingLocked}
                        onChange={(value, airport) =>
                          updateMultiCitySector(itemIndex, sectorIndex, {
                            originAirportId: value ? getRecordId(airport) : '',
                            origin: value ? getAirportText(airport) : '',
                          })
                        }
                      />
                    </div>
                    {!sector.originAirportId && (
                      <TextField
                        labelKey="travel.booking.fields.originText"
                        value={sector.origin}
                        disabled={accountingLocked}
                        onChange={(value) => updateMultiCitySector(itemIndex, sectorIndex, { origin: value })}
                      />
                    )}

                    <div className="relative">
                      <FaPlaneArrival className="pointer-events-none absolute right-2 top-1 text-violet-500" aria-hidden="true" />
                      <TravelCompactAutocomplete
                        labelKey="travel.booking.fields.destinationAirport"
                        value={sector.destinationAirportId || ''}
                        records={activeAirports}
                        getLabel={getAirportLabel}
                        getMeta={getAirportMeta}
                        placeholderKey="travel.airports.search"
                        emptyKey="travel.airports.empty"
                        disabled={accountingLocked}
                        onChange={(value, airport) =>
                          updateMultiCitySector(itemIndex, sectorIndex, {
                            destinationAirportId: value ? getRecordId(airport) : '',
                            destination: value ? getAirportText(airport) : '',
                          })
                        }
                      />
                    </div>
                    {!sector.destinationAirportId && (
                      <TextField
                        labelKey="travel.booking.fields.destinationText"
                        value={sector.destination}
                        disabled={accountingLocked}
                        onChange={(value) => updateMultiCitySector(itemIndex, sectorIndex, { destination: value })}
                      />
                    )}

                    <TextField
                      labelKey="travel.booking.fields.departureDateTime"
                      type="datetime-local"
                      value={sector.departureDateTime}
                      disabled={accountingLocked}
                      onChange={(value) => updateMultiCitySector(itemIndex, sectorIndex, { departureDateTime: value })}
                    />

                    <TravelCompactAutocomplete
                      labelKey="travel.booking.fields.vendor"
                      value={getVendorCounterpartyValue(sector)}
                      records={vendorCounterparties}
                      disabled={accountingLocked}
                      getLabel={getVendorLabel}
                      getMeta={getVendorMeta}
                      placeholderKey="travel.placeholders.vendorName"
                      onChange={(value, record) => updateMultiCitySectorVendor(itemIndex, sectorIndex, value, record)}
                      onQuickAdd={canManageVendors ? (query) => quickAddRecord('vendor', query, { itemIndex, sectorIndex }) : null}
                      onAddDetails={canManageVendors ? (query) => openModal('vendor', 'details', { query, itemIndex, sectorIndex }) : null}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-xs font-black text-slate-800">Passenger Pricing</p>
                    {!accountingLocked && (
                      <div className="flex gap-2">
                        {[
                          ['adult', 'Adult', 'border-cyan-200 bg-cyan-50 text-cyan-700'],
                          ['child', 'Child', 'border-violet-200 bg-violet-50 text-violet-700'],
                          ['infant', 'Infant', 'border-amber-200 bg-amber-50 text-amber-700'],
                        ].map(([paxType, label, colors]) => (
                          <button
                            key={paxType}
                            type="button"
                            onClick={() => addMultiCityPricingRow(itemIndex, sectorIndex, paxType)}
                            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-extrabold ${colors}`}
                            title={`Add ${label} row`}
                            aria-label={`Add ${label} row to sector ${sectorIndex + 1}`}
                          >
                            <FaPlus aria-hidden="true" /> {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <div className="min-w-[820px] space-y-2">
                      {rows.map((row, rowIndex) => {
                        const rowKey = row._id || row.uiKey || `${sectorKey}-${rowIndex}`;
                        const vendorKey = `sector-row-${sectorKey}-${rowKey}`;
                        const showVendor = Boolean(row.vendorId || row.vendorPartyId || openRowVendorKeys[vendorKey]);
                        return (
                          <div key={rowKey} className={`grid items-end gap-2 rounded-lg border border-slate-200 p-2 ${showVendor ? 'grid-cols-[75px_70px_1fr_1fr_1.4fr_112px]' : 'grid-cols-[75px_70px_1fr_1fr_112px]'}`}>
                            <span className="pb-3 text-xs font-black capitalize text-slate-700">{row.paxType || 'adult'}</span>
                            <label><FieldLabel>Qty</FieldLabel><input type="number" min="0" step="1" value={row.count ?? ''} disabled={accountingLocked} onChange={(event) => updateMultiCityPricingRow(itemIndex, sectorIndex, rowIndex, { count: event.target.value })} className={fieldClass} /></label>
                            <MoneyField labelKey="travel.booking.fields.costPrice" value={row.costPrice} disabled={accountingLocked} currency={item.costCurrency} side="cost" baseCurrency={baseCurrency} onRateClick={openCurrencyRateModal} onChange={(value) => updateMultiCityPricingRow(itemIndex, sectorIndex, rowIndex, { costPrice: value })} />
                            <MoneyField labelKey="travel.booking.fields.sellingPrice" value={row.sellingPrice} disabled={accountingLocked} currency={item.sellingCurrency} side="sale" baseCurrency={baseCurrency} onRateClick={openCurrencyRateModal} onChange={(value) => updateMultiCityPricingRow(itemIndex, sectorIndex, rowIndex, { sellingPrice: value })} />
                            {showVendor && <TravelCompactAutocomplete labelKey="travel.booking.fields.vendor" value={getVendorCounterpartyValue(row)} records={vendorCounterparties} disabled={accountingLocked} getLabel={getVendorLabel} getMeta={getVendorMeta} placeholderKey="travel.placeholders.vendorName" onChange={(value, record) => updateMultiCityRowVendor(itemIndex, sectorIndex, rowIndex, value, record)} onQuickAdd={canManageVendors ? (query) => quickAddRecord('vendor', query, { itemIndex, sectorIndex, sectorRowIndex: rowIndex }) : null} onAddDetails={canManageVendors ? (query) => openModal('vendor', 'details', { query, itemIndex, sectorIndex, sectorRowIndex: rowIndex }) : null} />}
                            <div className="flex h-10 items-center justify-end gap-2">
                              {!accountingLocked && <>
                                <button type="button" onClick={() => addMultiCityPricingRow(itemIndex, sectorIndex, row.paxType || 'adult', rowIndex)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700" title="Add matching row" aria-label="Add matching passenger row"><FaPlus aria-hidden="true" /></button>
                                <button type="button" onClick={() => setOpenRowVendorKeys((current) => ({ ...current, [vendorKey]: true }))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700" title="Choose row vendor" aria-label="Choose row vendor"><FaUserTie aria-hidden="true" /></button>
                                <button type="button" onClick={() => removeMultiCityPricingRow(itemIndex, sectorIndex, rowIndex)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600" title="Delete pricing row" aria-label="Delete pricing row"><FaTrash aria-hidden="true" /></button>
                              </>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {sectors.length === 0 && (
          <p className="rounded-lg border border-dashed border-cyan-200 p-4 text-center text-xs font-semibold text-slate-500">
            Add at least two sectors before confirming this Multi-City invoice.
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 border-t border-cyan-100 pt-3 sm:grid-cols-4">
          <label><FieldLabel>{t('travel.fields.currency')}</FieldLabel><CurrencySelect value={item.costCurrency} disabled={accountingLocked} onChange={(value) => updateItemCurrency(itemIndex, value)} /></label>
          <div className="rounded-lg border bg-white px-3 py-2"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400"><FaCoins /> Total Cost</p><p className="font-black">{formatMoney(totals.cost, item.costCurrency)}</p></div>
          <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-cyan-500"><FaFileInvoiceDollar /> Total Sale</p><p className="font-black text-cyan-700">{formatMoney(totals.selling, item.sellingCurrency)}</p></div>
          <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2"><p className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-500"><FaMoneyBillWave /> Profit</p><p className="font-black text-emerald-700">{formatMoney(totals.selling - totals.cost, item.sellingCurrency)}</p></div>
        </div>
      </div>
    );
  };

  const renderAdvancedDetails = (item, index) => {
    if (!expandedItems[index]) {
      return null;
    }

    if (item.itemType === 'air_ticket') {
      const details = item.ticketDetails || {};

      const selectedTravelerIds = item.travelerIds || [];
      const selectedTravelerOccurrences = buildTravelerOccurrences(selectedTravelerIds);

      return (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <FieldLabel>Journey Type</FieldLabel>

              <select
                value={details.journeyType || 'one_way'}
                disabled={accountingLocked}
                onChange={(event) => updateJourneyType(index, event.target.value)}
                className={selectClass}
              >
                {JOURNEY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type === 'one_way'
                      ? 'One Way'
                      : type === 'round_trip'
                        ? 'Round Trip'
                        : 'Multi City'}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-end">
              <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50/50 px-3">
                <input
                  type="checkbox"
                  checked={details.sameFlightForAll !== false}
                  disabled={accountingLocked}
                  onChange={(event) =>
                    updateItemDetails(
                      index,
                      'ticketDetails',
                      'sameFlightForAll',
                      event.target.checked
                    )
                  }
                  className="h-4 w-4 accent-cyan-600"
                />

                <span className="text-xs font-extrabold text-slate-700">Same Flight For All</span>
              </span>
            </label>

            <TextField
              labelKey="travel.booking.fields.travelClass"
              value={details.travelClass}
              disabled={accountingLocked}
              onChange={(value) => updateItemDetails(index, 'ticketDetails', 'travelClass', value)}
            />

            <TextField
              labelKey="travel.booking.fields.baggage"
              value={details.baggage}
              disabled={accountingLocked}
              onChange={(value) => updateItemDetails(index, 'ticketDetails', 'baggage', value)}
            />
          </div>

          {details.journeyType === 'multi_city' && renderMultiCitySectors(item, index)}

          {details.journeyType !== 'multi_city' && details.sameFlightForAll !== false && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-cyan-100 bg-cyan-50/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <TravelCompactAutocomplete
                labelKey="travel.booking.fields.airline"
                value={details.airlineId || ''}
                records={activeAirlines}
                getLabel={getAirlineLabel}
                getMeta={getAirlineMeta}
                placeholderKey="travel.airlines.search"
                emptyKey="travel.airlines.empty"
                disabled={accountingLocked}
                onChange={(value, airline) =>
                  updateTicketMasterSelection(
                    index,
                    'airlineId',
                    'airline',
                    value ? airline : null,
                    getAirlineText
                  )
                }
              />

              {!details.airlineId && (
                <TextField
                  labelKey="travel.booking.fields.airlineText"
                  value={details.airline}
                  disabled={accountingLocked}
                  onChange={(value) => updateItemDetails(index, 'ticketDetails', 'airline', value)}
                />
              )}

              <TravelCompactAutocomplete
                labelKey="travel.booking.fields.originAirport"
                value={details.originAirportId || ''}
                records={activeAirports}
                getLabel={getAirportLabel}
                getMeta={getAirportMeta}
                placeholderKey="travel.airports.search"
                emptyKey="travel.airports.empty"
                disabled={accountingLocked}
                onChange={(value, airport) =>
                  updateTicketMasterSelection(
                    index,
                    'originAirportId',
                    'origin',
                    value ? airport : null,
                    getAirportText
                  )
                }
              />

              {!details.originAirportId && (
                <TextField
                  labelKey="travel.booking.fields.originText"
                  value={details.origin}
                  disabled={accountingLocked}
                  onChange={(value) => updateItemDetails(index, 'ticketDetails', 'origin', value)}
                />
              )}

              <TravelCompactAutocomplete
                labelKey="travel.booking.fields.destinationAirport"
                value={details.destinationAirportId || ''}
                records={activeAirports}
                getLabel={getAirportLabel}
                getMeta={getAirportMeta}
                placeholderKey="travel.airports.search"
                emptyKey="travel.airports.empty"
                disabled={accountingLocked}
                onChange={(value, airport) =>
                  updateTicketMasterSelection(
                    index,
                    'destinationAirportId',
                    'destination',
                    value ? airport : null,
                    getAirportText
                  )
                }
              />

              {!details.destinationAirportId && (
                <TextField
                  labelKey="travel.booking.fields.destinationText"
                  value={details.destination}
                  disabled={accountingLocked}
                  onChange={(value) =>
                    updateItemDetails(index, 'ticketDetails', 'destination', value)
                  }
                />
              )}

              <TextField
                labelKey="travel.booking.fields.departureDateTime"
                type="datetime-local"
                value={details.departureDateTime}
                disabled={accountingLocked}
                onChange={(value) =>
                  updateItemDetails(index, 'ticketDetails', 'departureDateTime', value)
                }
              />

              {details.journeyType === 'round_trip' && (
                <>
                  <TravelCompactAutocomplete
                    labelKey="travel.booking.fields.returnOriginAirport"
                    value={details.returnOriginAirportId || ''}
                    records={activeAirports}
                    getLabel={getAirportLabel}
                    getMeta={getAirportMeta}
                    placeholderKey="travel.airports.search"
                    emptyKey="travel.airports.empty"
                    disabled={accountingLocked}
                    onChange={(value, airport) =>
                      updateTicketMasterSelection(
                        index,
                        'returnOriginAirportId',
                        'returnOrigin',
                        value ? airport : null,
                        getAirportText
                      )
                    }
                  />

                  {!details.returnOriginAirportId && (
                    <TextField
                      labelKey="travel.booking.fields.returnOriginText"
                      value={details.returnOrigin}
                      disabled={accountingLocked}
                      onChange={(value) =>
                        updateItemDetails(index, 'ticketDetails', 'returnOrigin', value)
                      }
                    />
                  )}

                  <TravelCompactAutocomplete
                    labelKey="travel.booking.fields.returnDestinationAirport"
                    value={details.returnDestinationAirportId || ''}
                    records={activeAirports}
                    getLabel={getAirportLabel}
                    getMeta={getAirportMeta}
                    placeholderKey="travel.airports.search"
                    emptyKey="travel.airports.empty"
                    disabled={accountingLocked}
                    onChange={(value, airport) =>
                      updateTicketMasterSelection(
                        index,
                        'returnDestinationAirportId',
                        'returnDestination',
                        value ? airport : null,
                        getAirportText
                      )
                    }
                  />

                  {!details.returnDestinationAirportId && (
                    <TextField
                      labelKey="travel.booking.fields.returnDestinationText"
                      value={details.returnDestination}
                      disabled={accountingLocked}
                      onChange={(value) =>
                        updateItemDetails(index, 'ticketDetails', 'returnDestination', value)
                      }
                    />
                  )}

                  <TextField
                    labelKey="travel.booking.fields.returnDateTime"
                    type="datetime-local"
                    value={details.returnDateTime}
                    disabled={accountingLocked}
                    onChange={(value) =>
                      updateItemDetails(index, 'ticketDetails', 'returnDateTime', value)
                    }
                  />
                </>
              )}
            </div>
          )}

          {selectedTravelerIds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black text-slate-800">Passenger Ticket Details</p>

              {selectedTravelerOccurrences.map((occurrence) => {
                const { travelerId, absoluteIndex } = occurrence;
                const traveler = activeTravelers.find(
                  (record) => String(record._id) === String(travelerId)
                );

                const passenger = (details.passengerTickets || [])[absoluteIndex] || {};

                return (
                  <div key={occurrence.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-black text-cyan-700">
                      {traveler ? getTravelerLabel(traveler) : travelerId}
                      {occurrence.occurrence > 0 ? ` · ${occurrence.occurrence + 1}` : ''}
                    </p>

                    <div
                      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
                        details.sameFlightForAll !== false ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
                      }`}
                    >
                      <label>
                        <FieldLabel>Passenger Type</FieldLabel>

                        <select
                          value={passenger.paxType || 'adult'}
                          disabled={accountingLocked}
                          onChange={(event) =>
                            updateTicketPassengerDetail(
                              index,
                              absoluteIndex,
                              'paxType',
                              event.target.value
                            )
                          }
                          className={selectClass}
                        >
                          <option value="adult">Adult</option>
                          <option value="child">Child</option>
                          <option value="infant">Infant</option>
                        </select>
                      </label>

                      <TextField
                        labelKey="travel.booking.fields.pnr"
                        value={passenger.pnr}
                        disabled={accountingLocked}
                        onChange={(value) =>
                          updateTicketPassengerDetail(index, absoluteIndex, 'pnr', value)
                        }
                      />

                      <TextField
                        labelKey="travel.booking.fields.ticketNumber"
                        value={passenger.ticketNumber}
                        disabled={accountingLocked}
                        onChange={(value) =>
                          updateTicketPassengerDetail(index, absoluteIndex, 'ticketNumber', value)
                        }
                      />

                      {details.sameFlightForAll === false && (
                        <>
                          <TravelCompactAutocomplete
                            labelKey="travel.booking.fields.airline"
                            value={passenger.airlineId || ''}
                            records={activeAirlines}
                            getLabel={getAirlineLabel}
                            getMeta={getAirlineMeta}
                            placeholderKey="travel.airlines.search"
                            emptyKey="travel.airlines.empty"
                            disabled={accountingLocked}
                            onChange={(value, airline) =>
                              updatePassengerTicketMasterSelection(
                                index,
                                absoluteIndex,
                                'airlineId',
                                'airline',
                                value ? airline : null,
                                getAirlineText
                              )
                            }
                          />

                          {!passenger.airlineId && (
                            <TextField
                              labelKey="travel.booking.fields.airlineText"
                              value={passenger.airline}
                              disabled={accountingLocked}
                              onChange={(value) =>
                                updateTicketPassengerDetail(index, absoluteIndex, 'airline', value)
                              }
                            />
                          )}

                          <TravelCompactAutocomplete
                            labelKey="travel.booking.fields.originAirport"
                            value={passenger.originAirportId || ''}
                            records={activeAirports}
                            getLabel={getAirportLabel}
                            getMeta={getAirportMeta}
                            placeholderKey="travel.airports.search"
                            emptyKey="travel.airports.empty"
                            disabled={accountingLocked}
                            onChange={(value, airport) =>
                              updatePassengerTicketMasterSelection(
                                index,
                                absoluteIndex,
                                'originAirportId',
                                'origin',
                                value ? airport : null,
                                getAirportText
                              )
                            }
                          />

                          {!passenger.originAirportId && (
                            <TextField
                              labelKey="travel.booking.fields.originText"
                              value={passenger.origin}
                              disabled={accountingLocked}
                              onChange={(value) =>
                                updateTicketPassengerDetail(index, absoluteIndex, 'origin', value)
                              }
                            />
                          )}

                          <TravelCompactAutocomplete
                            labelKey="travel.booking.fields.destinationAirport"
                            value={passenger.destinationAirportId || ''}
                            records={activeAirports}
                            getLabel={getAirportLabel}
                            getMeta={getAirportMeta}
                            placeholderKey="travel.airports.search"
                            emptyKey="travel.airports.empty"
                            disabled={accountingLocked}
                            onChange={(value, airport) =>
                              updatePassengerTicketMasterSelection(
                                index,
                                absoluteIndex,
                                'destinationAirportId',
                                'destination',
                                value ? airport : null,
                                getAirportText
                              )
                            }
                          />

                          {!passenger.destinationAirportId && (
                            <TextField
                              labelKey="travel.booking.fields.destinationText"
                              value={passenger.destination}
                              disabled={accountingLocked}
                              onChange={(value) =>
                                updateTicketPassengerDetail(index, absoluteIndex, 'destination', value)
                              }
                            />
                          )}

                          <TextField
                            labelKey="travel.booking.fields.departureDateTime"
                            type="datetime-local"
                            value={passenger.departureDateTime}
                            disabled={accountingLocked}
                            onChange={(value) =>
                              updateTicketPassengerDetail(
                                index,
                                absoluteIndex,
                                'departureDateTime',
                                value
                              )
                            }
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (item.itemType === 'visit_visa') {
      const details = item.visaDetails || {};

      const selectedTravelerIds = item.travelerIds || [];
      const selectedTravelerOccurrences = buildTravelerOccurrences(selectedTravelerIds);

      return (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField
              labelKey="travel.booking.fields.country"
              value={details.country}
              disabled={accountingLocked}
              onChange={(value) => updateItemDetails(index, 'visaDetails', 'country', value)}
            />

            <TextField
              labelKey="travel.booking.fields.visaType"
              value={details.visaType}
              disabled={accountingLocked}
              onChange={(value) => updateItemDetails(index, 'visaDetails', 'visaType', value)}
            />

            <TextField
              labelKey="travel.booking.fields.duration"
              value={details.duration}
              disabled={accountingLocked}
              onChange={(value) => updateItemDetails(index, 'visaDetails', 'duration', value)}
            />
          </div>

          {selectedTravelerIds.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-black text-slate-800">Traveler Visa Details</p>

              {selectedTravelerOccurrences.map((occurrence) => {
                const { travelerId, absoluteIndex } = occurrence;
                const traveler = activeTravelers.find(
                  (record) => String(record._id) === String(travelerId)
                );

                const visaTraveler = (details.travelerVisas || [])[absoluteIndex] || {};

                return (
                  <div key={occurrence.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-black text-cyan-700">
                      {traveler ? getTravelerLabel(traveler) : travelerId}
                      {occurrence.occurrence > 0 ? ` · ${occurrence.occurrence + 1}` : ''}
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label>
                        <FieldLabel>Passenger Type</FieldLabel>

                        <select
                          value={visaTraveler.paxType || 'adult'}
                          disabled={accountingLocked}
                          onChange={(event) =>
                            updateVisaTravelerDetail(
                              index,
                              absoluteIndex,
                              'paxType',
                              event.target.value
                            )
                          }
                          className={selectClass}
                        >
                          <option value="adult">Adult</option>
                          <option value="child">Child</option>
                          <option value="infant">Infant</option>
                        </select>
                      </label>

                      <TextField
                        labelKey="travel.booking.fields.passportNumber"
                        value={visaTraveler.passportNumber || traveler?.passportNumber || ''}
                        disabled={accountingLocked}
                        onChange={(value) =>
                          updateVisaTravelerDetail(index, absoluteIndex, 'passportNumber', value)
                        }
                      />

                      <TextField
                        labelKey="travel.booking.fields.reference"
                        value={visaTraveler.reference}
                        disabled={accountingLocked}
                        onChange={(value) =>
                          updateVisaTravelerDetail(index, absoluteIndex, 'reference', value)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                labelKey="travel.booking.fields.passportNumber"
                value={details.passportNumber}
                disabled={accountingLocked}
                onChange={(value) =>
                  updateItemDetails(index, 'visaDetails', 'passportNumber', value)
                }
              />

              <TextField
                labelKey="travel.booking.fields.reference"
                value={details.reference}
                disabled={accountingLocked}
                onChange={(value) => updateItemDetails(index, 'visaDetails', 'reference', value)}
              />
            </div>
          )}
        </div>
      );
    }

    if (item.itemType === 'hotel') {
      const details = item.hotelDetails || {};
      const filteredHotels = filterHotelsByCity(activeHotels, details.city);

      return (
        <div className="border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <TravelCityAutocomplete
              inputId={`hotel-city-${index}`}
              value={details.city || ''}
              onChange={(value) => updateHotelCity(index, value)}
              cities={activeCities}
              hotels={activeHotels}
              onCreate={canManageHotels ? createCityInline : null}
              disabled={accountingLocked}
            />

            <TravelCompactAutocomplete
              labelKey="travel.booking.fields.hotel"
              value={getRecordId(details.hotelId) || ''}
              records={filteredHotels}
              disabled={accountingLocked}
              getLabel={getHotelLabel}
              getMeta={(hotel) => hotel?.country || ''}
              placeholderKey="travel.placeholders.hotelName"
              onChange={(value, hotel) => {
                if (!value) {
                  updateItemDetails(index, 'hotelDetails', 'hotelId', '');
                  return;
                }
                selectHotelForItem(index, hotel);
              }}
              onQuickAdd={
                canManageHotels
                  ? (query) => {
                      if (!details.city) {
                        setFormError(t('travel.booking.alerts.selectCityFirst'));
                        document.getElementById(`hotel-city-${index}`)?.focus();
                        return;
                      }
                      return (
                      openModal('hotel', 'quick', {
                        query,
                        itemIndex: index,
                        city: details.city,
                      })
                      );
                    }
                  : null
              }
              onAddDetails={
                canManageHotels
                  ? (query) => {
                      if (!details.city) {
                        setFormError(t('travel.booking.alerts.selectCityFirst'));
                        document.getElementById(`hotel-city-${index}`)?.focus();
                        return;
                      }
                      return (
                      openModal('hotel', 'details', {
                        query,
                        itemIndex: index,
                        city: details.city,
                      })
                      );
                    }
                  : null
              }
            />

            <TextField
              labelKey="travel.booking.fields.checkIn"
              type="date"
              value={details.checkIn}
              disabled={accountingLocked}
              onChange={(value) => updateHotelDate(index, 'checkIn', value)}
            />

            <TextField
              labelKey="travel.booking.fields.checkOut"
              type="date"
              value={details.checkOut}
              disabled={accountingLocked}
              onChange={(value) => updateHotelDate(index, 'checkOut', value)}
            />

            <label className="min-w-0">
              <FieldLabel>Nights</FieldLabel>

              <input
                type="number"
                min="0"
                value={details.nights ?? ''}
                disabled
                className={`${fieldClass} bg-slate-50`}
              />
            </label>

            <TextField
              labelKey="travel.booking.fields.confirmationNumberOptional"
              value={details.confirmationNumber}
              disabled={accountingLocked}
              onChange={(value) =>
                updateItemDetails(index, 'hotelDetails', 'confirmationNumber', value)
              }
            />
          </div>

          {!accountingLocked && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={addAnotherHotel}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 px-3 text-xs font-extrabold text-cyan-800 transition hover:-translate-y-0.5 hover:shadow-sm"
              >
                <FaPlus aria-hidden="true" />
                {t('travel.booking.actions.addAnotherHotel')}
              </button>
            </div>
          )}
        </div>
      );
    }

    if (item.itemType === 'umrah_package') {
      const details = item.umrahDetails || {};
      const ticketDetails = item.ticketDetails || {};

      const makkahHotels = activeHotels.filter((hotel) => {
        const city = String(hotel?.city || '').toLowerCase();

        return city.includes('makkah') || city.includes('mecca');
      });

      const madinahHotels = activeHotels.filter((hotel) => {
        const city = String(hotel?.city || '').toLowerCase();

        return city.includes('madinah') || city.includes('madina') || city.includes('medina');
      });

      return (
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="min-w-0">
            <FieldLabel>Package Mode</FieldLabel>

            <select
              value={details.packageMode || 'complete_vendor_package'}
              disabled={accountingLocked}
              onChange={(event) =>
                updateItemDetails(index, 'umrahDetails', 'packageMode', event.target.value)
              }
              className={selectClass}
            >
              {umrahPackageModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <TextField
            labelKey="travel.booking.fields.packageName"
            value={details.packageName}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'umrahDetails', 'packageName', value)}
          />

          <TextField
            labelKey="travel.booking.fields.departureDate"
            type="date"
            value={details.departureDate}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'umrahDetails', 'departureDate', value)}
          />

          <TextField
            labelKey="travel.booking.fields.returnDate"
            type="date"
            value={details.returnDate}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'umrahDetails', 'returnDate', value)}
          />

          <TravelCompactAutocomplete
            labelKey="travel.booking.fields.airline"
            value={ticketDetails.airlineId || ''}
            records={activeAirlines}
            getLabel={getAirlineLabel}
            getMeta={getAirlineMeta}
            placeholderKey="travel.airlines.search"
            emptyKey="travel.airlines.empty"
            disabled={accountingLocked}
            onChange={(value, airline) =>
              updateTicketMasterSelection(
                index,
                'airlineId',
                'airline',
                value ? airline : null,
                getAirlineText
              )
            }
          />

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_96px] items-end gap-2 lg:col-span-2">
            <TravelCompactAutocomplete
              labelKey="travel.booking.fields.makkahHotel"
              value={getRecordId(details.makkahHotelId) || ''}
              records={makkahHotels}
              disabled={accountingLocked}
              getLabel={getHotelLabel}
              getMeta={(hotel) => hotel?.country || ''}
              placeholderKey="travel.placeholders.hotelName"
              onChange={(value) => updateItemDetails(index, 'umrahDetails', 'makkahHotelId', value)}
              onQuickAdd={
                canManageHotels
                  ? (query) =>
                      openModal('hotel', 'quick', {
                        query,
                        itemIndex: index,
                        group: 'umrahDetails',
                        field: 'makkahHotelId',
                      })
                  : null
              }
              onAddDetails={
                canManageHotels
                  ? (query) =>
                      openModal('hotel', 'details', {
                        query,
                        itemIndex: index,
                        group: 'umrahDetails',
                        field: 'makkahHotelId',
                      })
                  : null
              }
            />
            <TextField
              labelKey="travel.booking.fields.makkahNights"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={details.makkahNights}
              disabled={accountingLocked}
              onChange={(value) => {
                if (value === '' || /^\d+$/.test(value)) {
                  updateItemDetails(index, 'umrahDetails', 'makkahNights', value);
                }
              }}
            />
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_96px] items-end gap-2 lg:col-span-2">
            <TravelCompactAutocomplete
              labelKey="travel.booking.fields.madinahHotel"
              value={getRecordId(details.madinahHotelId) || ''}
              records={madinahHotels}
              disabled={accountingLocked}
              getLabel={getHotelLabel}
              getMeta={(hotel) => hotel?.country || ''}
              placeholderKey="travel.placeholders.hotelName"
              onChange={(value) => updateItemDetails(index, 'umrahDetails', 'madinahHotelId', value)}
              onQuickAdd={
                canManageHotels
                  ? (query) =>
                      openModal('hotel', 'quick', {
                        query,
                        itemIndex: index,
                        group: 'umrahDetails',
                        field: 'madinahHotelId',
                      })
                  : null
              }
              onAddDetails={
                canManageHotels
                  ? (query) =>
                      openModal('hotel', 'details', {
                        query,
                        itemIndex: index,
                        group: 'umrahDetails',
                        field: 'madinahHotelId',
                      })
                  : null
              }
            />
            <TextField
              labelKey="travel.booking.fields.madinahNights"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={details.madinahNights}
              disabled={accountingLocked}
              onChange={(value) => {
                if (value === '' || /^\d+$/.test(value)) {
                  updateItemDetails(index, 'umrahDetails', 'madinahNights', value);
                }
              }}
            />
          </div>

          {renderUmrahComponents(item, index)}
        </div>
      );
    }

    if (item.itemType === 'transport') {
      const details = item.transportDetails || {};

      return (
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            labelKey="travel.booking.fields.pickup"
            value={details.pickup}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'transportDetails', 'pickup', value)}
          />

          <TextField
            labelKey="travel.booking.fields.dropoff"
            value={details.dropoff}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'transportDetails', 'dropoff', value)}
          />

          <TextField
            labelKey="travel.booking.fields.dateTime"
            type="datetime-local"
            value={details.dateTime}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'transportDetails', 'dateTime', value)}
          />

          <TextField
            labelKey="travel.booking.fields.vehicleType"
            value={details.vehicleType}
            disabled={accountingLocked}
            onChange={(value) => updateItemDetails(index, 'transportDetails', 'vehicleType', value)}
          />
        </div>
      );
    }

    return (
      <div className="border-t border-slate-100 pt-3">
        <label className="block">
          <FieldLabel>{t('travel.booking.fields.description')}</FieldLabel>

          <textarea
            value={item.description || ''}
            disabled={accountingLocked}
            onChange={(event) => updateItemField(index, 'description', event.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </label>
      </div>
    );
  };

  const renderPaxPricing = (item, itemIndex) => {
    const rows =
      Array.isArray(item.paxPricing) && item.paxPricing.length
        ? item.paxPricing
        : [createEmptyPaxPricingRow('adult')];

    const renderPaxRow = (row, rowIndex) => {
      const paxType = row?.paxType || 'adult';
      const label = paxType === 'child' ? 'Child' : paxType === 'infant' ? 'Infant' : 'Adult';
      const rowKey = row?.uiKey || `${paxType}-${rowIndex}`;
      const showRowVendor =
        Boolean(row?.vendorId || row?.vendorPartyId) || Boolean(openRowVendorKeys[rowKey]);

      return (
        <div
          key={rowKey}
          className={`relative grid items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 ${
            showRowVendor
              ? 'grid-cols-[76px_72px_minmax(105px,0.7fr)_minmax(105px,0.7fr)_minmax(260px,1.6fr)_112px]'
              : 'grid-cols-[76px_72px_minmax(150px,1fr)_minmax(150px,1fr)_112px]'
          }`}
        >
          <div className="pb-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                paxType === 'adult'
                  ? 'bg-cyan-50 text-cyan-700'
                  : paxType === 'child'
                    ? 'bg-violet-50 text-violet-700'
                    : 'bg-amber-50 text-amber-700'
              }`}
            >
              {label}
            </span>
          </div>

          <label className="min-w-0">
            <FieldLabel>Qty</FieldLabel>

            <input
              type="number"
              min="0"
              step="1"
              value={row?.count ?? ''}
              disabled={accountingLocked}
              onChange={(event) =>
                updatePaxPricingRow(itemIndex, rowIndex, 'count', event.target.value)
              }
              className={fieldClass}
            />
          </label>

          <MoneyField
            labelKey="travel.booking.fields.costPrice"
            value={row?.costPrice}
            disabled={accountingLocked}
            currency={item.costCurrency}
            side="cost"
            baseCurrency={baseCurrency}
            onRateClick={openCurrencyRateModal}
            onChange={(value) => updatePaxPricingRow(itemIndex, rowIndex, 'costPrice', value)}
          />

          <MoneyField
            labelKey="travel.booking.fields.sellingPrice"
            value={row?.sellingPrice}
            disabled={accountingLocked}
            currency={item.sellingCurrency}
            side="sale"
            baseCurrency={baseCurrency}
            onRateClick={openCurrencyRateModal}
            onChange={(value) => updatePaxPricingRow(itemIndex, rowIndex, 'sellingPrice', value)}
          />

          {showRowVendor && (
            <div className="relative z-30 min-w-0">
              <TravelCompactAutocomplete
                labelKey="travel.booking.fields.vendor"
                value={getVendorCounterpartyValue(row)}
                records={vendorCounterparties}
                disabled={accountingLocked}
                getLabel={getVendorLabel}
                getMeta={getVendorMeta}
                placeholderKey="travel.placeholders.vendorName"
                onChange={(value, record) =>
                  updatePaxRowVendorCounterparty(itemIndex, rowIndex, value, record)
                }
                onQuickAdd={
                  canManageVendors
                    ? (query) => quickAddRecord('vendor', query, { itemIndex, rowIndex })
                    : null
                }
                onAddDetails={
                  canManageVendors
                    ? (query) => openModal('vendor', 'details', { query, itemIndex, rowIndex })
                    : null
                }
              />
            </div>
          )}

          <div className="flex h-10 items-center justify-end gap-2">
            {!accountingLocked && (
              <>
                <button
                  type="button"
                  onClick={() => addPaxPricingRow(itemIndex, rowIndex, paxType)}
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"
                  title="Add row"
                  aria-label="Add row"
                >
                  <FaPlus aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setOpenRowVendorKeys((current) => ({ ...current, [rowKey]: true }))
                  }
                  className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 ${
                    showRowVendor ? 'ring-1 ring-amber-200' : ''
                  }`}
                  title="Add vendor"
                  aria-label="Add vendor"
                >
                  <FaUserTie aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => removePaxPricingRow(itemIndex, rowIndex)}
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                  title="Delete row"
                  aria-label="Delete row"
                >
                  <FaTrash aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      );
    };

    const sourceTotals = calculateBookingItemSourceTotals({ ...item, paxPricing: rows });

    return (
      <div className="relative z-10 mt-3 overflow-visible rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/60 via-white to-sky-50/50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-900">Passenger Pricing</p>
          </div>

          {!accountingLocked && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addPaxPricingRow(itemIndex, null, 'child')}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-xs font-extrabold text-violet-700 transition hover:bg-violet-100"
              >
                <FaPlus aria-hidden="true" />
                Child
              </button>

              <button
                type="button"
                onClick={() => addPaxPricingRow(itemIndex, null, 'infant')}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-extrabold text-amber-700 transition hover:bg-amber-100"
              >
                <FaPlus aria-hidden="true" />
                Infant
              </button>
            </div>
          )}
        </div>

        <div className="relative overflow-visible">
          <div className="min-w-[760px] space-y-2 overflow-visible">{rows.map(renderPaxRow)}</div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <FieldLabel>{t('travel.fields.currency')}</FieldLabel>

            <CurrencySelect
              value={item.costCurrency}
              disabled={accountingLocked}
              onChange={(value) => updateItemCurrency(itemIndex, value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Cost</p>

              <p className="mt-1 text-sm font-black text-slate-800">
                {formatMoney(sourceTotals.cost, item.costCurrency)}
              </p>
            </div>

            <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase text-cyan-500">Total Sale</p>

              <p className="mt-1 text-sm font-black text-cyan-700">
                {formatMoney(sourceTotals.selling, item.sellingCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHotelRoomPricing = (item, itemIndex) => {
    const details = item.hotelDetails || {};

    const roomRows = Array.isArray(details.roomPricing) ? details.roomPricing : [];

    const chargePerRoom = details.chargePerRoom === true;

    const sourceTotals = calculateBookingItemSourceTotals(item);

    return (
      <div className="mt-3 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/50 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-slate-900">Hotel Room Pricing</p>

            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {chargePerRoom ? 'Room × Rate × Nights' : 'Persons × Rate × Nights'} —{' '}
              {numberValue(details.nights)} night(s)
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="w-28">
              <input
                type="number"
                min="0"
                step="1"
                value={details.nights ?? ''}
                disabled={accountingLocked}
                placeholder="Nights"
                onChange={(event) =>
                  updateItemDetails(itemIndex, 'hotelDetails', 'nights', event.target.value)
                }
                className={fieldClass}
              />
            </label>

            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-violet-200 bg-white px-3">
              <input
                type="checkbox"
                checked={chargePerRoom}
                disabled={accountingLocked}
                onChange={(event) =>
                  updateItemDetails(
                    itemIndex,
                    'hotelDetails',
                    'chargePerRoom',
                    event.target.checked
                  )
                }
                className="h-4 w-4 accent-violet-600"
              />

              <span className="text-xs font-extrabold text-slate-700">Charge Per Room</span>
            </label>

            {!accountingLocked && (
              <button
                type="button"
                onClick={() => addHotelRoomPricingRow(itemIndex)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:-translate-y-0.5"
              >
                <FaPlus aria-hidden="true" />
                Add Room Type
              </button>
            )}
          </div>
        </div>

        {roomRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-violet-200 bg-white px-3 py-4 text-center">
            {!accountingLocked && (
              <button
                type="button"
                onClick={() => addHotelRoomPricingRow(itemIndex)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-extrabold text-violet-700"
              >
                <FaPlus aria-hidden="true" />
                Add Room Type
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 overflow-x-auto">
            <div className="min-w-[760px] space-y-2">
              {roomRows.map((room, roomIndex) => {
                const customOccupancy = ['family', 'sharing', 'custom'].includes(room.roomType);

                return (
                  <div
                    key={`${itemIndex}-room-${roomIndex}`}
                    className="grid grid-cols-[150px_100px_100px_minmax(140px,1fr)_minmax(140px,1fr)_40px] items-end gap-2 rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <label className="min-w-0">
                      <FieldLabel>Room Type</FieldLabel>

                      <select
                        value={room.roomType || 'double'}
                        disabled={accountingLocked}
                        onChange={(event) =>
                          updateHotelRoomPricingRow(
                            itemIndex,
                            roomIndex,
                            'roomType',
                            event.target.value
                          )
                        }
                        className={selectClass}
                      >
                        {hotelRoomTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="min-w-0">
                      <FieldLabel>Persons</FieldLabel>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={room.occupancy ?? ''}
                        disabled={accountingLocked || chargePerRoom || !customOccupancy}
                        onChange={(event) =>
                          updateHotelRoomPricingRow(
                            itemIndex,
                            roomIndex,
                            'occupancy',
                            event.target.value
                          )
                        }
                        className={fieldClass}
                      />
                    </label>

                    <label className="min-w-0">
                      <FieldLabel>Rooms</FieldLabel>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={room.quantity ?? ''}
                        disabled={accountingLocked || !chargePerRoom}
                        onChange={(event) =>
                          updateHotelRoomPricingRow(
                            itemIndex,
                            roomIndex,
                            'quantity',
                            event.target.value
                          )
                        }
                        className={fieldClass}
                      />
                    </label>

                    <MoneyField
                      labelKey="travel.booking.fields.costPrice"
                      value={room.costPrice}
                      disabled={accountingLocked}
                      currency={item.costCurrency}
                      side="cost"
                      baseCurrency={baseCurrency}
                      onRateClick={openCurrencyRateModal}
                      onChange={(value) =>
                        updateHotelRoomPricingRow(itemIndex, roomIndex, 'costPrice', value)
                      }
                    />

                    <MoneyField
                      labelKey="travel.booking.fields.sellingPrice"
                      value={room.sellingPrice}
                      disabled={accountingLocked}
                      currency={item.sellingCurrency}
                      side="sale"
                      baseCurrency={baseCurrency}
                      onRateClick={openCurrencyRateModal}
                      onChange={(value) =>
                        updateHotelRoomPricingRow(itemIndex, roomIndex, 'sellingPrice', value)
                      }
                    />

                    <div className="flex h-10 items-center justify-center">
                      {!accountingLocked && (
                        <button
                          type="button"
                          onClick={() => removeHotelRoomPricingRow(itemIndex, roomIndex)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-xs text-rose-600 transition hover:bg-rose-100 sm:h-9 sm:w-9 sm:text-sm"
                          title="Remove room"
                        >
                          <FaTrash aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {room.roomType === 'custom' && (
                      <div className="col-span-full">
                        <TextField
                          labelKey="travel.booking.fields.roomType"
                          value={room.customRoomType}
                          disabled={accountingLocked}
                          onChange={(value) =>
                            updateHotelRoomPricingRow(itemIndex, roomIndex, 'customRoomType', value)
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <FieldLabel>{t('travel.fields.currency')}</FieldLabel>

            <CurrencySelect
              value={item.costCurrency}
              disabled={accountingLocked}
              onChange={(value) => updateItemCurrency(itemIndex, value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Cost</p>

              <p className="mt-1 text-sm font-black text-slate-800">
                {formatMoney(sourceTotals.cost, item.costCurrency)}
              </p>
            </div>

            <div className="rounded-lg border border-violet-100 bg-white px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase text-violet-500">Total Sale</p>

              <p className="mt-1 text-sm font-black text-violet-700">
                {formatMoney(sourceTotals.selling, item.sellingCurrency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderQuantityPricing = (item, itemIndex) => {
    const pricing = item.quantityPricing || {
      quantity: 1,
      unitLabel: 'Quantity',
      costPrice: '',
      sellingPrice: '',
    };

    const sourceTotals = calculateBookingItemSourceTotals({
      ...item,
      quantityPricing: pricing,
    });

    return (
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="min-w-0">
          <FieldLabel>Quantity</FieldLabel>

          <input
            type="number"
            min="1"
            step="1"
            value={pricing.quantity ?? ''}
            disabled={accountingLocked}
            onChange={(event) => updateQuantityPricing(itemIndex, 'quantity', event.target.value)}
            className={fieldClass}
          />
        </label>

        <MoneyField
          labelKey="travel.booking.fields.costPrice"
          value={pricing.costPrice}
          disabled={accountingLocked}
          currency={item.costCurrency}
          side="cost"
          baseCurrency={baseCurrency}
          onRateClick={openCurrencyRateModal}
          onChange={(value) => updateQuantityPricing(itemIndex, 'costPrice', value)}
        />

        <MoneyField
          labelKey="travel.booking.fields.sellingPrice"
          value={pricing.sellingPrice}
          disabled={accountingLocked}
          currency={item.sellingCurrency}
          side="sale"
          baseCurrency={baseCurrency}
          onRateClick={openCurrencyRateModal}
          onChange={(value) => updateQuantityPricing(itemIndex, 'sellingPrice', value)}
        />

        <label>
          <FieldLabel>{t('travel.fields.currency')}</FieldLabel>

          <CurrencySelect
            value={item.costCurrency}
            disabled={accountingLocked}
            onChange={(value) => updateItemCurrency(itemIndex, value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-extrabold uppercase text-slate-400">Total Cost</p>

            <p className="mt-1 text-sm font-black text-slate-800">
              {formatMoney(sourceTotals.cost, item.costCurrency)}
            </p>
          </div>

          <div className="rounded-lg border border-cyan-100 bg-white px-3 py-2">
            <p className="text-[10px] font-extrabold uppercase text-cyan-500">Total Sale</p>

            <p className="mt-1 text-sm font-black text-cyan-700">
              {formatMoney(sourceTotals.selling, item.sellingCurrency)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderInvoiceRow = (item, index) => {
    const useComponents =
      item.itemType === 'umrah_package' &&
      item.umrahDetails?.packageMode === 'custom_component_package';
    const isMultiCity =
      item.itemType === 'air_ticket' && item.ticketDetails?.journeyType === 'multi_city';
    const rowVendorsActive = !useComponents && !isMultiCity && isRowVendorMode(item);

    return (
      <div
        id={`travel-booking-item-${index}`}
        key={item._id || index}
        className="relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-200 hover:shadow-md"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50/50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-black text-white shadow-sm">
              {index + 1}
            </span>

            <span className="truncate text-xs font-extrabold text-slate-600">
              {getDefaultServiceTitle(item)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleItemDetails(index)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-100 bg-white text-cyan-700 transition hover:bg-cyan-50"
              title={t('travel.booking.actions.optionalDetails')}
            >
              {expandedItems[index] ? (
                <FaChevronUp aria-hidden="true" />
              ) : (
                <FaChevronDown aria-hidden="true" />
              )}
            </button>

            {!accountingLocked && formState.bookingItems.length > 1 && (
              <button
                type="button"
                onClick={() => removeBookingItem(index)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm transition hover:-translate-y-0.5"
                title={t('travel.booking.actions.removeItem')}
              >
                <FaTrash aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="p-3">
          <div
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
              showServiceAndTitle
                ? useComponents
                  ? 'xl:grid-cols-3'
                  : 'xl:grid-cols-4'
                : useComponents
                  ? 'xl:grid-cols-1'
                  : 'xl:grid-cols-2'
            }`}
          >
            <label className="min-w-0">
              <FieldLabel>{t('travel.booking.fields.bookingItem')}</FieldLabel>

              <select
                value={item.itemType || 'service'}
                disabled={accountingLocked}
                onChange={(event) => updateItemField(index, 'itemType', event.target.value)}
                className={selectClass}
              >
                {bookingItemTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            {showServiceAndTitle && (
              <>
                <TravelCompactAutocomplete
                  labelKey="travel.booking.fields.service"
                  value={getRecordId(item.serviceId) || ''}
                  records={activeServices}
                  disabled={accountingLocked}
                  getLabel={getServiceLabel}
                  getMeta={(service) => service?.code || ''}
                  placeholderKey="travel.placeholders.serviceName"
                  onChange={(_, service) => selectServiceForItem(index, service || {})}
                  onQuickAdd={
                    canManageServices
                      ? (query) =>
                          openModal('service', 'quick', {
                            query,
                            itemIndex: index,
                          })
                      : null
                  }
                  onAddDetails={
                    canManageServices
                      ? (query) =>
                          openModal('service', 'details', {
                            query,
                            itemIndex: index,
                          })
                      : null
                  }
                />

                <TextField
                  labelKey="travel.booking.fields.itemTitle"
                  value={item.title}
                  disabled={accountingLocked}
                  onChange={(value) => updateItemField(index, 'title', value)}
                />
              </>
            )}

            {!useComponents && !isMultiCity && (
              <div>
                <TravelCompactAutocomplete
                  labelKey="travel.booking.fields.vendor"
                  value={getVendorCounterpartyValue(item)}
                  records={vendorCounterparties}
                  disabled={accountingLocked || rowVendorsActive}
                  getLabel={getVendorLabel}
                  getMeta={getVendorMeta}
                  placeholderKey="travel.placeholders.vendorName"
                  onChange={(value, record) => updateItemVendorCounterparty(index, value, record)}
                  onQuickAdd={
                    canManageVendors && !rowVendorsActive
                      ? (query) => quickAddRecord('vendor', query, { itemIndex: index })
                      : null
                  }
                  onAddDetails={
                    canManageVendors && !rowVendorsActive
                      ? (query) => openModal('vendor', 'details', { query, itemIndex: index })
                      : null
                  }
                />
                {rowVendorsActive && (
                  <p className="mt-1 text-[11px] font-bold text-amber-700">Row vendors active</p>
                )}
              </div>
            )}
          </div>

          {!useComponents &&
            ['air_ticket', 'visit_visa'].includes(item.itemType) &&
            !isMultiCity &&
            renderPaxPricing(item, index)}

          {!useComponents &&
            item.itemType === 'umrah_package' &&
            item.umrahDetails?.packageMode !== 'custom_component_package' &&
            renderPaxPricing(item, index)}

          {!useComponents && item.itemType === 'hotel' && renderHotelRoomPricing(item, index)}

          {!useComponents &&
            ['transport', 'appointment', 'token', 'insurance', 'service', 'other'].includes(
              item.itemType
            ) &&
            renderQuantityPricing(item, index)}

          {expandedItems[index] && renderTravelerPicker(item, index)}

          {renderAdvancedDetails(item, index)}
        </div>
      </div>
    );
  };

  const attachments = formState.attachments || [];

  const showCustomerPayment = numberValue(formState.receivedAmount) > 0;

  const canSubmitFinal = !saving && !loading && (!isEditMode || !accountingLocked);
  const canSaveDocumentVersion = isEditMode ? canEdit : canCreate;
  const documentSaveChoices = getTravelDocumentSaveChoices({
    isEditMode,
    postedInvoiceEditing,
    currentStatus: formState.status,
  });

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-3 sm:p-4 md:p-5 lg:p-6">
      <TravelErrorModal open={Boolean(formError)} message={formError} onClose={() => setFormError('')} />

      {documentPrompt && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="travel-document-action-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-cyan-200 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-cyan-700 to-blue-700 px-5 py-4 text-white">
              <h2 id="travel-document-action-title" className="text-lg font-black">
                {documentPrompt.action === TRAVEL_DOCUMENT_ACTIONS.PRINT
                  ? 'Print Invoice'
                  : 'Download Invoice PDF'}
              </h2>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm font-semibold leading-6 text-slate-700">
                {isEditMode
                  ? 'This form contains changes that are not part of the last saved invoice. Save a new version before continuing, or use the last saved version.'
                  : 'An official invoice must be saved before it can be printed or downloaded. Choose how you want to save it.'}
              </p>

              {postedInvoiceEditing && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                  Saving this posted invoice requires the existing accounting entries to be safely reposted. Printing the last saved version does not repost accounting.
                </p>
              )}

              {!canSaveDocumentVersion && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  You do not have permission to save this invoice. You may only use the last saved version.
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4">
              <TravelActionButton
                variant="secondary"
                disabled={saving || documentActionLoading}
                onClick={() => setDocumentPrompt(null)}
              >
                Cancel
              </TravelActionButton>

              {isEditMode && (
                <TravelActionButton
                  icon={documentPrompt.action === TRAVEL_DOCUMENT_ACTIONS.PRINT ? FaPrint : FaFilePdf}
                  variant="secondary"
                  disabled={saving || documentActionLoading}
                  onClick={() => {
                    const action = documentPrompt.action;
                    setDocumentPrompt(null);
                    void performInvoiceDocumentAction(action, id, formState);
                  }}
                >
                  {documentPrompt.action === TRAVEL_DOCUMENT_ACTIONS.PRINT
                    ? 'Print Last Saved'
                    : 'PDF Last Saved'}
                </TravelActionButton>
              )}

              {canSaveDocumentVersion &&
                documentSaveChoices.map((choice) => (
                  <TravelActionButton
                    key={choice.status}
                    icon={documentPrompt.action === TRAVEL_DOCUMENT_ACTIONS.PRINT ? FaPrint : FaFilePdf}
                    variant={choice.status === 'confirmed' || choice.requiresRepost ? 'success' : 'soft'}
                    disabled={saving || documentActionLoading}
                    onClick={() => handleDocumentSaveChoice(choice.status)}
                  >
                    {choice.label} &amp;{' '}
                    {documentPrompt.action === TRAVEL_DOCUMENT_ACTIONS.PRINT ? 'Print' : 'PDF'}
                  </TravelActionButton>
                ))}
            </div>
          </div>
        </div>
      )}

      <TravelerDuplicateConfirmationModal
        open={Boolean(duplicateTravelerPrompt)}
        travelerName={duplicateTravelerPrompt?.travelerName || ''}
        onCancel={() => setDuplicateTravelerPrompt(null)}
        onAddAgain={() => {
          const prompt = duplicateTravelerPrompt;
          setDuplicateTravelerPrompt(null);
          if (prompt) {
            addItemTravelerOccurrence(
              prompt.itemIndex,
              prompt.travelerId,
              prompt.travelerRecord
            );
          }
        }}
      />

      <MatchingTravelersModal
        open={Boolean(matchingTravelersPrompt)}
        customerName={matchingTravelersPrompt?.customerName || ''}
        travelers={matchingTravelersPrompt?.travelers || []}
        onCancel={() => setMatchingTravelersPrompt(null)}
        onSelect={(traveler) => {
          const prompt = matchingTravelersPrompt;
          setMatchingTravelersPrompt(null);
          if (
            prompt &&
            formState.customerType === 'customer' &&
            String(getRecordId(formState.customerId)) === String(prompt.customerId)
          ) {
            assignCustomerTravelerToItem(prompt.itemIndex, prompt.customerId, traveler);
          }
        }}
      />

      {advanceConfirmationStatus && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="advance-confirmation-title">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-5 py-4 text-white">
              <h2 id="advance-confirmation-title" className="text-lg font-black">Extra Payment Confirmation</h2>
            </div>
            <div className="space-y-3 p-5">
              {advanceWarnings.map((row) => (
                <div key={row.key} className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="font-black text-slate-900">{row.label}: {row.name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><span className="block font-bold text-slate-500">{row.key === 'customer' ? 'Invoice Total' : 'Vendor Cost'}</span>{formatMoney(row.amount, baseCurrency)}</div>
                    <div><span className="block font-bold text-slate-500">{row.key === 'customer' ? 'Received Now' : 'Paid Now'}</span>{formatMoney(row.paymentNow, baseCurrency)}</div>
                    <div><span className="block font-bold text-slate-500">{row.key === 'customer' ? 'Invoice Due' : 'Vendor Due'}</span>{formatMoney(row.due, baseCurrency)}</div>
                    <div><span className="block font-bold text-emerald-700">Extra Payment</span>{formatMoney(row.extraPayment, baseCurrency)}</div>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                    {row.key === 'customer'
                      ? `This payment exceeds the current invoice by ${formatMoney(row.extraPayment, baseCurrency)}. The full receipt will be recorded in the customer ledger. The final ledger balance depends on any existing outstanding amounts or advances.`
                      : `This payment exceeds this invoice's cost for this vendor by ${formatMoney(row.extraPayment, baseCurrency)}. The full payment will be recorded in that vendor's ledger, whose final balance also reflects existing transactions.`}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <TravelActionButton
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  closeReservedPrintWindow(pendingSubmitOptionsRef.current || {});
                  pendingSubmitOptionsRef.current = null;
                  setAdvanceConfirmationStatus('');
                }}
              >
                Cancel
              </TravelActionButton>
              <TravelActionButton variant="success" disabled={saving} onClick={confirmExtraPaymentAndSave}>Confirm &amp; Save</TravelActionButton>
            </div>
          </div>
        </div>
      )}

      {repostConfirmation && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="repost-confirmation-title">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-4 text-white">
              <h2 id="repost-confirmation-title" className="text-lg font-black">Update Posted Invoice?</h2>
            </div>
            <div className="p-5">
              <p className="text-sm font-semibold leading-6 text-slate-700">
                This invoice has already been posted to accounting. The previous accounting entries will be safely reversed and the updated invoice will be posted again.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
              <TravelActionButton
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  closeReservedPrintWindow(pendingSubmitOptionsRef.current || {});
                  pendingSubmitOptionsRef.current = null;
                  setRepostConfirmation(null);
                }}
              >
                Cancel
              </TravelActionButton>
              <TravelActionButton
                variant="success"
                disabled={saving}
                onClick={() => {
                  const confirmation = repostConfirmation;
                  setRepostConfirmation(null);
                  void submitBooking(
                    confirmation.status,
                    confirmation.advanceConfirmed,
                    true,
                    pendingSubmitOptionsRef.current || {}
                  );
                }}
              >
                Update &amp; Repost
              </TravelActionButton>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="mb-3 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 px-4 py-3 text-sm font-bold text-cyan-700">
          {t('travel.common.loading')}
        </div>
      )}

      <div className="space-y-4">
        <section className={sectionClasses}>
          <div className="flex flex-col gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-3 py-2.5 sm:px-4 xl:flex-row xl:items-end xl:justify-between">
            {/* LEFT SIDE: Invoice + Date + Customer */}
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <div className="flex h-10 flex-shrink-0 items-center gap-2 pr-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-violet-700 shadow-sm ring-1 ring-black/5">
                  <FaClipboardList aria-hidden="true" />
                </span>

                <h2 className="whitespace-nowrap text-sm font-black text-slate-900">
                  {isEditMode ? 'Edit Invoice' : 'New Invoice'}
                </h2>
              </div>

              <div className="w-[155px] flex-shrink-0">
                <input
                  type="date"
                  value={formState.invoiceDate || ''}
                  disabled={accountingLocked}
                  onChange={(event) => updateRoot('invoiceDate', event.target.value)}
                  aria-label="Invoice Date"
                  className={fieldClass}
                />
              </div>

              <TravelCompactAutocomplete
                className="min-w-[260px] flex-1 xl:max-w-[520px]"
                value={getCustomerCounterpartyValue(formState)}
                records={customerCounterparties}
                disabled={accountingLocked}
                getLabel={getCustomerLabel}
                getMeta={getCustomerMeta}
                placeholderKey="travel.booking.placeholders.customerSearch"
                emptyKey="travel.booking.empty.customers"
                onChange={(value, record) => {
                  const selection = getCounterpartySelection(value, record, 'customer');

                  setFormState((current) => ({
                    ...current,
                    customerType: selection.type === 'party' ? 'party' : 'customer',
                    customerId: selection.type === 'party' ? '' : selection.id,
                    customerPartyId: selection.type === 'party' ? selection.id : '',
                  }));
                }}
                onQuickAdd={canCreate ? (query) => quickAddRecord('customer', query) : null}
                onAddDetails={
                  canCreate ? (query) => openModal('customer', 'details', { query }) : null
                }
              />
            </div>

            {/* RIGHT SIDE: Actions */}
            <div className="flex flex-shrink-0 flex-wrap items-end gap-2">
              <label
                className="inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-violet-200 bg-white px-3 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
                title="Show Service and Item Title"
              >
                <input
                  type="checkbox"
                  checked={showServiceAndTitle}
                  onChange={(event) => setShowServiceAndTitle(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <span>Service / Custom Title</span>
              </label>

              {!accountingLocked && (
                <button
                  type="button"
                  onClick={() => addBookingItem('service')}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 text-xs font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <FaPlus aria-hidden="true" />
                  {t('travel.booking.actions.addService')}
                </button>
              )}

              {!isEditMode && (
                <TravelActionButton
                  icon={FaTrash}
                  variant="secondary"
                  onClick={handleClearDraft}
                  disabled={loading || saving}
                >
                  {t('travel.booking.actions.clearDraft')}
                </TravelActionButton>
              )}

              <TravelActionButton
                icon={FaTimes}
                variant="secondary"
                onClick={() => navigate('/travel/bookings')}
              >
                {t('travel.common.cancel')}
              </TravelActionButton>
            </div>
          </div>

          <div className={`${sectionBodyClasses} space-y-3`}>
            {(formState.bookingItems || []).map(renderInvoiceRow)}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* LEFT SIDE — PAYMENTS ONLY */}
          <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
            <SectionHeader icon={FaMoneyBillWave} title="Payments & Totals" tone="emerald" />

            <div className={sectionBodyClasses}>
              <div className="space-y-4">
                {/* CUSTOMER RECEIPT */}
                <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                      <FaWallet aria-hidden="true" />
                    </span>

                    <p className="text-sm font-black text-slate-900">Customer Receipt</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MoneyField
                      labelKey="travel.booking.fields.discountAmount"
                      value={formState.discountAmount}
                      disabled={accountingLocked}
                      onChange={(value) => updateRoot('discountAmount', value)}
                    />

                    <MoneyField
                      labelKey="travel.booking.fields.receivedAmount"
                      value={formState.receivedAmount}
                      disabled={accountingLocked}
                      onChange={(value) => updateRoot('receivedAmount', value)}
                    />

                    <label>
                      <FieldLabel>{t('travel.booking.fields.paymentType')}</FieldLabel>

                      <select
                        value={formState.paymentType || 'cash'}
                        disabled={accountingLocked || !showCustomerPayment}
                        onChange={(event) => updateRoot('paymentType', event.target.value)}
                        className={selectClass}
                      >
                        <option value="cash">{t('payment.cash')}</option>
                        <option value="online">{t('payment.online')}</option>
                        <option value="cheque">{t('payment.cheque')}</option>
                      </select>
                    </label>

                    <label>
                      <FieldLabel>{t('travel.booking.fields.paymentAccount')}</FieldLabel>

                      <select
                        value={formState.accountId || ''}
                        disabled={accountingLocked || !showCustomerPayment}
                        onChange={(event) => updateRoot('accountId', event.target.value)}
                        className={selectClass}
                      >
                        <option value="">{t('travel.booking.placeholders.paymentAccount')}</option>

                        {paymentAccounts.map((account) => (
                          <option key={account._id} value={account._id}>
                            {[account.name, account.code].filter(Boolean).join(' - ')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {/* VENDOR PAYMENT */}
                <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                        <FaUserTie aria-hidden="true" />
                      </span>

                      <div>
                        <p className="text-sm font-black text-slate-900">Vendor Payment</p>

                        <p className="text-[11px] font-semibold text-slate-500">
                          {formatMoney(totals.vendorPaid, baseCurrency)} paid now
                        </p>
                      </div>
                    </div>
                  </div>

                  {vendorCostSummary.hasUnassignedCost && (
                    <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                      Unassigned vendor cost:{' '}
                      {formatMoney(vendorCostSummary.unassignedCostBase, baseCurrency)}
                    </div>
                  )}

                  <div className="space-y-2">
                    {vendorCostSummary.groups.map((group) => {
                      const payment = effectiveVendorPayments.find(
                        (candidate) => getVendorCounterpartyKey(candidate) === group.key
                      );

                      const paidAmount = numberValue(payment?.paidAmount);

                      const vendorBalance = totals.vendorBalances.find((row) => row.key === group.key);

                      const vendorRecord = vendorCounterparties.find(
                        (record) => String(record._id) === group.key
                      );

                      return (
                        <div
                          key={group.key}
                          className="rounded-lg border border-amber-100 bg-white p-2"
                        >
                          <div className="grid grid-cols-[minmax(150px,1fr)_130px_130px_130px] items-end gap-2 overflow-x-auto">
                            <div className="min-w-[150px] pb-2">
                              <p className="truncate text-xs font-black text-slate-900">
                                {vendorRecord ? getVendorLabel(vendorRecord) : group.key}
                              </p>

                              <p className="text-[10px] font-bold text-slate-500">
                                Cost {formatMoney(group.totalCostBase, baseCurrency)} ·{' '}
                                Due {formatMoney(vendorBalance?.invoiceVendorDue || 0, baseCurrency)}
                                {vendorBalance?.extraVendorPayment > 0
                                  ? ` · Extra ${formatMoney(vendorBalance.extraVendorPayment, baseCurrency)}`
                                  : ''}
                              </p>
                            </div>

                            <MoneyField
                              labelKey="travel.booking.fields.vendorPaidAmount"
                              value={payment?.paidAmount ?? ''}
                              disabled={accountingLocked}
                              accent
                              onChange={(value) =>
                                updateVendorPayment(group.key, 'paidAmount', value)
                              }
                            />

                            {paidAmount > 0 && (
                              <label>
                                <FieldLabel>Payment Type</FieldLabel>

                                <select
                                  value={payment?.paymentType || 'cash'}
                                  disabled={accountingLocked}
                                  onChange={(event) =>
                                    updateVendorPayment(
                                      group.key,
                                      'paymentType',
                                      event.target.value
                                    )
                                  }
                                  className={selectClass}
                                >
                                  <option value="cash">{t('payment.cash')}</option>
                                  <option value="online">{t('payment.online')}</option>
                                  <option value="cheque">{t('payment.cheque')}</option>
                                </select>
                              </label>
                            )}

                            {paidAmount > 0 && (
                              <label>
                                <FieldLabel>Payment Account</FieldLabel>

                                <select
                                  value={payment?.accountId || ''}
                                  disabled={accountingLocked}
                                  onChange={(event) =>
                                    updateVendorPayment(group.key, 'accountId', event.target.value)
                                  }
                                  className={selectClass}
                                >
                                  <option value="">
                                    {t('travel.booking.placeholders.paymentAccount')}
                                  </option>

                                  {paymentAccounts.map((account) => (
                                    <option key={account._id} value={account._id}>
                                      {[account.name, account.code].filter(Boolean).join(' - ')}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {!vendorCostSummary.groups.length && !vendorCostSummary.hasUnassignedCost && (
                      <p className="text-xs font-semibold text-slate-500">No vendor costs yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE — SUMMARY + ACTION BUTTONS */}
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FaUniversity className="text-cyan-600" />

                <p className="text-sm font-black text-slate-900">Invoice Summary</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniTotal
                  label="Invoice Total"
                  value={formatMoney(totals.invoiceTotal, baseCurrency)}
                  accent="text-blue-700"
                  icon={FaFileInvoiceDollar}
                />

                <MiniTotal
                  label="Customer Received"
                  value={formatMoney(totals.customerReceived, baseCurrency)}
                  accent="text-emerald-700"
                  icon={FaMoneyBillWave}
                />

                <MiniTotal
                  label="Customer Due"
                  value={formatMoney(totals.customerDue, baseCurrency)}
                  accent={totals.customerDue > 0 ? 'text-rose-700' : 'text-slate-700'}
                  icon={FaWallet}
                />

                <MiniTotal
                  label="Estimated Cost"
                  value={formatMoney(totals.estimatedCost, baseCurrency)}
                  icon={FaCoins}
                />

                <MiniTotal
                  label="Vendor Paid Now"
                  value={formatMoney(totals.vendorPaidNow, baseCurrency)}
                  accent="text-amber-700"
                  icon={FaMoneyBillWave}
                />

                <MiniTotal
                  label="Vendor Due"
                  value={formatMoney(totals.vendorDue, baseCurrency)}
                  accent="text-orange-700"
                  icon={FaUserTie}
                />

                <div className="col-span-2">
                  <MiniTotal
                    label="Estimated Profit"
                    value={formatMoney(totals.estimatedProfit, baseCurrency)}
                    accent={totals.estimatedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}
                    icon={FaFileInvoiceDollar}
                  />
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS UNDER INVOICE SUMMARY */}
            <div className="flex flex-wrap justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              {!accountingLocked && !postedInvoiceEditing && (
                <>
                  <TravelActionButton
                    icon={FaSave}
                    variant="secondary"
                    disabled={saving || loading}
                    onClick={() => submitBooking('draft')}
                  >
                    {t('travel.booking.actions.saveDraft')}
                  </TravelActionButton>

                  <TravelActionButton
                    icon={FaClipboardList}
                    variant="soft"
                    disabled={saving || loading}
                    onClick={() => submitBooking('quotation')}
                  >
                    {t('travel.booking.actions.saveQuotation')}
                  </TravelActionButton>

                  <TravelActionButton
                    icon={FaFileInvoiceDollar}
                    variant="success"
                    disabled={saving || loading || !canSubmitFinal}
                    onClick={() => submitBooking('confirmed')}
                  >
                    {saving
                      ? t('travel.common.saving')
                      : t('travel.booking.actions.confirmInvoice')}
                  </TravelActionButton>
                </>
              )}

              {postedInvoiceEditing && (
                <>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800">
                    <FaFileInvoiceDollar aria-hidden="true" />
                    Posted Invoice — Editing will repost accounting
                  </div>

                  <TravelActionButton
                    icon={FaSave}
                    variant="success"
                    disabled={saving || loading || !canSubmitFinal}
                    onClick={() =>
                      submitBooking(
                        ['confirmed', 'processing', 'completed'].includes(formState.status)
                          ? formState.status
                          : 'confirmed'
                      )
                    }
                  >
                    {saving ? t('travel.common.saving') : 'Update & Repost'}
                  </TravelActionButton>
                </>
              )}

              {accountingLocked && !postedInvoiceEditing && (
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700">
                  <FaSave aria-hidden="true" />
                  Accounting Posted
                </div>
              )}

              <TravelBookingDocumentButtons
                disabled={
                  saving ||
                  loading ||
                  documentActionLoading ||
                  (!isEditMode && !canCreate)
                }
                onPrint={() => handleDocumentRequest(TRAVEL_DOCUMENT_ACTIONS.PRINT)}
                onPdf={() => handleDocumentRequest(TRAVEL_DOCUMENT_ACTIONS.PDF)}
              />
            </div>
          </div>
        </section>

        <section className="overflow-visible rounded-xl border border-cyan-100 bg-white shadow-sm">
          {/* COMPACT MAIN ROW */}
          <div className="flex flex-wrap items-center gap-2 bg-gradient-to-r from-cyan-50 via-white to-sky-50 px-3 py-2.5">
            {/* Reminder title */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-cyan-700 shadow-sm ring-1 ring-black/5">
                <span className="text-base">🔔</span>
              </span>

              <span className="text-sm font-black text-slate-900">Reminder</span>
            </div>

            {/* Small Notes field */}
            <div className="min-w-[220px] flex-1">
              <input
                type="text"
                value={formState.notes || ''}
                disabled={accountingLocked}
                onChange={(event) => updateRoot('notes', event.target.value)}
                placeholder="Notes"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50"
              />
            </div>

            {/* Attachment icon only */}
            <label
              className={`relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-200 bg-white text-cyan-700 shadow-sm transition hover:bg-cyan-50 ${
                attachments.length >= MAX_ATTACHMENTS
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer'
              }`}
              title="Attach files"
            >
              <FaPaperclip aria-hidden="true" />

              {attachments.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-cyan-600 px-1 text-center text-[10px] font-black text-white">
                  {attachments.length}
                </span>
              )}

              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                disabled={accountingLocked || attachments.length >= MAX_ATTACHMENTS}
                onChange={handleAttachmentChange}
              />
            </label>

            {/* Current reminder status */}
            <span className="hidden rounded-full border border-cyan-100 bg-white px-2.5 py-1 text-[11px] font-extrabold text-cyan-700 sm:inline-flex">
              {formState.reminderSettings?.enabled === false
                ? 'Disabled'
                : `${Number(formState.reminderSettings?.leadMinutes || 1440) / 60}h before`}
            </span>

            {/* Expand / Collapse */}
            <button
              type="button"
              onClick={() => setReminderPanelOpen((current) => !current)}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
              title={reminderPanelOpen ? 'Hide reminder settings' : 'Show reminder settings'}
              aria-label={reminderPanelOpen ? 'Hide reminder settings' : 'Show reminder settings'}
            >
              {reminderPanelOpen ? (
                <FaChevronUp aria-hidden="true" />
              ) : (
                <FaChevronDown aria-hidden="true" />
              )}
            </button>
          </div>

          {/* EXPANDED AREA */}
          {reminderPanelOpen && (
            <div className="border-t border-cyan-100 bg-white p-2">
              <TravelBookingReminderControls
                value={formState.reminderSettings}
                businessSettings={reminderBusinessSettings}
                disabled={accountingLocked}
                onChange={updateReminderSettings}
                embedded
              />

              {/* Attached files only when expanded */}
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                  {attachments.map((attachment, index) => (
                    <div
                      key={attachment.key || `${attachment.name}-${index}`}
                      className="flex max-w-[280px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      {attachment.url ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate text-xs font-bold text-cyan-700"
                        >
                          {attachment.originalName || attachment.name || attachment.key}
                        </a>
                      ) : (
                        <span className="min-w-0 truncate text-xs font-bold text-slate-700">
                          {attachment.name}
                        </span>
                      )}

                      {!accountingLocked && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50"
                          title={t('travel.booking.actions.removeAttachment')}
                        >
                          <FaTimes aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <TravelCustomerFormModal
        open={modal?.type === 'customer' && modal?.mode === 'details'}
        values={modalValues}
        onChange={handleModalChange}
        onClose={closeModal}
        onSubmit={submitModal}
        submitting={modalSaving}
        error={modalError}
      />

      <TravelTravelerFormModal
        open={modal?.type === 'traveler' && modal?.mode === 'details'}
        values={modalValues}
        onChange={handleModalChange}
        onClose={closeModal}
        onSubmit={submitModal}
        submitting={modalSaving}
        error={modalError}
      />

      <TravelVendorFormModal
        open={modal?.type === 'vendor' && modal?.mode === 'details'}
        categories={categories}
        values={modalValues}
        onChange={handleModalChange}
        onClose={() => {
          if (modal?.context?.parentHotel && hotelModalDraftRef.current) {
            const parent = hotelModalDraftRef.current;
            hotelModalDraftRef.current = null;
            setModal(parent.modal);
            setModalValues(parent.values);
            setModalError('');
          } else {
            closeModal();
          }
        }}
        onSubmit={submitModal}
        submitting={modalSaving}
        error={modalError}
      />

      <TravelHotelFormModal
        open={modal?.type === 'hotel' && modal?.mode === 'details'}
        activeVendors={activeVendors}
        canManageVendors={canManageVendors}
        values={modalValues}
        onChange={handleModalChange}
        onClose={closeModal}
        onSubmit={submitModal}
        submitting={modalSaving}
        error={modalError}
        onQuickAddVendor={quickAddHotelVendor}
        onAddVendorDetails={openHotelVendorDetails}
        cities={activeCities}
        hotels={activeHotels}
        canManageCities={canManageHotels}
        onCreateCity={createCityInline}
      />

      <TravelCurrencyRateModal
        open={Boolean(rateModal)}
        currency={rateModal?.currency}
        side={rateModal?.side}
        currentInvoiceRate={rateModal?.currentInvoiceRate}
        currentDefaultRate={rateModal?.currentDefaultRate}
        baseCurrency={baseCurrency}
        sourceAmount={rateModal?.sourceAmount}
        required={Boolean(rateModal?.required)}
        canMakeDefault={canManageSettings}
        saving={rateModalSaving}
        error={rateModalError}
        onClose={() => {
          if (rateModalSaving) return;
          setRateModal(null);
          setRateModalError('');
        }}
        onApply={applyCurrencyRate}
      />

      <BookingRelationModal
        modal={
          modal &&
          (['service', 'category'].includes(modal.type) ||
            (modal.type === 'hotel' && modal.mode === 'quick'))
            ? modal
            : null
        }
        modalFields={modalFields}
        modalValues={modalValues}
        categories={categories}
        submitting={modalSaving}
        error={modalError}
        onChange={handleModalChange}
        onClose={closeModal}
        onSubmit={submitModal}
        onQuickAddCategory={(query) => openModal('category', 'quick', { query })}
      />
    </div>
  );
};

export default TravelBookingFormPage;
