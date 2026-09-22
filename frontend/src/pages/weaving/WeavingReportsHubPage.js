import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaChartLine, FaFileInvoiceDollar } from 'react-icons/fa';
import WeavingOperationalReport from '../../components/weaving/reports/WeavingOperationalReport';
import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';
import WeavingReportsPage from './WeavingReportsPage';

const definitions = [
  ['salary','salaryClosingSheet','payroll.view'], ['production','productionReport','weaving.reports.production'], ['looms','loomPerformance','weaving.looms.view_performance'], ['quality','qualityProduction','weaving.reports.production'], ['stock','fabricStockReport','weaving.reports.stock'], ['sales','salesConversion','weaving.reports.sales'], ['rejection','pendingRejection','weaving.reports.sales'], ['profit','profitReport','weaving.reports.profit'],
];

export default function WeavingReportsHubPage() {
  const [params, setParams] = useSearchParams(); const available = definitions.filter(([key, , permission]) => hasPermission(permission) || (!['salary', 'profit'].includes(key) && hasPermission('weaving.reports.view'))); const requested = params.get('tab'); const active = available.some(([key]) => key === requested) ? requested : available[0]?.[0] || 'salary';
  return <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-3 sm:p-5 lg:p-6"><div className="mx-auto max-w-[1750px] space-y-4"><header className="flex items-center gap-3 border-b-2 border-indigo-600 bg-white px-4 py-4 shadow-sm"><span className="grid h-10 w-10 place-items-center bg-slate-900 text-white"><FaChartLine /></span><div><h1 className="text-2xl font-black">{t('weaving.operationalReports.reports')}</h1><p className="text-sm font-semibold text-slate-500">{t('weaving.operationalReports.reportsSubtitle')}</p></div></header><nav className="flex overflow-x-auto border bg-white p-1 shadow-sm">{available.map(([key,label]) => <button key={key} onClick={() => setParams({ tab: key })} className={`inline-flex min-w-max items-center gap-2 px-4 py-2.5 text-sm font-bold ${active === key ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><FaFileInvoiceDollar />{t(`weaving.operationalReports.${label}`)}</button>)}</nav>{active === 'salary' ? <WeavingReportsPage /> : <WeavingOperationalReport kind={active} />}</div></div>;
}
