import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimesCircle } from 'react-icons/fa';

import { getCurrentLanguage, t } from '../../i18n/i18n';

const EVENT_NAME = 'smart-khata:weaving-feedback';

const defaults = {
  error: { icon: FaTimesCircle, title: 'weaving.feedback.errorTitle', bar: 'bg-rose-500', iconTone: 'bg-rose-100 text-rose-700', button: 'bg-rose-700 hover:bg-rose-800' },
  warning: { icon: FaExclamationTriangle, title: 'weaving.feedback.warningTitle', bar: 'bg-amber-500', iconTone: 'bg-amber-100 text-amber-700', button: 'bg-amber-600 hover:bg-amber-700' },
  info: { icon: FaInfoCircle, title: 'weaving.feedback.infoTitle', bar: 'bg-blue-500', iconTone: 'bg-blue-100 text-blue-700', button: 'bg-blue-700 hover:bg-blue-800' },
  success: { icon: FaCheckCircle, title: 'weaving.feedback.successTitle', bar: 'bg-emerald-500', iconTone: 'bg-emerald-100 text-emerald-700', button: 'bg-emerald-700 hover:bg-emerald-800' },
};

const rawMessage = (value) => value?.response?.data?.message || value?.message || value?.text || value || '';

export const getWeavingUserMessage = (value, fallback = '') => {
  const message = String(rawMessage(value) || fallback || t('weaving.feedback.genericError')).trim();
  if (/duplicate|matching record already exists|E11000/i.test(message)) return t('weaving.feedback.duplicate');
  if (/Cast to ObjectId|BSON|MongoServerError|Mongoose|ValidationError|stack|internal server|HTTP 500/i.test(message)) return t('weaving.feedback.genericError');
  if (/Network Error|ECONN|Failed to fetch|timeout/i.test(message)) return t('weaving.feedback.networkError');
  return message;
};

const dispatch = (detail) => {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
};

export const showWeavingFeedback = ({ type = 'info', title = '', message = '' } = {}) =>
  dispatch({ mode: 'message', type, title, message: getWeavingUserMessage(message) });
export const showWeavingError = (error, fallback = '') =>
  showWeavingFeedback({ type: 'error', message: getWeavingUserMessage(error, fallback) });
export const showWeavingWarning = (message, title = '') =>
  showWeavingFeedback({ type: 'warning', title, message });
export const showWeavingInfo = (message, title = '') =>
  showWeavingFeedback({ type: 'info', title, message });
export const showWeavingSuccess = (message, title = '') =>
  showWeavingFeedback({ type: 'success', title, message });

export const requestWeavingConfirmation = (options = {}) => new Promise((resolve) => {
  dispatch({ mode: 'confirm', type: options.type || 'warning', title: options.title || '', message: getWeavingUserMessage(options.message), confirmLabel: options.confirmLabel || '', cancelLabel: options.cancelLabel || '', inputLabel: options.inputLabel || '', inputPlaceholder: options.inputPlaceholder || '', inputRequired: options.inputRequired === true, resolve });
});

export const useWeavingFeedback = (value, clearValue, options = {}) => {
  const lastValue = useRef(null);
  useEffect(() => {
    if (!value) {
      lastValue.current = null;
      return;
    }
    if (value === lastValue.current) return;
    lastValue.current = value;
    const isObject = typeof value === 'object';
    const isError = options.type === 'error' || (isObject && (value.error === true || value.type === 'error'));
    if (isError || options.showNonErrors === true) {
      showWeavingFeedback({ type: isError ? 'error' : options.type || 'info', message: isObject ? value.text || value.message : value });
    }
    if (clearValue) window.setTimeout(() => clearValue(options.emptyValue ?? (isObject ? null : '')), 0);
  }, [value, clearValue, options.emptyValue, options.showNonErrors, options.type]);
};

export default function WeavingFeedbackModal() {
  const [dialog, setDialog] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const close = useCallback((result = false) => {
    if (dialog?.resolve) dialog.resolve(result);
    setDialog(null); setInputValue('');
  }, [dialog]);

  useEffect(() => {
    const open = (event) => { setInputValue(''); setDialog(event.detail); };
    window.addEventListener(EVENT_NAME, open);
    return () => window.removeEventListener(EVENT_NAME, open);
  }, []);
  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  if (!dialog) return null;
  const type = defaults[dialog.type] ? dialog.type : 'info';
  const config = defaults[type];
  const Icon = config.icon;
  const rtl = getCurrentLanguage() === 'ur';
  const canConfirm = !dialog.inputRequired || inputValue.trim();
  const accept = () => close(dialog.inputLabel ? inputValue.trim() : true);

  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}><section dir={rtl ? 'rtl' : 'ltr'} role="alertdialog" aria-modal="true" aria-labelledby="weaving-feedback-title" className="w-full max-w-md overflow-hidden rounded-md bg-white shadow-2xl"><div className={`h-1.5 ${config.bar}`} /><div className="p-5 sm:p-6"><div className="flex items-start gap-4"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${config.iconTone}`}><Icon className="text-2xl" /></div><div className="min-w-0 flex-1"><h2 id="weaving-feedback-title" className="text-lg font-bold text-slate-950">{dialog.title || t(config.title)}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{dialog.message}</p></div></div>{dialog.inputLabel && <label className="mt-5 block text-sm font-semibold text-slate-700">{dialog.inputLabel}<textarea autoFocus rows="3" value={inputValue} placeholder={dialog.inputPlaceholder} onChange={(event) => setInputValue(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>}<div className={`mt-6 flex gap-2 ${rtl ? 'justify-start' : 'justify-end'}`}>{dialog.mode === 'confirm' && <button type="button" onClick={() => close(false)} className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">{dialog.cancelLabel || t('weaving.feedback.cancel')}</button>}<button type="button" autoFocus={!dialog.inputLabel} disabled={!canConfirm} onClick={accept} className={`h-10 rounded-md px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${config.button}`}>{dialog.mode === 'confirm' ? dialog.confirmLabel || t('weaving.feedback.confirm') : t('weaving.feedback.ok')}</button></div></div></section></div>;
}
