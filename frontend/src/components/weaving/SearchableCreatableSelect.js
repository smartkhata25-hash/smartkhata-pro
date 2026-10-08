import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { FaChevronDown, FaPlus, FaSearch } from 'react-icons/fa';

import { t } from '../../i18n/i18n';

const defaultLabel = (item) => item?.name || '';
const normalizeSearchValue = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

const SearchableCreatableSelect = ({
  label,
  hideLabel = false,
  placeholder,
  options = [],
  value,
  onChange,
  onQuickAdd,
  onAddDetails,
  canAddDetails = () => true,
  addDetailsLabel,
  getLabel = defaultLabel,
  required = false,
}) => {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const root = useRef(null);
  const inputRef = useRef(null);
  const optionRefs = useRef([]);
  const actionInProgress = useRef(false);
  const previousValue = useRef(value);

  const selected = options.find((item) => String(item._id) === String(value));

  const [query, setQuery] = useState(selected ? getLabel(selected) : '');

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [quickAdding, setQuickAdding] = useState(false);

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
        setActiveIndex(-1);
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
    if (actionInProgress.current) return;

    actionInProgress.current = true;
    setQuery(getLabel(item));
    onChange(item._id, item);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleInputChange = (event) => {
    const next = event.target.value;

    setQuery(next);
    onChange('', null);
    setOpen(true);
    setActiveIndex(-1);
    actionInProgress.current = false;
  };

  const handleQuickAdd = async (event) => {
    event?.preventDefault();

    if (actionInProgress.current) return;

    actionInProgress.current = true;
    setQuickAdding(true);

    const name = query.trim();

    try {
      const created = await onQuickAdd(name);

      setQuery(created?.value || created?.name || name);
      setOpen(false);
      setActiveIndex(-1);
    } finally {
      actionInProgress.current = false;
      setQuickAdding(false);
    }
  };

  const addDetailsAvailable = Boolean(onAddDetails && canAddDetails(query.trim()));
  const canCreate = query.trim() && !exact && (onQuickAdd || addDetailsAvailable);

  const navigableItems = useMemo(() => {
    const items = filtered.map((item) => ({ type: 'option', item }));

    if (canCreate && onQuickAdd) items.push({ type: 'quick-add' });
    if (canCreate && addDetailsAvailable) items.push({ type: 'add-details' });

    return items;
  }, [addDetailsAvailable, canCreate, filtered, onQuickAdd]);

  const navigationKey = navigableItems
    .map((entry) => (entry.type === 'option' ? `option:${entry.item._id}` : entry.type))
    .join('|');

  useEffect(() => {
    setActiveIndex(-1);
  }, [navigationKey]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;

    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  const openList = () => {
    actionInProgress.current = false;
    setOpen(true);
  };

  const closeList = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const runAddDetails = () => {
    if (actionInProgress.current) return;

    actionInProgress.current = true;
    onAddDetails(query.trim());
    closeList();
  };

  const activateItem = (index) => {
    const entry = navigableItems[index];

    if (!entry) return;

    if (entry.type === 'option') selectItem(entry.item);
    else if (entry.type === 'quick-add') handleQuickAdd();
    else if (entry.type === 'add-details') runAddDetails();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      if (!open) setOpen(true);

      if (!navigableItems.length) {
        setActiveIndex(-1);
        return;
      }

      setActiveIndex((current) => {
        if (current < 0) return event.key === 'ArrowDown' ? 0 : navigableItems.length - 1;

        const direction = event.key === 'ArrowDown' ? 1 : -1;
        return (current + direction + navigableItems.length) % navigableItems.length;
      });
      return;
    }

    if (event.key === 'Enter' && open) {
      event.preventDefault();
      event.stopPropagation();

      if (activeIndex >= 0) activateItem(activeIndex);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      closeList();
    }
  };

  return (
    <div ref={root} className="relative block min-w-0 text-sm font-medium text-slate-700">
      {!hideLabel && <label
        htmlFor={inputId}
        className="block min-h-[18px] text-xs font-semibold leading-[18px] text-slate-600"
      >
        {label}

        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>}

      <div className="relative mt-1">
        <FaSearch className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs text-slate-400" />

        <input
          ref={inputRef}
          id={inputId}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={openList}
          onClick={openList}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
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
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) closeList();
            else openList();

            inputRef.current?.focus();
          }}
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
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 top-full z-[200] mt-1 max-h-72 w-full min-w-[280px] overflow-y-auto rounded-lg border border-teal-100 bg-white shadow-2xl ring-1 ring-black/5"
          >
            {filtered.map((item, index) => {
              const isSelected = String(item._id) === String(value);
              const isActive = activeIndex === index;

              return (
                <button
                  type="button"
                  key={item._id}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  ref={(node) => { optionRefs.current[index] = node; }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    selectItem(item);
                  }}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm transition last:border-b-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-teal-100 to-emerald-50 font-semibold text-teal-900 ring-1 ring-inset ring-teal-300'
                      : isSelected
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
                    id={`${listboxId}-option-${filtered.length}`}
                    role="option"
                    aria-selected={activeIndex === filtered.length}
                    disabled={quickAdding}
                    ref={(node) => { optionRefs.current[filtered.length] = node; }}
                    onMouseEnter={() => setActiveIndex(filtered.length)}
                    onPointerDown={handleQuickAdd}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 ${activeIndex === filtered.length ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : ''}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                      <FaPlus className="text-xs" />
                    </span>

                    <span className="truncate">
                      {t('weaving.operations.quickAdd')} &quot;{query.trim()}&quot;
                    </span>
                  </button>
                )}

                {addDetailsAvailable && (
                  <button
                    type="button"
                    id={`${listboxId}-option-${filtered.length + (onQuickAdd ? 1 : 0)}`}
                    role="option"
                    aria-selected={activeIndex === filtered.length + (onQuickAdd ? 1 : 0)}
                    ref={(node) => { optionRefs.current[filtered.length + (onQuickAdd ? 1 : 0)] = node; }}
                    onMouseEnter={() => setActiveIndex(filtered.length + (onQuickAdd ? 1 : 0))}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      runAddDetails();
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-50 ${activeIndex === filtered.length + (onQuickAdd ? 1 : 0) ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                      <FaPlus className="text-xs" />
                    </span>

                    <span>
                      {typeof addDetailsLabel === 'function'
                        ? addDetailsLabel(query.trim())
                        : addDetailsLabel || t('weaving.operations.addWithDetails')}
                    </span>
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
