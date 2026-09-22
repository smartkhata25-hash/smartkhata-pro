import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaDownload, FaPrint, FaSpinner, FaSyncAlt } from 'react-icons/fa';
import { t } from '../../../i18n/i18n';
import {
  getWeavingFabricStockReport, getWeavingLoomPerformance, getWeavingPendingRejectionReport,
  getWeavingProductionReport, getWeavingProfitReport, getWeavingQualityProduction,
  getWeavingReportMeta, getWeavingSalesReport, weavingOperationalReportUrl,
  rebuildWeavingCosting,
} from '../../../services/weavingReportService';
import WeavingReportControls from './WeavingReportControls';
import WeavingProfitAnalysis from '../profit/WeavingProfitAnalysis';
import { useWeavingFeedback } from '../WeavingFeedbackModal';

const loaders = { production: getWeavingProductionReport, looms: getWeavingLoomPerformance, quality: getWeavingQualityProduction, stock: getWeavingFabricStockReport, sales: getWeavingSalesReport, rejection: getWeavingPendingRejectionReport, profit: getWeavingProfitReport };
const number = (value) => value === null || value === undefined ? '-' : Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const money = (value) => value === null || value === undefined ? '-' : `Rs ${number(value)}`;
const titles = { production: 'productionReport', looms: 'loomPerformance', quality: 'qualityProduction', stock: 'fabricStockReport', sales: 'salesConversion', rejection: 'pendingRejection', profit: 'profitReport' };
const baseParams = { preset: 'this_month', from: '', to: '', loomId: '', fabricQualityId: '', contractId: '', partyId: '', godownId: '', grade: '', ownershipType: '', saleType: '', paymentStatus: '', groupBy: 'date', scope: 'combined' };

const Metric = ({ label, value, currency, warning }) => <div className={`min-w-0 border-l-4 bg-white px-4 py-3 shadow-sm ${warning ? 'border-amber-500' : 'border-teal-600'}`}><div className="truncate text-[11px] font-black uppercase text-slate-500">{label}</div><div className={`mt-1 truncate text-xl font-black ${warning ? 'text-amber-700' : 'text-slate-950'}`}>{currency ? money(value) : number(value)}</div></div>;
const Cell = ({ children, strong, tone = '' }) => <td className={`whitespace-nowrap px-3 py-2.5 ${strong ? 'font-black' : ''} ${tone}`}>{children ?? '-'}</td>;
const Empty = ({ span }) => <tr><td colSpan={span} className="p-10 text-center font-semibold text-slate-400">{t('weaving.operationalReports.noData')}</td></tr>;

function StandardTable({ kind, report, navigate }) {
  const table = useMemo(() => {
    if (kind === 'production') return { headers: ['group','than','meter','kg','good','bGrade','rejected'], rows: report.groups?.map((row) => [row.label, number(row.totals?.than), number(row.totals?.meter), number(row.totals?.kg), number(row.totals?.goodMeter), number(row.totals?.bGradeMeter), number(row.totals?.rejectedMeter)]) };
    if (kind === 'looms') return { headers: ['rank','loom','name','than','meter','kg','good','bGrade','rejected','activeDays','action'], rows: report.rows?.map((row) => [row.rank, row.loomNo, row.loomName, number(row.than), number(row.meter), number(row.kg), number(row.goodMeter), number(row.bGradeMeter), number(row.rejectedMeter), row.activeDays, <button type="button" className="font-bold text-teal-700 hover:underline" onClick={() => navigate(`/weaving/looms?loomId=${row.loomId}`)}>{t('weaving.operationalReports.viewLedger')}</button>]) };
    if (kind === 'quality') return { headers: ['quality','count','width','than','meter','kg','good','bGrade','rejected'], rows: report.rows?.map((row) => [row.quality, [row.warpCount,row.weftCount].filter(Boolean).join(' / '), row.width, number(row.than), number(row.meter), number(row.kg), number(row.goodMeter), number(row.bGradeMeter), number(row.rejectedMeter)]) };
    if (kind === 'stock') return { headers: ['quality','grade','ownership','godown','than','pieces','meter','kg','lbs'], rows: report.rows?.map((row) => [row.quality?.name, String(row.grade || '').replace('_',' '), row.ownerName, row.godownName, number(row.than), number(row.pieceCount), number(row.meter), number(row.kg), number(row.lbs)]) };
    if (kind === 'sales') return { headers: ['invoice','date','party','saleType','source','item','quantity','rate','amount','received','balance','status'], rows: report.rows?.map((row) => [row.invoiceNo,row.date,row.party,row.saleType,row.source,row.item,`${number(row.quantity)} ${row.uom}`,money(row.rate),money(row.amount),money(row.received),money(row.balance),row.paymentStatus]) };
    return { headers: ['party','pakkiDate','quality','original','received','pending','age','status'], rows: report.rows?.map((row) => [row.party,row.pakkiDate,row.quality,number(row.original),number(row.received),number(row.pending),`${row.age} ${t('weaving.operationalReports.days')}`,row.status]) };
  }, [kind, report, navigate]);
  return <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-900 text-left text-[11px] uppercase text-white"><tr>{table.headers.map((header) => <th key={header} className="px-3 py-3">{t(`weaving.operationalReports.columns.${header}`)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{table.rows?.length ? table.rows.map((row, index) => <tr key={index} className="hover:bg-slate-50">{row.map((cell, cellIndex) => <Cell key={cellIndex} strong={cellIndex === 0 || cellIndex >= row.length - 3}>{cell}</Cell>)}</tr>) : <Empty span={table.headers.length} />}</tbody></table></div>;
}

const reportMetrics = (kind, report) => {
  const s = report.summary || {};
  if (kind === 'looms') return [['activeLooms',s.totalActiveLooms],['withProduction',s.loomsWithProduction],['productionMeter',s.totalProductionMeter],['idleLooms',s.idleLooms]];
  if (kind === 'stock') return [['than',s.than],['pieces',s.pieceCount],['meter',s.meter],['kg',s.kg],['lbs',s.lbs]];
  if (kind === 'sales') return [['totalSales',s.totalSales,true],['fabricSales',s.fabricSales,true],['yarnSales',s.yarnSales,true],['conversionRevenue',s.conversionRevenue,true],['received',s.received,true],['outstanding',s.outstanding,true]];
  if (kind === 'rejection') return [['originalRejection',s.original],['received',s.received],['pending',s.pending],['pendingParties',s.pendingParties],['oldestPendingDays',s.oldestPendingDays]];
  return [['than',s.than],['meter',s.meter],['kg',s.kg],['good',s.goodMeter],['bGrade',s.bGradeMeter],['rejected',s.rejectedMeter]];
};

function ProfitReport({ report }) {
  const exact = report.costCoverage === 'complete'; const scoped = report.periodCostsUnallocated; const finalKey = scoped ? 'contributionProfit' : exact ? 'netProfit' : 'provisionalNetProfit'; const finalValue = scoped ? report.contributionProfit : exact ? report.netProfit : report.provisionalNetProfit;
  const rows = [['fabricSales',report.revenue?.fabricSales],['yarnSales',report.revenue?.yarnSales],['conversionIncome',report.revenue?.conversionIncome],['otherSales',report.revenue?.otherSales],['salesDeductions',report.revenue?.salesDeductions],['netRevenue',report.revenue?.netRevenue],['directCost',report.costs?.directStockCost],['sizingCost',report.costs?.sizingCost],['payrollLabour',scoped ? null : report.costs?.payrollCost],['operatingExpenses',scoped ? null : report.costs?.operatingExpenses],[finalKey,finalValue]];
return <div className="space-y-4 p-4"><div className="text-sm font-semibold text-slate-600"><div>{t(exact ? 'weaving.operationalReports.completeCosting' : 'weaving.operationalReports.partialCosting')}</div>{scoped && <div className="mt-1 font-semibold">{t('weaving.operationalReports.periodCostsUnallocated')}</div>}{!exact && <div className="mt-1 font-semibold">{report.missingCostReason || t('weaving.operationalReports.missingCost')}</div>}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric label={t('weaving.operationalReports.totalSales')} value={report.revenue?.netRevenue} currency /><Metric label={t('weaving.operationalReports.productionCost')} value={scoped ? report.costs?.directStockCost : report.costs?.productionCost} currency /><Metric label={t('weaving.operationalReports.operatingExpenses')} value={scoped ? null : report.costs?.operatingExpenses} currency /><Metric label={t(`weaving.operationalReports.${finalKey}`)} value={finalValue} currency warning={!exact} /></div><div className="overflow-hidden border border-slate-200"><table className="w-full text-sm"><tbody>{rows.map(([key,value], index) => <tr key={key} className={index === rows.length - 1 ? `border-t-2 border-slate-900 ${exact ? 'bg-emerald-50' : 'bg-amber-50'}` : 'border-t'}><td className="px-4 py-3 font-bold">{t(`weaving.operationalReports.metrics.${key}`)}</td><td className="px-4 py-3 text-right font-black">{value === null ? t('weaving.operationalReports.notAllocated') : money(value)}</td></tr>)}</tbody></table></div></div>;
}

function StandardOperationalReport({ kind, hideTitle = false }) {
  const navigate = useNavigate(); const [params, setParams] = useState(baseParams); const [meta, setMeta] = useState({}); const [report, setReport] = useState({ rows: [], summary: {} }); const [loading, setLoading] = useState(true); const [recalculating, setRecalculating] = useState(false); const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });
  const costingWarning = kind === 'profit' && !loading && (report.costCoverage !== 'complete' || report.periodCostsUnallocated)
    ? [report.costCoverage !== 'complete' ? report.missingCostReason || t('weaving.operationalReports.missingCost') : '', report.periodCostsUnallocated ? t('weaving.operationalReports.periodCostsUnallocated') : ''].filter(Boolean).join('\n')
    : '';
  useWeavingFeedback(costingWarning, null, { type: 'warning', showNonErrors: true });
  useEffect(() => { getWeavingReportMeta().then(setMeta).catch(() => {}); }, []);
  const requestParams = useMemo(() => ({ ...params, ...(params.preset === 'custom' ? {} : { from: '', to: '' }) }), [params]);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setReport(await loaders[kind](requestParams)); } catch (loadError) { setError(loadError?.response?.data?.message || t('weaving.operationalReports.loadFailed')); } finally { setLoading(false); } }, [kind, requestParams]);
  useEffect(() => { load(); }, [load]);
  const openOutput = (format) => window.open(weavingOperationalReportUrl(kind, format, requestParams), '_blank', 'noopener,noreferrer');
  const recalculate = async () => { setRecalculating(true); setError(''); try { await rebuildWeavingCosting(); await load(); } catch (recalcError) { setError(recalcError?.response?.data?.message || t('weaving.operationalReports.recalculateFailed')); } finally { setRecalculating(false); } };
  return <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">{!hideTitle && <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3"><h2 className="mr-auto text-lg font-black text-slate-950">{t(`weaving.operationalReports.${titles[kind]}`)}</h2>{kind === 'profit' && <button type="button" disabled={recalculating} className="inline-flex h-9 items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-bold text-teal-800 disabled:opacity-50" onClick={recalculate}><FaSyncAlt className={recalculating ? 'animate-spin' : ''} />{t('weaving.operationalReports.recalculateCosting')}</button>}<button className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold" onClick={() => openOutput('print')}><FaPrint />{t('weaving.reports.print')}</button><button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-bold text-white" onClick={() => openOutput('pdf')}><FaDownload />PDF</button></div>}<WeavingReportControls kind={kind} params={params} setParams={setParams} meta={meta} />{loading ? <div className="p-16"><FaSpinner className="mx-auto animate-spin text-3xl text-teal-600" /></div> : kind === 'profit' ? <ProfitReport report={report} /> : <><div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 md:grid-cols-3 xl:grid-cols-6">{reportMetrics(kind, report).map(([label,value,currency]) => <Metric key={label} label={t(`weaving.operationalReports.metrics.${label}`)} value={value} currency={currency} />)}</div><StandardTable kind={kind} report={report} navigate={navigate} /></>}</section>;
}

export default function WeavingOperationalReport({ kind, hideTitle = false }) {
  if (kind === 'profit') {
    return <WeavingProfitAnalysis hideTitle={hideTitle} mode="page" />;
  }

  return <StandardOperationalReport kind={kind} hideTitle={hideTitle} />;
}
