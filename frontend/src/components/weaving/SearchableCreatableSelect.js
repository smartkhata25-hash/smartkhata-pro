import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { FaChevronDown, FaPlus, FaSearch } from 'react-icons/fa';

import { t } from '../../i18n/i18n';

const defaultLabel = (item) => item?.name || '';
const normalizeSearchValue = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

const SearchableCreatableSelect = ({
  label,
  placeholder,
  options = [],
  value,
  onChange,
  onQuickAdd,
  onAddDetails,
  getLabel = defaultLabel,
  required = false,
}) => {
  const inputId = useId();
  const root = useRef(null);
  const previousValue = useRef(value);

  const selected = options.find((item) => String(item._id) === String(value));

  const [query, setQuery] = useState(selected ? getLabel(selected) : '');

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected) {
      setQuery(getLabel(selected));
    } else if (previousValue.current && !value) {
      setQuery('');
    }

    previousValue.current = value;
  }, [selected, value, getLabel]);

  useEffect(() => {
    const close = (event) => {
      if (!root.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', close);

    return () => {
      document.removeEventListener('pointerdown', close);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = normalizeSearchValue(query);

    return options
      .filter((item) => {
        const itemLabel = normalizeSearchValue(getLabel(item));

        return !term || itemLabel.includes(term);
      })
      .slice(0, 30);
  }, [getLabel, options, query]);

  const exact = useMemo(() => {
    const term = normalizeSearchValue(query);

    if (!term) return false;

    return options.some(
      (item) =>
        normalizeSearchValue(getLabel(item)) === term
    );
  }, [getLabel, options, query]);

  const selectItem = (item) => {
    setQuery(getLabel(item));
    onChange(item._id, item);
    setOpen(false);
  };

  const handleInputChange = (event) => {
    const next = event.target.value;

    setQuery(next);
    onChange('', null);
    setOpen(true);
  };

  const handleQuickAdd = async (event) => {
    event.preventDefault();

    const name = query.trim();

    const created = await onQuickAdd(name);

    setQuery(created?.value || created?.name || name);
    setOpen(false);
  };

  const canCreate = query.trim() && !exact && (onQuickAdd || onAddDetails);

  return (
    <div ref={root} className="relative block min-w-0 text-sm font-medium text-slate-700">
      <label
        htmlFor={inputId}
        className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600"
      >
        {label}

        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>

      <div className="relative mt-1">
        <FaSearch className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs text-slate-400" />

        <input
          id={inputId}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={handleInputChange}
          className="
            h-9
            w-full
            rounded-md
            border
            border-slate-300
            bg-white
            pl-8
            pr-9
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
          "
        />

        <button
          type="button"
          title="Open list"
          aria-label="Open list"
          onClick={() => setOpen((current) => !current)}
          className="
            absolute
            right-0
            top-0
            flex
            h-9
            w-9
            items-center
            justify-center
            rounded-r-md
            text-slate-400
            transition
            hover:bg-teal-50
            hover:text-teal-700
          "
        >
          <FaChevronDown className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-[200] mt-1 max-h-72 w-full min-w-[280px] overflow-y-auto rounded-lg border border-teal-100 bg-white shadow-2xl ring-1 ring-black/5">
            {filtered.map((item) => {
              const isSelected = String(item._id) === String(value);

              return (
                <button
                  type="button"
                  key={item._id}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    selectItem(item);
                  }}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm transition last:border-b-0 ${
                    isSelected
                      ? 'bg-gradient-to-r from-teal-100 to-emerald-50 font-semibold text-teal-900'
                      : 'text-slate-700 hover:bg-gradient-to-r hover:from-teal-50 hover:to-emerald-50 hover:text-teal-900'
                  }`}
                >
                  {getLabel(item)}
                </button>
              );
            })}

            {!filtered.length && (
              <div className="px-4 py-3 text-sm text-slate-500">
                {t('weaving.operations.noMatches')}
              </div>
            )}

            {canCreate && (
              <div className="sticky bottom-0 border-t border-teal-100 bg-white p-1.5 shadow-[0_-4px_12px_rgba(15,23,42,0.05)]">
                {onQuickAdd && (
                  <button
                    type="button"
                    onPointerDown={handleQuickAdd}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                      <FaPlus className="text-xs" />
                    </span>

                    <span className="truncate">
                      {t('weaving.operations.quickAdd')} &quot;{query.trim()}&quot;
                    </span>
                  </button>
                )}

                {onAddDetails && (
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();

                      onAddDetails(query.trim());

                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                      <FaPlus className="text-xs" />
                    </span>

                    <span>{t('weaving.operations.addWithDetails')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchableCreatableSelect;
