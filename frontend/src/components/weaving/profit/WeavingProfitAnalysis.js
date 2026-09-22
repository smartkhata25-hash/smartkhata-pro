import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBoxes,
  FaChartBar,
  FaCoins,
  FaDownload,
  FaFileInvoice,
  FaFilter,
  FaIndustry,
  FaPrint,
  FaSpinner,
  FaSyncAlt,
  FaUsers,
} from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import {
  getWeavingProfitDetails,
  getWeavingProfitReport,
  getWeavingReportMeta,
  rebuildWeavingCosting,
  weavingOperationalReportUrl,
} from '../../../services/weavingReportService';
import SearchableCreatableSelect from '../SearchableCreatableSelect';
import WeavingProfitDetailDrawer from './WeavingProfitDetailDrawer';
import { useWeavingFeedback } from '../WeavingFeedbackModal';

const EMPTY_FILTERS = {
  preset: 'this_month',
  from: '',
  to: '',
  partyId: '',
  fabricQualityId: '',
};

const number = (value) =>
  value === null || value === undefined
    ? '\u2014'
    : Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });

const money = (value) =>
  value === null || value === undefined ? '\u2014' : `${t('currency.rs')} ${number(value)}`;

const ProfitMetric = ({ label, value, format = 'money', provisional = false, tone = 'slate', onClick }) => {
  const styles = {
    slate: 'from-slate-950 to-slate-800 text-white',
    teal: 'from-teal-700 to-emerald-600 text-white',
    emerald: 'from-emerald-700 to-green-600 text-white',
    indigo: 'from-indigo-700 to-blue-600 text-white',
    amber: 'from-amber-500 to-orange-500 text-slate-950',
    rose: 'from-rose-700 to-red-600 text-white',
  };
  const displayValue = format === 'money'
    ? money(value)
    : value === null || value === undefined
      ? '\u2014'
      : `${number(value)}${format === 'percent' ? '%' : ''}`;

  return (
    <button type="button" onClick={onClick} className={`min-h-[112px] min-w-0 overflow-hidden rounded-md bg-gradient-to-br p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${styles[tone]}`}>
      <div className="text-[11px] font-black uppercase opacity-75">{label}</div>
      <div className="mt-2 truncate text-xl font-black sm:text-2xl">
        {provisional && value !== null && value !== undefined ? '~ ' : ''}{displayValue}
      </div>
      {provisional && <div className="mt-1 text-xs font-bold opacity-75">{t('weaving.profitAnalysis.knownCostEstimate')}</div>}
    </button>
  );
};

const BreakdownButton = ({ label, value, format = 'money', icon: Icon, tone, onClick }) => (
  <button type="button" onClick={onClick} className="flex min-h-[66px] min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50">
    <span className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${tone}`}><Icon /></span>
    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{label}</span>
    <span className="whitespace-nowrap text-sm font-black text-slate-950">{format === 'money' ? money(value) : number(value)}</span>
  </button>
);

const WeavingProfitAnalysis = ({ hideTitle = false, mode = 'page' }) => {
  const [scope, setScope] = useState('combined');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [meta, setMeta] = useState({ parties: [], qualities: [] });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });
  const [drawer, setDrawer] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    getWeavingReportMeta().then(setMeta).catch(() => {});
  }, []);

  const requestParams = useMemo(() => ({
    ...filters,
    scope,
    ...(scope === 'own' ? { saleType: 'fabric' } : {}),
    ...(scope === 'conversion' ? { saleType: 'conversion' } : {}),
    ...(filters.preset === 'custom' ? {} : { from: '', to: '' }),
  }), [filters, scope]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await getWeavingProfitReport(requestParams));
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('weaving.operationalReports.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [requestParams]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    setDrawer(null);
    setDetail(null);
  }, [requestParams]);

  const loadDetail = useCallback(async (type, page = 1) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      setDetail(await getWeavingProfitDetails({ ...requestParams, type, page, limit: 25 }));
    } catch (loadError) {
      setDetailError(loadError?.response?.data?.message || t('weaving.profitAnalysis.detailLoadFailed'));
    } finally {
      setDetailLoading(false);
    }
  }, [requestParams]);

  const openDetail = (type) => {
    setDrawer(type);
    setDetail(null);
    loadDetail(type);
  };

  const recalculate = async () => {
    setRecalculating(true);
    setError('');
    try {
      await rebuildWeavingCosting();
      await loadReport();
      if (drawer) await loadDetail(drawer, detail?.pagination?.page || 1);
    } catch (recalcError) {
      setError(recalcError?.response?.data?.message || t('weaving.operationalReports.recalculateFailed'));
    } finally {
      setRecalculating(false);
    }
  };

  const openOutput = (format) => {
    window.open(weavingOperationalReportUrl('profit', format, requestParams), '_blank', 'noopener,noreferrer');
  };

  const exact = report?.costCoverage === 'complete';
  const scoped = report?.periodCostsUnallocated;
  const costingWarning = !loading && report && (!exact || scoped)
    ? [
        !exact ? report.missingCostReason || t('weaving.operationalReports.missingCost') : '',
        scoped ? t('weaving.operationalReports.periodCostsUnallocated') : '',
      ].filter(Boolean).join('\n')
    : '';
  useWeavingFeedback(costingWarning, null, { type: 'warning', showNonErrors: true });
  const directCost = exact ? report?.costs?.directStockCost : report?.costs?.knownDirectStockCost;
  const contribution = exact ? report?.contributionProfit : report?.provisionalGrossProfit;
  const netProfit = exact ? report?.netProfit : report?.provisionalNetProfit;
  const netTone = Number(netProfit || 0) < 0 ? 'rose' : 'emerald';

  const metrics = scoped
    ? [
        ['revenue', report?.revenue?.netRevenue, 'teal', 'revenue', false, 'money'],
        ['directCost', directCost, 'slate', 'cogs', !exact, 'money'],
        ['contribution', contribution, 'emerald', 'invoices', !exact, 'money'],
        ['margin', exact ? report?.contributionMargin : null, 'indigo', 'invoices', false, 'percent'],
        ['invoices', report?.invoiceCount, 'amber', 'invoices', false, 'number'],
        ['meters', report?.meter, 'slate', 'invoices', false, 'number'],
      ]
    : [
        ['revenue', report?.revenue?.netRevenue, 'teal', 'revenue', false, 'money'],
        ['directCost', directCost, 'slate', 'cogs', !exact, 'money'],
        ['grossProfit', contribution, 'emerald', 'invoices', !exact, 'money'],
        ['payrollLabour', report?.costs?.payrollCost, 'indigo', 'expenses', false, 'money'],
        ['operatingExpenses', report?.costs?.operatingExpenses, 'amber', 'expenses', false, 'money'],
        ['netProfit', netProfit, netTone, 'invoices', !exact, 'money'],
        ['netMargin', exact ? report?.netMargin : null, 'slate', 'invoices', false, 'percent'],
      ];

  return (
    <section className={`${mode === 'page' ? 'border border-slate-200 bg-white shadow-sm' : ''} min-w-0`}>
      {!hideTitle && (
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900 px-4 py-4 text-white">
          <div className="mr-auto min-w-0">
            <h2 className="text-lg font-black">{t('weaving.profitAnalysis.title')}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-300">{t('weaving.profitAnalysis.subtitle')}</p>
          </div>
          <button type="button" disabled={recalculating} className="inline-flex h-9 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-bold disabled:opacity-50" onClick={recalculate}>
            <FaSyncAlt className={recalculating ? 'animate-spin' : ''} /> {t('weaving.operationalReports.recalculateCosting')}
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-bold" onClick={() => openOutput('print')}><FaPrint /> {t('weaving.reports.print')}</button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-black text-slate-950" onClick={() => openOutput('pdf')}><FaDownload /> PDF</button>
        </header>
      )}

      <div className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {['combined', 'own', 'conversion'].map((item) => (
            <button key={item} type="button" onClick={() => setScope(item)} className={`h-10 rounded-md px-4 text-sm font-black transition ${scope === item ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-300 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-800'}`}>
              {t(`weaving.profitAnalysis.scopes.${item}`)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm font-bold text-slate-700">
            {t('weaving.profitAnalysis.period')}
            <select value={filters.preset} onChange={(event) => setFilters((current) => ({ ...current, preset: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
              {['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'custom'].map((preset) => <option key={preset} value={preset}>{t(`weaving.operationalReports.presets.${preset}`)}</option>)}
            </select>
          </label>
          {filters.preset === 'custom' ? (
            <>
              <label className="block text-sm font-bold text-slate-700">{t('weaving.operationalReports.from')}<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3" /></label>
              <label className="block text-sm font-bold text-slate-700">{t('weaving.operationalReports.to')}<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3" /></label>
            </>
          ) : <div className="hidden lg:block" />}
          <SearchableCreatableSelect label={t('weaving.operationalReports.party')} placeholder={t('weaving.operationalReports.allParties')} options={meta.parties || []} value={filters.partyId} onChange={(value) => setFilters((current) => ({ ...current, partyId: value }))} />
          <SearchableCreatableSelect label={t('weaving.operationalReports.quality')} placeholder={t('weaving.operationalReports.allQualities')} options={meta.qualities || []} value={filters.fabricQualityId} onChange={(value) => setFilters((current) => ({ ...current, fabricQualityId: value }))} getLabel={(item) => [item.name, item.code].filter(Boolean).join(' - ')} />
          <button type="button" className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 hover:border-rose-300 hover:text-rose-700" onClick={() => setFilters(EMPTY_FILTERS)}><FaFilter /> {t('weaving.profitAnalysis.clearFilters')}</button>
        </div>

        {loading && <div className="flex h-56 items-center justify-center"><FaSpinner className="animate-spin text-3xl text-teal-600" /></div>}

        {!loading && report && (
          <>
            <div className="text-sm text-slate-600">
              <div className="font-black">{t(exact ? 'weaving.operationalReports.completeCosting' : 'weaving.operationalReports.partialCosting')}</div>
              {!exact && <div className="mt-1 font-semibold">{report.missingCostReason || t('weaving.operationalReports.missingCost')}</div>}
              {scoped && <div className="mt-1 font-semibold">{t('weaving.operationalReports.periodCostsUnallocated')}</div>}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-7">
              {metrics.map(([key, value, tone, detailType, provisional, format]) => (
                <ProfitMetric key={key} label={t(`weaving.profitAnalysis.${key}`)} value={value} tone={tone} provisional={provisional} format={format} onClick={() => openDetail(detailType)} />
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="overflow-hidden border border-slate-200 bg-white xl:col-span-1">
                <div className="border-b border-slate-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-3">
                  <h3 className="font-black text-slate-950">{t('weaving.profitAnalysis.revenueMix')}</h3>
                </div>
                {scope !== 'conversion' && <BreakdownButton label={t('weaving.profitAnalysis.fabricSales')} value={report.revenue?.fabricSales} icon={FaIndustry} tone="bg-teal-100 text-teal-700" onClick={() => openDetail('revenue')} />}
                {scope === 'combined' && <BreakdownButton label={t('weaving.profitAnalysis.yarnSales')} value={report.revenue?.yarnSales} icon={FaBoxes} tone="bg-indigo-100 text-indigo-700" onClick={() => openDetail('revenue')} />}
                {scope !== 'own' && <BreakdownButton label={t('weaving.profitAnalysis.conversionIncome')} value={report.revenue?.conversionIncome} icon={FaCoins} tone="bg-amber-100 text-amber-700" onClick={() => openDetail('conversion')} />}
              </div>

              <div className="overflow-hidden border border-slate-200 bg-white xl:col-span-1">
                <div className="border-b border-slate-200 bg-gradient-to-r from-slate-100 to-indigo-50 px-4 py-3"><h3 className="font-black text-slate-950">{t('weaving.profitAnalysis.costStructure')}</h3></div>
                <BreakdownButton label={t('weaving.profitAnalysis.materialCost')} value={report.costs?.material} icon={FaBoxes} tone="bg-slate-200 text-slate-700" onClick={() => openDetail('cogs')} />
                <BreakdownButton label={t('weaving.profitAnalysis.processingCost')} value={report.costs?.processing} icon={FaIndustry} tone="bg-indigo-100 text-indigo-700" onClick={() => openDetail('cogs')} />
                <BreakdownButton label={t('weaving.profitAnalysis.otherDirectCost')} value={report.costs?.otherDirect} icon={FaCoins} tone="bg-rose-100 text-rose-700" onClick={() => openDetail('cogs')} />
              </div>

              <div className="overflow-hidden border border-slate-200 bg-white xl:col-span-1">
                <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-rose-50 px-4 py-3"><h3 className="font-black text-slate-950">{t('weaving.profitAnalysis.profitability')}</h3></div>
                <BreakdownButton label={t('weaving.profitAnalysis.qualityProfitability')} value={report.revenue?.fabricSales} icon={FaChartBar} tone="bg-emerald-100 text-emerald-700" onClick={() => openDetail('quality')} />
                <BreakdownButton label={t('weaving.profitAnalysis.partyProfitability')} value={report.revenue?.netRevenue} icon={FaUsers} tone="bg-indigo-100 text-indigo-700" onClick={() => openDetail('party')} />
                <BreakdownButton label={t('weaving.profitAnalysis.invoiceProfitability')} value={report.invoiceCount} format="number" icon={FaFileInvoice} tone="bg-amber-100 text-amber-700" onClick={() => openDetail('invoices')} />
              </div>
            </div>
          </>
        )}
      </div>

      {drawer && (
        <WeavingProfitDetailDrawer
          type={drawer}
          data={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setDrawer(null)}
          onPageChange={(page) => loadDetail(drawer, page)}
        />
      )}
    </section>
  );
};

export default WeavingProfitAnalysis;
