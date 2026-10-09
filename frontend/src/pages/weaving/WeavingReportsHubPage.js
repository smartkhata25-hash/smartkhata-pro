import React from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FaBalanceScale, FaBook, FaChartLine, FaFileInvoiceDollar, FaGem } from 'react-icons/fa';

import WeavingOperationalReport from '../../components/weaving/reports/WeavingOperationalReport';
import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';

const definitions = [
  ['production', 'productionReport', 'weaving.reports.production'],
  ['looms', 'loomPerformance', 'weaving.looms.view_performance'],
  ['quality', 'qualityProduction', 'weaving.reports.production'],
  ['stock', 'fabricStockReport', 'weaving.reports.stock'],
  ['sales', 'salesConversion', 'weaving.reports.sales'],
  ['rejection', 'pendingRejection', 'weaving.reports.sales'],
  ['profit', 'profitReport', 'weaving.reports.profit'],
];

export default function WeavingReportsHubPage() {
  const [params, setParams] = useSearchParams();
  if (params.get('tab') === 'salary') {
    const next = new URLSearchParams(params);
    next.delete('tab');
    return <Navigate replace to={`/weaving/payroll/salary-closing${next.toString() ? `?${next}` : ''}`} />;
  }

  const available = definitions.filter(([key, , permission]) =>
    hasPermission(permission) || (key !== 'profit' && hasPermission('weaving.reports.view'))
  );
  const requested = params.get('tab');
  const active = available.some(([key]) => key === requested) ? requested : available[0]?.[0];
  const quickReports = [
    hasPermission('reports.general_ledger') && { label: t('weaving.sidebar.generalLedger'), path: '/weaving/general-ledger', icon: FaBook },
    hasPermission('reports.trial_balance') && { label: t('reports.trialBalance'), path: '/weaving/trial-balance', icon: FaBalanceScale },
    hasPermission('business_value.view') && { label: t('businessValue.menuLabel'), path: '/weaving/business-value', icon: FaGem },
  ].filter(Boolean);

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1750px] space-y-4">
        <header className="flex items-center gap-3 border-b-2 border-indigo-600 bg-white px-4 py-4 shadow-sm">
          <span className="grid h-10 w-10 place-items-center bg-slate-900 text-white"><FaChartLine /></span>
          <div><h1 className="text-2xl font-black">{t('weaving.operationalReports.reports')}</h1><p className="text-sm font-semibold text-slate-500">{t('weaving.operationalReports.reportsSubtitle')}</p></div>
        </header>

        {quickReports.length > 0 && <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{quickReports.map(({ label, path, icon: Icon }) => <Link key={path} to={path} className="flex items-center gap-3 rounded-xl border border-teal-100 bg-gradient-to-r from-white to-teal-50 p-4 font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-teal-600 to-indigo-700 text-white"><Icon /></span>{label}</Link>)}</nav>}

        {available.length > 0 ? <>
          <nav className="flex overflow-x-auto border bg-white p-1 shadow-sm">{available.map(([key, label]) => <button type="button" key={key} onClick={() => setParams({ tab: key })} className={`inline-flex min-w-max items-center gap-2 px-4 py-2.5 text-sm font-bold ${active === key ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><FaFileInvoiceDollar />{t(`weaving.operationalReports.${label}`)}</button>)}</nav>
          <WeavingOperationalReport kind={active} />
        </> : <section className="rounded-xl border border-teal-100 bg-white p-8 text-center font-bold text-slate-600 shadow-sm">Choose an available financial report above.</section>}
      </div>
    </div>
  );
}
