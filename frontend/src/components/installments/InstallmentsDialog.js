import React, { useEffect, useId, useRef } from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from 'react-icons/fa';

import { t } from '../../i18n/i18n';

const tones = {
  error: { icon: FaTimesCircle, iconClass: 'bg-rose-100 text-rose-700', button: 'bg-rose-600 hover:bg-rose-700' },
  warning: { icon: FaExclamationTriangle, iconClass: 'bg-amber-100 text-amber-700', button: 'bg-amber-600 hover:bg-amber-700' },
  success: { icon: FaCheckCircle, iconClass: 'bg-emerald-100 text-emerald-700', button: 'bg-emerald-600 hover:bg-emerald-700' },
};

const InstallmentsDialog = ({
  open,
  type = 'error',
  title,
  message,
  details = [],
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  busy = false,
  inputLabel = '',
  inputValue = '',
  onInputChange,
  inputRequired = false,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const primaryRef = useRef(null);
  const inputRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const tone = tones[type] || tones.error;
  const Icon = tone.icon;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const timer = window.setTimeout(() => (inputLabel ? inputRef.current : primaryRef.current)?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onCloseRef.current?.(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(panelRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [busy, inputLabel, open]);

  if (!open) return null;
  const hasCancel = Boolean(cancelLabel);
  const submit = (event) => {
    event.preventDefault();
    if (!busy && (!inputRequired || String(inputValue || '').trim())) onConfirm?.();
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose?.(); }}>
    <form ref={panelRef} onSubmit={submit} role={type === 'error' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 flex-none place-items-center rounded-full text-xl ${tone.iconClass}`} aria-hidden="true"><Icon /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-black text-slate-900">{title || t(`installments.dialog.${type}Title`)}</h2>
            {message && <p id={descriptionId} className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{message}</p>}
          </div>
        </div>
        {details.length > 0 && <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3">{details.map((detail) => <div key={detail.label} className="flex items-center justify-between gap-4 text-sm"><dt className="font-semibold text-slate-500">{detail.label}</dt><dd className={`font-black ${detail.tone || 'text-slate-900'}`}>{detail.value}</dd></div>)}</dl>}
        {inputLabel && <label className="mt-4 block text-xs font-bold text-slate-600">{inputLabel}<textarea ref={inputRef} rows="3" value={inputValue} onChange={(event) => onInputChange?.(event.target.value)} className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></label>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
        {hasCancel && <button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-60">{cancelLabel}</button>}
        <button ref={primaryRef} type="submit" disabled={busy || (inputRequired && !String(inputValue || '').trim())} className={`min-h-10 rounded-xl px-5 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${tone.button}`}>{busy ? t('common.saving') : (confirmLabel || t('installments.dialog.ok'))}</button>
      </div>
    </form>
  </div>;
};

export default InstallmentsDialog;
