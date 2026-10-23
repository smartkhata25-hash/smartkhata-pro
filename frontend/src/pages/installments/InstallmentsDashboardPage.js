import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import InstallmentsSummaryCard from '../../components/installments/dashboard/InstallmentsSummaryCard';
import {
  installmentsQuickActions,
  installmentsSummaryCards,
} from '../../components/installments/dashboard/installmentsDashboardConfig';
import { t } from '../../i18n/i18n';
import { hasPermission } from '../../utils/permissionHelper';
import { getInstallmentsPaymentDashboard, getInstallmentsPaymentDashboardCacheSnapshot } from '../../services/installmentsPaymentService';
import { getInstallmentsCommitteesPage, getInstallmentsCommitteesPageCacheSnapshot } from '../../services/installmentsCommitteeService';
import InstallmentsProfitModal from '../../components/installments/reports/InstallmentsProfitModal';

const InstallmentsDashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [metrics, setMetrics] = useState(null);
  const [committeeSummary, setCommitteeSummary] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [committeeLoading, setCommitteeLoading] = useState(true);
  const [metricsError, setMetricsError] = useState('');
  const [committeeError, setCommitteeError] = useState('');
  const [metricsStale, setMetricsStale] = useState(false);
  const [committeeStale, setCommitteeStale] = useState(false);
  const [profitOpen, setProfitOpen] = useState(false);
  const canViewCommittees = hasPermission('installments.committees.view') || hasPermission('installments.committees.manage');
  const loadDashboard = useCallback(() => {
    const canViewMetrics = hasPermission('installments.payments.view_collections') || hasPermission('installments.reports.profit') || hasPermission('installments.reports.receivables');
    if (canViewMetrics) {
      const snapshot = getInstallmentsPaymentDashboardCacheSnapshot();
      if (snapshot?.data) { setMetrics(snapshot.data); setMetricsStale(snapshot.isStale); }
      setMetricsLoading(!snapshot?.data); setMetricsError('');
      getInstallmentsPaymentDashboard().then((data) => { setMetrics(data); setMetricsStale(false); }).catch((error) => { setMetricsError(error?.response?.data?.message || error?.message || t('installments.dashboard.loadError')); setMetricsStale(true); }).finally(() => setMetricsLoading(false));
    } else { setMetrics(null); setMetricsLoading(false); }
    if (canViewCommittees) {
      const params = { status: 'all', page: 1, limit: 1 };
      const snapshot = getInstallmentsCommitteesPageCacheSnapshot(params);
      if (snapshot?.data) { setCommitteeSummary(snapshot.data.fundingSummary || {}); setCommitteeStale(snapshot.isStale); }
      setCommitteeLoading(!snapshot?.data); setCommitteeError('');
      getInstallmentsCommitteesPage(params).then((data) => { setCommitteeSummary(data.fundingSummary || {}); setCommitteeStale(false); }).catch((error) => { setCommitteeError(error?.response?.data?.message || error?.message || t('installments.dashboard.loadError')); setCommitteeStale(true); }).finally(() => setCommitteeLoading(false));
    } else { setCommitteeSummary(null); setCommitteeLoading(false); }
  }, [canViewCommittees]);
  useEffect(() => {
    loadDashboard();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadDashboard();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [loadDashboard]);
  const values = {
    expectedCollection: metrics?.collections?.expected,
    received: metrics?.collections?.actuallyReceived,
    overdue: metrics?.collections?.previousOverdue,
    customerReceivables: metrics?.customerReceivables,
    supplierPayables: metrics?.supplierPayables,
    committeeSavings: metrics?.unappliedCustomerSavings,
    totalSales: metrics?.totalSales,
    netProfit: metrics?.netProfit,
  };
  const openCard = (key) => {
    const date = metrics?.date;
    const period = metrics?.profitPeriod;
    if (key === 'expectedCollection') navigate('/installments/collections/today');
    else if (key === 'received' && date) navigate(`/installments/reports?tab=collections&detail=receipts&scope=dashboard_received&fromDate=${date}&toDate=${date}`);
    else if (key === 'overdue' && date) navigate(`/installments/reports?tab=collections&detail=schedules&scope=dashboard_overdue&status=overdue&fromDate=${date}&toDate=${date}`);
    else if (key === 'customerReceivables') navigate('/installments/reports?tab=balances&balanceType=receivable&scope=dashboard_receivables');
    else if (key === 'supplierPayables') navigate('/installments/reports?tab=balances&balanceType=payable&scope=dashboard_payables');
    else if (key === 'committeeSavings') navigate('/installments/reports?tab=savings&scope=dashboard_savings');
    else if (key === 'totalSales' && period) navigate(`/installments/reports?tab=profit&detail=sales&scope=dashboard_sales&fromDate=${period.fromDate}&toDate=${period.toDate}`);
    else if (key === 'netProfit') setProfitOpen(true);
  };

  return (
  <main className="min-h-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/60 px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
    <div className="mx-auto w-full max-w-[1500px]">
      {location.state?.installmentsNotice && <div role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{location.state.installmentsNotice}</div>}
      {(metricsError || metricsStale) && <div role={metricsError ? 'alert' : 'status'} className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><span>{metricsStale && metrics ? t('installments.dashboard.staleData') : metricsError}</span><button type="button" onClick={loadDashboard} className="flex-none rounded-lg border border-amber-300 bg-white px-3 py-1.5">{t('installments.dashboard.retry')}</button></div>}
      <section aria-label={t('installments.dashboard.summary')}>
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {installmentsSummaryCards.filter((card) => !card.permission || hasPermission(card.permission)).map((card) => (
            <InstallmentsSummaryCard key={card.key} card={card} value={values[card.key]} loading={metricsLoading && metrics === null} unavailable={Boolean(metricsError) && metrics === null} onClick={metrics ? () => openCard(card.key) : null} />
          ))}
        </div>
      </section>
      {canViewCommittees && <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('installments.dashboard.committeeStatus.title')}>
        {(committeeError || committeeStale) && <div role={committeeError ? 'alert' : 'status'} className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 sm:col-span-4"><span>{committeeStale && committeeSummary ? t('installments.dashboard.staleData') : committeeError}</span><button type="button" onClick={loadDashboard} className="flex-none rounded-lg border border-amber-300 bg-white px-3 py-1.5">{t('installments.dashboard.retry')}</button></div>}
        {[
          ['paid', 'paidInFull', 'text-emerald-700'],
          ['partial', 'partiallyPaid', 'text-amber-700'],
          ['unpaid', 'notPaid', 'text-rose-700'],
          ['overdue', 'overduePlans', 'text-rose-800'],
        ].map(([funding, labelKey, tone]) => <button type="button" key={funding} disabled={!committeeSummary} onClick={() => committeeSummary && navigate(`/installments/committees?status=all&funding=${funding}&scope=dashboard_committee`)} aria-label={t(`installments.dashboard.committeeStatus.${labelKey}`)} className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-start shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-default disabled:hover:translate-y-0"><p className="text-[10px] font-black uppercase text-slate-400">{t(`installments.dashboard.committeeStatus.${labelKey}`)}</p><p className={`text-lg font-black ${tone}`}>{committeeLoading && committeeSummary === null ? '…' : committeeSummary === null ? '—' : Number(committeeSummary?.[funding] || 0)}</p></button>)}
      </section>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('installments.dashboard.quickActions.title')}>
        {installmentsQuickActions.map((action) => {
          const Icon = action.icon;
          const enabled = action.enabled && (!action.permission || hasPermission(action.permission));
          return (
            <button
              key={action.key}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && action.path && navigate(action.path)}
              aria-label={t(`installments.dashboard.quickActions.${action.key}`)}
              className={`group flex min-h-[86px] items-center gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br ${action.tone} px-3 py-3 text-start shadow-sm sm:min-h-[96px] sm:px-4 ${enabled ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md' : 'cursor-not-allowed opacity-80'}`}
            >
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${action.iconTone} text-white shadow-md sm:h-11 sm:w-11`}>
                <Icon aria-hidden="true" />
              </span>
              <span className="min-w-0 text-xs font-extrabold leading-4 text-slate-700 sm:text-sm">
                {t(`installments.dashboard.quickActions.${action.key}`)}
              </span>
            </button>
          );
        })}
      </div>
      <InstallmentsProfitModal open={profitOpen} onClose={() => setProfitOpen(false)} initialRange={metrics?.profitPeriod} />
    </div>
  </main>
  );
};

export default InstallmentsDashboardPage;

