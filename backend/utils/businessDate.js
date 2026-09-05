const BUSINESS_TIME_ZONE = "Asia/Karachi";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_KEY_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;

const pad2 = (value) => String(value).padStart(2, "0");

const getDateParts = (date, timeZone = BUSINESS_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return parts.reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});
};

const getTimeZoneOffsetMs = (date, timeZone = BUSINESS_TIME_ZONE) => {
  const parts = getDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
};

const zonedDateTimeToUtc = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone = BUSINESS_TIME_ZONE,
}) => {
  const localUtcMs = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  let utcMs = localUtcMs;
  for (let index = 0; index < 3; index += 1) {
    utcMs = localUtcMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  }

  return new Date(utcMs);
};

const formatDateKeyFromDate = (date, timeZone = BUSINESS_TIME_ZONE) => {
  const parts = getDateParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

const getBusinessDateKey = (
  value = new Date(),
  { fallback = null, allowEmpty = false, label = "business date" } = {},
) => {
  if (value === undefined || value === null || value === "") {
    if (fallback !== null && fallback !== undefined && fallback !== "") {
      return getBusinessDateKey(fallback, { allowEmpty, label });
    }
    if (allowEmpty) return "";
    throw new Error(`Invalid ${label}`);
  }

  if (typeof value === "string") {
    const clean = value.trim();
    const match = clean.match(DATE_KEY_PATTERN);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    if (fallback !== null && fallback !== undefined && fallback !== "") {
      return getBusinessDateKey(fallback, { allowEmpty, label });
    }
    if (allowEmpty) return "";
    throw new Error(`Invalid ${label}`);
  }

  return formatDateKeyFromDate(date);
};

const parseTimeParts = (value = "", fallback = "00:00") => {
  const clean = String(value || "").trim();
  const match = clean.match(TIME_KEY_PATTERN);
  const fallbackMatch = String(fallback || "00:00").match(TIME_KEY_PATTERN);
  const source = match || fallbackMatch || ["", "0", "0", "0"];

  const hour = Math.min(Math.max(Number(source[1] || 0), 0), 23);
  const minute = Math.min(Math.max(Number(source[2] || 0), 0), 59);
  const second = Math.min(Math.max(Number(source[3] || 0), 0), 59);

  return { hour, minute, second };
};

const parseBusinessDate = (value, options = {}) => {
  const key = getBusinessDateKey(value, options);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);

  return zonedDateTimeToUtc({ year, month, day });
};

const nullableBusinessDate = (value, options = {}) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return parseBusinessDate(value, options);
};

const parseBusinessDateTime = (
  dateValue,
  timeValue = "",
  { fallback = null, defaultTime = "00:00", label = "business date" } = {},
) => {
  const key = getBusinessDateKey(dateValue, { fallback, label });
  const [year, month, day] = key.split("-").map(Number);
  const { hour, minute, second } = parseTimeParts(timeValue, defaultTime);

  return zonedDateTimeToUtc({ year, month, day, hour, minute, second });
};

const getCurrentBusinessDateKey = (date = new Date()) =>
  formatDateKeyFromDate(date);

const getCurrentBusinessTimeInput = (date = new Date()) => {
  const parts = getDateParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

const startOfBusinessDay = (value, options = {}) =>
  parseBusinessDate(value, options);

const nextBusinessDayStart = (value, options = {}) => {
  const key = getBusinessDateKey(value, options);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12);
  const nextKey = formatDateKeyFromDate(new Date(utcNoon + 24 * 60 * 60 * 1000));

  return parseBusinessDate(nextKey);
};

const endOfBusinessDay = (value, options = {}) => {
  const next = nextBusinessDayStart(value, options);
  if (!next) return null;
  return new Date(next.getTime() - 1);
};

const buildBusinessDateRange = ({
  startDate,
  endDate,
  field = "date",
  inclusiveEnd = false,
} = {}) => {
  if (!startDate && !endDate) return {};

  const range = {};

  if (startDate) {
    range.$gte = startOfBusinessDay(startDate);
  }

  if (endDate) {
    if (inclusiveEnd) {
      range.$lte = endOfBusinessDay(endDate);
    } else {
      range.$lt = nextBusinessDayStart(endDate);
    }
  }

  return { [field]: range };
};

const addDaysToBusinessDateKey = (value, days = 0) => {
  const key = getBusinessDateKey(value);
  const [year, month, day] = key.split("-").map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12);

  return formatDateKeyFromDate(
    new Date(utcNoon + Number(days || 0) * 24 * 60 * 60 * 1000),
  );
};

const getBusinessDateWeekday = (value) => {
  const key = getBusinessDateKey(value);
  const [year, month, day] = key.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
};

const buildBusinessPresetDateRange = ({
  dateFilter = "",
  fromDate = "",
  toDate = "",
  field = "date",
  now = new Date(),
} = {}) => {
  const filter = String(dateFilter || "").trim();
  const todayKey = getBusinessDateKey(now);
  let startKey = "";
  let endExclusiveKey = "";

  if (filter === "today") {
    startKey = todayKey;
    endExclusiveKey = addDaysToBusinessDateKey(todayKey, 1);
  }

  if (filter === "yesterday") {
    startKey = addDaysToBusinessDateKey(todayKey, -1);
    endExclusiveKey = todayKey;
  }

  if (filter === "this_week") {
    const weekday = getBusinessDateWeekday(todayKey);
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    startKey = addDaysToBusinessDateKey(todayKey, -daysFromMonday);
    endExclusiveKey = addDaysToBusinessDateKey(todayKey, 1);
  }

  if (filter === "last_week") {
    const weekday = getBusinessDateWeekday(todayKey);
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    const thisMondayKey = addDaysToBusinessDateKey(todayKey, -daysFromMonday);
    startKey = addDaysToBusinessDateKey(thisMondayKey, -7);
    endExclusiveKey = thisMondayKey;
  }

  if (filter === "this_month") {
    const [year, month] = todayKey.split("-");
    startKey = `${year}-${month}-01`;
    endExclusiveKey = addDaysToBusinessDateKey(todayKey, 1);
  }

  if (filter === "last_month") {
    const [year, month] = todayKey.split("-");
    const thisMonthStartKey = `${year}-${month}-01`;
    const lastMonthAnyDayKey = addDaysToBusinessDateKey(thisMonthStartKey, -1);
    const [lastYear, lastMonth] = lastMonthAnyDayKey.split("-");
    startKey = `${lastYear}-${lastMonth}-01`;
    endExclusiveKey = thisMonthStartKey;
  }

  if (filter === "this_year") {
    const [year] = todayKey.split("-");
    startKey = `${year}-01-01`;
    endExclusiveKey = addDaysToBusinessDateKey(todayKey, 1);
  }

  if (filter === "last_year") {
    const [year] = todayKey.split("-").map(Number);
    startKey = `${year - 1}-01-01`;
    endExclusiveKey = `${year}-01-01`;
  }

  if (filter === "custom" || fromDate || toDate) {
    return buildBusinessDateRange({
      startDate: fromDate,
      endDate: toDate,
      field,
    });
  }

  if (!startKey && !endExclusiveKey) {
    return {};
  }

  const range = {};
  if (startKey) range.$gte = startOfBusinessDay(startKey);
  if (endExclusiveKey) range.$lt = startOfBusinessDay(endExclusiveKey);

  return { [field]: range };
};

const formatBusinessDate = (value, locale = "en-GB") => {
  if (!value) return "";

  const date = parseBusinessDate(value, { allowEmpty: true });
  if (!date) return "";

  return new Intl.DateTimeFormat(locale, {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const extractBusinessTime = (value = "") => {
  if (!value) return "";
  const clean = String(value).trim();
  const match = clean.match(TIME_KEY_PATTERN);
  if (match) {
    return `${pad2(match[1])}:${pad2(match[2])}`;
  }

  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getDateParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

module.exports = {
  BUSINESS_TIME_ZONE,
  getBusinessDateKey,
  getCurrentBusinessDateKey,
  getCurrentBusinessTimeInput,
  nullableBusinessDate,
  parseBusinessDate,
  parseBusinessDateTime,
  startOfBusinessDay,
  endOfBusinessDay,
  nextBusinessDayStart,
  buildBusinessDateRange,
  buildBusinessPresetDateRange,
  formatBusinessDate,
  extractBusinessTime,
};
