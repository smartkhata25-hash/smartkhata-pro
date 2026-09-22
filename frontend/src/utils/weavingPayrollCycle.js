import { getBusinessDateInputValue, formatBusinessDateForDisplay } from './localDateTime';

const CYCLE_KEY_PATTERN = /^(\d{4})-(\d{2})-H([12])$/i;

const pad2 = (value) => String(value).padStart(2, '0');

const buildDateKey = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const getMonthLastDay = (year, month) => new Date(Date.UTC(year, month, 0, 12)).getUTCDate();

const getNextMonth = (year, month) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

const getPreviousCycleKey = (cycle) => {
  if (cycle.half === 'H2') {
    return `${cycle.year}-${pad2(cycle.month)}-H1`;
  }

  const previous = cycle.month === 1 ? { year: cycle.year - 1, month: 12 } : { year: cycle.year, month: cycle.month - 1 };
  return `${previous.year}-${pad2(previous.month)}-H2`;
};

const getNextCycleKey = (cycle) => {
  if (cycle.half === 'H1') {
    return `${cycle.year}-${pad2(cycle.month)}-H2`;
  }

  const next = getNextMonth(cycle.year, cycle.month);
  return `${next.year}-${pad2(next.month)}-H1`;
};

export const getCurrentWeavingCycleKey = (value = new Date()) => {
  const [year, month, day] = getBusinessDateInputValue(value).split('-').map(Number);
  return `${year}-${pad2(month)}-${day <= 15 ? 'H1' : 'H2'}`;
};

export const deriveWeavingPayrollCycle = (cycleKey = getCurrentWeavingCycleKey()) => {
  const match = String(cycleKey || '').trim().match(CYCLE_KEY_PATTERN);

  if (!match) {
    return deriveWeavingPayrollCycle(getCurrentWeavingCycleKey());
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const half = match[3] === '2' ? 'H2' : 'H1';
  const nextMonth = getNextMonth(year, month);
  const periodStart = buildDateKey(year, month, half === 'H1' ? 1 : 16);
  const periodEnd = buildDateKey(year, month, half === 'H1' ? 15 : getMonthLastDay(year, month));
  const dueDate = buildDateKey(
    half === 'H1' ? year : nextMonth.year,
    half === 'H1' ? month : nextMonth.month,
    half === 'H1' ? 22 : 7
  );

  return {
    key: `${year}-${pad2(month)}-${half}`,
    year,
    month,
    half,
    periodStart,
    periodEnd,
    dueDate,
  };
};

export const formatWeavingPayrollCycleLabel = (cycleLike, payText = 'Pay') => {
  const cycle =
    typeof cycleLike === 'string' ? deriveWeavingPayrollCycle(cycleLike) : cycleLike;
  const periodMonth = formatBusinessDateForDisplay(cycle.periodStart, { month: 'short' })
    .replace(/^\d{2}\s+/, '');
  const startDay = cycle.periodStart.slice(-2);
  const endDay = cycle.periodEnd.slice(-2);
  const dueDate = formatBusinessDateForDisplay(cycle.dueDate, { month: 'short' });

  return `${startDay}\u2013${endDay} ${periodMonth} - ${payText} ${dueDate}`;
};

export const getWeavingPayrollCycleOptions = ({
  baseCycleKey = getCurrentWeavingCycleKey(),
  before = 2,
  after = 8,
  payText = 'Pay',
} = {}) => {
  let first = deriveWeavingPayrollCycle(baseCycleKey);

  for (let index = 0; index < before; index += 1) {
    first = deriveWeavingPayrollCycle(getPreviousCycleKey(first));
  }

  const options = [];
  let cursor = first;

  for (let index = 0; index < before + after + 1; index += 1) {
    options.push({
      ...cursor,
      label: formatWeavingPayrollCycleLabel(cursor, payText),
    });
    cursor = deriveWeavingPayrollCycle(getNextCycleKey(cursor));
  }

  return options;
};
