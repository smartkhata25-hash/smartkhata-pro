import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaChartBar, FaFileAlt } from 'react-icons/fa';
import WeavingOperationalReport from '../../components/weaving/reports/WeavingOperationalReport';
import PartyWiseProductionModal from '../../components/weaving/PartyWiseProductionModal';
import { hasPermission } from '../../utils/permissionHelper';
import { t } from '../../i18n/i18n';

export default function WeavingProductionPage() {
  const [params, setParams] = useSearchParams();
  const canViewProduction = hasPermission('weaving.reports.view') || hasPermission('weaving.reports.production');
  const productionOpen = params.get('action') === 'party-production';
  const openProduction = () => {
    const next = new URLSearchParams(params);
    next.set('action', 'party-production');
    setParams(next, { replace: true });
  };
  const closeProduction = () => {
    const next = new URLSearchParams(params);
    next.delete('action');
    setParams(next, { replace: true });
  };
  return <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 p-3 sm:p-5 lg:p-6"><div className="mx-auto max-w-[1700px] space-y-4"><header className="flex flex-wrap items-center gap-3 border-b-2 border-cyan-600 bg-white px-4 py-4 shadow-sm"><span className="grid h-10 w-10 place-items-center bg-slate-900 text-white"><FaChartBar /></span><div className="mr-auto"><h1 className="text-2xl font-black">{t('weaving.operationalReports.production')}</h1><p className="text-sm font-semibold text-slate-500">{t('weaving.operationalReports.productionSubtitle')}</p></div>{canViewProduction && <button type="button" onClick={openProduction} className="inline-flex h-10 items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-4 text-sm font-bold text-cyan-800 hover:bg-cyan-100">{t('weaving.partyProduction.title')}</button>}<Link to="/weaving/reports?tab=production" className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-bold text-white"><FaFileAlt />{t('weaving.operationalReports.detailedReports')}</Link></header><WeavingOperationalReport kind="production" /></div>{productionOpen && canViewProduction && <PartyWiseProductionModal onClose={closeProduction} />}</div>;
}
