import React, { useCallback } from 'react';
import { t } from '../../i18n/i18n';

export const KG_TO_LBS = 2.2046226218;
export const LBS_TO_KG = 0.45359237;

const display = (value) => {
  if (value === '' || value == null) {
    return '';
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '';
  }

  return String(Math.round(numeric * 1000) / 1000);
};

const WeightKgLbsInput = ({
  kg = '',
  lbs = '',
  onChange,
  disabled = false,
  required = false,
  kgPlaceholder = 'e.g. 500',
  lbsPlaceholder = 'e.g. 1102.311',
}) => {
  const changeKg = useCallback(
    (event) => {
      const raw = event.target.value;

      onChange({
        kg: raw,
        lbs: raw === '' ? '' : display(Number(raw) * KG_TO_LBS),
        sourceEntryUnit: 'KG',
      });
    },
    [onChange]
  );

  const changeLbs = useCallback(
    (event) => {
      const raw = event.target.value;

      onChange({
        lbs: raw,
        kg: raw === '' ? '' : display(Number(raw) * LBS_TO_KG),
        sourceEntryUnit: 'LBS',
      });
    },
    [onChange]
  );

  const inputClass = `
    mt-1
    h-9
    w-full
    rounded-md
    border
    border-slate-300
    bg-white
    px-3
    text-sm
    text-slate-800
    outline-none
    transition-all
    duration-150
    placeholder:text-slate-400
    hover:border-teal-400
    hover:bg-teal-50/20
    focus:border-teal-500
    focus:bg-white
    focus:ring-2
    focus:ring-teal-100
    disabled:cursor-not-allowed
    disabled:bg-slate-100
    disabled:text-slate-500
  `;

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <label className="block min-w-0 text-sm font-medium text-slate-700">
        <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
          {t('weaving.operations.kg')}

          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>

        <input
          type="number"
          min="0"
          step="0.001"
          inputMode="decimal"
          placeholder={kgPlaceholder}
          value={kg}
          onChange={changeKg}
          disabled={disabled}
          required={required}
          className={inputClass}
        />
      </label>

      <label className="block min-w-0 text-sm font-medium text-slate-700">
        <span className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600">
          {t('weaving.operations.lbs')}
        </span>

        <input
          type="number"
          min="0"
          step="0.001"
          inputMode="decimal"
          placeholder={lbsPlaceholder}
          value={lbs}
          onChange={changeLbs}
          disabled={disabled}
          className={inputClass}
        />
      </label>
    </div>
  );
};

export default WeightKgLbsInput;
