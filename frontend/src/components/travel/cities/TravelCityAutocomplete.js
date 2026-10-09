import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaMapMarkerAlt, FaPlus, FaSearch, FaTimes } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import { buildCitySuggestions, getNormalizedCityKey, normalizeCityName } from './travelCityUtils';

const TravelCityAutocomplete = ({
  value = '',
  onChange,
  cities = [],
  hotels = [],
  onCreate = null,
  disabled = false,
  labelKey = 'travel.fields.city',
  placeholderKey = 'travel.placeholders.city',
  inputId,
}) => {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const createLockRef = useRef(false);
  const options = useMemo(() => buildCitySuggestions(cities, hotels), [cities, hotels]);
  const cleanQuery = normalizeCityName(query);
  const queryKey = getNormalizedCityKey(cleanQuery);
  const filtered = useMemo(() => {
    if (!queryKey) return options.slice(0, 12);
    return options
      .filter((city) => getNormalizedCityKey(city.name).includes(queryKey))
      .slice(0, 12);
  }, [options, queryKey]);
  const exact = options.find((city) => getNormalizedCityKey(city.name) === queryKey);
  const canAdd = Boolean(cleanQuery && !exact && onCreate);

  useEffect(() => {
    if (!open) setQuery(value || '');
  }, [open, value]);

  useEffect(() => setHighlightedIndex(0), [queryKey]);

  const selectCity = (city) => {
    const name = normalizeCityName(city?.name);
    onChange(name, city);
    setQuery(name);
    setOpen(false);
  };

  const createCity = async () => {
    if (!canAdd || createLockRef.current) return;
    createLockRef.current = true;
    setCreating(true);
    setCreateError('');
    try {
      const saved = await onCreate(cleanQuery);
      if (saved) selectCity(saved);
    } catch (error) {
      setCreateError(error?.response?.data?.message || t('travel.cities.createFailed'));
    } finally {
      createLockRef.current = false;
      setCreating(false);
    }
  };

  const handleKeyDown = (event) => {
    const actionCount = filtered.length + (canAdd ? 1 : 0);
    if (event.key === 'ArrowDown' && actionCount) {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => (current + 1) % actionCount);
    } else if (event.key === 'ArrowUp' && actionCount) {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => (current - 1 + actionCount) % actionCount);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (highlightedIndex < filtered.length) selectCity(filtered[highlightedIndex]);
      else if (canAdd) void createCity();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative block min-w-0">
      {labelKey && (
        <span className="mb-1 block text-xs font-extrabold text-slate-500">{t(labelKey)}</span>
      )}
      <span className="relative block">
        <FaMapMarkerAlt className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-cyan-600" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          disabled={disabled}
          placeholder={t(placeholderKey)}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            if (!next) onChange('', null);
          }}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-9 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        {query && !disabled && (
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(''); onChange('', null); setOpen(true); }} className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100" title={t('travel.common.clear')}>
            <FaTimes aria-hidden="true" />
          </button>
        )}
      </span>

      {open && !disabled && (
        <span className="absolute left-0 z-[210] mt-1 block max-h-72 w-full min-w-[260px] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-2xl">
          {filtered.map((city, index) => (
            <button key={city._id || city.name} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectCity(city)} className={`block w-full rounded-md px-3 py-2 text-left ${index === highlightedIndex ? 'bg-cyan-50 text-cyan-900' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span className="block text-sm font-extrabold">{city.name}</span>
              {city.country && <span className="block text-xs font-semibold text-slate-500">{city.country}</span>}
            </button>
          ))}
          {canAdd && (
            <button type="button" disabled={creating} onMouseDown={(event) => event.preventDefault()} onClick={() => void createCity()} className={`flex w-full items-center gap-2 rounded-md border-t border-slate-100 px-3 py-2 text-left text-sm font-extrabold text-cyan-700 ${highlightedIndex === filtered.length ? 'bg-cyan-50' : 'hover:bg-cyan-50'}`}>
              <FaPlus aria-hidden="true" />
              {creating ? t('travel.common.saving') : `${t('travel.cities.addQuoted')} “${cleanQuery}”`}
            </button>
          )}
          {!filtered.length && !canAdd && (
            <span className="block px-3 py-3 text-center text-sm font-semibold text-slate-500"><FaSearch className="mr-2 inline" />{t('travel.cities.empty')}</span>
          )}
        </span>
      )}
      {createError && <span className="mt-1 block text-xs font-semibold text-rose-600">{createError}</span>}
    </div>
  );
};

export default TravelCityAutocomplete;
