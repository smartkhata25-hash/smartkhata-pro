import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaExternalLinkAlt, FaFilePdf, FaFilter, FaPrint, FaUndo, FaUsers, FaWallet } from 'react-icons/fa';
import { useNavigate, useSearchParams } from 'react-router-dom';

import InstallmentsProfitModal, { rangeFor } from '../../components/installments/reports/InstallmentsProfitModal';
import { t } from '../../i18n/i18n';
import {
  getInstallmentsBalancesReport,
  getInstallmentsCollectionReport,
  getInstallmentsExpensesReport,
  getInstallmentsProfitReport,
  getInstallmentsReportLookups,
  getInstallmentsSavingsReport,
} from '../../services/installmentsReportService';
import { formatInstallmentsDisplayRef } from '../../utils/installmentsDisplay';
import { formatInstallmentsMoney } from '../../utils/installmentsMoney';
import { exportInstallmentsReportPdf } from '../../utils/installmentsReportPdf';
import { hasPermission } from '../../utils/permissionHelper';

const money = (value) => value === null || value === undefined ? t('installments.reports.notAllocated') : formatInstallmentsMoney(value);
const asArray = (value) => Array.isArray(value) ? value : [];
const tabs = [
  ['profit', 'installments.reports.profitReport', 'installments.reports.profit'],
  ['collections', 'installments.reports.collectionReport', 'installments.reports.collections'],
  ['expenses', 'installments.reports.expensesReport', 'installments.reports.expenses'],
  ['balances', 'installments.reports.receivablesPayables', 'installments.reports.receivables'],
  ['savings', 'installments.reports.savingsReport', 'installments.reports.receivables'],
];
const filterKeys = ['fromDate', 'toDate', 'productId', 'category', 'supplierId', 'memberId', 'committeeId', 'accountId', 'status', 'titleId', 'search', 'scope'];
const validReportPayload = (tab, result) => {
  if (!result || typeof result !== 'object') return false;
  if (tab === 'profit') return Boolean(result.summary) && Array.isArray(result.sales) && Array.isArray(result.expenses) && Array.isArray(result.products);
  if (tab === 'collections') return Boolean(result.summary) && Array.isArray(result.schedules) && Array.isArray(result.receipts);
  if (tab === 'expenses') return Boolean(result.summary) && Array.isArray(result.byTitle) && Array.isArray(result.rows);
  if (tab === 'balances') return Array.isArray(result.members) && Array.isArray(result.suppliers);
  if (tab === 'savings') return Boolean(result.summary) && Array.isArray(result.rows);
  return false;
};
const readFilters = (params) => {
  const [fromDate, toDate] = rangeFor('month');
  return filterKeys.reduce((values, key) => ({ ...values, [key]: params.get(key) || (key === 'fromDate' ? fromDate : key === 'toDate' ? toDate : '') }), {});
};

const Table = ({ children, head, empty }) => <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border bg-white"><table className="w-full min-w-[640px] text-xs"><thead className="bg-slate-100"><tr>{head.map((label) => <th key={label} className="whitespace-nowrap px-2 py-2 text-start">{label}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty && <p className="p-6 text-center text-sm font-semibold text-slate-500">{t('installments.reports.emptySelected')}</p>}</div>;
const metricTones = {
  indigo: 'text-indigo-700 hover:bg-indigo-50',
  rose: 'text-rose-700 hover:bg-rose-50',
  cyan: 'bg-cyan-50/70 text-cyan-800 hover:bg-cyan-100',
  amber: 'text-amber-700 hover:bg-amber-50',
  emerald: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  violet: 'text-violet-700 hover:bg-violet-50',
  slate: 'text-slate-700 hover:bg-slate-50',
};
const Metric = ({ label, value, onClick, percent, tone = 'slate' }) => <button type="button" disabled={!onClick} onClick={onClick} className={`flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-start text-sm font-bold outline-none transition last:border-b-0 ${metricTones[tone]} ${onClick ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300' : 'cursor-default'}`}><span className="text-slate-700">{label}</span><span className="whitespace-nowrap font-black">{percent ? `${Number(value || 0).toFixed(2)}%` : money(value)}</span></button>;
const reportActionClass = 'installments-report-no-print grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300';

const InstallmentsReportsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedTabs = tabs.filter((row) => hasPermission(row[2]));
  const requested = searchParams.get('tab');
  const tab = allowedTabs.some((row) => row[0] === requested) ? requested : allowedTabs[0]?.[0];
  const detail = searchParams.get('detail') || '';
  const balanceType = searchParams.get('balanceType') || 'all';
  const dashboardScope = searchParams.get('scope') || '';
  const isDashboardReceived = tab === 'collections' && detail === 'receipts' && dashboardScope === 'dashboard_received';
  const isDashboardOverdue = tab === 'collections' && dashboardScope === 'dashboard_overdue';
  const isDashboardBalance = tab === 'balances' && ['dashboard_receivables', 'dashboard_payables'].includes(dashboardScope);
  const isDashboardSavings = tab === 'savings' && dashboardScope === 'dashboard_savings';
  const isDashboardSales = tab === 'profit' && dashboardScope === 'dashboard_sales';
  const [filters, setFilters] = useState(() => readFilters(searchParams));
  const [lookups, setLookups] = useState({ products: [], categories: [], suppliers: [], members: [], committees: [], accounts: [], expenseTitles: [] });
  const [data, setData] = useState(null);
  const [dataTab, setDataTab] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profitOpen, setProfitOpen] = useState(false);
  const tabRefs = useRef({});
  const exportPdf = () => exportInstallmentsReportPdf({ tab, data: dataTab === tab ? data : null, filters, balanceType });

  useEffect(() => { getInstallmentsReportLookups().then(setLookups).catch(() => {}); }, []);
  useEffect(() => {
    const next = readFilters(searchParams);
    setFilters((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, [searchParams]);
  const focusedCollectionParams = useMemo(() => ({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    scope: isDashboardOverdue ? 'dashboard_overdue' : 'dashboard_received',
    ...(isDashboardOverdue ? { status: 'overdue' } : {}),
  }), [filters.fromDate, filters.toDate, isDashboardOverdue]);
  const focusedSalesParams = useMemo(() => ({ fromDate: filters.fromDate, toDate: filters.toDate }), [filters.fromDate, filters.toDate]);
  const staticFocusedParams = useMemo(() => ({}), []);
  const params = isDashboardReceived || isDashboardOverdue ? focusedCollectionParams : isDashboardSales ? focusedSalesParams : isDashboardBalance || isDashboardSavings ? staticFocusedParams : filters;
  useEffect(() => {
    if (!tab || (!['balances', 'savings'].includes(tab) && (!filters.fromDate || !filters.toDate || filters.fromDate > filters.toDate))) return undefined;
    let active = true;
    setLoading(true); setError(''); setData(null); setDataTab('');
    const request = tab === 'profit' ? getInstallmentsProfitReport(params)
      : tab === 'collections' ? getInstallmentsCollectionReport(params)
        : tab === 'expenses' ? getInstallmentsExpensesReport(params)
          : tab === 'savings' ? getInstallmentsSavingsReport()
            : getInstallmentsBalancesReport();
    request.then((result) => {
      if (!active) return;
      if (!validReportPayload(tab, result)) throw new Error(t('installments.reports.loadError'));
      setData(result); setDataTab(tab);
    }).catch((requestError) => { if (active) { setData(null); setDataTab(''); setError(requestError.response?.data?.message || requestError.message || t('installments.reports.loadError')); } }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [tab, params, filters.fromDate, filters.toDate]);
  useEffect(() => { tabRefs.current[tab]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); }, [tab]);

  if (!tab) return <main className="p-6 text-sm text-slate-600">{t('installments.reports.noAccess')}</main>;
  const update = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key); setSearchParams(next, { replace: true }); };
  const openDetail = (value) => { const next = new URLSearchParams(searchParams); if (value) next.set('detail', value); else next.delete('detail'); setSearchParams(next); };
  const clear = () => { setFilters(readFilters(new URLSearchParams())); setSearchParams({ tab }); };
  const clearReceivedFilters = () => {
    setFilters((current) => ({ ...current, search: '', accountId: '', committeeId: '' }));
    setSearchParams({ tab: 'collections', detail: 'receipts', scope: 'dashboard_received', fromDate: filters.fromDate, toDate: filters.toDate }, { replace: true });
  };
  const clearFocusedFilters = () => {
    setFilters((current) => ({ ...current, search: '', committeeId: '', supplierId: '', status: '' }));
    const next = new URLSearchParams(searchParams);
    ['search', 'committeeId', 'supplierId', 'status'].forEach((key) => next.delete(key));
    if (isDashboardOverdue) next.set('status', 'overdue');
    setSearchParams(next, { replace: true });
  };
  const memberRows = asArray(data?.members).filter((row) => row.receivable > 0);
  const supplierRows = asArray(data?.suppliers).filter((row) => row.payable > 0);

  if (isDashboardReceived) return <DashboardReceivedReceipts
    data={dataTab === tab ? data : null}
    loading={loading}
    error={error}
    filters={filters}
    lookups={lookups}
    update={update}
    clear={clearReceivedFilters}
    navigate={navigate}
  />;
  if (isDashboardOverdue) return <DashboardOverdueList data={dataTab === tab ? data : null} loading={loading} error={error} filters={filters} update={update} clear={clearFocusedFilters} navigate={navigate} />;
  if (isDashboardBalance) return <DashboardBalanceList type={balanceType} rows={balanceType === 'payable' ? supplierRows : memberRows} dataReady={dataTab === tab && Boolean(data)} loading={loading} error={error} filters={filters} update={update} clear={clearFocusedFilters} navigate={navigate} />;
  if (isDashboardSavings) return <DashboardSavingsList data={dataTab === tab ? data : null} loading={loading} error={error} filters={filters} update={update} clear={clearFocusedFilters} navigate={navigate} />;
  if (isDashboardSales) return <DashboardSalesList data={dataTab === tab ? data : null} loading={loading} error={error} filters={filters} update={update} clear={clearFocusedFilters} navigate={navigate} />;

  return <main className="installments-reports-print min-h-full overflow-x-hidden bg-slate-50 p-2 sm:p-4"><style>{`@media print { .installments-report-no-print { display: none !important; } .installments-reports-print { background: white !important; padding: 0 !important; } .installments-reports-print table { break-inside: auto; } .installments-reports-print tr { break-inside: avoid; } }`}</style><div className="mx-auto max-w-[1500px]">
    <div className="installments-report-no-print mb-2 flex min-w-0 items-center gap-1.5 rounded-xl border bg-white p-1 shadow-sm"><nav aria-label={t('installments.reports.title')} className="min-w-0 flex-1 scroll-smooth overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"><div className="flex w-max min-w-full gap-1">{allowedTabs.map(([key, label]) => <button ref={(node) => { tabRefs.current[key] = node; }} key={key} type="button" onClick={() => setSearchParams({ tab: key })} aria-current={tab === key ? 'page' : undefined} className={`min-h-9 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-black outline-none transition sm:px-3 sm:text-xs ${tab === key ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300'}`}>{t(label)}</button>)}</div></nav>{hasPermission('installments.reports.export') && <div className="flex flex-none gap-1"><button type="button" onClick={() => window.print()} disabled={loading || Boolean(error) || dataTab !== tab} title={t('installments.reports.print')} aria-label={t('installments.reports.print')} className={`${reportActionClass} disabled:cursor-not-allowed disabled:opacity-50`}><FaPrint aria-hidden="true" /></button><button type="button" onClick={exportPdf} disabled={loading || Boolean(error) || dataTab !== tab || !data} title={t('installments.reports.savePdfHint')} aria-label={t('installments.reports.savePdfHint')} className={`${reportActionClass} text-rose-600 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50`}><FaFilePdf aria-hidden="true" /></button></div>}</div>
    {!['balances', 'savings'].includes(tab) && <Filters tab={tab} filters={filters} update={update} lookups={lookups} clear={clear} />}
    {error && <p className="mb-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    {loading || (!error && dataTab !== tab) ? <p className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">{t('loading')}</p> : data ? <section className="space-y-3">
      {tab === 'profit' && <ProfitSummary data={data} openDetail={openDetail} onOpenModal={() => setProfitOpen(true)} />}
      {tab === 'collections' && <CollectionSummary data={data} openDetail={openDetail} />}
      {tab === 'expenses' && <ExpenseSummary data={data} openDetail={openDetail} />}
      {tab === 'balances' && <BalanceTables type={balanceType} members={memberRows} suppliers={supplierRows} navigate={navigate} />}
      {tab === 'savings' && <SavingsTable data={data} navigate={navigate} />}
      {detail && ['profit', 'collections', 'expenses'].includes(tab) && <DetailTable type={detail} data={data} close={() => openDetail('')} navigate={navigate} />}
    </section> : !error ? <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">{t('installments.reports.empty')}</p> : null}
    <InstallmentsProfitModal open={profitOpen} onClose={() => setProfitOpen(false)} initialRange={{ fromDate: filters.fromDate, toDate: filters.toDate }} />
  </div></main>;
};

const reportControl = 'h-10 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 sm:text-sm';
const DateControl = ({ label, value, min, max, onChange }) => <label className="relative min-w-0"><span className="pointer-events-none absolute start-2 top-1 z-10 text-[9px] font-bold uppercase leading-none text-slate-500">{label}</span><input aria-label={label} dir="ltr" type="date" className={`${reportControl} px-1.5 pb-0.5 pt-3 text-[11px] sm:px-2 sm:text-xs`} value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} /></label>;
const Filters = ({ tab, filters, update, lookups, clear }) => <section className="installments-report-no-print mb-2 min-w-0 rounded-xl border bg-white p-2 shadow-sm lg:flex lg:items-start lg:gap-2">
  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-1.5 lg:w-[390px] lg:flex-none">
    <DateControl label={t('installments.reports.fromDate')} value={filters.fromDate} max={filters.toDate} onChange={(value) => update('fromDate', value)} />
    <DateControl label={t('installments.reports.toDate')} value={filters.toDate} min={filters.fromDate} onChange={(value) => update('toDate', value)} />
    <button type="button" onClick={clear} title={t('installments.reports.clearFilters')} aria-label={t('installments.reports.clearFilters')} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300"><FaUndo aria-hidden="true" /></button>
  </div>
  <div className={`mt-1.5 grid min-w-0 grid-cols-2 gap-1.5 lg:mt-0 lg:flex-1 ${tab === 'collections' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
    {tab === 'profit' && <><Select value={filters.productId} onChange={(value) => update('productId', value)} label={t('installments.reports.allProducts')} rows={lookups.products} text={(row) => row.name} /><Select value={filters.category} onChange={(value) => update('category', value)} label={t('installments.reports.allCategories')} rows={lookups.categories} text={(row) => row} id={(row) => row} /><Select extra="col-span-2 lg:col-span-1" value={filters.supplierId} onChange={(value) => update('supplierId', value)} label={t('installments.reports.allSuppliers')} rows={lookups.suppliers} text={(row) => row.name} /></>}
    {tab === 'collections' && <><Select value={filters.memberId} onChange={(value) => update('memberId', value)} label={t('installments.reports.allMembers')} rows={lookups.members} text={(row) => row.fullName} /><Select value={filters.committeeId} onChange={(value) => update('committeeId', value)} label={t('installments.reports.allCommittees')} rows={lookups.committees} text={(row) => formatInstallmentsDisplayRef(row.committeeNumber, 'committee')} /><Select value={filters.accountId} onChange={(value) => update('accountId', value)} label={t('installments.reports.allAccounts')} rows={lookups.accounts} text={(row) => row.name} /><select aria-label={t('installments.reports.allStatuses')} className={reportControl} value={filters.status} onChange={(event) => update('status', event.target.value)}><option value="">{t('installments.reports.allStatuses')}</option><option value="paid">{t('installments.reports.paid')}</option><option value="partial">{t('installments.reports.partial')}</option><option value="unpaid">{t('installments.reports.unpaid')}</option><option value="overdue">{t('installments.reports.overdue')}</option></select></>}
    {tab === 'expenses' && <><Select value={filters.titleId} onChange={(value) => update('titleId', value)} label={t('installments.reports.allExpenseTitles')} rows={lookups.expenseTitles} text={(row) => row.name} /><Select value={filters.accountId} onChange={(value) => update('accountId', value)} label={t('installments.reports.allAccounts')} rows={lookups.accounts} text={(row) => row.name} /><input aria-label={t('search')} className={`${reportControl} col-span-2 lg:col-span-1`} value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder={t('search')} /></>}
  </div>
</section>;
const Select = ({ value, onChange, label, rows, text, id = (row) => row._id, extra = '' }) => <select aria-label={label} title={label} className={`${reportControl} ${extra}`} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{rows.map((row) => <option key={id(row)} value={id(row)}>{text(row)}</option>)}</select>;

const FocusedToolbar = ({ search, onSearch, searchLabel, filterValue = '', onFilter, filterLabel, filterOptions = [], onClear, icon: FilterIcon = FaFilter }) => {
  const [open, setOpen] = useState(false);
  const hasFilter = Boolean(filterValue);
  return <div className="relative mb-2 flex min-w-0 items-center gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm">
    <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} aria-label={searchLabel} placeholder={searchLabel} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-normal focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 sm:text-sm" />
    {filterOptions.length > 0 && <><select aria-label={filterLabel} className={`${reportControl} hidden sm:block sm:w-56 sm:flex-none`} value={filterValue} onChange={(event) => onFilter(event.target.value)}><option value="">{filterLabel}</option>{filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={filterLabel} title={filterLabel} className={`relative grid h-10 w-10 flex-none place-items-center rounded-lg border bg-white text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:hidden ${hasFilter ? 'border-cyan-400 text-cyan-700' : 'border-slate-200'}`}><FilterIcon aria-hidden="true" />{hasFilter && <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-white" />}</button></>}
    <button type="button" onClick={() => { onClear(); setOpen(false); }} title={t('installments.reports.clearFilters')} aria-label={t('installments.reports.clearFilters')} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300"><FaUndo aria-hidden="true" /></button>
    {open && filterOptions.length > 0 && <div className="absolute inset-x-1 top-[calc(100%+4px)] z-30 rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:hidden"><select autoFocus aria-label={filterLabel} className={reportControl} value={filterValue} onChange={(event) => { onFilter(event.target.value); setOpen(false); }}><option value="">{filterLabel}</option>{filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
  </div>;
};

const FocusedFrame = ({ loading, error, dataReady, empty, emptyText, children }) => {
  if (error) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>;
  if (loading || !dataReady) return <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">{t('loading')}</p>;
  if (empty) return <p className="rounded-xl border bg-white p-8 text-center text-sm font-semibold text-slate-500">{emptyText}</p>;
  return children;
};

const FocusedPage = ({ toolbar, children }) => <main className="min-h-full overflow-x-hidden bg-slate-50 p-2 sm:p-4"><div className="mx-auto max-w-[1500px]">{toolbar}{children}</div></main>;

const DashboardReceivedReceipts = ({ data, loading, error, filters, lookups, update, clear, navigate }) => {
  const [mobileFilter, setMobileFilter] = useState('');
  const query = String(filters.search || '').trim().toLocaleLowerCase();
  const allReceipts = asArray(data?.receipts);
  const committeeOptions = [...new Map(allReceipts.filter((row) => row.committeeId?._id).map((row) => [String(row.committeeId._id), row.committeeId])).values()];
  const hasUnassignedCommittee = allReceipts.some((row) => !row.committeeId?._id);
  const receipts = allReceipts.filter((row) => {
    const accountId = String(row.accountId?._id || row.accountId || '');
    const committeeId = String(row.committeeId?._id || row.committeeId || '');
    if (filters.accountId && accountId !== filters.accountId) return false;
    if (filters.committeeId === '__none__' && committeeId) return false;
    if (filters.committeeId && filters.committeeId !== '__none__' && committeeId !== filters.committeeId) return false;
    if (!query) return true;
    const committeeRef = formatInstallmentsDisplayRef(row.committeeId?.committeeNumber, 'committee');
    const receiptRef = formatInstallmentsDisplayRef(row.referenceNumber, 'reference');
    return [
      row.memberId?.fullName,
      row.memberId?.mobile,
      row.memberId?.memberNumber,
      row.referenceNumber,
      receiptRef,
      row.committeeId?.committeeNumber,
      committeeRef,
    ].some((value) => String(value || '').toLocaleLowerCase().includes(query));
  });
  const filterButton = (name, Icon, label, active) => <button type="button" onClick={() => setMobileFilter((current) => current === name ? '' : name)} aria-expanded={mobileFilter === name} aria-label={label} title={label} className={`relative grid h-10 w-10 flex-none place-items-center rounded-lg border bg-white text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:hidden ${active ? 'border-cyan-400 text-cyan-700' : 'border-slate-200'}`}><Icon aria-hidden="true" />{active && <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-white" />}</button>;

  return <main className="min-h-full overflow-x-hidden bg-slate-50 p-2 sm:p-4">
    <div className="mx-auto max-w-[1500px]">
      <div className="relative mb-2 flex min-w-0 items-center gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm">
        <input type="search" value={filters.search} onChange={(event) => update('search', event.target.value)} aria-label={t('installments.reports.receiptSearch')} placeholder={t('installments.reports.receiptSearch')} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-normal focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 sm:text-sm" />
        <select aria-label={t('installments.reports.allAccounts')} className={`${reportControl} hidden sm:block sm:w-52 sm:flex-none`} value={filters.accountId} onChange={(event) => update('accountId', event.target.value)}><option value="">{t('installments.reports.allAccounts')}</option>{lookups.accounts.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select>
        <select aria-label={t('installments.reports.allCommittees')} className={`${reportControl} hidden sm:block sm:w-52 sm:flex-none`} value={filters.committeeId} onChange={(event) => update('committeeId', event.target.value)}><option value="">{t('installments.reports.allCommittees')}</option>{hasUnassignedCommittee && <option value="__none__">{t('installments.reports.withoutCommittee')}</option>}{committeeOptions.map((row) => <option key={row._id} value={row._id}>{formatInstallmentsDisplayRef(row.committeeNumber, 'committee')}</option>)}</select>
        {filterButton('account', FaWallet, t('installments.reports.allAccounts'), Boolean(filters.accountId))}
        {filterButton('committee', FaUsers, t('installments.reports.allCommittees'), Boolean(filters.committeeId))}
        <button type="button" onClick={() => { clear(); setMobileFilter(''); }} title={t('installments.reports.clearFilters')} aria-label={t('installments.reports.clearFilters')} className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-300"><FaUndo aria-hidden="true" /></button>
        {mobileFilter && <div className="absolute inset-x-1 top-[calc(100%+4px)] z-30 rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:hidden">
          {mobileFilter === 'account' ? <select autoFocus aria-label={t('installments.reports.allAccounts')} className={reportControl} value={filters.accountId} onChange={(event) => { update('accountId', event.target.value); setMobileFilter(''); }}><option value="">{t('installments.reports.allAccounts')}</option>{lookups.accounts.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select> : <select autoFocus aria-label={t('installments.reports.allCommittees')} className={reportControl} value={filters.committeeId} onChange={(event) => { update('committeeId', event.target.value); setMobileFilter(''); }}><option value="">{t('installments.reports.allCommittees')}</option>{hasUnassignedCommittee && <option value="__none__">{t('installments.reports.withoutCommittee')}</option>}{committeeOptions.map((row) => <option key={row._id} value={row._id}>{formatInstallmentsDisplayRef(row.committeeNumber, 'committee')}</option>)}</select>}
        </div>}
      </div>
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : loading || !data ? <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">{t('loading')}</p> : <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600"><tr><th className="hidden whitespace-nowrap p-2 text-start sm:table-cell">{t('date')}</th><th className="whitespace-nowrap p-2 text-start">{t('installments.reports.reference')}</th><th className="p-2 text-start">{t('installments.reports.member')}</th><th className="hidden whitespace-nowrap p-2 text-start md:table-cell">{t('installments.reports.committee')}</th><th className="whitespace-nowrap p-2 text-end">{t('installments.reports.receivedAmount')}</th><th className="hidden whitespace-nowrap p-2 text-start min-[480px]:table-cell">{t('installments.reports.paidFrom')}</th></tr></thead>
          <tbody>{receipts.map((row) => <tr key={row._id} className="border-b last:border-b-0 hover:bg-cyan-50/60">
            <td className="hidden whitespace-nowrap p-2 sm:table-cell">{row.transactionDate}</td>
            <td className="p-2 font-semibold text-blue-700">{hasPermission('installments.payments.view_history') ? <button type="button" className="text-start hover:underline" onClick={() => navigate(`/installments/payments/history?type=receipts&fromDate=${row.transactionDate}&toDate=${row.transactionDate}&reference=${encodeURIComponent(row.referenceNumber || '')}`)}>{formatInstallmentsDisplayRef(row.referenceNumber, 'reference')}</button> : formatInstallmentsDisplayRef(row.referenceNumber, 'reference')}</td>
            <td className="p-2 font-bold text-slate-800">{row.memberId?.fullName || '—'}{row.memberId?.mobile && <small className="block font-normal text-slate-500">{row.memberId.mobile}</small>}</td>
            <td className="hidden p-2 text-blue-700 md:table-cell">{row.committeeId ? formatInstallmentsDisplayRef(row.committeeId.committeeNumber, 'committee') : '—'}</td>
            <td className="whitespace-nowrap p-2 text-end font-black text-emerald-700">{money(row.amount)}</td>
            <td className="hidden p-2 min-[480px]:table-cell">{row.accountId?.name || '—'}</td>
          </tr>)}</tbody>
        </table>
        {!receipts.length && <p className="p-6 text-center text-sm font-semibold text-slate-500">{t('installments.reports.noReceivedPayments')}</p>}
      </div>}
    </div>
  </main>;
};

const DashboardOverdueList = ({ data, loading, error, filters, update, clear, navigate }) => {
  const query = String(filters.search || '').trim().toLocaleLowerCase();
  const allRows = asArray(data?.schedules).filter((row) => Number(row.remaining) > 0 && row.dueDate < filters.toDate);
  const committeeOptions = [...new Map(allRows.filter((row) => row.committee?._id).map((row) => [String(row.committee._id), row.committee])).values()].map((row) => ({ value: String(row._id), label: formatInstallmentsDisplayRef(row.committeeNumber, 'committee') }));
  const rows = allRows.filter((row) => {
    if (filters.committeeId && String(row.committee?._id || '') !== filters.committeeId) return false;
    if (!query) return true;
    return [row.member?.fullName, row.member?.mobile, row.member?.memberNumber, row.committee?.committeeNumber, formatInstallmentsDisplayRef(row.committee?.committeeNumber, 'committee')].some((value) => String(value || '').toLocaleLowerCase().includes(query));
  });
  const toolbar = <FocusedToolbar search={filters.search} onSearch={(value) => update('search', value)} searchLabel={t('installments.reports.searchMember')} filterValue={filters.committeeId} onFilter={(value) => update('committeeId', value)} filterLabel={t('installments.reports.allCommittees')} filterOptions={committeeOptions} onClear={clear} icon={FaUsers} />;
  return <FocusedPage toolbar={toolbar}><FocusedFrame loading={loading} error={error} dataReady={Boolean(data)} empty={!rows.length} emptyText={t('installments.reports.noOverdueInstallments')}><div className="max-w-full overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[680px] text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-start">{t('installments.reports.member')}</th><th className="p-2 text-start">{t('installments.reports.committee')}</th><th className="p-2 text-start">{t('date')}</th><th className="p-2 text-end">{t('installments.reports.scheduled')}</th><th className="p-2 text-end">{t('installments.reports.applied')}</th><th className="p-2 text-end">{t('installments.reports.remaining')}</th><th className="p-2 text-end">{t('installments.reports.daysOverdue')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.dueKey} className="border-b last:border-b-0 hover:bg-rose-50/60"><td className="p-2 font-bold"><button type="button" className="text-start text-blue-700 hover:underline" onClick={() => navigate(`/installments/members?memberId=${row.member?._id}`)}>{row.member?.fullName || '—'}</button></td><td className="p-2"><button type="button" className="text-blue-700 hover:underline" onClick={() => navigate(`/installments/committees?committeeId=${row.committee?._id}`)}>{formatInstallmentsDisplayRef(row.committee?.committeeNumber, 'committee')}</button></td><td className="p-2">{row.dueDate}</td><td className="p-2 text-end">{money(row.scheduledAmount)}</td><td className="p-2 text-end text-emerald-700">{money(row.appliedAmount)}</td><td className="p-2 text-end font-black text-rose-700">{money(row.remaining)}</td><td className="p-2 text-end font-bold text-rose-700">{row.daysOverdue}</td></tr>)}</tbody></table></div></FocusedFrame></FocusedPage>;
};

const DashboardBalanceList = ({ type, rows, dataReady, loading, error, filters, update, clear, navigate }) => {
  const supplier = type === 'payable';
  const query = String(filters.search || '').trim().toLocaleLowerCase();
  const filtered = asArray(rows).filter((row) => [supplier ? row.name : row.fullName, supplier ? row.phone : row.mobile, supplier ? row.supplierNumber : row.memberNumber].some((value) => String(value || '').toLocaleLowerCase().includes(query)));
  const toolbar = <FocusedToolbar search={filters.search} onSearch={(value) => update('search', value)} searchLabel={t(supplier ? 'installments.reports.searchSupplier' : 'installments.reports.searchMember')} onClear={clear} />;
  return <FocusedPage toolbar={toolbar}><FocusedFrame loading={loading} error={error} dataReady={dataReady} empty={!filtered.length} emptyText={t(supplier ? 'installments.reports.noSupplierPayables' : 'installments.reports.noCustomerReceivables')}><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-start">{t(supplier ? 'installments.reports.supplier' : 'installments.reports.member')}</th><th className="p-2 text-end">{t(supplier ? 'installments.reports.payable' : 'installments.reports.receivable')}</th><th className="w-16 p-2 text-center">{t('installments.reports.ledger')}</th></tr></thead><tbody>{filtered.map((row) => <tr key={row._id} className="border-b last:border-b-0 hover:bg-cyan-50"><td className="p-2 font-bold">{supplier ? row.name : row.fullName}<small className="block font-normal text-slate-500">{supplier ? row.phone : row.mobile}</small></td><td className={`p-2 text-end font-black ${supplier ? 'text-rose-700' : 'text-emerald-700'}`}>{money(supplier ? row.payable : row.receivable)}</td><td className="p-2 text-center"><button type="button" className="inline-grid h-8 w-8 place-items-center rounded-lg border text-blue-700" title={t('installments.reports.ledger')} aria-label={t('installments.reports.ledger')} onClick={() => navigate(supplier ? `/installments/suppliers?supplierId=${row._id}` : `/installments/members?memberId=${row._id}`)}><FaExternalLinkAlt aria-hidden="true" /></button></td></tr>)}</tbody></table></div></FocusedFrame></FocusedPage>;
};

const DashboardSavingsList = ({ data, loading, error, filters, update, clear, navigate }) => {
  const query = String(filters.search || '').trim().toLocaleLowerCase();
  const eligible = asArray(data?.rows).filter((row) => Number(row.availableSavings) > 0);
  const statuses = [...new Set(eligible.map((row) => row.closureType === 'settled' ? 'completed' : row.status).filter(Boolean))].map((value) => ({ value, label: t(`installments.committees.management.status.${value}`) }));
  const rows = eligible.filter((row) => {
    const status = row.closureType === 'settled' ? 'completed' : row.status;
    if (filters.status && status !== filters.status) return false;
    return !query || [row.member?.fullName, row.member?.mobile, row.member?.memberNumber, row.committeeNumber, formatInstallmentsDisplayRef(row.committeeNumber, 'committee')].some((value) => String(value || '').toLocaleLowerCase().includes(query));
  });
  const toolbar = <FocusedToolbar search={filters.search} onSearch={(value) => update('search', value)} searchLabel={t('installments.reports.searchMember')} filterValue={filters.status} onFilter={(value) => update('status', value)} filterLabel={t('installments.reports.allStatuses')} filterOptions={statuses} onClear={clear} />;
  return <FocusedPage toolbar={toolbar}><FocusedFrame loading={loading} error={error} dataReady={Boolean(data)} empty={!rows.length} emptyText={t('installments.reports.noAvailableSavings')}><div className="max-w-full overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[560px] text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-start">{t('installments.reports.member')}</th><th className="p-2 text-start">{t('installments.reports.committee')}</th><th className="p-2 text-end">{t('installments.reports.availableSavings')}</th><th className="p-2 text-start">{t('status')}</th><th className="w-16 p-2 text-center">{t('actions')}</th></tr></thead><tbody>{rows.map((row) => { const status = row.closureType === 'settled' ? 'completed' : row.status; return <tr key={row._id} className="border-b last:border-b-0 hover:bg-emerald-50/60"><td className="p-2 font-bold"><button type="button" className="text-start text-blue-700 hover:underline" onClick={() => navigate(`/installments/members?memberId=${row.member?._id}`)}>{row.member?.fullName || '—'}</button></td><td className="p-2"><button type="button" className="text-blue-700 hover:underline" onClick={() => navigate(`/installments/committees?committeeId=${row._id}`)}>{formatInstallmentsDisplayRef(row.committeeNumber, 'committee')}</button></td><td className="p-2 text-end font-black text-emerald-700">{money(row.availableSavings)}</td><td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 font-bold">{t(`installments.committees.management.status.${status}`)}</span></td><td className="p-2 text-center"><button type="button" className="inline-grid h-8 w-8 place-items-center rounded-lg border text-blue-700" title={t('view')} aria-label={t('view')} onClick={() => navigate(`/installments/committees?committeeId=${row._id}`)}><FaExternalLinkAlt aria-hidden="true" /></button></td></tr>; })}</tbody></table></div></FocusedFrame></FocusedPage>;
};

const DashboardSalesList = ({ data, loading, error, filters, update, clear, navigate }) => {
  const invoices = [...asArray(data?.sales).reduce((map, row) => {
    const key = String(row.invoiceId || row.invoiceNumber);
    const current = map.get(key) || { _id: row.invoiceId, invoiceNumber: row.invoiceNumber, invoiceDate: row.invoiceDate, member: row.member, totalSale: 0, purchaseCost: 0, grossProfit: 0, suppliers: new Map() };
    current.totalSale += Number(row.saleAmount || 0); current.purchaseCost += Number(row.purchaseCost || 0); current.grossProfit += Number(row.grossProfit || 0);
    if (row.supplier?._id) current.suppliers.set(String(row.supplier._id), row.supplier.name);
    map.set(key, current); return map;
  }, new Map()).values()];
  const supplierOptions = [...new Map(invoices.flatMap((row) => [...row.suppliers].map(([value, label]) => [value, { value, label }]))).values()];
  const query = String(filters.search || '').trim().toLocaleLowerCase();
  const rows = invoices.filter((row) => {
    if (filters.supplierId && !row.suppliers.has(filters.supplierId)) return false;
    return !query || [row.invoiceNumber, formatInstallmentsDisplayRef(row.invoiceNumber, 'invoice'), row.member?.fullName, row.member?.mobile, row.member?.memberNumber].some((value) => String(value || '').toLocaleLowerCase().includes(query));
  });
  const toolbar = <FocusedToolbar search={filters.search} onSearch={(value) => update('search', value)} searchLabel={t('installments.reports.searchInvoiceMember')} filterValue={filters.supplierId} onFilter={(value) => update('supplierId', value)} filterLabel={t('installments.reports.allSuppliers')} filterOptions={supplierOptions} onClear={clear} />;
  return <FocusedPage toolbar={toolbar}><FocusedFrame loading={loading} error={error} dataReady={Boolean(data)} empty={!rows.length} emptyText={t('installments.reports.noSalesInvoices')}><div className="max-w-full overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[680px] text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="p-2 text-start">{t('installments.reports.invoice')}</th><th className="p-2 text-start">{t('date')}</th><th className="p-2 text-start">{t('installments.reports.member')}</th><th className="p-2 text-end">{t('installments.reports.totalSales')}</th><th className="p-2 text-end">{t('installments.reports.cogs')}</th><th className="p-2 text-end">{t('installments.reports.grossProfit')}</th><th className="w-16 p-2 text-center">{t('actions')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row._id || row.invoiceNumber} className="border-b last:border-b-0 hover:bg-indigo-50/60"><td className="p-2 font-bold text-blue-700">{formatInstallmentsDisplayRef(row.invoiceNumber, 'invoice')}</td><td className="p-2">{row.invoiceDate}</td><td className="p-2 font-bold">{row.member?.fullName || '—'}</td><td className="p-2 text-end font-black text-indigo-700">{money(row.totalSale)}</td><td className="p-2 text-end text-rose-700">{money(row.purchaseCost)}</td><td className={`p-2 text-end font-black ${row.grossProfit < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{money(row.grossProfit)}</td><td className="p-2 text-center">{hasPermission('installments.invoices.view') && <button type="button" className="inline-grid h-8 w-8 place-items-center rounded-lg border text-blue-700" title={t('view')} aria-label={t('view')} onClick={() => navigate(`/installments/invoices/${row._id}`)}><FaExternalLinkAlt aria-hidden="true" /></button>}</td></tr>)}</tbody></table></div></FocusedFrame></FocusedPage>;
};

const ProfitSummary = ({ data, openDetail, onOpenModal }) => <><div className="overflow-hidden rounded-xl border bg-white"><Metric tone="indigo" label={t('installments.reports.totalSales')} value={data.summary.totalSales} onClick={() => openDetail('sales')} /><Metric tone="rose" label={t('installments.reports.cogsLess')} value={data.summary.cogs} onClick={() => openDetail('cogs')} /><Metric tone="cyan" label={t('installments.reports.grossProfitEquals')} value={data.summary.grossProfit} onClick={() => openDetail('products')} /><Metric tone="amber" label={t('installments.reports.operatingExpensesLess')} value={data.summary.operatingExpenses} onClick={data.summary.expensesApplicable ? () => openDetail('expenses') : null} /><Metric tone={Number(data.summary.netProfit) < 0 ? 'rose' : 'emerald'} label={t('installments.reports.netProfitEquals')} value={data.summary.netProfit} onClick={onOpenModal} /><Metric tone="violet" label={t('installments.reports.productProfitability')} value={data.summary.grossProfit} onClick={() => openDetail('products')} /></div>{!data.summary.expensesApplicable && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{t('installments.reports.unallocatedExpenseNote')}</p>}</>;
const CollectionSummary = ({ data, openDetail }) => <><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Metric tone="indigo" label={t('installments.reports.totalScheduled')} value={data.summary.totalScheduled} onClick={() => openDetail('schedules')} /><Metric tone="emerald" label={t('installments.reports.totalCollected')} value={data.summary.totalCollected} onClick={() => openDetail('receipts')} /><Metric tone="cyan" label={t('installments.reports.appliedScheduled')} value={data.summary.appliedScheduled} /><Metric tone="amber" label={t('installments.reports.remaining')} value={data.summary.remaining} onClick={() => openDetail('schedules')} /><Metric tone="rose" label={t('installments.reports.overdue')} value={data.summary.overdue} onClick={() => openDetail('schedules')} /><Metric tone="violet" label={t('installments.reports.excessCollection')} value={data.summary.excessCollection} /><Metric tone="indigo" label={t('installments.reports.performance')} value={data.summary.performancePercent} percent /></div><div className="rounded-xl border bg-white p-3 text-xs font-bold text-slate-600">{t('installments.reports.paid')}: <span className="text-emerald-700">{data.summary.paid}</span> · {t('installments.reports.partial')}: <span className="text-amber-700">{data.summary.partial}</span> · {t('installments.reports.unpaid')}: <span className="text-rose-700">{data.summary.unpaid}</span></div></>;
const ExpenseSummary = ({ data, openDetail }) => {
  const titleRows = asArray(data?.byTitle);
  return <><div className="overflow-hidden rounded-xl border bg-white"><Metric tone="amber" label={t('installments.reports.totalOperatingExpenses')} value={data.summary.totalOperatingExpenses} onClick={() => openDetail('expenses')} /></div><Table head={[t('title'), t('installments.reports.expenseCategory'), t('amount')]} empty={!titleRows.length}>{titleRows.map((row) => <tr key={row.label} className="border-b hover:bg-amber-50/50"><td className="p-2">{row.label}</td><td className="p-2">{row.count}</td><td className="p-2 font-bold text-amber-700">{money(row.amount)}</td></tr>)}</Table></>;
};

const BalanceTables = ({ type, members, suppliers, navigate }) => <div className={`grid gap-3 ${type === 'all' ? 'lg:grid-cols-2' : ''}`}>{type !== 'payable' && <Table head={[t('installments.reports.member'), t('installments.reports.receivable'), t('installments.reports.ledger')]} empty={!members.length}>{members.map((row) => <tr key={row._id} className="cursor-pointer border-b hover:bg-emerald-50" onClick={() => navigate(`/installments/members?memberId=${row._id}`)}><td className="p-2">{row.fullName}</td><td className="p-2 font-black text-emerald-700">{money(row.receivable)}</td><td className="p-2 text-blue-700"><FaExternalLinkAlt /></td></tr>)}</Table>}{type !== 'receivable' && <Table head={[t('installments.reports.supplier'), t('installments.reports.payable'), t('installments.reports.ledger')]} empty={!suppliers.length}>{suppliers.map((row) => <tr key={row._id} className="cursor-pointer border-b hover:bg-rose-50" onClick={() => navigate(`/installments/suppliers?supplierId=${row._id}`)}><td className="p-2">{row.name}</td><td className="p-2 font-black text-rose-700">{money(row.payable)}</td><td className="p-2 text-blue-700"><FaExternalLinkAlt /></td></tr>)}</Table>}</div>;
const SavingsTable = ({ data, navigate }) => <><div className="overflow-hidden rounded-xl border bg-white"><Metric tone="emerald" label={t('installments.reports.availableSavings')} value={data.summary.availableSavings} /></div><Table head={[t('installments.reports.member'), t('installments.reports.committee'), t('installments.reports.savingsContributions'), t('installments.reports.completedPayouts'), t('installments.reports.appliedAdvance'), t('installments.reports.availableSavings'), t('status')]} empty={!data.rows.length}>{data.rows.map((row) => <tr key={row._id} className="cursor-pointer border-b hover:bg-cyan-50" onClick={() => navigate(`/installments/committees?committeeId=${row._id}`)}><td className="p-2">{row.member?.fullName}</td><td className="p-2 font-semibold text-blue-700">{formatInstallmentsDisplayRef(row.committeeNumber, 'committee')}</td><td className="p-2 text-indigo-700">{money(row.contributions)}</td><td className="p-2 text-rose-700">{money(row.payouts)}</td><td className="p-2 text-amber-700">{money(row.appliedAdvance)}</td><td className="p-2 font-black text-emerald-700">{money(row.availableSavings)}</td><td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">{t(`installments.committees.management.status.${row.closureType === 'settled' ? 'completed' : row.status}`)}</span></td></tr>)}</Table></>;

const DetailTable = ({ type, data, close, navigate }) => <div className="rounded-xl border bg-white p-3"><div className="mb-2 flex justify-between"><h2 className="font-black">{t(`installments.reports.details.${type}`)}</h2><button onClick={close} className="text-sm font-bold text-slate-500">{t('close')}</button></div>{type === 'receipts' ? <Table head={[t('date'), t('installments.reports.reference'), t('installments.reports.member'), t('installments.reports.committee'), t('amount'), t('installments.reports.paidFrom'), t('status'), t('actions')]} empty={!data.receipts.length}>{data.receipts.map((row) => <tr key={row._id} className="border-b"><td className="p-2">{row.transactionDate}</td><td className="p-2">{formatInstallmentsDisplayRef(row.referenceNumber, 'reference')}</td><td className="p-2">{row.memberId?.fullName}</td><td className="p-2">{formatInstallmentsDisplayRef(row.committeeId?.committeeNumber, 'committee')}</td><td className="p-2 font-bold">{money(row.amount)}</td><td className="p-2">{row.accountId?.name}</td><td className="p-2">{row.status}</td><td className="p-2">{hasPermission('installments.payments.view_history') && <button type="button" className="font-bold text-blue-700" onClick={() => navigate(`/installments/payments/history?type=receipts&fromDate=${row.transactionDate}&toDate=${row.transactionDate}&reference=${encodeURIComponent(row.referenceNumber || '')}`)}>{t('view')}</button>}</td></tr>)}</Table> : type === 'schedules' ? <Table head={[t('date'), t('installments.reports.member'), t('installments.reports.committee'), t('installments.reports.scheduled'), t('installments.reports.applied'), t('installments.reports.remaining'), t('installments.reports.daysOverdue'), t('status')]} empty={!data.schedules.length}>{data.schedules.map((row) => <tr key={row.dueKey} className="border-b"><td className="p-2">{row.dueDate}</td><td className="p-2"><button className="text-blue-700" onClick={() => navigate(`/installments/members?memberId=${row.member?._id}`)}>{row.member?.fullName}</button></td><td className="p-2"><button className="text-blue-700" onClick={() => navigate(`/installments/committees?committeeId=${row.committee?._id}`)}>{formatInstallmentsDisplayRef(row.committee?.committeeNumber, 'committee')}</button></td><td className="p-2">{money(row.scheduledAmount)}</td><td className="p-2">{money(row.appliedAmount)}</td><td className="p-2 font-bold">{money(row.remaining)}</td><td className="p-2">{row.daysOverdue}</td><td className="p-2">{row.status}</td></tr>)}</Table> : type === 'expenses' ? <Table head={[t('date'), t('title'), t('installments.reports.expenseCategory'), t('installments.reports.paidFrom'), t('amount')]} empty={!(data.expenses || data.rows).length}>{(data.expenses || data.rows).map((row) => <tr key={row._id} className="border-b"><td className="p-2">{row.date}</td><td className="p-2">{row.title}</td><td className="p-2">{row.category?.name}</td><td className="p-2">{row.paidFrom?.map((account) => account.name).join(', ')}</td><td className="p-2">{money(row.amount)}</td></tr>)}</Table> : type === 'products' ? <Table head={[t('installments.reports.product'), t('installments.reports.quantity'), t('installments.reports.totalSales'), t('installments.reports.cogs'), t('installments.reports.grossProfit'), '%']} empty={!data.products.length}>{data.products.map((row) => <tr key={`${row.productName}-${row.category}`} className="border-b"><td className="p-2">{row.productName}</td><td className="p-2">{row.quantity}</td><td className="p-2">{money(row.totalSales)}</td><td className="p-2">{money(row.purchaseCost)}</td><td className="p-2">{money(row.grossProfit)}</td><td className="p-2">{row.grossMarginPercent}%</td></tr>)}</Table> : <Table head={[t('date'), t('installments.reports.invoice'), t('installments.reports.member'), t('installments.reports.supplier'), t('installments.reports.product'), t('installments.reports.quantity'), t('amount')]} empty={!data.sales.length}>{data.sales.map((row) => <tr key={row._id} className="cursor-pointer border-b hover:bg-cyan-50" onClick={() => navigate(`/installments/invoices/${row.invoiceId}`)}><td className="p-2">{row.invoiceDate}</td><td className="p-2 text-blue-700">{formatInstallmentsDisplayRef(row.invoiceNumber, 'invoice')}</td><td className="p-2">{row.member?.fullName}</td><td className="p-2">{row.supplier?.name || '—'}</td><td className="p-2">{row.productName}</td><td className="p-2">{row.quantity}</td><td className="p-2 font-bold">{money(type === 'cogs' ? row.purchaseCost : row.saleAmount)}</td></tr>)}</Table>}</div>;

export default InstallmentsReportsPage;
