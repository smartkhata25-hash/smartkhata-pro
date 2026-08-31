import { DEFAULT_TRAVEL_CURRENCY } from '../../../../config/travelConfig';

export const sanitizeDraftState = (state) => ({
  ...state,

  attachments: [],

  keepAttachmentKeys: [],

  bookingItems: (state.bookingItems || []).map((item) => ({
    ...item,

    paxPricing: (item.paxPricing || []).map((row) => ({
      ...row,
    })),

    quantityPricing: item.quantityPricing
      ? {
          ...item.quantityPricing,
        }
      : null,

    ticketDetails: {
      ...(item.ticketDetails || {}),

      pnr: '',

      ticketNumber: '',

      passengerTickets: (item.ticketDetails?.passengerTickets || []).map((passenger) => ({
        ...passenger,

        pnr: '',

        ticketNumber: '',
      })),
    },

    visaDetails: {
      ...(item.visaDetails || {}),

      passportNumber: '',

      reference: '',

      travelerVisas: (item.visaDetails?.travelerVisas || []).map((traveler) => ({
        ...traveler,

        passportNumber: '',

        reference: '',
      })),
    },

    hotelDetails: {
      ...(item.hotelDetails || {}),

      roomPricing: (item.hotelDetails?.roomPricing || []).map((row) => ({
        ...row,
      })),

      confirmationNumber: '',
    },

    umrahDetails: {
      ...(item.umrahDetails || {}),

      components: (item.umrahDetails?.components || []).map((component) => ({
        ...component,

        paxPricing: (component.paxPricing || []).map((row) => ({
          ...row,
        })),

        quantityPricing: component.quantityPricing
          ? {
              ...component.quantityPricing,
            }
          : null,

        hotelPricing: component.hotelPricing
          ? {
              ...component.hotelPricing,

              roomPricing: (component.hotelPricing?.roomPricing || []).map((row) => ({
                ...row,
              })),
            }
          : null,
      })),
    },
  })),
});

export const upsertRecord = (records, record) => {
  const safeRecords = Array.isArray(records) ? records : [];

  if (!record?._id) {
    return safeRecords;
  }

  const index = safeRecords.findIndex((item) => String(item?._id) === String(record._id));

  if (index === -1) {
    return [record, ...safeRecords];
  }

  const nextRecords = [...safeRecords];

  nextRecords[index] = {
    ...nextRecords[index],

    ...record,
  };

  return nextRecords;
};

export const compactPayload = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(compactPayload)
      .filter((item) => item !== '' && item !== null && item !== undefined);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((result, [key, child]) => {
      const nextValue = compactPayload(child);

      if (
        nextValue === '' ||
        nextValue === null ||
        nextValue === undefined ||
        (Array.isArray(nextValue) && nextValue.length === 0)
      ) {
        return result;
      }

      result[key] = nextValue;

      return result;
    }, {});
  }

  return value;
};

const parseMoney = (value) => {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
};

const parseQuantity = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) {
    return fallback;
  }

  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity < 0) {
    return fallback;
  }

  return Math.floor(quantity);
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const hasPricingValue = (value) => value !== undefined && value !== null && value !== '';

const normalizeCurrencyCode = (value) =>
  String(value || DEFAULT_TRAVEL_CURRENCY)
    .trim()
    .toUpperCase();

const buildRateMap = (currencySettings, calculatorRates = null) => {
  const baseCurrency = normalizeCurrencyCode(
    currencySettings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY
  );

  const rates = new Map([[baseCurrency, 1]]);

  (currencySettings?.rates || []).forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);

    const rateToBase = Number(rate?.rateToBase || 0);

    if (currency) {
      rates.set(currency, Number.isFinite(rateToBase) && rateToBase > 0 ? rateToBase : 0);
    }
  });

  if (baseCurrency === 'PKR' && calculatorRates) {
    const sarToPkr = Number(calculatorRates?.SAR_to_PKR || 0);
    const usdToPkr = Number(calculatorRates?.USD_to_PKR || 0);

    if (Number.isFinite(sarToPkr) && sarToPkr > 0) {
      rates.set('SAR', sarToPkr);
    }

    if (Number.isFinite(usdToPkr) && usdToPkr > 0) {
      rates.set('USD', usdToPkr);
    }
  }

  return {
    baseCurrency,
    rates,
  };
};

const getCalculatorRateSnapshot = (formState = {}) => {
  const items = Array.isArray(formState?.bookingItems) ? formState.bookingItems : [];

  for (const item of items) {
    if (item?.itemType === 'umrah_package' && item?.umrahDetails?.pricingSummary?.rates) {
      return item.umrahDetails.pricingSummary.rates;
    }
  }

  return null;
};

const estimateAmount = (amount, currency, settings) => {
  const numericAmount = parseMoney(amount);

  if (!numericAmount) {
    return 0;
  }

  const safeCurrency = normalizeCurrencyCode(currency);

  if (safeCurrency === settings.baseCurrency) {
    return numericAmount;
  }

  const rate = Number(settings.rates.get(safeCurrency) || 0);

  return rate > 0 ? numericAmount * rate : 0;
};

const inferRoomOccupancy = (row = {}) => {
  const explicitOccupancy = parseQuantity(row?.occupancy, 0);

  if (explicitOccupancy > 0) {
    return explicitOccupancy;
  }

  const roomType = String(row?.roomType || '')
    .trim()
    .toLowerCase();

  const customRoomType = String(row?.customRoomType || '')
    .trim()
    .toLowerCase();

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

  if (occupancyMap[roomType]) {
    return occupancyMap[roomType];
  }

  const searchableText = `${roomType} ${customRoomType}`;

  const sharingMatch = searchableText.match(
    /(?:^|\s)(\d+)\s*(?:sharing|share|pax|person|persons|head|heads)(?:\s|$)/
  );

  if (sharingMatch) {
    return Number(sharingMatch[1]) || 0;
  }

  return 0;
};

const calculatePaxPricingTotals = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows.reduce(
    (result, row) => {
      const count = parseQuantity(row?.count, 0);

      result.selling += count * parseMoney(row?.sellingPrice);

      result.cost += count * parseMoney(row?.costPrice);

      return result;
    },
    {
      selling: 0,

      cost: 0,
    }
  );
};

const calculateQuantityPricingTotals = (pricing) => {
  if (!pricing || typeof pricing !== 'object') {
    return null;
  }

  const quantity = parseQuantity(pricing.quantity, 0);

  return {
    selling: quantity * parseMoney(pricing.sellingPrice),

    cost: quantity * parseMoney(pricing.costPrice),
  };
};

const calculateHotelRoomTotals = (hotelDetails = {}) => {
  const rows = Array.isArray(hotelDetails?.roomPricing) ? hotelDetails.roomPricing : [];

  if (rows.length === 0) {
    return null;
  }

  const nights = parseQuantity(hotelDetails?.nights, 0);

  const chargePerRoom =
    hotelDetails?.chargePerRoom === true || hotelDetails?.chargePerRoom === 'true';

  return rows.reduce(
    (result, row) => {
      const multiplier = chargePerRoom ? parseQuantity(row?.quantity, 0) : inferRoomOccupancy(row);

      result.selling += multiplier * parseMoney(row?.sellingPrice) * nights;

      result.cost += multiplier * parseMoney(row?.costPrice) * nights;

      return result;
    },
    {
      selling: 0,

      cost: 0,
    }
  );
};

const calculateUmrahHotelPricingTotals = (hotelPricing) => {
  if (!hotelPricing || typeof hotelPricing !== 'object') {
    return null;
  }

  if (hotelPricing.usesNightlyBreakdown === true) {
    const nights = parseQuantity(hotelPricing.nights, 0);

    const weekendNights = Math.min(parseQuantity(hotelPricing.weekendNights, 0), nights);

    const normalNights = hasPricingValue(hotelPricing.normalNights)
      ? parseQuantity(hotelPricing.normalNights, Math.max(0, nights - weekendNights))
      : Math.max(0, nights - weekendNights);

    const normalRate = parseMoney(hotelPricing.normalRate);

    const weekendRate = hasPricingValue(hotelPricing.weekendRate)
      ? parseMoney(hotelPricing.weekendRate)
      : normalRate;

    const normalSubtotal = hasPricingValue(hotelPricing.normalSubtotal)
      ? parseMoney(hotelPricing.normalSubtotal)
      : normalNights * normalRate;

    const weekendSubtotal = hasPricingValue(hotelPricing.weekendSubtotal)
      ? parseMoney(hotelPricing.weekendSubtotal)
      : weekendNights * weekendRate;

    return {
      selling: hasPricingValue(hotelPricing.sellingSubtotal)
        ? parseMoney(hotelPricing.sellingSubtotal)
        : normalSubtotal + weekendSubtotal,

      cost: hasPricingValue(hotelPricing.costSubtotal) ? parseMoney(hotelPricing.costSubtotal) : 0,
    };
  }

  return calculateHotelRoomTotals({
    nights: hotelPricing.nights,

    chargePerRoom: hotelPricing.chargePerRoom,

    roomPricing: hotelPricing.roomPricing,
  });
};

export const calculateUmrahComponentSourceTotals = (component = {}) => {
  if (
    component.hotelPricing &&
    (component.hotelPricing.usesNightlyBreakdown === true ||
      (Array.isArray(component.hotelPricing?.roomPricing) &&
        component.hotelPricing.roomPricing.length > 0))
  ) {
    const hotelTotals = calculateUmrahHotelPricingTotals(component.hotelPricing);

    if (hotelTotals) {
      return {
        selling: roundMoney(hotelTotals.selling),

        cost: roundMoney(hotelTotals.cost),
      };
    }
  }

  const paxTotals = calculatePaxPricingTotals(component.paxPricing);

  if (paxTotals) {
    return {
      selling: roundMoney(paxTotals.selling),

      cost: roundMoney(paxTotals.cost),
    };
  }

  const quantityTotals = calculateQuantityPricingTotals(component.quantityPricing);

  if (quantityTotals) {
    return {
      selling: roundMoney(quantityTotals.selling),

      cost: roundMoney(quantityTotals.cost),
    };
  }

  return {
    selling: roundMoney(parseMoney(component.sellingPrice)),

    cost: roundMoney(parseMoney(component.costPrice)),
  };
};

export const calculateBookingItemSourceTotals = (item = {}) => {
  if (
    item.itemType === 'hotel' &&
    Array.isArray(item.hotelDetails?.roomPricing) &&
    item.hotelDetails.roomPricing.length > 0
  ) {
    const roomTotals = calculateHotelRoomTotals(item.hotelDetails);

    if (roomTotals) {
      return {
        selling: roundMoney(roomTotals.selling),

        cost: roundMoney(roomTotals.cost),
      };
    }
  }

  const paxTotals = calculatePaxPricingTotals(item.paxPricing);

  if (paxTotals) {
    return {
      selling: roundMoney(paxTotals.selling),

      cost: roundMoney(paxTotals.cost),
    };
  }

  const quantityTotals = calculateQuantityPricingTotals(item.quantityPricing);

  if (quantityTotals) {
    return {
      selling: roundMoney(quantityTotals.selling),

      cost: roundMoney(quantityTotals.cost),
    };
  }

  return {
    selling: roundMoney(parseMoney(item.sellingPrice)),

    cost: roundMoney(parseMoney(item.costPrice)),
  };
};

export const calculateLocalTotals = (formState, currencySettings) => {
  const calculatorRates = getCalculatorRateSnapshot(formState);

  const settings = buildRateMap(currencySettings, calculatorRates);

  const totals = (formState.bookingItems || []).reduce(
    (result, item) => {
      const useComponents =
        item.itemType === 'umrah_package' &&
        item.umrahDetails?.packageMode === 'custom_component_package' &&
        Array.isArray(item.umrahDetails?.components) &&
        item.umrahDetails.components.length > 0;

      if (useComponents) {
        item.umrahDetails.components.forEach((component) => {
          const sourceTotals = calculateUmrahComponentSourceTotals(component);

          const componentSelling = estimateAmount(
            sourceTotals.selling,

            component.sellingCurrency,

            settings
          );

          const componentCost = estimateAmount(
            sourceTotals.cost,

            component.costCurrency,

            settings
          );

          const componentVendorPaid = estimateAmount(
            component.vendorPaidAmount,

            component.costCurrency,

            settings
          );

          result.selling += componentSelling;

          result.cost += componentCost;

          result.vendorPaid += Math.min(
            Math.max(componentVendorPaid, 0),

            Math.max(componentCost, 0)
          );
        });

        return result;
      }

      const sourceTotals = calculateBookingItemSourceTotals(item);

      const itemSelling = estimateAmount(
        sourceTotals.selling,

        item.sellingCurrency,

        settings
      );

      const itemCost = estimateAmount(
        sourceTotals.cost,

        item.costCurrency,

        settings
      );

      const itemVendorPaid = estimateAmount(
        item.vendorPaidAmount,

        item.costCurrency,

        settings
      );

      result.selling += itemSelling;

      result.cost += itemCost;

      result.vendorPaid += Math.min(
        Math.max(itemVendorPaid, 0),

        Math.max(itemCost, 0)
      );

      return result;
    },
    {
      selling: 0,

      cost: 0,

      vendorPaid: 0,

      baseCurrency: settings.baseCurrency,
    }
  );

  const selling = roundMoney(totals.selling);

  const cost = roundMoney(totals.cost);

  const vendorPaid = roundMoney(Math.min(totals.vendorPaid, totals.cost));

  const discount = roundMoney(parseMoney(formState.discountAmount));

  const received = roundMoney(parseMoney(formState.receivedAmount));

  const net = roundMoney(Math.max(selling - discount, 0));

  const due = roundMoney(Math.max(net - received, 0));

  const vendorPayable = roundMoney(Math.max(cost - vendorPaid, 0));

  const profit = roundMoney(net - cost);

  return {
    selling,

    cost,

    vendorPaid,

    vendorPaidTotal: vendorPaid,

    discount,

    received,

    net,

    due,

    vendorPayable,

    profit,

    baseCurrency: settings.baseCurrency,
  };
};
