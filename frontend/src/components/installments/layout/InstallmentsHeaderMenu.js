import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaChevronDown } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';

const pathOnly = (value = '') => String(value).split('?')[0];

const InstallmentsHeaderMenu = ({ menu }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const hasSections = Array.isArray(menu.sections) && menu.sections.length > 0;
  const items = hasSections ? menu.sections.flatMap((section) => section.items || []) : [];
  const activePaths = Array.isArray(menu.activePaths) && menu.activePaths.length ? menu.activePaths : items.map((item) => item.path);
  const active = menu.path
    ? location.pathname === pathOnly(menu.path)
    : activePaths.some((itemPath) => location.pathname === pathOnly(itemPath) || location.pathname.startsWith(`${pathOnly(itemPath)}/`));

  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const closeOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === 'Escape' && open) { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('touchstart', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('touchstart', closeOutside);
      document.removeEventListener('keydown', closeEscape);
      window.clearTimeout(closeTimer.current);
    };
  }, [open]);

  const show = (focusFirst = false) => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
    if (focusFirst) window.setTimeout(() => itemRefs.current[0]?.focus(), 0);
  };
  const hideSoon = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 180); };
  const go = (path) => { setOpen(false); navigate(path); };
  const handleMenuKey = (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const available = itemRefs.current.filter(Boolean);
    if (!available.length) return;
    const current = available.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown'
      ? (current + 1) % available.length
      : (current <= 0 ? available.length - 1 : current - 1);
    available[next].focus();
  };

  if (!hasSections) return <button type="button" onClick={() => go(menu.path)} aria-current={active ? 'page' : undefined} className={`rounded-lg px-2.5 py-2 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-300 ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}`}>{t(menu.label)}</button>;

  return <div ref={rootRef} className="relative" onMouseEnter={() => show()} onMouseLeave={hideSoon}>
    <button ref={buttonRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} onKeyDown={(event) => { if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(true); } }} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-300 ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'}`}>
      {t(menu.label)}<FaChevronDown aria-hidden="true" className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div role="menu" aria-label={t(menu.label)} onKeyDown={handleMenuKey} className={`absolute top-[calc(100%+4px)] z-[70] max-h-[min(70vh,28rem)] w-max min-w-[240px] max-w-[min(340px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl ${menu.align === 'end' ? 'end-0' : 'start-0'}`}>
      {menu.sections.map((section, sectionIndex) => <div key={section.title || sectionIndex} className={sectionIndex ? 'mt-2 border-t border-slate-100 pt-2' : ''}>
        <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{t(section.title)}</p>
        {(section.items || []).map((item) => <button ref={(node) => { itemRefs.current[items.indexOf(item)] = node; }} key={item.path} type="button" role="menuitem" onClick={() => go(item.path)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-start text-sm font-semibold text-slate-700 outline-none transition hover:bg-indigo-50 hover:text-indigo-700 focus:bg-indigo-50 focus:text-indigo-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300">{t(item.label)}</button>)}
      </div>)}
    </div>}
  </div>;
};

export default InstallmentsHeaderMenu;
