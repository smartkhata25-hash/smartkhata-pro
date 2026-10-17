import {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCIES,
} from '../../../../config/travelConfig';

export const sanitizeDraftState = (state) => ({
  ...state,

  attachments: [],

  keepAttachmentKeys: [],

  vendorPayments: (state.vendorPayments || []).map((payment) => ({ ...payment })),

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

      sectors: (item.ticketDetails?.sectors || []).map((sector) => ({
        ...sector,
        paxPricing: (sector.paxPricing || []).map((row) => ({ ...row })),
      })),

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

export const normalizeDualCurrencyRates = (currencySettings = null) => {
  const baseCurrency = normalizeCurrencyCode(
    currencySettings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY
  );

  return (currencySettings?.rates || []).map((rate) => {
    const legacyRate = Number(rate?.rateToBase || 0);
    const costRate = Number(rate?.costRateToBase ?? legacyRate);
    const saleRate = Number(rate?.saleRateToBase ?? legacyRate);
    return {
      currency: normalizeCurrencyCode(rate?.currency),
      costRateToBase: Number.isFinite(costRate) && costRate >= 0 ? costRate : 0,
      saleRateToBase: Number.isFinite(saleRate) && saleRate >= 0 ? saleRate : 0,
    };
  }).filter((rate) => rate.currency && rate.currency !== baseCurrency);
};

export const captureCurrencyRateSnapshot = (currencySettings = null) =>
  normalizeDualCurrencyRates(currencySettings).map((rate) => ({ ...rate }));

export const updateInvoiceCurrencyRate = (snapshot, currency, side, value) => {
  const code = normalizeCurrencyCode(currency);
  const field = side === 'cost' ? 'costRateToBase' : 'saleRateToBase';
  const numeric = Number(value);
  if (!code || !Number.isFinite(numeric) || numeric < 0) return snapshot || [];
  const rows = Array.isArray(snapshot) ? snapshot.map((row) => ({ ...row })) : [];
  const index = rows.findIndex((row) => normalizeCurrencyCode(row.currency) === code);
  if (index >= 0) rows[index][field] = numeric;
  else rows.push({ currency: code, costRateToBase: 0, saleRateToBase: 0, [field]: numeric });
  return rows;
};

export const getInvoiceCurrencyRate = (
  snapshot,
  currency,
  side,
  baseCurrency = DEFAULT_TRAVEL_CURRENCY
) => {
  const code = normalizeCurrencyCode(currency);
  if (code === normalizeCurrencyCode(baseCurrency)) return 1;
  const row = (snapshot || []).find(
    (candidate) => normalizeCurrencyCode(candidate?.currency) === code
  );
  const rate = Number(side === 'cost' ? row?.costRateToBase : row?.saleRateToBase);
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
};

export const getMissingInvoiceCurrencyRateSides = (
  snapshot,
  currency,
  baseCurrency = DEFAULT_TRAVEL_CURRENCY
) => {
  const code = normalizeCurrencyCode(currency);
  if (code === normalizeCurrencyCode(baseCurrency)) return [];
  return ['cost', 'sale'].filter(
    (side) => getInvoiceCurrencyRate(snapshot, code, side, baseCurrency) <= 0
  );
};

const buildRateMap = (currencySettings, currencyRateSnapshot = [], calculatorRates = null) => {
  const baseCurrency = normalizeCurrencyCode(
    currencySettings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY
  );

  const costRates = new Map([[baseCurrency, 1]]);
  const saleRates = new Map([[baseCurrency, 1]]);

  normalizeDualCurrencyRates(currencySettings).forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);
    if (currency) {
      costRates.set(currency, rate.costRateToBase);
      saleRates.set(currency, rate.saleRateToBase);
    }
  });

  const snapshotCurrencies = new Set();
  (currencyRateSnapshot || []).forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);
    if (!currency || currency === baseCurrency) return;
    snapshotCurrencies.add(currency);
    const costRate = Number(rate?.costRateToBase);
    const saleRate = Number(rate?.saleRateToBase);
    if (Number.isFinite(costRate) && costRate >= 0) costRates.set(currency, costRate);
    if (Number.isFinite(saleRate) && saleRate >= 0) saleRates.set(currency, saleRate);
  });

  if (baseCurrency === 'PKR' && calculatorRates) {
    const sarToPkr = Number(calculatorRates?.SAR_to_PKR || 0);
    const usdToPkr = Number(calculatorRates?.USD_to_PKR || 0);

    if (Number.isFinite(sarToPkr) && sarToPkr > 0) {
      if (!snapshotCurrencies.has('SAR') && !(costRates.get('SAR') > 0)) costRates.set('SAR', sarToPkr);
      if (!snapshotCurrencies.has('SAR') && !(saleRates.get('SAR') > 0)) saleRates.set('SAR', sarToPkr);
    }

    if (Number.isFinite(usdToPkr) && usdToPkr > 0) {
      if (!snapshotCurrencies.has('USD') && !(costRates.get('USD') > 0)) costRates.set('USD', usdToPkr);
      if (!snapshotCurrencies.has('USD') && !(saleRates.get('USD') > 0)) saleRates.set('USD', usdToPkr);
    }
  }

  return {
    baseCurrency,
    costRates,
    saleRates,
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

const estimateAmount = (amount, currency, settings, side) => {
  const numericAmount = parseMoney(amount);

  if (!numericAmount) {
    return 0;
  }

  const safeCurrency = normalizeCurrencyCode(currency);

  if (safeCurrency === settings.baseCurrency) {
    return numericAmount;
  }

  const rates = side === 'cost' ? settings.costRates : settings.saleRates;
  const rate = Number(rates.get(safeCurrency) || 0);

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
    item.itemType === 'air_ticket' &&
    item.ticketDetails?.journeyType === 'multi_city' &&
    Array.isArray(item.ticketDetails?.sectors) &&
    item.ticketDetails.sectors.length > 0
  ) {
    const sectorTotals = item.ticketDetails.sectors.reduce(
      (totals, sector) => {
        const pricing = calculatePaxPricingTotals(sector.paxPricing);
        totals.selling += pricing?.selling || 0;
        totals.cost += pricing?.cost || 0;
        return totals;
      },
      { selling: 0, cost: 0 }
    );

    return {
      selling: roundMoney(sectorTotals.selling),
      cost: roundMoney(sectorTotals.cost),
    };
  }

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

const addRateCandidate = (map, currency, side, sourceAmount, baseAmount, baseCurrency) => {
  const code = normalizeCurrencyCode(currency);
  const source = Number(sourceAmount || 0);
  const base = Number(baseAmount || 0);
  if (!code || code === baseCurrency || source <= 0 || base <= 0) return;
  const rate = base / source;
  if (!Number.isFinite(rate) || rate <= 0) return;
  const key = `${code}:${side}`;
  map.set(key, [...(map.get(key) || []), rate]);
};

const consistentRate = (values = []) => {
  if (!values.length) return 0;
  if (!values.every((value) => Math.abs(value - values[0]) <= 0.01)) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
};

export const resolveBookingCurrencyRateSnapshot = (booking = {}, currencySettings = null) => {
  const baseCurrency = normalizeCurrencyCode(
    booking?.baseCurrency || currencySettings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY
  );
  const saved = new Map(
    (booking?.currencyRateSnapshot || []).map((row) => [
      normalizeCurrencyCode(row?.currency),
      {
        currency: normalizeCurrencyCode(row?.currency),
        costRateToBase: Number(row?.costRateToBase || 0),
        saleRateToBase: Number(row?.saleRateToBase || 0),
      },
    ])
  );
  const candidates = new Map();

  if (saved.size === 0) {
    (booking?.bookingItems || []).forEach((item) => {
      const useComponents =
        item?.itemType === 'umrah_package' &&
        item?.umrahDetails?.packageMode === 'custom_component_package' &&
        Array.isArray(item?.umrahDetails?.components) &&
        item.umrahDetails.components.length > 0;
      if (useComponents) {
        item.umrahDetails.components.forEach((component) => {
          const totals = calculateUmrahComponentSourceTotals(component);
          addRateCandidate(candidates, component.costCurrency, 'cost', totals.cost, component.estimatedCostBase, baseCurrency);
          addRateCandidate(candidates, component.sellingCurrency, 'sale', totals.selling, component.estimatedSellingBase, baseCurrency);
        });
        return;
      }
      const totals = calculateBookingItemSourceTotals(item);
      addRateCandidate(candidates, item.costCurrency, 'cost', totals.cost, item.estimatedCostBase, baseCurrency);
      addRateCandidate(candidates, item.sellingCurrency, 'sale', totals.selling, item.estimatedSellingBase, baseCurrency);
    });
  }

  const defaults = new Map(
    normalizeDualCurrencyRates(currencySettings).map((row) => [row.currency, row])
  );
  const calculatorRates = getCalculatorRateSnapshot(booking);

  return SUPPORTED_TRAVEL_CURRENCIES.map((currency) => currency.code)
    .filter((currency) => currency !== baseCurrency)
    .map((currency) => {
      const savedRow = saved.get(currency);
      const defaultRow = defaults.get(currency);
      const calculatorRate =
        baseCurrency === 'PKR'
          ? Number(calculatorRates?.[`${currency}_to_PKR`] || 0)
          : 0;
      return {
        currency,
        costRateToBase: savedRow
          ? savedRow.costRateToBase
          : consistentRate(candidates.get(`${currency}:cost`)) ||
            (calculatorRate > 0 ? calculatorRate : 0) ||
            defaultRow?.costRateToBase ||
            0,
        saleRateToBase: savedRow
          ? savedRow.saleRateToBase
          : consistentRate(candidates.get(`${currency}:sale`)) ||
            (calculatorRate > 0 ? calculatorRate : 0) ||
            defaultRow?.saleRateToBase ||
            0,
      };
    });
};

export const findMissingConversionRate = (formState = {}, currencySettings = null) => {
  const settings = buildRateMap(
    currencySettings,
    formState.currencyRateSnapshot,
    getCalculatorRateSnapshot(formState)
  );
  const missing = [];
  const check = (amount, currency, side) => {
    const code = normalizeCurrencyCode(currency);
    if (Number(amount || 0) <= 0 || code === settings.baseCurrency) return;
    const rates = side === 'cost' ? settings.costRates : settings.saleRates;
    if (!(Number(rates.get(code) || 0) > 0)) missing.push({ currency: code, side });
  };

  (formState.bookingItems || []).forEach((item) => {
    const useComponents =
      item?.itemType === 'umrah_package' &&
      item?.umrahDetails?.packageMode === 'custom_component_package' &&
      Array.isArray(item?.umrahDetails?.components) &&
      item.umrahDetails.components.length > 0;
    if (useComponents) {
      item.umrahDetails.components.forEach((component) => {
        const totals = calculateUmrahComponentSourceTotals(component);
        check(totals.cost, component.costCurrency, 'cost');
        check(totals.selling, component.sellingCurrency, 'sale');
      });
      return;
    }
    const totals = calculateBookingItemSourceTotals(item);
    check(totals.cost, item.costCurrency, 'cost');
    check(totals.selling, item.sellingCurrency, 'sale');
  });

  return missing[0] || null;
};

export const getVendorCounterpartyKey = (source = {}) => {
  const isParty = source?.vendorType === 'party' || Boolean(source?.vendorPartyId);
  const id = isParty ? source?.vendorPartyId : source?.vendorId;

  return id ? `${isParty ? 'party' : 'vendor'}:${String(id?._id || id)}` : '';
};

export const isRowVendorMode = (item = {}) =>
  Array.isArray(item?.paxPricing) &&
  item.paxPricing.some((row) => Boolean(row?.vendorId || row?.vendorPartyId));

export const deriveVendorCostGroups = (formState = {}, currencySettings = null) => {
  const settings = buildRateMap(
    currencySettings,
    formState.currencyRateSnapshot,
    getCalculatorRateSnapshot(formState)
  );
  const groups = new Map();
  let unassignedCostBase = 0;

  const addCost = (source, amount, description) => {
    const totalCostBase = roundMoney(amount);

    if (!(totalCostBase > 0)) {
      return;
    }

    const key = getVendorCounterpartyKey(source);

    if (!key) {
      unassignedCostBase = roundMoney(unassignedCostBase + totalCostBase);
      return;
    }

    const vendorType = key.startsWith('party:') ? 'party' : 'vendor';
    const id = key.slice(key.indexOf(':') + 1);
    const current = groups.get(key) || {
      key,
      vendorType,
      vendorId: vendorType === 'vendor' ? id : '',
      vendorPartyId: vendorType === 'party' ? id : '',
      totalCostBase: 0,
      descriptions: [],
      sourceCount: 0,
    };

    current.totalCostBase = roundMoney(current.totalCostBase + totalCostBase);
    current.sourceCount += 1;
    if (description && !current.descriptions.includes(description)) {
      current.descriptions.push(description);
    }
    groups.set(key, current);
  };

  (formState.bookingItems || []).forEach((item, itemIndex) => {
    const description = item.title || String(item.itemType || `Item ${itemIndex + 1}`).replace(/_/g, ' ');
    const useComponents =
      item.itemType === 'umrah_package' &&
      item.umrahDetails?.packageMode === 'custom_component_package' &&
      Array.isArray(item.umrahDetails?.components) &&
      item.umrahDetails.components.length > 0;

    if (useComponents) {
      item.umrahDetails.components.forEach((component) => {
        const totals = calculateUmrahComponentSourceTotals(component);
        addCost(
          component,
          estimateAmount(totals.cost, component.costCurrency, settings, 'cost'),
          component.label || component.componentType || description
        );
      });
      return;
    }

    const multiCitySectors =
      item.itemType === 'air_ticket' &&
      item.ticketDetails?.journeyType === 'multi_city' &&
      Array.isArray(item.ticketDetails?.sectors) &&
      item.ticketDetails.sectors.length > 0
        ? item.ticketDetails.sectors
        : null;

    if (multiCitySectors) {
      const entries = multiCitySectors.flatMap((sector, sectorIndex) =>
        (sector.paxPricing || []).map((row, rowIndex) => ({
          sector,
          sectorIndex,
          row,
          rowIndex,
        }))
      );
      const rowCosts = entries.map(({ row }) =>
        roundMoney(
          estimateAmount(
            parseQuantity(row?.count, 0) * parseMoney(row?.costPrice),
            item.costCurrency,
            settings,
            'cost'
          )
        )
      );
      const itemCostBase = roundMoney(
        estimateAmount(
          calculateBookingItemSourceTotals(item).cost,
          item.costCurrency,
          settings,
          'cost'
        )
      );
      const delta = roundMoney(
        itemCostBase - rowCosts.reduce((sum, amount) => sum + amount, 0)
      );
      const adjustmentIndex = [...rowCosts]
        .map((amount, index) => ({ amount, index }))
        .reverse()
        .find(({ amount }) => amount > 0)?.index;
      if (adjustmentIndex !== undefined) {
        rowCosts[adjustmentIndex] = roundMoney(rowCosts[adjustmentIndex] + delta);
      }

      entries.forEach(({ sector, sectorIndex, row, rowIndex }, entryIndex) => {
        const source = getVendorCounterpartyKey(row) ? row : sector;
        addCost(
          source,
          rowCosts[entryIndex],
          `${description} (Sector ${sectorIndex + 1}, ${String(row?.paxType || 'adult')}, row ${rowIndex + 1})`
        );
      });
      return;
    }

    if (Array.isArray(item.paxPricing) && item.paxPricing.length > 0 && isRowVendorMode(item)) {
      const rowCosts = item.paxPricing.map((row) =>
        roundMoney(
          estimateAmount(
            parseQuantity(row?.count, 0) * parseMoney(row?.costPrice),
            item.costCurrency,
            settings,
            'cost'
          )
        )
      );
      const itemCostBase = roundMoney(
        estimateAmount(
          calculateBookingItemSourceTotals(item).cost,
          item.costCurrency,
          settings,
          'cost'
        )
      );
      const delta = roundMoney(
        itemCostBase - rowCosts.reduce((sum, amount) => sum + amount, 0)
      );
      const adjustmentIndex = [...rowCosts]
        .map((amount, index) => ({ amount, index }))
        .reverse()
        .find(({ amount }) => amount > 0)?.index;

      if (adjustmentIndex !== undefined) {
        rowCosts[adjustmentIndex] = roundMoney(rowCosts[adjustmentIndex] + delta);
      }

      item.paxPricing.forEach((row, rowIndex) => {
        addCost(
          row,
          rowCosts[rowIndex],
          `${description} (${String(row?.paxType || 'adult')})`
        );
      });
      return;
    }

    const totals = calculateBookingItemSourceTotals(item);
    addCost(item, estimateAmount(totals.cost, item.costCurrency, settings, 'cost'), description);
  });

  return {
    groups: [...groups.values()],
    unassignedCostBase: roundMoney(unassignedCostBase),
    hasUnassignedCost: unassignedCostBase > 0,
    baseCurrency: settings.baseCurrency,
  };
};

export const calculateLocalTotals = (formState, currencySettings) => {
  const calculatorRates = getCalculatorRateSnapshot(formState);

  const settings = buildRateMap(
    currencySettings,
    formState.currencyRateSnapshot,
    calculatorRates
  );

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
            settings,
            'sale'
          );

          const componentCost = estimateAmount(
            sourceTotals.cost,

            component.costCurrency,
            settings,
            'cost'
          );

          result.selling += roundMoney(componentSelling);

          result.cost += roundMoney(componentCost);
        });

        return result;
      }

      const sourceTotals = calculateBookingItemSourceTotals(item);

      const itemSelling = estimateAmount(
        sourceTotals.selling,

        item.sellingCurrency,
        settings,
        'sale'
      );

      const itemCost = estimateAmount(
        sourceTotals.cost,

        item.costCurrency,
        settings,
        'cost'
      );

      result.selling += roundMoney(itemSelling);

      result.cost += roundMoney(itemCost);

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

  const vendorPaid = roundMoney(
    (formState.vendorPayments || []).reduce(
      (sum, payment) => sum + parseMoney(payment?.paidAmount),
      0
    )
  );

  const discount = roundMoney(parseMoney(formState.discountAmount));

  const received = roundMoney(parseMoney(formState.receivedAmount));

  const net = roundMoney(Math.max(selling - discount, 0));

  const customerBalance = roundMoney(net - received);

  const due = roundMoney(Math.max(customerBalance, 0));

  const customerAdvance = roundMoney(Math.max(-customerBalance, 0));

  const vendorBalance = roundMoney(cost - vendorPaid);

  const vendorPayable = roundMoney(Math.max(vendorBalance, 0));

  const vendorAdvance = roundMoney(Math.max(-vendorBalance, 0));

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

    customerAdvance,

    customerBalance,

    vendorPayable,

    vendorAdvance,

    vendorBalance,

    profit,

    baseCurrency: settings.baseCurrency,
  };
};
