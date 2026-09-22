import React, { useEffect } from 'react';
import { FaChevronLeft, FaChevronRight, FaSpinner, FaTimes } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import { useWeavingFeedback } from '../WeavingFeedbackModal';

const number = (value) =>
  value === null || value === undefined
    ? '\u2014'
    : Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });

const money = (value) =>
  value === null || value === undefined ? '\u2014' : `${t('currency.rs')} ${number(value)}`;

const ProfitabilityTable = ({ rows, type }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="bg-slate-900 text-left text-[11px] font-black uppercase text-white">
        <tr>
          <th className="px-3 py-3">{t(`weaving.profitAnalysis.${type}`)}</th>
          <th className="px-3 py-3 text-right">{t('weaving.profitAnalysis.revenue')}</th>
          <th className="px-3 py-3 text-right">{t('weaving.profitAnalysis.directCost')}</th>
          <th className="px-3 py-3 text-right">{t('weaving.profitAnalysis.contribution')}</th>
          <th className="px-3 py-3 text-right">{t('weaving.profitAnalysis.margin')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={row.key} className="hover:bg-teal-50/50">
            <td className="px-3 py-3">
              <div className="font-bold text-slate-900">
                {type === 'quality' ? row.quality || '\u2014' : row.party || '\u2014'}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {type === 'quality'
                  ? [row.qualityCode, row.count, row.width].filter(Boolean).join(' | ')
                  : (row.businessTypes || []).map((item) => t(`weaving.profitAnalysis.saleTypes.${item}`)).join(', ')}
              </div>
            </td>
            <td className="px-3 py-3 text-right font-bold">{money(row.revenue)}</td>
            <td className="px-3 py-3 text-right">{money(row.directCost)}</td>
            <td className="px-3 py-3 text-right font-black text-emerald-700">{money(row.profit)}</td>
            <td className="px-3 py-3 text-right font-bold">{row.margin === null ? '\u2014' : `${number(row.margin)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const InvoiceTable = ({ rows }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="bg-slate-900 text-left text-[11px] font-black uppercase text-white">
        <tr>
          {['invoice', 'date', 'party', 'item', 'revenue', 'directCost', 'contribution', 'margin'].map((key) => (
            <th key={key} className={`px-3 py-3 ${['revenue', 'directCost', 'contribution', 'margin'].includes(key) ? 'text-right' : ''}`}>
              {t(`weaving.profitAnalysis.${key}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={row.invoiceId} className="hover:bg-indigo-50/50">
            <td className="whitespace-nowrap px-3 py-3 font-black text-indigo-700">{row.invoiceNo}</td>
            <td className="whitespace-nowrap px-3 py-3">{row.date}</td>
            <td className="px-3 py-3 font-bold">{row.party}</td>
            <td className="px-3 py-3">{row.item}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right font-bold">{money(row.revenue)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{money(row.directCost)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right font-black text-emerald-700">{money(row.profit)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{row.margin === null ? '\u2014' : `${number(row.margin)}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SimpleRows = ({ data, type }) => (
  <div className="divide-y divide-slate-100">
    {(data.rows || []).map((row, index) => {
      const label = row.key
        ? t(`weaving.profitAnalysis.breakdown.${row.key}`)
        : row.kind === 'payroll'
          ? t('weaving.profitAnalysis.payrollLabour')
          : row.title || row.description || '\u2014';

      return (
        <div key={`${row.key || row.kind || 'row'}-${index}`} className={`flex items-start justify-between gap-4 px-4 py-3 ${row.level === 1 ? 'bg-slate-50 pl-9' : ''}`}>
          <div className="min-w-0">
            <div className={`${row.level === 0 || row.key === 'total' ? 'font-black' : 'font-semibold'} text-slate-800`}>{label}</div>
            {type === 'expenses' && row.date && <div className="mt-0.5 text-xs text-slate-500">{row.date}</div>}
          </div>
          <div className={`whitespace-nowrap ${row.key === 'total' || row.key === 'net' ? 'font-black text-emerald-700' : 'font-bold text-slate-900'}`}>
            {money(row.amount)}
          </div>
        </div>
      );
    })}
  </div>
);

const WeavingProfitDetailDrawer = ({ type, data, loading, error, onClose, onPageChange }) => {
  useWeavingFeedback(error, null, { type: 'error' });
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);

  const rows = data?.rows || [];
  const pagination = data?.pagination;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label={t(`weaving.profitAnalysis.details.${type}`)}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={t('common.close')} onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900 px-4 py-4 text-white sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-black">{t(`weaving.profitAnalysis.details.${type}`)}</h2>
            {data?.range && <p className="mt-0.5 text-xs font-semibold text-slate-300">{data.range.from || '\u2014'} - {data.range.to || '\u2014'}</p>}
          </div>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-200 hover:bg-white/10 hover:text-white" title={t('common.close')} onClick={onClose}>
            <FaTimes />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && <div className="flex h-56 items-center justify-center"><FaSpinner className="animate-spin text-3xl text-teal-600" /></div>}
          {!loading && !error && !rows.length && <div className="p-12 text-center font-semibold text-slate-400">{t('weaving.operationalReports.noData')}</div>}
          {!loading && !error && rows.length > 0 && ['quality', 'party', 'conversion'].includes(type) && <ProfitabilityTable rows={rows} type={type === 'conversion' ? 'party' : type} />}
          {!loading && !error && rows.length > 0 && type === 'invoices' && <InvoiceTable rows={rows} />}
          {!loading && !error && rows.length > 0 && ['revenue', 'cogs', 'expenses'].includes(type) && <SimpleRows data={data} type={type} />}
        </div>

        {pagination && pagination.pages > 1 && (
          <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button type="button" disabled={pagination.page <= 1} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 font-bold text-slate-700 disabled:opacity-40" onClick={() => onPageChange(pagination.page - 1)}>
              <FaChevronLeft /> {t('common.previous')}
            </button>
            <span className="text-sm font-bold text-slate-600">{pagination.page} / {pagination.pages}</span>
            <button type="button" disabled={pagination.page >= pagination.pages} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 font-bold text-slate-700 disabled:opacity-40" onClick={() => onPageChange(pagination.page + 1)}>
              {t('common.next')} <FaChevronRight />
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
};

export default WeavingProfitDetailDrawer;
