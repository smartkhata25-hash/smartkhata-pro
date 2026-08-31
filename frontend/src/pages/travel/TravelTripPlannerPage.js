import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaCalculator,
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaMapMarkerAlt,
  FaPrint,
  FaRedo,
  FaRoute,
  FaSave,
} from 'react-icons/fa';

import { t } from '../../i18n/i18n';
import { buildTravelRouteState } from '../../utils/travelContext';
import {
  UMRAH_CITY_OPTIONS,
  UMRAH_PRESET_DAY_OPTIONS,
  buildAdjustedItinerary,
  generateItinerary,
  getFirstStayDate,
  getLastStayCheckoutDate,
  getLocalTodayIso,
  isoToHuman,
  summarizeCityStays,
} from '../../utils/umrahTripPlanner';
import {
  TravelActionButton,
  TravelMasterPageFrame,
} from '../../components/travel/master/TravelMasterUI';

const panelClass =
  'overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.07)]';

const labelClass = 'mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500';

const inputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-500';

const selectClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-500';

const formatIsoDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const calculateExitDate = (departureDate, totalDays) => {
  if (!departureDate) {
    return '';
  }

  const days = Number(totalDays);

  if (!Number.isInteger(days) || days < 1) {
    return '';
  }

  const parts = String(departureDate).split('-').map(Number);

  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return '';
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setDate(date.getDate() + days - 1);

  return formatIsoDate(date);
};

const initialPlannerState = () => ({
  departureDate: getLocalTodayIso(),
  totalDays: 15,
  customTotalDays: 15,
  useCustomTotal: false,
  exitDate: '',
  useExitDate: false,
  startCity: 'makkah',
  exitCity: 'makkah',
  maxMadinah: false,
  excludeArrival: false,
  excludeExit: false,
  markWeekend: true,
  fridayAdjustments: {},
});

const ToggleBox = ({ checked, onChange, labelKey, tone = 'cyan' }) => {
  const tones = {
    cyan: checked
      ? 'border-cyan-300 bg-gradient-to-r from-cyan-50 to-sky-50 text-cyan-900'
      : 'border-slate-200 bg-white text-slate-700',
    emerald: checked
      ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900'
      : 'border-slate-200 bg-white text-slate-700',
    violet: checked
      ? 'border-violet-300 bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-900'
      : 'border-slate-200 bg-white text-slate-700',
    amber: checked
      ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900'
      : 'border-slate-200 bg-white text-slate-700',
  };

  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm font-bold shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
        tones[tone] || tones.cyan
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
      />
      <span>{t(labelKey)}</span>
    </label>
  );
};

const StatCard = ({ labelKey, value, tone = 'cyan', icon: Icon }) => {
  const tones = {
    cyan: 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-100 text-cyan-950',
    emerald:
      'border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-100 text-emerald-950',
    amber:
      'border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 text-amber-950',
    violet:
      'border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-100 text-violet-950',
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${
        tones[tone] || tones.cyan
      }`}
    >
      <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-white/40" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider opacity-60">
            {t(labelKey)}
          </p>
          <p className="mt-1 truncate text-lg font-black">{value}</p>
        </div>

        {Icon && (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-sm shadow-sm">
            <Icon aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
};

const SegmentList = ({ result }) => {
  const segments = result?.adjustedSegments || result?.segments || [];

  if (!segments.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-dashed border-cyan-200 bg-gradient-to-br from-white via-cyan-50/40 to-sky-50 px-4 py-14 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-xl text-white shadow-lg shadow-cyan-200">
          <FaRoute aria-hidden="true" />
        </div>

        <p className="mt-4 text-sm font-extrabold text-slate-600">
          {t('travel.tripPlanner.empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((segment, index) => {
        if (segment.type === 'travel') {
          return (
            <div
              key={`travel-${segment.iso || index}`}
              className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 px-4 py-3 shadow-sm"
            >
              <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-amber-200/30" />

              <div className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
                  <FaRoute aria-hidden="true" />
                </span>

                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-amber-800">
                    {t('travel.tripPlanner.travelDay')}
                  </p>
                  <p className="mt-0.5 text-sm font-black text-slate-800">
                    {segment.date?.human || isoToHuman(segment.iso)}
                  </p>
                </div>
              </div>
            </div>
          );
        }

        const weekendCount = Array.isArray(segment.weekendDates) ? segment.weekendDates.length : 0;

        const isMakkah = segment.city === 'makkah';

        return (
          <div
            key={`stay-${segment.city}-${index}`}
            className={`overflow-hidden rounded-2xl border shadow-sm ${
              isMakkah
                ? 'border-emerald-200 bg-gradient-to-br from-white via-emerald-50/60 to-teal-50'
                : 'border-cyan-200 bg-gradient-to-br from-white via-cyan-50/60 to-sky-50'
            }`}
          >
            <div
              className={`flex flex-col gap-3 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between ${
                isMakkah
                  ? 'bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600'
                  : 'bg-gradient-to-r from-cyan-700 via-sky-600 to-blue-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <FaMapMarkerAlt aria-hidden="true" />
                </span>

                <div>
                  <p className="text-base font-black capitalize">
                    {t(`travel.umrah.city.${segment.city}`)}
                  </p>
                  <p className="text-xs font-bold text-white/80">
                    {t('travel.tripPlanner.calendarNights')}: {segment.originalDays}
                  </p>
                </div>
              </div>

              <div className="text-xs font-bold text-white/90 sm:text-right">
                <p>
                  {t('travel.booking.fields.checkIn')}: {segment.checkIn?.human || '-'}
                </p>
                <p className="mt-1">
                  {t('travel.booking.fields.checkOut')}: {segment.checkOut?.human || '-'}
                </p>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <StatCard
                  labelKey="travel.tripPlanner.countedNights"
                  value={segment.countedDays ?? segment.displayDays ?? segment.days ?? 0}
                  tone={isMakkah ? 'emerald' : 'cyan'}
                  icon={FaClock}
                />

                <StatCard
                  labelKey="travel.tripPlanner.countedCheckIn"
                  value={segment.countedCheckInIso ? isoToHuman(segment.countedCheckInIso) : '-'}
                  tone="violet"
                  icon={FaCalendarAlt}
                />

                <StatCard
                  labelKey="travel.tripPlanner.weekendNights"
                  value={weekendCount}
                  tone="amber"
                  icon={FaCheckCircle}
                />
              </div>

              {weekendCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {segment.weekendDates.map((iso) => (
                    <span
                      key={iso}
                      className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-black text-amber-700 shadow-sm"
                    >
                      {isoToHuman(iso)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const FridayTransferOptions = ({ result, onSelect }) => {
  const conflicts = (result?.travelInfos || []).filter((info) => info.options?.length);

  if (!conflicts.length) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 shadow-md">
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <FaCalendarAlt aria-hidden="true" />
          <p className="text-sm font-black">{t('travel.tripPlanner.fridayTransferTitle')}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {conflicts.map((info) => (
          <div
            key={`friday-transfer-${info.index}`}
            className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm"
          >
            <div className="flex flex-col gap-1 text-xs font-bold text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t(`travel.umrah.city.${info.fromCity}`)} {t('travel.tripPlanner.to')}{' '}
                {t(`travel.umrah.city.${info.toCity}`)}
              </span>

              <span className="text-amber-700">
                {t('travel.tripPlanner.originalFriday')}: {info.original?.human || '-'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {info.options.map((option) => {
                const selected = option.value === info.selectedOption;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => onSelect(info.index, option.value)}
                    className={`rounded-xl border px-4 py-3 text-left text-xs font-bold transition ${
                      selected
                        ? 'border-cyan-500 bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-100 ring-2 ring-cyan-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-[1px] hover:border-cyan-300 hover:bg-cyan-50 hover:shadow-md'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <span className="block text-sm font-black">
                      {t(option.labelKey)} - {option.date?.human || '-'}
                    </span>

                    <span className={`mt-1 block ${selected ? 'text-white/85' : 'text-slate-500'}`}>
                      {t('travel.tripPlanner.fridaySpentIn')}{' '}
                      {t(`travel.umrah.city.${option.fridaySpentInCity}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TravelTripPlannerPage = () => {
  const navigate = useNavigate();

  const [values, setValues] = useState(() => initialPlannerState());
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const selectedTotalDays = useMemo(() => {
    const days = values.useCustomTotal ? Number(values.customTotalDays) : Number(values.totalDays);

    return Number.isInteger(days) && days > 0 ? days : 0;
  }, [values.useCustomTotal, values.customTotalDays, values.totalDays]);

  const automaticExitDate = useMemo(
    () => calculateExitDate(values.departureDate, selectedTotalDays),
    [values.departureDate, selectedTotalDays]
  );

  const effectiveExitDate = useMemo(() => {
    if (values.useExitDate) {
      return values.exitDate || automaticExitDate;
    }

    return automaticExitDate;
  }, [values.useExitDate, values.exitDate, automaticExitDate]);

  const adjustedResult = useMemo(
    () =>
      buildAdjustedItinerary(result, {
        excludeArrival: values.excludeArrival,
        excludeExit: values.excludeExit,
        markWeekend: values.markWeekend,
      }),
    [result, values.excludeArrival, values.excludeExit, values.markWeekend]
  );

  const hasUnresolvedFridayTransfer = useMemo(
    () =>
      (adjustedResult?.travelInfos || []).some(
        (info) => info.options?.length && !info.selectedOption
      ),
    [adjustedResult]
  );

  useEffect(() => {
    if (result?.error) {
      setMessage(result.error);
    }
  }, [result]);

  const invalidateGeneratedPlan = () => {
    setResult(null);
    setMessage('');
  };

  const setField = (field, value, options = {}) => {
    const { invalidate = false, resetFriday = false } = options;

    setValues((current) => ({
      ...current,
      [field]: value,
      ...(resetFriday ? { fridayAdjustments: {} } : {}),
    }));

    if (invalidate) {
      invalidateGeneratedPlan();
    }
  };

  const buildGenerateOptions = (sourceValues) => {
    const totalDays = sourceValues.useCustomTotal
      ? Number(sourceValues.customTotalDays)
      : Number(sourceValues.totalDays);

    const autoExitDate = calculateExitDate(sourceValues.departureDate, totalDays);

    const finalExitDate = sourceValues.useExitDate
      ? sourceValues.exitDate || autoExitDate
      : autoExitDate;

    return {
      departureDate: sourceValues.departureDate,
      totalDays,
      exitDate: finalExitDate,
      startCity: sourceValues.startCity,
      exitCity: sourceValues.exitCity,
      maxMadinah: sourceValues.maxMadinah,
      fridayAdjustments: sourceValues.fridayAdjustments,
    };
  };

  const showGenerateResult = (generated) => {
    if (generated.error) {
      setResult(null);
      setMessage(generated.error);
      return;
    }

    const hasUnresolvedFridayConflict = (generated.travelInfos || []).some(
      (info) => info.options?.length && !info.selectedOption
    );

    setResult(generated);

    setMessage(
      hasUnresolvedFridayConflict
        ? t('travel.tripPlanner.fridayTransferDetected')
        : t('travel.tripPlanner.generated')
    );
  };

  const handleGenerate = (event) => {
    event.preventDefault();

    showGenerateResult(generateItinerary(buildGenerateOptions(values)));
  };

  const handleFridayAdjustment = (transferIndex, option) => {
    const nextValues = {
      ...values,
      fridayAdjustments: {
        ...(values.fridayAdjustments || {}),
        [transferIndex]: option,
      },
    };

    setValues(nextValues);

    showGenerateResult(generateItinerary(buildGenerateOptions(nextValues)));
  };

  const handlePresetDaysChange = (event) => {
    const nextDays = Number(event.target.value);

    setValues((current) => ({
      ...current,
      totalDays: nextDays,
      fridayAdjustments: {},
    }));

    invalidateGeneratedPlan();
  };

  const handleCustomDaysToggle = (checked) => {
    setValues((current) => ({
      ...current,
      useCustomTotal: checked,
      useExitDate: checked ? false : current.useExitDate,
      exitDate: checked ? '' : current.exitDate,
      fridayAdjustments: {},
    }));

    invalidateGeneratedPlan();
  };

  const handleExitDateToggle = (checked) => {
    setValues((current) => {
      const days = current.useCustomTotal
        ? Number(current.customTotalDays)
        : Number(current.totalDays);

      const calculated = calculateExitDate(current.departureDate, days);

      return {
        ...current,
        useExitDate: checked,
        useCustomTotal: checked ? false : current.useCustomTotal,
        exitDate: checked ? calculated : '',
        fridayAdjustments: {},
      };
    });

    invalidateGeneratedPlan();
  };

  const handleReset = () => {
    setValues(initialPlannerState());
    setResult(null);
    setMessage('');
  };

  const handleSendToCalculator = () => {
    if (!adjustedResult || adjustedResult.error) {
      return;
    }

    if (hasUnresolvedFridayTransfer) {
      setMessage(t('travel.tripPlanner.fridayTransferDetected'));
      return;
    }

    navigate('/travel/umrah-calculator', {
      state: {
        ...buildTravelRouteState('/travel/trip-planner'),
        umrahPlan: adjustedResult,
        umrahPlannerOptions: {
          departureDate: values.departureDate,
          totalDays: selectedTotalDays,
          useCustomTotal: values.useCustomTotal,
          exitDate: effectiveExitDate,
          useExitDate: values.useExitDate,
          startCity: values.startCity,
          exitCity: values.exitCity,
          excludeArrival: values.excludeArrival,
          excludeExit: values.excludeExit,
          markWeekend: values.markWeekend,
          fridayAdjustments: values.fridayAdjustments,
        },
      },
    });
  };

  const makkahSummary = summarizeCityStays(adjustedResult, 'makkah');

  const madinahSummary = summarizeCityStays(adjustedResult, 'madinah');

  const generatedTravelStartDate = getFirstStayDate(adjustedResult);

  const generatedTravelEndDate = getLastStayCheckoutDate(adjustedResult);

  const displayTravelStartDate = generatedTravelStartDate || values.departureDate;

  const displayTravelEndDate = generatedTravelEndDate || effectiveExitDate;

  return (
    <TravelMasterPageFrame
      titleKey="travel.tripPlanner.title"
      actions={
        <div className="flex flex-wrap gap-2">
          <TravelActionButton icon={FaRedo} variant="secondary" onClick={handleReset}>
            {t('travel.tripPlanner.reset')}
          </TravelActionButton>

          <TravelActionButton
            icon={FaCalculator}
            variant="primary"
            onClick={handleSendToCalculator}
            disabled={!adjustedResult || adjustedResult.error || hasUnresolvedFridayTransfer}
          >
            {t('travel.tripPlanner.sendToCalculator')}
          </TravelActionButton>
        </div>
      }
    >
      <div className="rounded-3xl bg-gradient-to-br from-cyan-50/70 via-white to-emerald-50/60 p-1">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className={panelClass}>
            <div className="relative overflow-hidden bg-gradient-to-r from-cyan-700 via-sky-600 to-blue-700 px-4 py-4 text-white">
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <div className="absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-cyan-300/10" />

              <div className="relative flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg shadow-sm backdrop-blur-sm">
                  <FaCalendarAlt aria-hidden="true" />
                </span>

                <div>
                  <h2 className="text-base font-black">{t('travel.tripPlanner.inputs')}</h2>

                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-cyan-50">
                    <span className="rounded-full bg-white/15 px-2 py-0.5">
                      {selectedTotalDays || '-'} {t('travel.tripPlanner.days')}
                    </span>

                    {effectiveExitDate && (
                      <span className="rounded-full bg-white/15 px-2 py-0.5">
                        {isoToHuman(effectiveExitDate)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleGenerate}
              className="space-y-4 bg-gradient-to-b from-white to-slate-50/60 p-4"
            >
              <label className="block">
                <span className={labelClass}>{t('travel.tripPlanner.departureDate')}</span>

                <input
                  type="date"
                  value={values.departureDate}
                  onChange={(event) =>
                    setField('departureDate', event.target.value, {
                      invalidate: true,
                      resetFriday: true,
                    })
                  }
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>{t('travel.tripPlanner.presetDays')}</span>

                  <select
                    value={values.totalDays}
                    disabled={values.useCustomTotal || values.useExitDate}
                    onChange={handlePresetDaysChange}
                    className={selectClass}
                  >
                    {UMRAH_PRESET_DAY_OPTIONS.map((days) => (
                      <option key={days} value={days}>
                        {days} {t('travel.tripPlanner.days')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelClass}>{t('travel.tripPlanner.customDays')}</span>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={values.customTotalDays}
                    disabled={!values.useCustomTotal || values.useExitDate}
                    onChange={(event) =>
                      setField('customTotalDays', event.target.value, {
                        invalidate: true,
                        resetFriday: true,
                      })
                    }
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ToggleBox
                  checked={values.useCustomTotal}
                  onChange={handleCustomDaysToggle}
                  labelKey="travel.tripPlanner.useCustomDays"
                  tone="violet"
                />

                <ToggleBox
                  checked={values.useExitDate}
                  onChange={handleExitDateToggle}
                  labelKey="travel.tripPlanner.useExitDate"
                  tone="emerald"
                />
              </div>

              <label className="block">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    {t('travel.tripPlanner.exitDate')}
                  </span>

                  {!values.useExitDate && effectiveExitDate && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      AUTO
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="date"
                    value={effectiveExitDate}
                    disabled={!values.useExitDate}
                    onChange={(event) =>
                      setField('exitDate', event.target.value, {
                        invalidate: true,
                        resetFriday: true,
                      })
                    }
                    className={`${inputClass} ${
                      !values.useExitDate
                        ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 font-black text-emerald-800'
                        : ''
                    }`}
                  />
                </div>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>{t('travel.tripPlanner.startCity')}</span>

                  <select
                    value={values.startCity}
                    onChange={(event) =>
                      setField('startCity', event.target.value, {
                        invalidate: true,
                        resetFriday: true,
                      })
                    }
                    className={selectClass}
                  >
                    {UMRAH_CITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelClass}>{t('travel.tripPlanner.exitCity')}</span>

                  <select
                    value={values.exitCity}
                    onChange={(event) =>
                      setField('exitCity', event.target.value, {
                        invalidate: true,
                        resetFriday: true,
                      })
                    }
                    className={selectClass}
                  >
                    {UMRAH_CITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <ToggleBox
                  checked={values.maxMadinah}
                  onChange={(checked) =>
                    setField('maxMadinah', checked, {
                      invalidate: true,
                      resetFriday: true,
                    })
                  }
                  labelKey="travel.tripPlanner.maxMadinah"
                  tone="emerald"
                />

                <ToggleBox
                  checked={values.excludeArrival}
                  onChange={(checked) => setField('excludeArrival', checked)}
                  labelKey="travel.tripPlanner.excludeArrival"
                  tone="cyan"
                />

                <ToggleBox
                  checked={values.excludeExit}
                  onChange={(checked) => setField('excludeExit', checked)}
                  labelKey="travel.tripPlanner.excludeExit"
                  tone="violet"
                />

                <ToggleBox
                  checked={values.markWeekend}
                  onChange={(checked) => setField('markWeekend', checked)}
                  labelKey="travel.tripPlanner.markWeekend"
                  tone="amber"
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                <TravelActionButton icon={FaRoute} type="submit" variant="primary">
                  {t('travel.tripPlanner.generate')}
                </TravelActionButton>
              </div>
            </form>

            {message && (
              <div className="border-t border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm font-bold text-amber-800">
                {message}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                labelKey="travel.tripPlanner.makkahNights"
                value={makkahSummary.nights}
                tone="emerald"
                icon={FaMapMarkerAlt}
              />

              <StatCard
                labelKey="travel.tripPlanner.madinahNights"
                value={madinahSummary.nights}
                tone="cyan"
                icon={FaMapMarkerAlt}
              />

              <StatCard
                labelKey="travel.tripPlanner.travelStart"
                value={displayTravelStartDate ? isoToHuman(displayTravelStartDate) : '-'}
                tone="amber"
                icon={FaCalendarAlt}
              />

              <StatCard
                labelKey="travel.tripPlanner.travelEnd"
                value={displayTravelEndDate ? isoToHuman(displayTravelEndDate) : '-'}
                tone="violet"
                icon={FaCalendarAlt}
              />
            </div>

            <FridayTransferOptions result={adjustedResult} onSelect={handleFridayAdjustment} />

            <SegmentList result={adjustedResult} />

            {adjustedResult && !adjustedResult.error && (
              <div className="flex flex-wrap justify-end gap-2 rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-cyan-50/50 to-emerald-50/50 p-3 shadow-sm">
                <TravelActionButton
                  icon={FaPrint}
                  variant="secondary"
                  onClick={() => window.print()}
                >
                  {t('common.print')}
                </TravelActionButton>

                <TravelActionButton
                  icon={FaSave}
                  variant="primary"
                  onClick={handleSendToCalculator}
                  disabled={hasUnresolvedFridayTransfer}
                >
                  {t('travel.tripPlanner.sendToCalculator')}
                </TravelActionButton>
              </div>
            )}
          </section>
        </div>
      </div>
    </TravelMasterPageFrame>
  );
};

export default TravelTripPlannerPage;
