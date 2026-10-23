import React, { useEffect, useMemo, useState } from 'react';
import { FaFilePdf, FaPrint, FaTimes, FaUndo } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

import { t } from '../../../i18n/i18n';
import { getBusinessDateInputValue } from '../../../utils/localDateTime';
import { formatInstallmentsDisplayRef } from '../../../utils/installmentsDisplay';
import { formatInstallmentsMoney } from '../../../utils/installmentsMoney';
import { exportInstallmentsReportPdf } from '../../../utils/installmentsReportPdf';
import { getInstallmentsProfitReport, getInstallmentsReportLookups } from '../../../services/installmentsReportService';

const money = (value) => value === null || value === undefined ? t('installments.reports.notAllocated') : formatInstallmentsMoney(value);
const asArray = (value) => Array.isArray(value) ? value : [];
const shift = (date, days) => { const next = new Date(`${date}T00:00:00`); next.setDate(next.getDate() + days); return getBusinessDateInputValue(next); };
const rangeFor = (period) => { const today = getBusinessDateInputValue(); const now = new Date(`${today}T00:00:00`); if (period === 'today') return [today, today]; if (period === 'yesterday') { const day = shift(today, -1); return [day, day]; } if (period === 'week') return [shift(today, -((now.getDay() + 6) % 7)), today]; if (period === 'last_month') { const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); return [getBusinessDateInputValue(first), getBusinessDateInputValue(last)]; } if (period === 'year') return [`${today.slice(0, 4)}-01-01`, today]; if (period === 'last_year') { const year = Number(today.slice(0, 4)) - 1; return [`${year}-01-01`, `${year}-12-31`]; } return [`${today.slice(0, 8)}01`, today]; };

const actionClass = 'installments-report-no-print grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 outline-none transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 focus-visible:ring-2 focus-visible:ring-cyan-300';
const ReportActions = ({ data, filters }) => <div className="flex items-center gap-1.5">
  <button type="button" onClick={() => window.print()} className={actionClass} title={t('installments.reports.print')} aria-label={t('installments.reports.print')}><FaPrint aria-hidden="true" /></button>
  <button type="button" disabled={!data} onClick={() => exportInstallmentsReportPdf({ tab: 'profit', data, filters })} className={`${actionClass} text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50`} title={t('installments.reports.savePdfHint')} aria-label={t('installments.reports.savePdfHint')}><FaFilePdf aria-hidden="true" /></button>
</div>;

const Detail = ({ type, data, filters, lookups, period, onClose }) => {
  const navigate = useNavigate();
  const rows = asArray(type === 'sales' || type === 'cogs' ? data?.sales : type === 'expenses' ? data?.expenses : data?.products);
  const selectedFilters = [
    `${t('installments.reports.fromDate')}: ${filters.fromDate}`,
    `${t('installments.reports.toDate')}: ${filters.toDate}`,
    filters.productId && lookups.products.find((item) => item._id === filters.productId)?.name,
    filters.category,
    filters.supplierId && lookups.suppliers.find((item) => item._id === filters.supplierId)?.name,
  ].filter(Boolean);

  return <div className="fixed inset-0 z-[110] bg-slate-950/45" onClick={(event) => { event.stopPropagation(); onClose(); }}>
    <aside className="absolute inset-y-0 end-0 flex w-full max-w-5xl flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="installments-report-no-print flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0"><h3 className="truncate text-base font-black text-slate-900 sm:text-lg">{t(`installments.reports.details.${type}`)}</h3><p className="mt-0.5 text-xs text-slate-500">{t(`installments.reports.periods.${period}`)}</p></div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 flex-none place-items-center rounded-lg text-slate-500 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={t('close')} title={t('close')}><FaTimes aria-hidden="true" /></button>
      </header>
      <div className="border-b bg-slate-50 px-4 py-2 sm:px-5"><div className="flex flex-wrap gap-1.5">{selectedFilters.map((label) => <span key={label} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{label}</span>)}</div></div>
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-4">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600 shadow-sm"><tr>{type === 'expenses' ? <><th className="p-2 text-start">{t('date')}</th><th className="p-2 text-start">{t('title')}</th><th className="p-2 text-start">{t('installments.reports.expenseCategory')}</th><th className="p-2 text-start">{t('installments.reports.paidFrom')}</th><th className="p-2 text-end">{t('amount')}</th></> : type === 'products' ? <><th className="p-2 text-start">{t('installments.reports.product')}</th><th className="p-2 text-end">{t('installments.reports.quantity')}</th><th className="p-2 text-end">{t('installments.reports.totalSales')}</th><th className="p-2 text-end">{t('installments.reports.cogs')}</th><th className="p-2 text-end">{t('installments.reports.grossProfit')}</th><th className="p-2 text-end">%</th></> : <><th className="p-2 text-start">{t('date')}</th><th className="p-2 text-start">{t('installments.reports.invoice')}</th><th className="p-2 text-start">{t('installments.reports.party')}</th><th className="p-2 text-start">{t('installments.reports.product')}</th><th className="p-2 text-end">{t('installments.reports.quantity')}</th><th className="p-2 text-end">{type === 'cogs' ? t('installments.reports.cogs') : t('installments.reports.totalSales')}</th></>}</tr></thead>
          <tbody>{rows.map((row) => type === 'expenses' ? <tr key={row._id} className="border-b hover:bg-slate-50"><td className="p-2">{row.date}</td><td className="p-2">{row.title}</td><td className="p-2">{row.category?.name || '-'}</td><td className="p-2">{row.paidFrom?.map((account) => account.name).join(', ') || '-'}</td><td className="p-2 text-end font-bold text-amber-700">{money(row.amount)}</td></tr> : type === 'products' ? <tr key={`${row.productName}-${row.category}`} className="border-b hover:bg-slate-50"><td className="p-2 font-semibold">{row.productName}<small className="block font-normal text-slate-500">{[row.category, row.brand, row.model].filter(Boolean).join(' · ')}</small></td><td className="p-2 text-end">{row.quantity}</td><td className="p-2 text-end text-indigo-700">{money(row.totalSales)}</td><td className="p-2 text-end text-rose-700">{money(row.purchaseCost)}</td><td className={`p-2 text-end font-black ${Number(row.grossProfit) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{money(row.grossProfit)}</td><td className="p-2 text-end">{row.grossMarginPercent}%</td></tr> : <tr key={row._id} className="cursor-pointer border-b hover:bg-cyan-50" onClick={() => navigate(`/installments/invoices/${row.invoiceId}`)}><td className="p-2">{row.invoiceDate}</td><td className="p-2 font-bold text-blue-700">{formatInstallmentsDisplayRef(row.invoiceNumber, 'invoice')}</td><td className="p-2">{type === 'cogs' ? row.supplier?.name : row.member?.fullName}</td><td className="p-2">{row.productName}<small className="block text-slate-500">{[row.brand, row.model].filter(Boolean).join(' · ')}</small></td><td className="p-2 text-end">{row.quantity}</td><td className={`p-2 text-end font-bold ${type === 'cogs' ? 'text-rose-700' : 'text-indigo-700'}`}>{money(type === 'cogs' ? row.purchaseCost : row.saleAmount)}</td></tr>)}</tbody>
        </table>
        {!rows.length && <p className="p-8 text-center text-sm text-slate-500">{t('installments.reports.empty')}</p>}
      </div>
    </aside>
  </div>;
};

const tones = {
  sales: 'text-indigo-700 hover:bg-indigo-50',
  cost: 'text-rose-700 hover:bg-rose-50',
  gross: 'bg-cyan-50/70 text-cyan-800 hover:bg-cyan-100',
  expense: 'text-amber-700 hover:bg-amber-50',
  profit: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  loss: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
  product: 'text-violet-700 hover:bg-violet-50',
};

const InstallmentsProfitModal = ({ open, onClose, initialRange }) => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [filters, setFilters] = useState(() => { const [fromDate, toDate] = initialRange ? [initialRange.fromDate, initialRange.toDate] : rangeFor('month'); return { fromDate, toDate, productId: '', category: '', supplierId: '' }; });
  const [lookups, setLookups] = useState({ products: [], categories: [], suppliers: [] });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const params = useMemo(() => filters, [filters]);

  useEffect(() => { if (!open) return; getInstallmentsReportLookups().then(setLookups).catch(() => {}); }, [open]);
  useEffect(() => { if (!open || !filters.fromDate || !filters.toDate || filters.fromDate > filters.toDate) return undefined; let active = true; setData(null); setError(''); getInstallmentsProfitReport(params).then((result) => { if (!result?.summary || !Array.isArray(result.sales) || !Array.isArray(result.expenses) || !Array.isArray(result.products)) throw new Error(t('installments.reports.loadError')); if (active) setData(result); }).catch((requestError) => { if (active) setError(requestError.response?.data?.message || requestError.message || t('installments.reports.loadError')); }); return () => { active = false; }; }, [open, params, filters.fromDate, filters.toDate]);
  useEffect(() => { if (!open) setDetail(''); }, [open]);

  if (!open) return null;

  const setPeriodRange = (value) => { setPeriod(value); if (value !== 'custom') { const [fromDate, toDate] = rangeFor(value); setFilters((current) => ({ ...current, fromDate, toDate })); } };
  const clearFilters = () => { const [fromDate, toDate] = rangeFor('month'); setPeriod('month'); setFilters({ fromDate, toDate, productId: '', category: '', supplierId: '' }); setDetail(''); };
  const openRow = (type) => { if (type === 'report') { navigate(`/installments/reports?tab=profit&fromDate=${filters.fromDate}&toDate=${filters.toDate}`); onClose(); } else if (type) setDetail(type); };
  const row = (label, value, type, tone) => <button type="button" disabled={!type || !data} onClick={() => openRow(type)} className={`flex w-full items-center justify-between gap-4 border-b px-3 py-3 text-start text-sm font-bold outline-none transition last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 ${tones[tone]} ${type ? 'cursor-pointer' : 'cursor-default'}`}><span className="text-slate-700">{label}</span><span className="whitespace-nowrap font-black">{money(value)}</span></button>;
  const controlClass = 'h-10 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 sm:text-sm';

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-2 sm:p-4" onClick={onClose}>
    <style>{`@media print { body * { visibility: hidden !important; } .installments-profit-print, .installments-profit-print * { visibility: visible !important; } .installments-profit-print { position: absolute !important; inset: 0 !important; max-height: none !important; width: 100% !important; max-width: none !important; overflow: visible !important; box-shadow: none !important; } .installments-report-no-print { display: none !important; } }`}</style>
    <section className="installments-profit-print max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0"><h2 className="truncate text-base font-black text-slate-900 sm:text-lg">{t('installments.reports.profitSummary')}</h2><p className="text-xs text-slate-500">{t('installments.reports.accrualBasis')}</p></div>
        <div className="flex items-center gap-1.5"><ReportActions data={data} filters={filters} /><button type="button" onClick={onClose} className={`${actionClass} text-slate-500`} aria-label={t('close')} title={t('close')}><FaTimes aria-hidden="true" /></button></div>
      </header>
      <div className="installments-report-no-print border-b bg-slate-50 p-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <select aria-label={t('installments.reports.period')} className={controlClass} value={period} onChange={(event) => setPeriodRange(event.target.value)}>{['today','yesterday','week','month','last_month','year','last_year','custom'].map((value) => <option key={value} value={value}>{t(`installments.reports.periods.${value}`)}</option>)}</select>
        <input aria-label={t('installments.reports.fromDate')} className={controlClass} type="date" value={filters.fromDate} max={filters.toDate} onChange={(event) => { setPeriod('custom'); setFilters((current) => ({ ...current, fromDate: event.target.value })); }} />
        <input aria-label={t('installments.reports.toDate')} className={controlClass} type="date" value={filters.toDate} min={filters.fromDate} onChange={(event) => { setPeriod('custom'); setFilters((current) => ({ ...current, toDate: event.target.value })); }} />
        <select aria-label={t('installments.reports.allProducts')} className={controlClass} value={filters.productId} onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))}><option value="">{t('installments.reports.allProducts')}</option>{lookups.products.map((item) => <option key={item._id || item.name} value={item._id || ''}>{item.name}</option>)}</select>
        <select aria-label={t('installments.reports.allCategories')} className={controlClass} value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">{t('installments.reports.allCategories')}</option>{lookups.categories.map((item) => <option key={item}>{item}</option>)}</select>
        <div className="flex min-w-0 gap-2"><select aria-label={t('installments.reports.allSuppliers')} className={controlClass} value={filters.supplierId} onChange={(event) => setFilters((current) => ({ ...current, supplierId: event.target.value }))}><option value="">{t('installments.reports.allSuppliers')}</option>{lookups.suppliers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select><button type="button" onClick={clearFilters} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300" title={t('installments.reports.clearFilters')} aria-label={t('installments.reports.clearFilters')}><FaUndo aria-hidden="true" /></button></div>
      </div></div>
      {error && <p className="m-3 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
      <div className="p-3 sm:p-4">
        {!data && !error ? <p className="p-8 text-center text-sm text-slate-500">{t('loading')}</p> : data?.summary ? <div className="overflow-hidden rounded-xl border border-slate-200">{row(t('installments.reports.totalSales'), data.summary.totalSales, 'sales', 'sales')}{row(t('installments.reports.cogsLess'), data.summary.cogs, 'cogs', 'cost')}{row(t('installments.reports.grossProfitEquals'), data.summary.grossProfit, 'products', 'gross')}{row(t('installments.reports.operatingExpensesLess'), data.summary.operatingExpenses, data.summary.expensesApplicable ? 'expenses' : '', 'expense')}{row(t('installments.reports.netProfitEquals'), data.summary.netProfit, 'report', Number(data.summary.netProfit) < 0 ? 'loss' : 'profit')}{row(t('installments.reports.productProfitability'), data.summary.grossProfit, 'products', 'product')}</div> : null}
        {data?.summary && !data.summary.expensesApplicable && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t('installments.reports.unallocatedExpenseNote')}</p>}
      </div>
    </section>
    {detail && data && <Detail type={detail} data={data} filters={filters} lookups={lookups} period={period} onClose={() => setDetail('')} />}
  </div>;
};

export { rangeFor };
export default InstallmentsProfitModal;
