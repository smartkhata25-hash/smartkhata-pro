import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaArrowRight, FaChevronRight, FaExclamationTriangle, FaSpinner, FaTimes } from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import { getWeavingProfitDetails, getWeavingProfitReport } from '../../../services/weavingReportService';
import { useWeavingFeedback } from '../WeavingFeedbackModal';
import WeavingProfitDetailDrawer from './WeavingProfitDetailDrawer';

const EMPTY_FILTERS = { preset: 'this_month', from: '', to: '' };
const number = (value) => Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const money = (value, provisional = false) => value === null || value === undefined
  ? t('weaving.profitSummary.pending')
  : `${provisional ? '~ ' : ''}${t('currency.rs')} ${number(value)}`;

const SummaryRow = ({ label, value, provisional = false, tone, onClick, strong = false }) => {
  const content = <><span className={`min-w-0 text-sm ${strong ? 'font-black' : 'font-bold'} text-slate-700 sm:text-base`}>{label}</span><span className="flex items-center gap-2"><span className={`whitespace-nowrap text-right text-sm font-black sm:text-base ${tone}`}>{money(value, provisional)}</span>{onClick && <FaChevronRight className="text-xs text-slate-400" aria-hidden="true" />}</span></>;
  const classes = `flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 text-left last:border-b-0 ${strong ? 'bg-slate-50/80' : 'bg-white'}`;
  return onClick
    ? <button type="button" className={`${classes} transition hover:bg-teal-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-500`} onClick={onClick}>{content}</button>
    : <div className={classes}>{content}</div>;
};

const WeavingProfitSummaryModal = ({ onClose, onOpenFullReport }) => {
  const [scope, setScope] = useState('combined');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });

  const requestParams = useMemo(() => ({
    ...filters, scope,
    ...(scope === 'own' ? { saleType: 'fabric' } : {}),
    ...(scope === 'conversion' ? { saleType: 'conversion' } : {}),
    ...(filters.preset === 'custom' ? {} : { from: '', to: '' }),
  }), [filters, scope]);

  const loadReport = useCallback(async () => {
    setLoading(true); setError('');
    try { setReport(await getWeavingProfitReport(requestParams)); }
    catch (loadError) { setError(loadError?.response?.data?.message || t('weaving.operationalReports.loadFailed')); }
    finally { setLoading(false); }
  }, [requestParams]);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { setDrawer(null); setDetail(null); }, [requestParams]);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !drawer) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [drawer, onClose]);

  const loadDetail = useCallback(async (type, page = 1) => {
    setDetailLoading(true); setDetailError('');
    try { setDetail(await getWeavingProfitDetails({ ...requestParams, type, page, limit: 25 })); }
    catch (loadError) { setDetailError(loadError?.response?.data?.message || t('weaving.profitAnalysis.detailLoadFailed')); }
    finally { setDetailLoading(false); }
  }, [requestParams]);
  const openDetail = (type) => { setDrawer(type); setDetail(null); loadDetail(type); };
  const hasCostingRun = Boolean(report?.hasCostingRun ?? report?.calculatedAt);
  const exact = hasCostingRun && report?.costCoverage === 'complete';
  const provisional = hasCostingRun && !exact;
  const hasUsefulEstimate = exact || Number(report?.knownCostInvoiceCount || 0) > 0 || Number(report?.invoiceCount || 0) === 0;
  const scoped = scope !== 'combined';
  const directCost = !hasCostingRun || !hasUsefulEstimate ? null : exact ? report?.costs?.directStockCost : report?.costs?.knownDirectStockCost;
  const contribution = !hasCostingRun || !hasUsefulEstimate ? null : exact ? report?.contributionProfit : report?.provisionalGrossProfit;
  const netProfit = !hasCostingRun || !hasUsefulEstimate ? null : exact ? report?.netProfit : report?.provisionalNetProfit;
  const revenue = Number(report?.revenue?.netRevenue || 0);
  const contributionMargin = contribution === null || contribution === undefined ? null : revenue === 0 ? 0 : Number(contribution) * 100 / revenue;

  const combinedRows = [
    { key: 'totalSales', label: t('weaving.profitSummary.totalSales'), value: report?.revenue?.netRevenue, tone: 'text-teal-700', detail: 'revenue' },
    { key: 'directCost', label: t('weaving.profitSummary.directCost'), value: directCost, provisional, tone: 'text-rose-700', detail: 'cogs' },
    { key: 'grossProfit', label: t('weaving.profitSummary.grossProfit'), value: contribution, provisional, tone: Number(contribution || 0) < 0 ? 'text-rose-700' : 'text-blue-700', strong: true },
    { key: 'payroll', label: t('weaving.profitSummary.payroll'), value: report?.costs?.payrollCost, tone: 'text-indigo-700', detail: 'expenses' },
    { key: 'expenses', label: t('weaving.profitSummary.expenses'), value: report?.costs?.operatingExpenses, tone: 'text-orange-700', detail: 'expenses' },
    { key: 'netProfit', label: t('weaving.profitSummary.netProfit'), value: netProfit, provisional, tone: Number(netProfit || 0) < 0 ? 'text-rose-700' : 'text-emerald-700', strong: true },
  ];
  const scopedRows = [
    { key: 'totalSales', label: t('weaving.profitSummary.scopedRevenue'), value: report?.revenue?.netRevenue, tone: 'text-teal-700', detail: 'revenue' },
    { key: 'directCost', label: t('weaving.profitSummary.directCost'), value: directCost, provisional, tone: 'text-rose-700', detail: 'cogs' },
    { key: 'contribution', label: t('weaving.profitSummary.contributionProfit'), value: contribution, provisional, tone: Number(contribution || 0) < 0 ? 'text-rose-700' : 'text-blue-700', strong: true },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={t('weaving.profitSummary.title')}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={t('common.close')} onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-950">{t('weaving.profitSummary.title')}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{t('weaving.profitSummary.subtitle')}</p>
          </div>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-xs font-black text-white hover:bg-teal-800 sm:text-sm" onClick={onOpenFullReport}>
            {t('weaving.profitAnalysis.fullReport')} <FaArrowRight />
          </button>
          <button type="button" className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" title={t('common.close')} onClick={onClose}><FaTimes /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1">
            {['combined', 'own', 'conversion'].map((item) => <button key={item} type="button" onClick={() => setScope(item)} className={`min-h-9 rounded-md px-2 text-xs font-black transition sm:text-sm ${scope === item ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>{t(`weaving.profitAnalysis.scopes.${item}`)}</button>)}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="block text-xs font-black uppercase tracking-wide text-slate-600">{t('weaving.profitAnalysis.period')}<select value={filters.preset} onChange={(event) => setFilters((current) => ({ ...current, preset: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">{['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'custom'].map((preset) => <option key={preset} value={preset}>{t(`weaving.operationalReports.presets.${preset}`)}</option>)}</select></label>
            {filters.preset === 'custom' && <div className="mt-3 grid grid-cols-2 gap-3"><label className="block text-xs font-bold text-slate-600">{t('weaving.operationalReports.from')}<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" /></label><label className="block text-xs font-bold text-slate-600">{t('weaving.operationalReports.to')}<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" /></label></div>}
          </div>
          {!loading && report && !exact && <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950" role="status"><FaExclamationTriangle className="mt-0.5 flex-shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><div className="text-sm font-black">{t(hasCostingRun ? 'weaving.profitSummary.partialCostingTitle' : 'weaving.profitSummary.costingPendingTitle')}</div><div className="mt-0.5 text-xs font-semibold text-amber-800">{t(hasCostingRun ? 'weaving.profitSummary.partialCostingText' : 'weaving.profitSummary.costingPendingText')}</div></div></div>}
          {loading && <div className="flex h-48 flex-col items-center justify-center gap-3"><FaSpinner className="animate-spin text-3xl text-teal-600" /><div className="text-sm font-black text-slate-600">{t('weaving.profitSummary.calculating')}</div></div>}
          {!loading && report && <><div className="overflow-hidden rounded-lg border border-slate-200">{(scoped ? scopedRows : combinedRows).map((row) => <SummaryRow key={row.key} {...row} onClick={row.detail ? () => openDetail(row.detail) : undefined} />)}{scoped && <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3"><span className="text-sm font-bold text-slate-600">{t('weaving.profitSummary.contributionMargin')}</span><span className="font-black text-slate-900">{contributionMargin === null ? t('weaving.profitSummary.pending') : `${provisional ? '~ ' : ''}${number(contributionMargin)}%`}</span></div>}</div>{provisional && <div className="text-right text-xs font-black uppercase tracking-wide text-amber-700">{t('weaving.profitSummary.provisional')}</div>}{scoped && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold leading-5 text-slate-600">{t('weaving.profitSummary.sharedCostsNote')}</div>}</>}
        </div>
      </div>
      {drawer && <WeavingProfitDetailDrawer type={drawer} data={detail} loading={detailLoading} error={detailError} onClose={() => setDrawer(null)} onPageChange={(page) => loadDetail(drawer, page)} />}
    </div>
  );
};

export default WeavingProfitSummaryModal;
