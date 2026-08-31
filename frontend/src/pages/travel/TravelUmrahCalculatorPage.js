import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaCalculator,
  FaCalendarAlt,
  FaExchangeAlt,
  FaHotel,
  FaPlane,
  FaReceipt,
  FaRedo,
  FaSave,
} from 'react-icons/fa';

import { DEFAULT_TRAVEL_CURRENCY } from '../../config/travelConfig';
import { t } from '../../i18n/i18n';
import {
  fetchTravelAirlines,
  fetchTravelCurrencySettings,
  fetchTravelHotels,
} from '../../services/travelMasterService';
import {
  createEmptyBookingItem,
  createInitialBookingForm,
} from '../../components/travel/bookings/travelBookingConfig';
import {
  TravelActionButton,
  TravelCompactAutocomplete,
  TravelMasterPageFrame,
} from '../../components/travel/master/TravelMasterUI';
import { hasPermission } from '../../utils/permissionHelper';
import { buildTravelRouteState } from '../../utils/travelContext';
import {
  getFirstStayDate,
  getLastStayCheckoutDate,
  summarizeCityStays,
} from '../../utils/umrahTripPlanner';
import {
  DEFAULT_UMRAH_RATES,
  calculateUmrahPackage,
  clampWeekendNights,
  createEmptyCalculatorHotel,
  getCalculatorRatesFromSettings,
  getHotelNightBreakdown,
  getHotelSubtotalSar,
  normalizeHotelForCalculator,
  splitHotelsByUmrahCity,
} from '../../utils/umrahCalculator';

const panelClass =
  'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.07)]';

const inputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const selectClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

const numberValue = (value, fallback = 0) => {
  const amount = Number(value);

  return Number.isFinite(amount) ? amount : fallback;
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const formatMoney = (amount, currency = 'SAR') =>
  `${currency} ${Number(amount || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const getAirlineLabel = (airline) =>
  [airline?.name, airline?.iataCode ? `(${airline.iataCode})` : ''].filter(Boolean).join(' ') ||
  '-';

const getAirlineCleanName = (airline) => airline?.name || airline?.iataCode || '';

const getHotelLabel = (hotel) => [hotel?.name, hotel?.city].filter(Boolean).join(', ') || '-';

const getHotelMeta = (hotel) =>
  [
    hotel?.starRating ? `${hotel.starRating} ${t('travel.umrah.fields.star')}` : '',
    hotel?.distanceText,
    hotel?.defaultRate
      ? formatMoney(hotel.defaultRate, hotel.currency || DEFAULT_TRAVEL_CURRENCY)
      : '',
  ]
    .filter(Boolean)
    .join(' | ');

const CompactNumberField = ({
  placeholder,
  value,
  onChange,
  min = 0,
  step = '0.01',
  disabled = false,
  suffix = '',
}) => (
  <div className="relative min-w-0">
    <input
      type="number"
      min={min}
      step={step}
      value={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      title={placeholder}
      aria-label={placeholder}
      onWheel={(event) => event.currentTarget.blur()}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} ${suffix ? 'pr-14' : ''}`}
    />

    {suffix && (
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">
        {suffix}
      </span>
    )}
  </div>
);

const SummaryTile = ({ labelKey, label, value, tone = 'cyan', large = false }) => {
  const tones = {
    cyan: 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-100 text-cyan-950',
    emerald:
      'border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-100 text-emerald-950',
    amber:
      'border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 text-amber-950',
    rose: 'border-rose-200 bg-gradient-to-br from-rose-50 via-pink-50 to-red-100 text-rose-950',
    violet:
      'border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-100 text-violet-950',
    dark: 'border-slate-800 bg-gradient-to-br from-slate-900 via-cyan-950 to-emerald-950 text-white',
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${
        large ? 'px-4 py-4' : 'px-3 py-2.5'
      } ${tones[tone] || tones.cyan}`}
    >
      <div className="absolute -right-5 -top-6 h-16 w-16 rounded-full bg-white/20" />

      <div className="relative">
        <p
          className={`font-black uppercase tracking-wide opacity-65 ${
            large ? 'text-[11px]' : 'text-[9px]'
          }`}
        >
          {label || (labelKey ? t(labelKey) : '')}
        </p>

        <p className={`mt-1 truncate font-black ${large ? 'text-2xl' : 'text-base'}`}>{value}</p>
      </div>
    </div>
  );
};

const HotelCalculatorCard = ({ city, titleKey, hotels, value, rates, markWeekend, onChange }) => {
  const isMakkah = city === 'makkah';

  const selectedHotelId = value.hotelId || '';

  const subtotal = getHotelSubtotalSar(value, {
    markWeekend,
  });

  const breakdown = getHotelNightBreakdown(value, {
    markWeekend,
  });

  const setField = (field, nextValue) => {
    onChange({
      ...value,
      [field]: nextValue,
    });
  };

  return (
    <section className={panelClass}>
      <div
        className={`relative overflow-hidden px-4 py-4 text-white ${
          isMakkah
            ? 'bg-gradient-to-r from-emerald-800 via-teal-700 to-cyan-600'
            : 'bg-gradient-to-r from-cyan-800 via-sky-700 to-blue-600'
        }`}
      >
        <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg shadow-sm backdrop-blur-sm">
              <FaHotel aria-hidden="true" />
            </span>

            <div>
              <h2 className="text-base font-black">{t(titleKey)}</h2>

              <p className="mt-0.5 text-[11px] font-bold text-white/75">
                {breakdown.totalNights} {t('travel.booking.fields.nights')}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white/15 px-3 py-2 text-right backdrop-blur-sm">
            <p className="text-[9px] font-black uppercase tracking-wide text-white/70">
              {t('travel.umrah.summary.hotelSubtotal')}
            </p>

            <p className="text-base font-black">{formatMoney(subtotal, 'SAR')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 bg-gradient-to-b from-white to-slate-50/70 p-4">
        <TravelCompactAutocomplete
          labelKey="travel.fields.hotel"
          value={selectedHotelId}
          records={hotels}
          getLabel={getHotelLabel}
          getMeta={getHotelMeta}
          placeholderKey="travel.placeholders.hotelName"
          emptyKey="travel.hotels.empty"
          onChange={(selectedId, hotel) =>
            onChange(
              selectedId && hotel
                ? normalizeHotelForCalculator(hotel, city, rates, value)
                : {
                    ...value,
                    hotelId: '',
                    name: '',
                  }
            )
          }
        />

        <div className="grid grid-cols-2 gap-2">
          <CompactNumberField
            placeholder={t('travel.booking.fields.nights')}
            value={value.nights}
            min="0"
            step="1"
            suffix="NTS"
            onChange={(nextValue) =>
              onChange({
                ...value,
                nights: nextValue,
                weekendNights: clampWeekendNights(value.weekendNights, nextValue),
              })
            }
          />

          <CompactNumberField
            placeholder={t('travel.umrah.fields.pricePerNightSar')}
            value={value.pricePerNight}
            suffix="SAR"
            onChange={(nextValue) => setField('pricePerNight', nextValue)}
          />

          <CompactNumberField
            placeholder={t('travel.tripPlanner.weekendNights')}
            value={value.weekendNights}
            min="0"
            step="1"
            suffix="W/E"
            disabled={!markWeekend}
            onChange={(nextValue) =>
              setField('weekendNights', clampWeekendNights(nextValue, value.nights))
            }
          />

          <CompactNumberField
            placeholder={t('travel.umrah.fields.weekendPriceSar')}
            value={value.weekendPrice}
            suffix="SAR"
            disabled={!markWeekend}
            onChange={(nextValue) => setField('weekendPrice', nextValue)}
          />
        </div>

        {!markWeekend && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            Weekend pricing is off. All nights use the normal rate.
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <SummaryTile
            labelKey="travel.umrah.summary.normalNights"
            value={breakdown.normalNights}
            tone={isMakkah ? 'emerald' : 'cyan'}
          />

          <SummaryTile
            labelKey="travel.tripPlanner.weekendNights"
            value={breakdown.weekendNights}
            tone="amber"
          />

          <SummaryTile
            labelKey="travel.umrah.summary.weekendSubtotal"
            value={formatMoney(breakdown.weekendSubtotal, 'SAR')}
            tone="amber"
          />
        </div>
      </div>
    </section>
  );
};

const TravelUmrahCalculatorPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const appliedPlanRef = useRef(false);

  const [hotels, setHotels] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [currencySettings, setCurrencySettings] = useState(null);

  const [makkah, setMakkah] = useState(() => createEmptyCalculatorHotel('makkah'));

  const [madinah, setMadinah] = useState(() => createEmptyCalculatorHotel('madinah'));

  const [pax, setPax] = useState(1);
  const [airlineId, setAirlineId] = useState('');
  const [airlineName, setAirlineName] = useState('');
  const [ticketPrice, setTicketPrice] = useState(0);
  const [ticketCurrency, setTicketCurrency] = useState('SAR');

  const [visaMode, setVisaMode] = useState('auto');
  const [defaultVisaSAR, setDefaultVisaSAR] = useState(300);
  const [manualVisaSAR, setManualVisaSAR] = useState(0);

  const [rates, setRates] = useState(DEFAULT_UMRAH_RATES);

  const [packageName, setPackageName] = useState(t('travel.umrah.packageTitle'));

  const [markWeekend, setMarkWeekend] = useState(true);

  const [travelDates, setTravelDates] = useState({
    start: '',
    end: '',
  });

  const canCreateBooking = hasPermission('travel.bookings.create');

  const loadReferences = useCallback(async () => {
    try {
      setLoading(true);
      setPageError('');

      const [hotelData, airlineData, currencyData] = await Promise.all([
        fetchTravelHotels(),
        fetchTravelAirlines(),
        fetchTravelCurrencySettings(),
      ]);

      setHotels(Array.isArray(hotelData) ? hotelData : []);

      setAirlines(Array.isArray(airlineData) ? airlineData : []);

      setCurrencySettings(currencyData || null);

      setRates(getCalculatorRatesFromSettings(currencyData || null));
    } catch (error) {
      console.error('Travel Umrah calculator references failed:', error);

      setPageError(t('travel.umrah.alerts.referencesFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  const { makkahHotels, madinahHotels } = useMemo(() => splitHotelsByUmrahCity(hotels), [hotels]);

  useEffect(() => {
    if (makkah.hotelId || !makkahHotels.length) {
      return;
    }

    setMakkah((current) => normalizeHotelForCalculator(makkahHotels[0], 'makkah', rates, current));
  }, [makkah.hotelId, makkahHotels, rates]);

  useEffect(() => {
    if (madinah.hotelId || !madinahHotels.length) {
      return;
    }

    setMadinah((current) =>
      normalizeHotelForCalculator(madinahHotels[0], 'madinah', rates, current)
    );
  }, [madinah.hotelId, madinahHotels, rates]);

  const incomingPlan = location.state?.umrahPlan || null;

  const incomingPlannerOptions = location.state?.umrahPlannerOptions || {};

  useEffect(() => {
    if (!incomingPlan || appliedPlanRef.current) {
      return;
    }

    appliedPlanRef.current = true;

    const makkahSummary = summarizeCityStays(incomingPlan, 'makkah');

    const madinahSummary = summarizeCityStays(incomingPlan, 'madinah');

    const start = getFirstStayDate(incomingPlan);

    const end = getLastStayCheckoutDate(incomingPlan);

    const incomingMarkWeekend =
      typeof incomingPlannerOptions.markWeekend === 'boolean'
        ? incomingPlannerOptions.markWeekend
        : true;

    setMakkah((current) => ({
      ...current,
      nights: makkahSummary.nights || current.nights,
      weekendNights: makkahSummary.weekendNights,
    }));

    setMadinah((current) => ({
      ...current,
      nights: madinahSummary.nights || current.nights,
      weekendNights: madinahSummary.weekendNights,
    }));

    setMarkWeekend(incomingMarkWeekend);

    setTravelDates({
      start,
      end,
    });
  }, [incomingPlan, incomingPlannerOptions.markWeekend]);

  const selectedAirline = useMemo(
    () => airlines.find((airline) => String(airline?._id) === String(airlineId)) || null,
    [airlineId, airlines]
  );

  const activeAirlines = useMemo(
    () => airlines.filter((airline) => airline?.isDeleted !== true && airline?.isActive !== false),
    [airlines]
  );

  const totals = useMemo(
    () =>
      calculateUmrahPackage({
        makkah,
        madinah,
        pax,
        ticketPrice,
        ticketCurrency,
        visaMode,
        defaultVisaSAR,
        manualVisaSAR,
        rates,
        markWeekend,
      }),
    [
      defaultVisaSAR,
      madinah,
      makkah,
      manualVisaSAR,
      pax,
      rates,
      markWeekend,
      ticketCurrency,
      ticketPrice,
      visaMode,
    ]
  );

  const updateRates = (field, value) => {
    setRates((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleReset = () => {
    setMakkah(createEmptyCalculatorHotel('makkah'));

    setMadinah(createEmptyCalculatorHotel('madinah'));

    setPax(1);
    setAirlineId('');
    setAirlineName('');
    setTicketPrice(0);
    setTicketCurrency('SAR');
    setVisaMode('auto');
    setDefaultVisaSAR(300);
    setManualVisaSAR(0);

    setPackageName(t('travel.umrah.packageTitle'));

    setMarkWeekend(true);

    setTravelDates({
      start: '',
      end: '',
    });
  };

  const getCityStaySummary = (city) =>
    incomingPlan ? summarizeCityStays(incomingPlan, city) : null;

  const buildHotelComponent = (city, hotel) => {
    const staySummary = getCityStaySummary(city);

    const breakdown = getHotelNightBreakdown(hotel, {
      markWeekend,
    });

    return {
      componentType: 'hotel',
      label: t(`travel.umrah.components.${city}Hotel`),

      hotelId: hotel.hotelId || '',

      costPrice: 0,
      sellingPrice: breakdown.subtotalSar,

      costCurrency: 'SAR',
      sellingCurrency: 'SAR',

      hotelPricing: {
        city,

        checkIn: staySummary?.firstCheckIn || '',

        checkOut: staySummary?.lastCheckout || '',

        nights: breakdown.totalNights,

        normalNights: breakdown.normalNights,

        weekendNights: breakdown.weekendNights,

        normalRate: breakdown.normalRate,

        weekendRate: breakdown.weekendRate,

        normalSubtotal: breakdown.normalSubtotal,

        weekendSubtotal: breakdown.weekendSubtotal,

        sellingSubtotal: breakdown.subtotalSar,

        costSubtotal: 0,

        markWeekend,

        usesNightlyBreakdown: true,

        chargePerRoom: true,

        roomPricing: [
          {
            roomType: 'double',
            customRoomType: '',
            occupancy: 2,
            quantity: 1,
            costPrice: 0,
            sellingPrice: breakdown.normalRate,
          },
        ],
      },

      quantityPricing: null,
      paxPricing: [],
      vendorPaidAmount: '',
      notes: hotel.name || '',
    };
  };

  const buildBookingPrefill = () => {
    const form = createInitialBookingForm('umrah_package');

    const item = createEmptyBookingItem('umrah_package');

    const safePax = Math.max(1, numberValue(pax, 1));

    const perPackageSar = totals.totalSAR;

    const perPaxSar = roundMoney(perPackageSar / safePax);

    const selectedAirlineName = selectedAirline
      ? getAirlineCleanName(selectedAirline)
      : airlineName;

    const startDate = travelDates.start || '';

    const endDate = travelDates.end || '';

    const makkahBreakdown = getHotelNightBreakdown(makkah, {
      markWeekend,
    });

    const madinahBreakdown = getHotelNightBreakdown(madinah, {
      markWeekend,
    });

    const calculatorRateSnapshot = {
      SAR_to_PKR: roundMoney(numberValue(rates.SAR_to_PKR, 0)),
      USD_to_PKR: roundMoney(numberValue(rates.USD_to_PKR, 0)),
      USD_to_SAR: roundMoney(numberValue(totals.rates?.USD_to_SAR, 0)),
    };

    const components = [
      buildHotelComponent('makkah', makkah),

      buildHotelComponent('madinah', madinah),

      {
        componentType: 'air_ticket',

        label: selectedAirlineName
          ? `${t('travel.umrah.components.ticket')} - ${selectedAirlineName}`
          : t('travel.umrah.components.ticket'),

        costCurrency: ticketCurrency,
        sellingCurrency: ticketCurrency,

        paxPricing: [
          {
            paxType: 'adult',
            count: safePax,
            costPrice: 0,
            sellingPrice: numberValue(ticketPrice, 0),
          },
        ],

        quantityPricing: null,
        hotelPricing: null,
        vendorPaidAmount: '',
        notes: selectedAirlineName || '',
      },

      {
        componentType: 'visit_visa',

        label: t('travel.umrah.components.visa'),

        costCurrency: 'SAR',
        sellingCurrency: 'SAR',

        paxPricing: [
          {
            paxType: 'adult',
            count: 1,
            costPrice: 0,
            sellingPrice: totals.visaSAR,
          },
        ],

        quantityPricing: null,
        hotelPricing: null,
        vendorPaidAmount: '',
      },
    ];

    return {
      ...form,

      serviceType: 'umrah_package',

      travelStartDate: startDate,
      travelEndDate: endDate,

      bookingItems: [
        {
          ...item,

          itemType: 'umrah_package',

          title: packageName || t('travel.umrah.packageTitle'),

          description: [
            `${t('travel.umrah.summary.totalSar')}: ${formatMoney(totals.totalSAR, 'SAR')}`,

            `${t('travel.umrah.summary.totalBase')}: ${formatMoney(
              totals.totalPKR,
              currencySettings?.baseCurrency || 'PKR'
            )}`,

            `${t('travel.umrah.summary.totalUsd')}: ${formatMoney(totals.totalUSD, 'USD')}`,
          ].join('\n'),

          costPrice: 0,
          sellingPrice: totals.totalSAR,

          costCurrency: 'SAR',
          sellingCurrency: 'SAR',

          paxPricing: [
            {
              paxType: 'adult',
              count: safePax,
              costPrice: 0,
              sellingPrice: perPaxSar,
            },
          ],

          ticketDetails: {
            ...(item.ticketDetails || {}),

            journeyType: 'round_trip',

            airline: selectedAirlineName || '',

            airlineId: airlineId || '',

            departureDateTime: startDate ? `${startDate}T00:00` : '',

            returnDateTime: endDate ? `${endDate}T00:00` : '',
          },

          umrahDetails: {
            ...(item.umrahDetails || {}),

            packageMode: 'custom_component_package',

            packageName: packageName || t('travel.umrah.packageTitle'),

            departureDate: startDate,

            returnDate: endDate,

            makkahHotelId: makkah.hotelId || '',

            madinahHotelId: madinah.hotelId || '',

            syncPassengerCountsToComponents: false,

            plannerInfo: incomingPlan
              ? {
                  travelStartDate: startDate,

                  travelEndDate: endDate,

                  durationDays: incomingPlan.raw?.totalDays || '',

                  hotelNights: incomingPlan.raw?.hotelNights || '',

                  startCity: incomingPlan.raw?.startCity || '',

                  exitCity: incomingPlan.raw?.exitCity || '',

                  distribution: incomingPlan.raw?.distribution || [],

                  excludeArrival: Boolean(incomingPlannerOptions.excludeArrival),

                  excludeExit: Boolean(incomingPlannerOptions.excludeExit),

                  markWeekend,

                  selectedFridayAdjustments:
                    incomingPlan.selectedFridayAdjustments ||
                    incomingPlannerOptions.fridayAdjustments ||
                    {},

                  travelInfos: incomingPlan.travelInfos || [],

                  itinerary: incomingPlan.adjustedSegments || incomingPlan.segments || [],
                }
              : {
                  travelStartDate: startDate,

                  travelEndDate: endDate,

                  markWeekend,
                },

            pricingSummary: {
              pax: safePax,

              ticketPrice: numberValue(ticketPrice, 0),

              ticketCurrency,

              visaSAR: totals.visaSAR,

              rates: calculatorRateSnapshot,

              totals: {
                SAR: totals.totalSAR,

                base: totals.totalPKR,

                USD: totals.totalUSD,

                baseCurrency: currencySettings?.baseCurrency || 'PKR',
              },

              hotels: {
                makkah: {
                  hotelId: makkah.hotelId || '',

                  hotelName: makkah.name || '',

                  ...makkahBreakdown,
                },

                madinah: {
                  hotelId: madinah.hotelId || '',

                  hotelName: madinah.name || '',

                  ...madinahBreakdown,
                },
              },

              airlineId: airlineId || '',

              airlineName: selectedAirlineName || '',
            },

            components,
          },
        },
      ],

      notes: incomingPlan ? t('travel.umrah.notes.fromTripPlanner') : '',
    };
  };

  const handleSendToBooking = () => {
    if (!canCreateBooking) {
      alert(t('travel.alerts.permissionDenied'));

      return;
    }

    navigate('/travel/bookings/new', {
      state: {
        ...buildTravelRouteState('/travel/umrah-calculator'),

        travelBookingPrefill: buildBookingPrefill(),
      },
    });
  };

  const baseCurrency = currencySettings?.baseCurrency || 'PKR';

  const ticketTotalSAR =
    totals.ticketTotalSAR ?? roundMoney(totals.ticketPriceInSAR * Math.max(1, numberValue(pax, 1)));

  return (
    <TravelMasterPageFrame
      titleKey="travel.umrah.title"
      actions={
        <div className="flex flex-wrap gap-2">
          <TravelActionButton icon={FaRedo} variant="secondary" onClick={handleReset}>
            {t('travel.umrah.actions.clear')}
          </TravelActionButton>

          <TravelActionButton
            icon={FaReceipt}
            variant="primary"
            onClick={handleSendToBooking}
            disabled={loading || !canCreateBooking}
          >
            {t('travel.umrah.actions.sendToBooking')}
          </TravelActionButton>
        </div>
      }
    >
      {pageError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-sm">
          {pageError}
        </div>
      )}

      {loading && (
        <div className="mb-4 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 px-4 py-3 text-sm font-bold text-cyan-800 shadow-sm">
          {t('travel.common.loading')}
        </div>
      )}

      <div className="rounded-3xl bg-gradient-to-br from-cyan-50/70 via-white to-emerald-50/60 p-1">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <section className="relative z-50 rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.07)]">
              <div className="relative overflow-hidden bg-gradient-to-r from-cyan-700 via-sky-600 to-blue-700 px-4 py-4 text-white">
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />

                <div className="absolute -bottom-10 right-20 h-24 w-24 rounded-full bg-cyan-300/10" />

                <div className="relative flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg shadow-sm backdrop-blur-sm">
                    <FaPlane aria-hidden="true" />
                  </span>

                  <div>
                    <h2 className="text-base font-black">
                      {t('travel.umrah.sections.ticketsVisa')}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-b from-white to-slate-50/60 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <CompactNumberField
                    placeholder={t('travel.umrah.fields.pax')}
                    value={pax}
                    min="1"
                    step="1"
                    suffix="PAX"
                    onChange={(value) => setPax(Math.max(1, numberValue(value, 1)))}
                  />

                  <div className="relative z-[100]">
                    <TravelCompactAutocomplete
                      value={airlineId}
                      records={activeAirlines}
                      getLabel={getAirlineLabel}
                      getMeta={(airline) => airline?.country || airline?.icaoCode || ''}
                      placeholderKey="travel.airlines.search"
                      emptyKey="travel.airlines.empty"
                      className="travel-airline-autocomplete"
                      onChange={(value, airline) => {
                        setAirlineId(value || '');

                        setAirlineName(airline ? getAirlineCleanName(airline) : '');
                      }}
                    />
                  </div>

                  <CompactNumberField
                    placeholder={t('travel.umrah.fields.ticketPrice')}
                    value={ticketPrice}
                    suffix={ticketCurrency}
                    onChange={setTicketPrice}
                  />

                  <select
                    value={ticketCurrency}
                    title={t('travel.umrah.fields.ticketCurrency')}
                    aria-label={t('travel.umrah.fields.ticketCurrency')}
                    onChange={(event) => setTicketCurrency(event.target.value)}
                    className={selectClass}
                  >
                    <option value="SAR">Ticket Currency — SAR</option>

                    <option value="USD">Ticket Currency — USD</option>

                    <option value="PKR">Ticket Currency — PKR</option>
                  </select>

                  <select
                    value={visaMode}
                    title={t('travel.umrah.fields.visaMode')}
                    aria-label={t('travel.umrah.fields.visaMode')}
                    onChange={(event) => setVisaMode(event.target.value)}
                    className={selectClass}
                  >
                    <option value="auto">Visa — {t('travel.umrah.visaMode.auto')}</option>

                    <option value="manual">Visa — {t('travel.umrah.visaMode.manual')}</option>
                  </select>

                  {visaMode === 'auto' ? (
                    <CompactNumberField
                      placeholder={t('travel.umrah.fields.defaultVisaSar')}
                      value={defaultVisaSAR}
                      suffix="SAR"
                      onChange={setDefaultVisaSAR}
                    />
                  ) : (
                    <CompactNumberField
                      placeholder={t('travel.umrah.fields.manualVisaSar')}
                      value={manualVisaSAR}
                      suffix="SAR"
                      onChange={setManualVisaSAR}
                    />
                  )}

                  <input
                    type="text"
                    value={packageName}
                    placeholder={t('travel.booking.fields.packageName')}
                    title={t('travel.booking.fields.packageName')}
                    aria-label={t('travel.booking.fields.packageName')}
                    onChange={(event) => setPackageName(event.target.value)}
                    className={`${inputClass} xl:col-span-2`}
                  />
                </div>

                <label
                  className={`mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-bold shadow-sm transition ${
                    markWeekend
                      ? 'border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={markWeekend}
                    onChange={(event) => setMarkWeekend(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />

                  <span>{t('travel.tripPlanner.markWeekend')}</span>

                  <span
                    className={`ml-auto rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                      markWeekend ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {markWeekend ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <HotelCalculatorCard
                city="makkah"
                titleKey="travel.umrah.sections.makkahHotels"
                hotels={makkahHotels}
                value={makkah}
                rates={rates}
                markWeekend={markWeekend}
                onChange={setMakkah}
              />

              <HotelCalculatorCard
                city="madinah"
                titleKey="travel.umrah.sections.madinahHotels"
                hotels={madinahHotels}
                value={madinah}
                rates={rates}
                markWeekend={markWeekend}
                onChange={setMadinah}
              />
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-3 xl:self-start">
            <section className={panelClass}>
              <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 px-4 py-3 text-white">
                <div className="absolute -right-6 -top-8 h-20 w-20 rounded-full bg-white/15" />

                <div className="relative flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <FaExchangeAlt aria-hidden="true" />
                  </span>

                  <div>
                    <h2 className="text-sm font-black">{t('travel.umrah.sections.rates')}</h2>

                    <p className="text-[10px] font-bold text-white/80">
                      Pakistani Rupee Exchange Rates
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-gradient-to-b from-white to-amber-50/30 p-4">
                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    1 SAR = PKR
                  </p>

                  <CompactNumberField
                    placeholder="1 SAR = PKR"
                    value={rates.SAR_to_PKR}
                    suffix="PKR"
                    onChange={(value) => updateRates('SAR_to_PKR', value)}
                  />
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    1 USD = PKR
                  </p>

                  <CompactNumberField
                    placeholder="1 USD = PKR"
                    value={rates.USD_to_PKR}
                    suffix="PKR"
                    onChange={(value) => updateRates('USD_to_PKR', value)}
                  />
                </div>

                <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-3 py-2">
                  <p className="text-[10px] font-bold text-amber-700">Calculated USD → SAR</p>

                  <p className="mt-0.5 text-sm font-black text-amber-950">
                    1 USD ≈{' '}
                    {Number(totals.rates?.USD_to_SAR || 0).toLocaleString('en-GB', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}{' '}
                    SAR
                  </p>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <div className="relative overflow-hidden bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 px-4 py-3 text-white">
                <div className="absolute -right-7 -top-8 h-24 w-24 rounded-full bg-white/10" />

                <div className="relative flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                    <FaCalculator aria-hidden="true" />
                  </span>

                  <div>
                    <h2 className="text-sm font-black">{t('travel.umrah.summary.title')}</h2>

                    <p className="text-[10px] font-bold text-white/80">Live Package Calculation</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-gradient-to-b from-white to-emerald-50/30 p-4">
                <SummaryTile
                  label="GRAND TOTAL"
                  value={formatMoney(totals.totalPKR, baseCurrency)}
                  tone="dark"
                  large
                />

                <div className="grid grid-cols-2 gap-2">
                  <SummaryTile
                    labelKey="travel.umrah.summary.makkahTotal"
                    value={formatMoney(totals.makkahTotalSAR, 'SAR')}
                    tone="emerald"
                  />

                  <SummaryTile
                    labelKey="travel.umrah.summary.madinahTotal"
                    value={formatMoney(totals.madinahTotalSAR, 'SAR')}
                    tone="cyan"
                  />

                  <SummaryTile
                    labelKey="travel.umrah.summary.ticketTotal"
                    value={formatMoney(ticketTotalSAR, 'SAR')}
                    tone="amber"
                  />

                  <SummaryTile
                    labelKey="travel.umrah.summary.visaTotal"
                    value={formatMoney(totals.visaSAR, 'SAR')}
                    tone="violet"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <SummaryTile
                    labelKey="travel.umrah.summary.totalSar"
                    value={formatMoney(totals.totalSAR, 'SAR')}
                    tone="emerald"
                  />

                  <SummaryTile
                    labelKey="travel.umrah.summary.totalUsd"
                    value={formatMoney(totals.totalUSD, 'USD')}
                    tone="amber"
                  />
                </div>

                {(travelDates.start || travelDates.end) && (
                  <div className="rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 px-3 py-3 text-xs font-bold text-slate-700">
                    <div className="flex items-start gap-2">
                      <FaCalendarAlt className="mt-0.5 shrink-0 text-cyan-700" aria-hidden="true" />

                      <div className="min-w-0">
                        <p>
                          {t('travel.booking.fields.travelStartDate')}:{' '}
                          <span className="font-black">{travelDates.start || '-'}</span>
                        </p>

                        <p className="mt-1">
                          {t('travel.booking.fields.travelEndDate')}:{' '}
                          <span className="font-black">{travelDates.end || '-'}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <TravelActionButton
                  icon={FaSave}
                  variant="primary"
                  onClick={handleSendToBooking}
                  disabled={!canCreateBooking}
                >
                  {t('travel.umrah.actions.sendToBooking')}
                </TravelActionButton>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </TravelMasterPageFrame>
  );
};

export default TravelUmrahCalculatorPage;
