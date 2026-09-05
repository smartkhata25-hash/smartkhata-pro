export const BUSINESS_TIME_ZONE = 'Asia/Karachi';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_KEY_PATTERN = /^(\d{1,2}):(\d{2})/;

const pad2 = (value) => String(value).padStart(2, '0');

const getDateParts = (date, timeZone = BUSINESS_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return parts.reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});
};

const normalizeDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export const getBusinessDateInputValue = (value = new Date()) => {
  if (typeof value === 'string') {
    const match = value.trim().match(DATE_KEY_PATTERN);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  const date = normalizeDate(value);
  const parts = getDateParts(date);

  return [parts.year, pad2(parts.month), pad2(parts.day)].join('-');
};

export const getBusinessTimeInputValue = (value = new Date()) => {
  if (typeof value === 'string') {
    const match = value.trim().match(TIME_KEY_PATTERN);
    if (match) {
      return `${pad2(match[1])}:${pad2(match[2])}`;
    }
  }

  const date = normalizeDate(value);
  const parts = getDateParts(date);

  return [pad2(parts.hour), pad2(parts.minute)].join(':');
};

export const formatBusinessDateForDisplay = (dateValue, options = {}) => {
  if (!dateValue) return options.fallback || '-';

  const date =
    typeof dateValue === 'string' && DATE_KEY_PATTERN.test(dateValue)
      ? new Date(`${getBusinessDateInputValue(dateValue)}T00:00:00.000Z`)
      : new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return options.fallback || '-';
  }

  return date.toLocaleDateString(options.locale || 'en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: options.month || 'short',
    year: 'numeric',
  });
};

export const formatTimestampForDisplay = (value, options = {}) => {
  if (!value) return options.fallback || '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return options.fallback || '-';
  }

  return date.toLocaleString(options.locale || 'en-GB', {
    timeZone: options.timeZone || BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: options.month || 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getLocalDateInputValue = getBusinessDateInputValue;

export const getLocalTimeInputValue = getBusinessTimeInputValue;

export const formatDateWithOptionalTime = (dateValue, timeValue = '') => {
  const dateText = formatBusinessDateForDisplay(dateValue);
  if (dateText === '-') return '-';

  const timeText = String(timeValue || '').trim();

  return timeText ? `${dateText} ${timeText.slice(0, 5)}` : dateText;
};
