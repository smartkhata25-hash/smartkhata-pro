import React, { useEffect, useMemo, useState } from 'react';
import {
  FaBolt,
  FaCheck,
  FaEdit,
  FaExternalLinkAlt,
  FaPlus,
  FaSave,
  FaSearch,
  FaTimes,
} from 'react-icons/fa';

import { DEFAULT_TRAVEL_CURRENCY } from '../../../config/travelConfig';
import { t } from '../../../i18n/i18n';

export const useIsCompactTravelView = () => {
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsCompact(window.innerWidth < 768);

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isCompact;
};

export const normalizeSearch = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase();

export const formatTravelMoney = (value, currency = '') => {
  const numericValue = Number(value || 0);
  const prefix = `${String(currency || DEFAULT_TRAVEL_CURRENCY).toUpperCase()} `;

  return `${prefix}${numericValue.toLocaleString('en-GB')}`;
};

export const TravelActionButton = ({
  children,
  icon: Icon = null,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  title,
  onMouseDown,
}) => {
  const variantClasses = {
    primary: 'border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-700',
    secondary: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    soft: 'border-cyan-100 bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  };

  return (
    <button
      type={type}
      onMouseDown={onMouseDown}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:gap-2 sm:px-3 sm:py-2 ${
        variantClasses[variant] || variantClasses.secondary
      }`}
    >
      {Icon && <Icon aria-hidden="true" className="text-[11px]" />}
      <span>{children}</span>
    </button>
  );
};

export const TravelStatusBadge = ({ active }) => (
  <span
    className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-extrabold ${
      active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-100 text-slate-600'
    }`}
  >
    {active ? <FaCheck aria-hidden="true" /> : <FaTimes aria-hidden="true" />}
    {active ? t('travel.common.active') : t('travel.common.inactive')}
  </span>
);

export const buildTravelConfirmMessage = (actionKey, recordLabel = '') => {
  const label = String(recordLabel || t('travel.common.thisRecord')).trim();

  return `${t(actionKey)}: ${label}?`;
};

export const TravelMasterPageFrame = ({
  titleKey,
  subtitleKey,
  children,
  actions = null,
  filters = null,
}) => (
  <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-3 sm:p-4 md:p-5 lg:p-6">
    <section className="mb-3 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
      <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500" />
      <div className="flex flex-col gap-2 px-3 py-3 lg:flex-row lg:items-center lg:justify-between md:px-4">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight text-slate-950 md:text-xl">
            {t(titleKey)}
          </h1>
          {subtitleKey && (
            <p className="mt-0.5 text-xs font-semibold text-slate-500 md:text-sm">
              {t(subtitleKey)}
            </p>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">{actions}</div>}
      </div>

      {filters && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 md:px-4">{filters}</div>
      )}
    </section>

    {children}
  </div>
);

export const TravelSearchInput = ({ value, onChange, placeholderKey }) => (
  <label className="relative block min-w-0 flex-1">
    <span className="sr-only">{t(placeholderKey)}</span>
    <FaSearch
      aria-hidden="true"
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
    />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={t(placeholderKey)}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-9 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
    />
  </label>
);

export const TravelSegmentedControl = ({ options, value, onChange }) => (
  <div className="inline-flex min-h-10 max-w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1">
    {options.map((option) => {
      const active = option.value === value;

      return (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-extrabold transition ${
            active ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {t(option.labelKey)}
        </button>
      );
    })}
  </div>
);

export const TravelMasterToolbar = ({ children, className = '' }) => (
  <div className={`flex flex-col gap-2 lg:flex-row lg:items-center ${className}`}>{children}</div>
);

export const TravelFilterSelect = ({
  value,
  onChange,
  options = [],
  placeholderKey,
  className = '',
}) => (
  <select
    value={value || ''}
    onChange={(event) => onChange(event.target.value)}
    className={`h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${className}`}
  >
    {placeholderKey && <option value="">{t(placeholderKey)}</option>}
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.labelKey ? t(option.labelKey) : option.label}
      </option>
    ))}
  </select>
);

export const TravelMasterList = ({
  columns,
  records,
  rowKey = '_id',
  renderMobileCard,
  emptyKey,
  selectedId = '',
  onRowClick = null,
}) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="hidden overflow-auto md:block">
      <table className="min-w-[980px] w-full table-fixed border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs font-extrabold uppercase tracking-normal text-slate-600">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`border border-slate-300 px-3 py-3 ${column.className || ''}`}
              >
                {t(column.labelKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const key = record[rowKey];
            const selected = String(selectedId) === String(key);

            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(record)}
                className={`border-b border-slate-200 transition ${
                  selected ? 'bg-cyan-50' : 'odd:bg-white even:bg-slate-50/40 hover:bg-cyan-50/60'
                } ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`border-x border-slate-200 px-3 py-2.5 align-top ${column.cellClassName || ''}`}
                  >
                    {column.render ? column.render(record) : record[column.key] || '-'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="space-y-2 p-3 md:hidden">
      {records.map((record) => (
        <div key={record[rowKey]}>{renderMobileCard(record)}</div>
      ))}
    </div>

    {records.length === 0 && (
      <div className="border-t border-slate-100 px-4 py-10 text-center text-sm font-semibold text-slate-500">
        {t(emptyKey)}
      </div>
    )}
  </section>
);

export const TravelCardLine = ({ labelKey, value }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-bold uppercase tracking-normal text-slate-400">{t(labelKey)}</p>
    <p className="mt-0.5 truncate text-sm font-bold text-slate-700">{value || '-'}</p>
  </div>
);

const renderField = (field, value, onChange) => {
  if (field.type === 'select') {
    return (
      <select
        value={value || ''}
        onChange={(event) => onChange(field.name, event.target.value)}
        required={field.required}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
      >
        {field.placeholderKey && <option value="">{t(field.placeholderKey)}</option>}
        {(field.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.labelKey ? t(option.labelKey) : option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={(event) => onChange(field.name, event.target.value)}
        rows={3}
        placeholder={field.placeholderKey ? t(field.placeholderKey) : ''}
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
      />
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.name, event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-cyan-600"
        />
        {t(field.labelKey)}
      </label>
    );
  }

  const isNumberField = field.type === 'number';

  return (
    <input
      type={field.type || 'text'}
      inputMode={field.inputMode}
      min={field.min}
      max={field.max}
      step={field.step}
      value={value ?? ''}
      onWheel={
        isNumberField
          ? (event) => {
              event.currentTarget.blur();
            }
          : undefined
      }
      onChange={(event) => onChange(field.name, event.target.value)}
      required={field.required}
      placeholder={field.placeholderKey ? t(field.placeholderKey) : ''}
      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
    />
  );
};

export const TravelFormModal = ({
  open,
  titleKey,
  modeKey,
  fields = [],
  values,
  onChange,
  onClose,
  onSubmit,
  submitting = false,
  error = '',
  children = null,
  submitIcon: SubmitIcon = FaSave,
}) => {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm md:items-center md:p-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-cyan-200">
              {modeKey ? t(modeKey) : t('travel.common.addWithDetails')}
            </p>
            <h2 className="mt-1 text-lg font-extrabold leading-tight">{t(titleKey)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('travel.common.close')}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white hover:bg-white/20"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4 md:max-h-[68vh]">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            {fields.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map((field) => {
                  if (field.hidden) return null;
                  const fullWidth =
                    field.fullWidth || field.type === 'textarea' || field.type === 'checkbox';
                  const FieldWrapper = field.type === 'checkbox' ? 'div' : 'label';

                  return (
                    <FieldWrapper
                      key={field.name}
                      className={`min-w-0 ${fullWidth ? 'sm:col-span-2' : ''}`}
                    >
                      {field.type !== 'checkbox' && field.labelKey && (
                        <span className="mb-1 block text-xs font-extrabold text-slate-500">
                          {t(field.labelKey)}
                        </span>
                      )}
                      {renderField(field, values[field.name], onChange)}
                    </FieldWrapper>
                  );
                })}
              </div>
            )}

            {children}
          </div>

          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white p-3">
            <TravelActionButton onClick={onClose} variant="secondary" disabled={submitting}>
              {t('travel.common.cancel')}
            </TravelActionButton>
            <TravelActionButton
              type="submit"
              icon={SubmitIcon}
              variant="primary"
              disabled={submitting}
            >
              {submitting ? t('travel.common.saving') : t('travel.common.save')}
            </TravelActionButton>
          </div>
        </form>
      </div>
    </div>
  );
};

export const TravelRelationPicker = ({
  labelKey,
  value,
  onChange,
  records = [],
  getLabel,
  getMeta = null,
  searchPlaceholderKey,
  emptyKey,
  onQuickAdd,
  onAddDetails,
}) => {
  const [query, setQuery] = useState('');

  const selectedRecord = useMemo(
    () => records.find((record) => String(record?._id) === String(value)) || null,
    [records, value]
  );

  const filteredRecords = useMemo(() => {
    const cleanQuery = normalizeSearch(query);

    if (!cleanQuery) {
      return records.slice(0, 8);
    }

    return records
      .filter((record) => {
        const label = getLabel(record).toLowerCase();
        const meta = getMeta ? String(getMeta(record) || '').toLowerCase() : '';

        return label.includes(cleanQuery) || meta.includes(cleanQuery);
      })
      .slice(0, 8);
  }, [getLabel, getMeta, query, records]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-slate-600">{t(labelKey)}</p>
          <p className="truncate text-sm font-bold text-slate-900">
            {selectedRecord ? getLabel(selectedRecord) : t('travel.common.noneSelected')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onQuickAdd && (
            <TravelActionButton icon={FaBolt} variant="soft" onClick={() => onQuickAdd(query)}>
              {t('travel.common.quickAdd')}
            </TravelActionButton>
          )}
          {onAddDetails && (
            <TravelActionButton
              icon={FaExternalLinkAlt}
              variant="secondary"
              onClick={() => onAddDetails(query)}
            >
              {t('travel.common.addWithDetails')}
            </TravelActionButton>
          )}
        </div>
      </div>

      <TravelSearchInput value={query} onChange={setQuery} placeholderKey={searchPlaceholderKey} />

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filteredRecords.map((record) => {
          const selected = String(record._id) === String(value);

          return (
            <button
              type="button"
              key={record._id}
              onClick={() => onChange(record._id, record)}
              className={`min-w-0 rounded-lg border px-3 py-2 text-left transition ${
                selected
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="block truncate text-sm font-extrabold">{getLabel(record)}</span>
              {getMeta && (
                <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                  {getMeta(record) || '-'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filteredRecords.length === 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500">
          {t(emptyKey)}
        </div>
      )}
    </div>
  );
};

export const TravelCompactAutocomplete = ({
  labelKey,
  value,
  onChange,
  records = [],
  getLabel,
  getMeta = null,
  placeholderKey,
  emptyKey = 'travel.common.noMatches',
  onQuickAdd = null,
  onAddDetails = null,
  disabled = false,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selectedRecord = useMemo(
    () => records.find((record) => String(record?._id) === String(value)) || null,
    [records, value]
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedRecord ? getLabel(selectedRecord) : '');
    }
  }, [getLabel, open, selectedRecord]);

  const filteredRecords = useMemo(() => {
    const cleanQuery = normalizeSearch(query);

    if (!cleanQuery) {
      return selectedRecord ? [selectedRecord] : [];
    }

    return records
      .filter((record) => {
        const label = getLabel(record).toLowerCase();
        const meta = getMeta ? String(getMeta(record) || '').toLowerCase() : '';

        return label.includes(cleanQuery) || meta.includes(cleanQuery);
      })
      .slice(0, 8);
  }, [getLabel, getMeta, query, records, selectedRecord]);

  const cleanQuery = normalizeSearch(query);
  const hasExactMatch = filteredRecords.some(
    (record) => normalizeSearch(getLabel(record)) === cleanQuery
  );
  const showCreationActions = cleanQuery && !hasExactMatch && (onQuickAdd || onAddDetails);

  const selectRecord = (record) => {
    onChange(record._id, record);
    setQuery(getLabel(record));
    setOpen(false);
  };

  return (
    <div className={`relative block min-w-0 ${className}`}>
      {labelKey && (
        <span className="mb-1 block text-xs font-extrabold text-slate-500">{t(labelKey)}</span>
      )}
      <span className="relative block">
        <FaSearch
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
        />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);

            if (!event.target.value) {
              onChange('', null);
            }
          }}
          placeholder={placeholderKey ? t(placeholderKey) : ''}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-9 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        />
        {value && !disabled && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('', null);
              setQuery('');
              setOpen(false);
            }}
            title={t('common.clear')}
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <FaTimes aria-hidden="true" className="text-xs" />
          </button>
        )}
      </span>

      {open && (
        <div className="absolute left-0 z-[200] mt-1 max-h-72 w-full min-w-[360px] max-w-[min(440px,calc(100vw-2rem))] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-2xl">
          {filteredRecords.map((record) => (
            <button
              type="button"
              key={record._id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectRecord(record)}
              className={`block w-full rounded-md px-3 py-2 text-left transition ${
                String(record._id) === String(value)
                  ? 'bg-cyan-50 text-cyan-900'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="block truncate text-sm font-extrabold">{getLabel(record)}</span>
              {getMeta && (
                <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                  {getMeta(record) || '-'}
                </span>
              )}
            </button>
          ))}

          {cleanQuery && filteredRecords.length === 0 && (
            <div className="px-3 py-3 text-center text-sm font-semibold text-slate-500">
              {t(emptyKey)}
            </div>
          )}

          {showCreationActions && (
            <div className="mt-1 flex flex-wrap gap-2 border-t border-slate-100 p-2">
              {onQuickAdd && (
                <TravelActionButton
                  icon={FaBolt}
                  variant="soft"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onQuickAdd(query);
                    setOpen(false);
                  }}
                >
                  {t('travel.common.quickAdd')}
                </TravelActionButton>
              )}
              {onAddDetails && (
                <TravelActionButton
                  icon={FaExternalLinkAlt}
                  variant="secondary"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onAddDetails(query);
                    setOpen(false);
                  }}
                >
                  {t('travel.common.addWithDetails')}
                </TravelActionButton>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const getEditAction = (onClick) => (
  <TravelActionButton
    icon={FaEdit}
    variant="secondary"
    onClick={onClick}
    title={t('travel.common.edit')}
  >
    {t('travel.common.edit')}
  </TravelActionButton>
);

export const getAddAction = (onClick, labelKey = 'travel.common.add') => (
  <TravelActionButton icon={FaPlus} variant="primary" onClick={onClick}>
    {t(labelKey)}
  </TravelActionButton>
);

export const getQuickAddAction = (onClick) => (
  <TravelActionButton icon={FaBolt} variant="soft" onClick={onClick}>
    {t('travel.common.quickAdd')}
  </TravelActionButton>
);
