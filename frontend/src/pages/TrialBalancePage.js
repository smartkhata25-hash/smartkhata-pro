import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoneyDisplay } from '../utils/money';
import { useNavigate, useSearchParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FaBalanceScale, FaChartBar, FaFilePdf, FaPrint, FaSearch, FaSyncAlt } from 'react-icons/fa';

import { t } from '../i18n/i18n';
import { getTrialBalance } from '../services/journalService';
import {
  getTrialBalanceChartPath,
  getTrialBalanceLedgerPath,
  getTrialBalancePdfMeta,
  normalizeTrialBalanceScope,
} from './trialBalanceUtils';

const PRESENTATION = Object.freeze({
  trading: { label: 'Trading', page: 'from-slate-100 via-white to-blue-50', header: 'from-slate-950 via-slate-900 to-blue-900', button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-200', link: 'text-blue-700 hover:text-blue-900' },
  travel: { label: 'Travel', page: 'from-cyan-50 via-white to-blue-50', header: 'from-cyan-700 via-sky-700 to-blue-800', button: 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-200', link: 'text-cyan-700 hover:text-cyan-900' },
  weaving: { label: 'Weaving', page: 'from-teal-50 via-white to-indigo-50', header: 'from-teal-800 via-emerald-800 to-indigo-900', button: 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-200', link: 'text-teal-700 hover:text-teal-900' },
});

const formatAmount = formatMoneyDisplay;

const SummaryCard = ({ label, value, tone }) => {
  const className = tone === 'debit'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'credit'
      ? 'border-blue-200 bg-blue-50 text-blue-800'
      : Number(value) === 0
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-rose-200 bg-rose-50 text-rose-800';
  return <div className={`rounded-xl border px-3 py-2 shadow-sm ${className}`}><p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 text-lg font-black tabular-nums">{formatAmount(value)}</p></div>;
};

const TrialBalancePage = ({ moduleScope = 'trading' }) => {
  const scope = normalizeTrialBalanceScope(moduleScope);
  const theme = PRESENTATION[scope];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trialData, setTrialData] = useState([]);
  const [isBalanced, setIsBalanced] = useState(true);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') || '');
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dateError = startDate && endDate && startDate > endDate ? 'From date cannot be after To date.' : '';

  const fetchData = useCallback(async () => {
    if (dateError) return;
    try {
      setLoading(true);
      setError('');
      const data = await getTrialBalance(startDate, endDate, { moduleScope: scope });
      setTrialData(Array.isArray(data?.trialBalance) ? data.trialBalance : []);
      setIsBalanced(Boolean(data?.isBalanced));
      setTotals({ debit: Number(data?.totalDebit || 0), credit: Number(data?.totalCredit || 0) });
    } catch (requestError) {
      console.error('Trial balance load failed:', requestError);
      setError(requestError?.response?.data?.message || 'Unable to load the Trial Balance.');
    } finally {
      setLoading(false);
    }
  }, [dateError, endDate, scope, startDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return query ? trialData.filter((row) => String(row.accountName || '').toLowerCase().includes(query)) : trialData;
  }, [searchTerm, trialData]);
  const difference = totals.debit - totals.credit;
  const pdfMeta = getTrialBalancePdfMeta(scope, startDate, endDate);

  const openChart = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const query = params.toString();
    navigate(`${getTrialBalanceChartPath(scope)}${query ? `?${query}` : ''}`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const status = isBalanced ? t('reports.trialBalanced') : t('reports.trialNotBalanced');
    doc.setFontSize(16); doc.text(pdfMeta.title, 14, 16);
    doc.setFontSize(10); doc.text(`Period: ${pdfMeta.dateRange}`, 14, 23); doc.text(`Status: ${status}`, 14, 29);
    autoTable(doc, {
      head: [[t('account.name'), t('reports.debit'), t('reports.credit')]],
      body: [...filteredData.map((row) => [row.accountName, formatAmount(row.debit), formatAmount(row.credit)]), [t('totals'), formatAmount(totals.debit), formatAmount(totals.credit)], [t('reports.difference'), formatAmount(Math.abs(difference)), '']],
      startY: 35,
      styles: { fontSize: 9 },
      headStyles: { fillColor: scope === 'travel' ? [8, 145, 178] : scope === 'weaving' ? [13, 148, 136] : [30, 64, 175] },
    });
    doc.save(pdfMeta.filename);
  };

  return (
    <main id="trial-balance-report" className={`h-full min-h-0 overflow-hidden bg-gradient-to-br ${theme.page} p-2 sm:p-3 lg:p-4`}>
      <style>{`@media print { body * { visibility: hidden !important; } #trial-balance-report, #trial-balance-report * { visibility: visible !important; } #trial-balance-report { position: absolute; inset: 0; height: auto !important; overflow: visible !important; padding: 0 !important; background: white !important; } #trial-balance-report .trial-balance-shell { display: block !important; height: auto !important; } #trial-balance-report .trial-balance-content, #trial-balance-report .trial-balance-table-panel { display: block !important; height: auto !important; overflow: visible !important; } #trial-balance-report .trial-balance-table-scroll { overflow: visible !important; } #trial-balance-report .no-print { display: none !important; } #trial-balance-report .print-card { box-shadow: none !important; border-color: #cbd5e1 !important; } }`}</style>
      <div className="trial-balance-shell mx-auto flex h-full min-h-0 max-w-[1500px] flex-col gap-3">
        <header className={`print-card flex shrink-0 items-center justify-between gap-3 overflow-hidden rounded-xl bg-gradient-to-r ${theme.header} px-3 py-2.5 text-white shadow-md sm:px-4`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/15 text-base ring-1 ring-white/20"><FaBalanceScale /></span>
            <h1 className="truncate text-xl font-black sm:text-2xl">{t('reports.trialBalance')}</h1>
          </div>
          <div className="no-print flex min-w-0 items-center gap-2">
            <button type="button" onClick={openChart} title="View Chart" aria-label="View Trial Balance Chart" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/15 text-base ring-1 ring-white/25 transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/70"><FaChartBar /></button>
            <div className="min-w-0 rounded-lg bg-white/10 px-3 py-2 text-right text-xs font-extrabold leading-tight ring-1 ring-white/20 sm:text-sm"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${isBalanced ? 'bg-emerald-300' : 'bg-rose-300'}`} />{isBalanced ? t('reports.trialBalanced') : t('reports.trialNotBalanced')}</div>
          </div>
        </header>

        <section className="no-print print-card shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1.4fr_auto_auto_auto] xl:items-end">
            <label className="space-y-1 text-xs font-extrabold uppercase text-slate-500">{t('common.from')}<input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className="block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="space-y-1 text-xs font-extrabold uppercase text-slate-500">{t('common.to')}<input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="col-span-2 space-y-1 text-xs font-extrabold uppercase text-slate-500 md:col-span-1">{t('account.search')}<span className="relative block"><FaSearch className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('account.search')} className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></span></label>
            <button type="button" onClick={fetchData} disabled={loading || Boolean(dateError)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-extrabold text-white shadow-sm focus:ring-4 disabled:opacity-60 ${theme.button}`}><FaSyncAlt className={loading ? 'animate-spin' : ''} />{t('common.refresh')}</button>
            <button type="button" onClick={exportToPDF} disabled={loading || Boolean(error)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-60"><FaFilePdf />PDF</button>
            <button type="button" onClick={() => window.print()} disabled={loading || Boolean(error)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"><FaPrint />{t('common.print')}</button>
          </div>
          {dateError && <p className="mt-2 text-sm font-bold text-rose-600" role="alert">{dateError}</p>}
        </section>

        <section className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3"><SummaryCard label={t('reports.totalDebit')} value={totals.debit} tone="debit" /><SummaryCard label={t('reports.totalCredit')} value={totals.credit} tone="credit" /><SummaryCard label={t('reports.difference')} value={Math.abs(difference)} tone="difference" /></section>

        <div className="trial-balance-content min-h-0 flex-1">
        <section className="trial-balance-table-panel print-card flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" aria-label="Loading Trial Balance">{[1, 2, 3, 4].map((row) => <div key={row} className="h-11 animate-pulse rounded-lg bg-slate-100" />)}</div>
            : error ? <div className="p-10 text-center" role="alert"><p className="font-bold text-rose-700">{error}</p><button type="button" onClick={fetchData} className={`mt-4 rounded-lg px-4 py-2 text-sm font-extrabold text-white ${theme.button}`}>Retry</button></div>
              : trialData.length === 0 ? <div className="p-12 text-center"><FaBalanceScale className="mx-auto text-4xl text-slate-300" /><p className="mt-3 font-bold text-slate-600">No Trial Balance activity found for this period.</p></div>
                : filteredData.length === 0 ? <div className="p-12 text-center font-bold text-slate-600">No accounts match your search.</div>
                  : <div className="trial-balance-table-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto"><table className="w-full min-w-[680px] border-collapse text-sm"><colgroup><col className="w-3/5" /><col className="w-1/5" /><col className="w-1/5" /></colgroup><thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-600 shadow-sm"><tr><th className="border-b bg-slate-100 px-5 py-3 text-left">{t('account.name')}</th><th className="border-b bg-slate-100 px-5 py-3 text-right">{t('reports.debit')}</th><th className="border-b bg-slate-100 px-5 py-3 text-right">{t('reports.credit')}</th></tr></thead><tbody>{filteredData.map((row) => <tr key={row.accountId} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 hover:bg-slate-100/70"><td className="px-5 py-3.5 font-extrabold"><button type="button" onClick={() => navigate(getTrialBalanceLedgerPath(scope, row.accountId))} className={`text-left underline-offset-2 hover:underline ${theme.link}`}>{row.accountName}</button></td><td className="px-5 py-3.5 text-right font-bold tabular-nums text-emerald-700">{formatAmount(row.debit)}</td><td className="px-5 py-3.5 text-right font-bold tabular-nums text-blue-700">{formatAmount(row.credit)}</td></tr>)}</tbody><tfoot className="bg-slate-900 font-black text-white"><tr><td className="px-5 py-4">{t('totals')}</td><td className="px-5 py-4 text-right tabular-nums">{formatAmount(totals.debit)}</td><td className="px-5 py-4 text-right tabular-nums">{formatAmount(totals.credit)}</td></tr></tfoot></table></div>}
        </section>
        </div>
      </div>
    </main>
  );
};

export default TrialBalancePage;
