const pad2 = (value) => String(value).padStart(2, '0');

const normalizeDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export const getLocalDateInputValue = (value = new Date()) => {
  const date = normalizeDate(value);

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-');
};

export const getLocalTimeInputValue = (value = new Date()) => {
  const date = normalizeDate(value);

  return [pad2(date.getHours()), pad2(date.getMinutes())].join(':');
};

export const formatDateWithOptionalTime = (dateValue, timeValue = '') => {
  if (!dateValue) return '-';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const dateText = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeText = String(timeValue || '').trim();

  return timeText ? `${dateText} ${timeText.slice(0, 5)}` : dateText;
};
