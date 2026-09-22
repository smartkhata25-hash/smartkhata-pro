import React, { useEffect } from 'react';
import { FaArrowRight, FaChartLine, FaTimes } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import WeavingProfitAnalysis from './WeavingProfitAnalysis';

const WeavingProfitSummaryModal = ({ onClose, onOpenFullReport }) => {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={t('weaving.profitAnalysis.title')}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={t('common.close')} onClick={onClose} />
      <div className="relative flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-lg bg-slate-50 shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900 px-4 py-4 text-white sm:px-5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-emerald-300 ring-1 ring-white/15"><FaChartLine /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black sm:text-xl">{t('weaving.profitAnalysis.title')}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-300 sm:text-sm">{t('weaving.profitAnalysis.subtitle')}</p>
          </div>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-black text-slate-950 hover:bg-emerald-400" onClick={onOpenFullReport}>
            {t('weaving.profitAnalysis.fullReport')} <FaArrowRight />
          </button>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-200 hover:bg-white/10 hover:text-white" title={t('common.close')} onClick={onClose}><FaTimes /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <WeavingProfitAnalysis hideTitle mode="modal" />
        </div>
      </div>
    </div>
  );
};

export default WeavingProfitSummaryModal;
