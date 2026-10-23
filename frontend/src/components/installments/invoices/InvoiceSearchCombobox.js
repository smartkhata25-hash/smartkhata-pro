import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const InvoiceSearchCombobox = ({
  label, placeholder, options, value, disabled, onChange, onQuickAdd, onAddDetails,
  getLabel = (row) => row.label || row.name, getSearchText = (row) => getLabel(row),
  getOptionPrimary = (row) => getLabel(row), getOptionSecondary = () => '',
  quickAddLabel = 'Quick add', addDetailsLabel = 'Add with details', noMatchesLabel = 'No matches', fallbackLabel = '',
}) => {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const selected = options.find((row) => String(row._id) === String(value));
  const displayLabel = selected ? getLabel(selected) : (fallbackLabel || (String(value || '').startsWith('legacy:') ? String(value).slice(7) : ''));
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (needle ? options.filter((row) => getSearchText(row).toLocaleLowerCase().includes(needle)) : options).slice(0, 30);
  }, [getSearchText, options, query]);

  useEffect(() => {
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setActive(-1), [query]);

  const choose = (row) => { onChange(row); setQuery(''); setOpen(false); };
  const act = (callback) => { const name = query.trim(); if (!name) return; callback(name); setOpen(false); };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      setActive((current) => Math.max(0, Math.min(filtered.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && open && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); inputRef.current?.blur(); }
  };

  return <label className="invoice-field" ref={rootRef}>
    <span>{label}</span>
    <div className="invoice-combobox">
      <input ref={inputRef} role="combobox" aria-controls={listboxId} aria-expanded={open} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        value={open ? query : displayLabel} placeholder={placeholder}
        onFocus={() => { setQuery(''); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 0)} onClick={() => setOpen(true)} onKeyDown={onKeyDown}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onChange(null); }} className="input" />
      {open && !disabled && <div id={listboxId} role="listbox" className="invoice-options">
        {filtered.map((row, index) => { const secondary = getOptionSecondary(row); return <button type="button" role="option" aria-selected={index === active} key={row._id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(row)} className={`invoice-option-row ${index === active ? 'active' : ''}`}><span className="invoice-option-name">{getOptionPrimary(row)}</span>{secondary && <span className="invoice-option-secondary">{secondary}</span>}</button>; })}
        {!filtered.length && <div className="invoice-no-match">{noMatchesLabel}</div>}
        {query.trim() && (onQuickAdd || onAddDetails) && <div className="invoice-create-actions">
          {onQuickAdd && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => act(onQuickAdd)}>{quickAddLabel}: “{query.trim()}”</button>}
          {onAddDetails && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => act(onAddDetails)}>{addDetailsLabel}</button>}
        </div>}
      </div>}
    </div>
  </label>;
};

export default InvoiceSearchCombobox;
