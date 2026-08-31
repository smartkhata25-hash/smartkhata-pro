const DAY_MS = 24 * 60 * 60 * 1000;

export const UMRAH_CITY_OPTIONS = Object.freeze([
  { value: 'makkah', labelKey: 'travel.umrah.city.makkah' },
  { value: 'madinah', labelKey: 'travel.umrah.city.madinah' },
]);

export const UMRAH_PRESET_DAY_OPTIONS = Object.freeze([15, 21, 28]);

export const getLocalTodayIso = () => {
  const now = new Date();

  return dateToIso(now);
};

export function parseDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    const date = new Date(value);

    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  if (typeof value === 'string') {
    const cleanValue = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
      const [year, month, day] = cleanValue.split('-').map(Number);

      return new Date(year, month - 1, day);
    }

    const date = new Date(cleanValue);

    if (!Number.isNaN(date.getTime())) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  return null;
}

export function dateToIso(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(date, count) {
  const source = parseDate(date);

  if (!source) {
    return null;
  }

  const next = new Date(source.getFullYear(), source.getMonth(), source.getDate());
  next.setDate(next.getDate() + Number(count || 0));

  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
}

export function addDaysIso(iso, count) {
  const date = addDays(iso, count);

  return date ? dateToIso(date) : iso || '';
}

export function formatDate(date) {
  const safeDate = parseDate(date);

  if (!safeDate) {
    return { iso: '', human: '-', weekday: null };
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dd = String(safeDate.getDate()).padStart(2, '0');
  const month = safeDate.toLocaleString('en-US', { month: 'short' });

  return {
    iso: dateToIso(safeDate),
    human: `${dd} ${month} (${days[safeDate.getDay()]})`,
    weekday: safeDate.getDay(),
  };
}

export function isoToHuman(iso) {
  return formatDate(iso).human;
}

const diffDaysInclusive = (start, end) =>
  Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

const isFriday = (date) => date.getDay() === 5;

const DEFAULT_DISTRIBUTIONS = Object.freeze({
  15: [6, 6, 3],
  21: [8, 9, 4],
  28: [10, 10, 8],
});

const fitDistributionToTotal = (distribution, totalNights) => {
  if (totalNights <= 0) {
    return [];
  }

  const next = distribution.slice().map((days) => Math.max(1, Number(days || 0)));

  if (totalNights < next.length) {
    return next.slice(0, totalNights).map(() => 1);
  }

  let currentTotal = next.reduce((sum, days) => sum + days, 0);

  while (currentTotal > totalNights) {
    let index = -1;

    for (let cursor = next.length - 1; cursor >= 0; cursor -= 1) {
      if (next[cursor] > 1) {
        index = cursor;
        break;
      }
    }

    if (index === -1) {
      break;
    }

    next[index] -= 1;
    currentTotal -= 1;
  }

  while (currentTotal < totalNights) {
    next[next.length - 1] += 1;
    currentTotal += 1;
  }

  return next.filter((days) => days > 0);
};

const getDistributionFromTotalDays = (totalDays) => {
  const first = Math.max(1, Math.round(totalDays * 0.4));
  const second = Math.max(1, Math.round(totalDays * 0.4));
  const third = Math.max(1, totalDays - first - second);
  const total = first + second + third;

  if (total === totalDays) {
    return [first, second, third];
  }

  return [Math.max(1, first + totalDays - total), second, third];
};

const applyMaxMadinah = (distribution) => {
  const next = distribution.slice();
  let shifts = 0;

  while (shifts < 4) {
    if (next[0] > 2) {
      next[0] -= 1;
      next[1] += 1;
      shifts += 1;
      continue;
    }

    if (next[2] > 2) {
      next[2] -= 1;
      next[1] += 1;
      shifts += 1;
      continue;
    }

    break;
  }

  return next;
};

const getTwoPartDistribution = (totalDays) => {
  if (totalDays <= 0) {
    return [];
  }

  if (totalDays === 1) {
    return [1];
  }

  const first = Math.max(1, Math.floor(totalDays / 2));
  const second = Math.max(1, totalDays - first);

  return [first, second];
};

const getStayCities = (distribution, startCity, exitCity) => {
  if (distribution.length === 2) {
    return [startCity, exitCity];
  }

  if (startCity === 'madinah') {
    return ['madinah', 'makkah', exitCity === 'madinah' ? 'madinah' : 'makkah'];
  }

  return ['makkah', 'madinah', exitCity === 'madinah' ? 'madinah' : 'makkah'];
};

const getHotelDistribution = (tripDays, startCity, exitCity) => {
  const hotelNights = Math.max(0, Number(tripDays || 0) - 1);

  if (hotelNights <= 0) {
    return [];
  }

  if (startCity !== exitCity) {
    return getTwoPartDistribution(hotelNights);
  }

  const baseDistribution =
    DEFAULT_DISTRIBUTIONS[tripDays] || getDistributionFromTotalDays(hotelNights);

  return fitDistributionToTotal(baseDistribution, hotelNights);
};

const buildStays = (startDate, distribution, startCity, exitCity) => {
  let cursor = parseDate(startDate);

  if (!cursor) {
    throw new Error('Invalid start date');
  }

  const cities = getStayCities(distribution, startCity, exitCity);

  return distribution.map((days, index) => {
    const checkIn = parseDate(cursor);
    const lastNight = addDays(checkIn, days - 1);
    const checkOut = addDays(lastNight, 1);

    cursor = parseDate(checkOut);

    return {
      city: cities[index],
      days,
      displayDays: days,
      checkIn,
      lastNight,
      checkOut,
    };
  });
};

const cloneStays = (stays) =>
  stays.map((stay) => ({
    ...stay,
    checkIn: parseDate(stay.checkIn),
    lastNight: parseDate(stay.lastNight),
    checkOut: parseDate(stay.checkOut),
    days: Number(stay.days || 0),
    displayDays: Number(stay.displayDays || stay.days || 0),
  }));

const getSelectedFridayOption = (fridayAdjustments, index) => {
  if (!fridayAdjustments) {
    return '';
  }

  if (typeof fridayAdjustments === 'string') {
    return fridayAdjustments;
  }

  if (Array.isArray(fridayAdjustments)) {
    return fridayAdjustments[index] || '';
  }

  if (typeof fridayAdjustments === 'object') {
    if (fridayAdjustments.transferIndex !== undefined) {
      return Number(fridayAdjustments.transferIndex) === index
        ? fridayAdjustments.option || ''
        : '';
    }

    return fridayAdjustments[String(index)] || '';
  }

  return '';
};

const rebuildStaysFrom = (stays, startIndex = 0) => {
  for (let childIndex = Math.max(1, startIndex); childIndex < stays.length; childIndex += 1) {
    const previous = stays[childIndex - 1];
    const current = stays[childIndex];
    current.checkIn = parseDate(previous.checkOut);
    current.lastNight = addDays(current.checkIn, Number(current.displayDays || current.days || 0) - 1);
    current.checkOut = addDays(current.lastNight, 1);
  }
};

const applyFridayAdjustments = (stays, fridayAdjustments = {}) => {
  const next = cloneStays(stays);

  for (let index = 0; index < next.length - 1; index += 1) {
    const originalStay = stays[index];
    const currentStay = next[index];
    const followingStay = next[index + 1];
    const selectedOption = getSelectedFridayOption(fridayAdjustments, index);

    if (!originalStay || !isFriday(parseDate(originalStay.checkOut)) || !followingStay) {
      continue;
    }

    if (selectedOption === 'thursday' && Number(currentStay.displayDays || 0) > 1) {
      currentStay.displayDays = Number(currentStay.displayDays || 0) - 1;
      followingStay.displayDays = Number(followingStay.displayDays || 0) + 1;
      currentStay.lastNight = addDays(currentStay.checkIn, currentStay.displayDays - 1);
      currentStay.checkOut = addDays(currentStay.lastNight, 1);
      rebuildStaysFrom(next, index + 1);
    }

    if (selectedOption === 'saturday' && Number(followingStay.displayDays || 0) > 1) {
      currentStay.displayDays = Number(currentStay.displayDays || 0) + 1;
      followingStay.displayDays = Number(followingStay.displayDays || 0) - 1;
      currentStay.lastNight = addDays(currentStay.checkIn, currentStay.displayDays - 1);
      currentStay.checkOut = addDays(currentStay.lastNight, 1);
      rebuildStaysFrom(next, index + 1);
    }
  }

  return next;
};

const buildSegmentsFromStays = (stays) => {
  const segments = [];

  stays.forEach((stay, index) => {
    const checkIn = formatDate(stay.checkIn);
    const lastNight = formatDate(stay.lastNight);
    const checkOut = formatDate(stay.checkOut);

    segments.push({
      type: 'stay',
      city: stay.city,
      days: stay.days,
      displayDays: stay.displayDays,
      checkIn,
      checkOut,
      isoCheckIn: checkIn.iso,
      isoLastNight: lastNight.iso,
      isoCheckOutDay: checkOut.iso,
      lastNight,
    });

    if (index < stays.length - 1) {
      segments.push({
        type: 'travel',
        date: checkOut,
        iso: checkOut.iso,
      });
    }
  });

  return segments;
};

const buildTravelInfosBeforeAdjust = (initialStays, segments, fridayAdjustments = {}) =>
  initialStays.slice(0, -1).map((stay, index) => {
    const originalTravelDate = addDays(stay.checkIn, stay.days);
    const original = formatDate(originalTravelDate);
    const adjustedTravel = segments.filter((segment) => segment.type === 'travel')[index];
    const fallback = adjustedTravel?.date || original;
    const nextStay = initialStays[index + 1];
    const selectedOption = getSelectedFridayOption(fridayAdjustments, index);

    if (!isFriday(originalTravelDate)) {
      return {
        index,
        fromCity: stay.city,
        toCity: nextStay?.city || '',
        original,
        default: fallback,
        selectedOption: '',
        fridaySpentInCity: '',
        alternates: [],
        options: [],
      };
    }

    const options = [
      {
        value: 'thursday',
        labelKey: 'travel.tripPlanner.fridayOptionThursday',
        date: formatDate(addDays(originalTravelDate, -1)),
        fridaySpentInCity: nextStay?.city || '',
        disabled: Number(stay.displayDays || stay.days || 0) <= 1,
      },
      {
        value: 'saturday',
        labelKey: 'travel.tripPlanner.fridayOptionSaturday',
        date: formatDate(addDays(originalTravelDate, 1)),
        fridaySpentInCity: stay.city,
        disabled: Number(nextStay?.displayDays || nextStay?.days || 0) <= 1,
      },
    ];
    const selected = options.find((option) => option.value === selectedOption);

    return {
      index,
      fromCity: stay.city,
      toCity: nextStay?.city || '',
      original,
      default: fallback,
      selectedOption: selected ? selected.value : '',
      fridaySpentInCity: selected?.fridaySpentInCity || '',
      alternates: options.map((option) => option.date),
      options,
    };
  });

export function generateItinerary(options = {}) {
  const {
    departureDate,
    totalDays: userTotalDays,
    exitDate,
    startCity = 'makkah',
    exitCity = 'makkah',
    maxMadinah = false,
    fridayAdjustments = {},
  } = options;

  const departure = parseDate(departureDate);

  if (!departure) {
    return { error: 'Invalid departure date' };
  }

  let totalDays = 15;

  if (exitDate) {
    const exit = parseDate(exitDate);

    if (!exit) {
      return { error: 'Invalid exit date' };
    }

    totalDays = diffDaysInclusive(departure, exit);

    if (totalDays < 1) {
      return { error: 'Exit date must be same or after departure date' };
    }
  } else if (userTotalDays) {
    totalDays = Number(userTotalDays);

    if (!Number.isInteger(totalDays) || totalDays < 1) {
      return { error: 'Total days must be a positive integer' };
    }
  }

  let distribution = getHotelDistribution(totalDays, startCity, exitCity);

  if (maxMadinah && distribution.length === 3) {
    distribution = applyMaxMadinah(distribution);
    distribution = fitDistributionToTotal(distribution, Math.max(0, totalDays - 1));
  }

  const initialStays = buildStays(departure, distribution, startCity, exitCity);
  const adjustedStays = applyFridayAdjustments(initialStays, fridayAdjustments);
  const segments = buildSegmentsFromStays(adjustedStays);
  const travelEndDate = addDays(departure, totalDays - 1);
  const hotelNights = Math.max(0, totalDays - 1);

  let makkahNights = 0;
  let madinahNights = 0;

  adjustedStays.forEach((stay) => {
    if (stay.city === 'makkah') {
      makkahNights += Number(stay.displayDays || stay.days || 0);
    }

    if (stay.city === 'madinah') {
      madinahNights += Number(stay.displayDays || stay.days || 0);
    }
  });

  return {
    raw: {
      departure: formatDate(departure),
      travelStartDate: formatDate(departure),
      returnDate: formatDate(travelEndDate),
      totalDays,
      hotelNights,
      distribution,
      startCity,
      exitCity,
    },
    segments,
    travelInfos: buildTravelInfosBeforeAdjust(initialStays, segments, fridayAdjustments),
    selectedFridayAdjustments: fridayAdjustments,
    makkahNights,
    madinahNights,
    notes: [
      `Distribution used: ${distribution.join(' / ')}`,
      ...(maxMadinah ? ['Max Madinah ON'] : []),
      `Start City: ${startCity}`,
      `Exit City: ${exitCity}`,
      `Total days: ${totalDays}`,
      `Hotel nights: ${hotelNights}`,
    ],
  };
}

const getCountedNights = (startIso, endIso) => {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  const nights = [];

  if (!start || !end || end < start) {
    return nights;
  }

  let cursor = start;

  while (cursor <= end) {
    nights.push(dateToIso(cursor));
    cursor = addDays(cursor, 1);
  }

  return nights;
};

export function buildAdjustedItinerary(
  result,
  { excludeArrival = false, excludeExit = false, markWeekend = false } = {}
) {
  if (!result || result.error) {
    return result || null;
  }

  const staySegments = (result.segments || []).filter((segment) => segment.type === 'stay');

  const adjustedStays = staySegments.map((stay, index) => {
    const originalDays = Number(stay.displayDays ?? stay.days ?? 0);
    const isoCheckIn = stay.isoCheckIn || stay.checkIn?.iso || '';
    const countedDays =
      originalDays - (excludeArrival && index === 0 ? 1 : 0) - (excludeExit && index === staySegments.length - 1 ? 1 : 0);
    const safeCountedDays = Math.max(0, countedDays);
    const countedCheckInIso = excludeArrival && index === 0 ? addDaysIso(isoCheckIn, 1) : isoCheckIn;
    const countedLastNightIso =
      safeCountedDays > 0
        ? addDaysIso(countedCheckInIso, safeCountedDays - 1)
        : addDaysIso(countedCheckInIso, -1);
    const countedNights = getCountedNights(countedCheckInIso, countedLastNightIso);
    const weekendDates = markWeekend
      ? countedNights.filter((iso) => {
          const day = parseDate(iso)?.getDay();

          return day === 4 || day === 5;
        })
      : [];

    return {
      ...stay,
      originalDays,
      countedDays: safeCountedDays,
      countedCheckInIso,
      countedLastNightIso,
      countedNights,
      weekendDates,
    };
  });

  const adjustedSegments = [];

  adjustedStays.forEach((stay, index) => {
    adjustedSegments.push({
      type: 'stay',
      city: stay.city,
      originalDays: stay.originalDays,
      countedDays: stay.countedDays,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      isoCheckIn: stay.isoCheckIn,
      isoLastNight: stay.isoLastNight,
      isoCheckOutDay: stay.isoCheckOutDay,
      countedCheckInIso: stay.countedCheckInIso,
      countedLastNightIso: stay.countedLastNightIso,
      countedNights: stay.countedNights,
      weekendDates: stay.weekendDates,
    });

    if (index < adjustedStays.length - 1) {
      adjustedSegments.push({
        type: 'travel',
        date: stay.checkOut,
        iso: stay.isoCheckOutDay || stay.checkOut?.iso,
      });
    }
  });

  let countedTotal = 0;
  let makkahNights = 0;
  let madinahNights = 0;

  adjustedStays.forEach((stay) => {
    countedTotal += stay.countedDays;

    if (stay.city === 'makkah') {
      makkahNights += stay.countedDays;
    }

    if (stay.city === 'madinah') {
      madinahNights += stay.countedDays;
    }
  });

  return {
    ...result,
    adjustedSegments,
    adjustedStays,
    countedTotal,
    makkahNights,
    madinahNights,
  };
}

export const getItineraryStays = (result) =>
  result?.adjustedStays ||
  (result?.adjustedSegments || result?.segments || []).filter((segment) => segment.type === 'stay');

export const getFirstStayDate = (result) => {
  if (result?.raw?.travelStartDate?.iso || result?.raw?.departure?.iso) {
    return result.raw.travelStartDate?.iso || result.raw.departure.iso;
  }

  const firstStay = getItineraryStays(result)[0];

  return firstStay?.countedCheckInIso || firstStay?.isoCheckIn || '';
};

export const getLastStayCheckoutDate = (result) => {
  if (result?.raw?.returnDate?.iso) {
    return result.raw.returnDate.iso;
  }

  const stays = getItineraryStays(result);
  const lastStay = stays[stays.length - 1];

  if (!lastStay) {
    return '';
  }

  if (lastStay.countedLastNightIso) {
    return addDaysIso(lastStay.countedLastNightIso, 1);
  }

  return lastStay.isoCheckOutDay || lastStay.checkOut?.iso || addDaysIso(lastStay.isoLastNight, 1);
};

export const summarizeCityStays = (result, city) =>
  getItineraryStays(result)
    .filter((stay) => stay.city === city)
    .reduce(
      (summary, stay) => ({
        nights: summary.nights + Number(stay.countedDays ?? stay.displayDays ?? stay.days ?? 0),
        weekendNights: summary.weekendNights + (Array.isArray(stay.weekendDates) ? stay.weekendDates.length : 0),
        firstCheckIn: summary.firstCheckIn || stay.countedCheckInIso || stay.isoCheckIn || '',
        lastCheckout: stay.countedLastNightIso
          ? addDaysIso(stay.countedLastNightIso, 1)
          : stay.isoCheckOutDay || stay.checkOut?.iso || summary.lastCheckout,
      }),
      {
        nights: 0,
        weekendNights: 0,
        firstCheckIn: '',
        lastCheckout: '',
      }
    );
