const FREQUENCIES = Object.freeze([
  'daily',
  'every_other_day',
  'every_3_days',
  'weekly',
  'every_15_days',
  'twice_monthly',
  'monthly',
  'custom_days',
]);

const parseDateOnly = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const formatDateOnly = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + Number(days) * 86400000);
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const dateForMonthDay = (year, month, day) =>
  new Date(Date.UTC(year, month, Math.min(Number(day), daysInMonth(year, month))));

const normalizeSchedule = (input = {}) => {
  const frequency = String(input.frequency || '').trim().toLowerCase();
  const startDate = String(input.startDate || '').trim();
  if (!FREQUENCIES.includes(frequency)) throw new Error('Invalid collection frequency');
  if (!parseDateOnly(startDate)) throw new Error('A valid start date is required');

  const schedule = { frequency, startDate };
  if (frequency === 'weekly') {
    const weekday = Number(input.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('A valid weekday is required');
    schedule.weekday = weekday;
  }
  if (frequency === 'twice_monthly') {
    const days = [...new Set((input.twiceMonthlyDays || []).map(Number))].sort((a, b) => a - b);
    if (days.length !== 2 || days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) {
      throw new Error('Two valid monthly collection days are required');
    }
    schedule.twiceMonthlyDays = days;
  }
  if (frequency === 'monthly') {
    const monthlyDay = Number(input.monthlyDay);
    if (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31) throw new Error('A valid monthly day is required');
    schedule.monthlyDay = monthlyDay;
  }
  if (frequency === 'custom_days') {
    const intervalDays = Number(input.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) throw new Error('A valid day interval is required');
    schedule.intervalDays = intervalDays;
  }
  return schedule;
};

const getNextDate = (current, schedule, occurrenceIndex) => {
  const { frequency } = schedule;
  if (frequency === 'daily') return occurrenceIndex === 0 ? current : addDays(current, 1);
  if (frequency === 'every_other_day') return occurrenceIndex === 0 ? current : addDays(current, 2);
  if (frequency === 'every_3_days') return occurrenceIndex === 0 ? current : addDays(current, 3);
  if (frequency === 'every_15_days') return occurrenceIndex === 0 ? current : addDays(current, 15);
  if (frequency === 'custom_days') return occurrenceIndex === 0 ? current : addDays(current, schedule.intervalDays);
  if (frequency === 'weekly') {
    if (occurrenceIndex > 0) return addDays(current, 7);
    return addDays(current, (schedule.weekday - current.getUTCDay() + 7) % 7);
  }

  let year = current.getUTCFullYear();
  let month = current.getUTCMonth();
  const candidatesForMonth = () => {
    const days = frequency === 'monthly' ? [schedule.monthlyDay] : schedule.twiceMonthlyDays;
    return [...new Set(days.map((day) => dateForMonthDay(year, month, day).getTime()))]
      .sort((a, b) => a - b)
      .map((time) => new Date(time));
  };

  for (let guard = 0; guard < 2400; guard += 1) {
    const candidate = candidatesForMonth().find((date) => (
      occurrenceIndex === 0 ? date >= current : date > current
    ));
    if (candidate) return candidate;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  throw new Error('Unable to calculate schedule');
};

const buildSchedulePreview = ({ schedule: rawSchedule, targetAmount, contributionAmount, limit = 12 }) => {
  const schedule = normalizeSchedule(rawSchedule);
  const target = Number(targetAmount);
  const contribution = Number(contributionAmount);
  if (!Number.isFinite(target) || target <= 0) throw new Error('Target amount must be greater than zero');
  if (!Number.isFinite(contribution) || contribution <= 0) throw new Error('Contribution amount must be greater than zero');
  const totalOccurrences = Math.ceil(target / contribution);
  const previewLimit = Math.max(1, Math.min(Number(limit) || 12, 50));
  const start = parseDateOnly(schedule.startDate);
  const dates = [];
  let current = start;
  let estimatedEndDate = '';
  for (let index = 0; index < totalOccurrences; index += 1) {
    current = getNextDate(current, schedule, index);
    if (index < previewLimit) dates.push(formatDateOnly(current));
    if (index === totalOccurrences - 1) estimatedEndDate = formatDateOnly(current);
  }
  return { schedule, dates, totalOccurrences, estimatedEndDate };
};

const buildScheduleDues = ({ committee, throughDate, fromDate = '', limit = 5000 }) => {
  const schedule = normalizeSchedule(committee.schedule || committee);
  const target = Number(committee.targetAmount);
  const contribution = Number(committee.contributionAmount);
  const through = parseDateOnly(throughDate);
  if (!through) throw new Error('A valid collection date is required');
  if (!(target > 0) || !(contribution > 0)) throw new Error('Committee amounts must be greater than zero');
  const totalOccurrences = Math.ceil(target / contribution);
  if (totalOccurrences > limit) throw new Error('This schedule is too large to calculate safely');
  const start = parseDateOnly(schedule.startDate);
  const rows = [];
  let current = start;
  let cumulative = 0;
  for (let index = 0; index < totalOccurrences; index += 1) {
    current = getNextDate(current, schedule, index);
    const date = formatDateOnly(current);
    const amount = Math.round(Math.min(contribution, target - cumulative) * 100) / 100;
    cumulative = Math.round((cumulative + amount) * 100) / 100;
    if (date > throughDate) break;
    if (!fromDate || date >= fromDate) {
      rows.push({
        dueKey: `${committee._id || committee.committeeId}:${date}:${index + 1}`,
        dueDate: date,
        installmentNumber: index + 1,
        amount,
      });
    }
  }
  return rows;
};

module.exports = { FREQUENCIES, buildScheduleDues, buildSchedulePreview, normalizeSchedule, parseDateOnly };

