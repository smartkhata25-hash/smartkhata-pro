import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaMoneyBillWave } from 'react-icons/fa';

import WeavingSummaryCard from '../../components/weaving/dashboard/WeavingSummaryCard';
import WeavingProfitSummaryModal from '../../components/weaving/profit/WeavingProfitSummaryModal';
import {
  EMPTY_WEAVING_DASHBOARD_SUMMARY,
  weavingDashboardCards,
} from '../../components/weaving/dashboard/weavingDashboardConfig';
import { t } from '../../i18n/i18n';
import { getAllExpenses } from '../../services/expenseService';
import { getWeavingAttendanceSummary } from '../../services/weavingAttendanceService';
import { getWeavingPayrollSummary } from '../../services/weavingPayrollService';
import { getYarnStockSummary } from '../../services/weavingYarnStockService';
import { listWeavingLooms } from '../../services/weavingOperationsService';
import { getWeavingDashboardSummary } from '../../services/weavingReportService';
import { buildWeavingRouteState } from '../../utils/weavingContext';
import { hasPermission } from '../../utils/permissionHelper';

const EMPTY_VALUE = '\u2014';

const formatDashboardValue = (value, format) => {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE;
  }

  if (format === 'attendance') {
    if (!value || typeof value !== 'object') {
      return EMPTY_VALUE;
    }

    const present = Number(value.present || 0);
    const total = Number(value.total || 0);

    return `${t('weaving.attendance.present')} ${present.toLocaleString(
      'en-GB'
    )} / ${total.toLocaleString('en-GB')}`;
  }

  if (format === 'profit' && typeof value === 'object') {
    return value.status === 'exact'
      ? `${t('currency.rs')} ${Number(value.amount || 0).toLocaleString('en-GB')}`
      : 'Provisional';
  }

  if (format === 'looms' && typeof value === 'object') {
    return `${t('weaving.dashboard.looms.total')} ${Number(value.total || 0).toLocaleString(
      'en-GB'
    )} / ${t('weaving.dashboard.looms.active')} ${Number(value.active || 0).toLocaleString(
      'en-GB'
    )}`;
  }

  const safeValue = Number(value);

  if (!Number.isFinite(safeValue)) {
    return EMPTY_VALUE;
  }

  if (format === 'currency') {
    return `${t('currency.rs')} ${safeValue.toLocaleString('en-GB')}`;
  }

  if (format === 'meters') {
    return `${safeValue.toLocaleString('en-GB')} ${t('weaving.units.meters')}`;
  }

  if (format === 'kg') {
    return `${safeValue.toLocaleString('en-GB')} KG`;
  }

  return safeValue.toLocaleString('en-GB');
};

const WeavingDashboardPage = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState({
    ...EMPTY_WEAVING_DASHBOARD_SUMMARY,
  });
  const [profitOpen, setProfitOpen] = useState(false);

  const canViewProfit = hasPermission('weaving.reports.profit');
  const canViewLooms = hasPermission('weaving.masters.view');

  const canUsePayments =
    hasPermission('weaving.payments.view') && hasPermission('weaving.payments.create');

  useEffect(() => {
    let cancelled = false;

    const fetchDashboardSummary = async () => {
      try {
        const [
          expenseResult,
          attendanceResult,
          payrollResult,
          stockResult,
          operationsResult,
          loomResult,
        ] =
          await Promise.allSettled([
            getAllExpenses({ moduleScope: 'weaving' }),
            getWeavingAttendanceSummary(),
            getWeavingPayrollSummary(),
            getYarnStockSummary(),
            getWeavingDashboardSummary(),
            canViewLooms ? listWeavingLooms() : Promise.resolve([]),
          ]);

        if (!cancelled) {
          const nextSummary = {};

          if (expenseResult.status === 'fulfilled') {
            nextSummary.totalExpenses = expenseResult.value.reduce(
              (sum, expense) => sum + Number(expense.amount || 0),
              0
            );
          }

          if (attendanceResult.status === 'fulfilled') {
            nextSummary.attendance = {
              present: Number(attendanceResult.value?.present || 0),
              total: Number(attendanceResult.value?.total || 0),
            };
          }

          if (payrollResult.status === 'fulfilled') {
            nextSummary.payrollDue = Number(payrollResult.value?.remaining || 0);
          }

          if (stockResult.status === 'fulfilled') {
            nextSummary.stockSummary = Number(stockResult.value?.totals?.totalKg || 0);
          }

          if (loomResult.status === 'fulfilled') {
            nextSummary.looms = {
              total: loomResult.value.length,
              active: loomResult.value.filter((loom) => loom.isActive !== false).length,
            };
          }

          if (operationsResult.status === 'fulfilled') {
            nextSummary.productionMeters = Number(operationsResult.value?.productionMeters || 0);

            nextSummary.salesRevenue = Number(operationsResult.value?.salesRevenue || 0);

            nextSummary.purchaseTotal = Number(operationsResult.value?.purchaseTotal || 0);

            nextSummary.readyToInvoice = Number(operationsResult.value?.readyToInvoice || 0);

            nextSummary.pendingRejectionMeter = Number(
              operationsResult.value?.pendingRejectionMeter || 0
            );

            nextSummary.netProfit = {
              status: operationsResult.value?.profitStatus || 'partial',
              amount: operationsResult.value?.netProfit,
            };
          }

          setSummary((previous) => ({
            ...previous,
            ...nextSummary,
          }));
        }
      } catch (error) {
        console.error('Weaving dashboard summary load failed:', error);
      }
    };

    fetchDashboardSummary();

    return () => {
      cancelled = true;
    };
  }, [canViewLooms]);

  const openSummaryCard = (card) => {
    if (card.key === 'netProfit') {
      if (canViewProfit) {
        setProfitOpen(true);
      }
      return;
    }

    if (!card.route) return;

    navigate(card.route, {
      state: buildWeavingRouteState('/weaving/dashboard'),
    });
  };

  const visibleDashboardCards = weavingDashboardCards.filter((card) => {
    if (card.permission && !hasPermission(card.permission)) {
      return false;
    }

    if (
      card.anyPermissions?.length &&
      !card.anyPermissions.some((permission) => hasPermission(permission))
    ) {
      return false;
    }

    return true;
  });

  const openDashboardRoute = (route) => {
    navigate(route, {
      state: buildWeavingRouteState('/weaving/dashboard'),
    });
  };

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 p-3 sm:p-4 md:p-5 lg:p-6">
      <section aria-label={t('weaving.dashboard.sections.summary')}>
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleDashboardCards.map((card) => (
            <WeavingSummaryCard
              key={card.key}
              card={card.key === 'netProfit' && !canViewProfit ? { ...card, route: '' } : card}
              value={card.displayValueKey
                ? t(card.displayValueKey)
                : formatDashboardValue(summary[card.key], card.format)}
              onCardClick={openSummaryCard}
            />
          ))}

          {canUsePayments && (
            <div className="group relative flex min-h-[158px] flex-col overflow-hidden rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-700">
                      {t('weaving.dashboard.payments.title')}
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-500">Receive & Pay</p>
                  </div>

                  <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg text-white shadow-md shadow-indigo-200 ring-2 ring-indigo-100 transition-transform duration-200 group-hover:scale-105">
                    <FaMoneyBillWave aria-hidden="true" />
                  </span>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => openDashboardRoute('/weaving/payments?tab=receive')}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-2 text-xs font-extrabold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 sm:text-sm"
                  >
                    <span className="whitespace-nowrap">{t('weaving.nav.receivePayment')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openDashboardRoute('/weaving/payments?tab=pay')}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-white/90 px-2 text-xs font-extrabold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 sm:text-sm"
                  >
                    <FaMoneyBillWave className="flex-shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{t('weaving.nav.payBill')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {profitOpen && (
        <WeavingProfitSummaryModal
          onClose={() => setProfitOpen(false)}
          onOpenFullReport={() => {
            setProfitOpen(false);

            navigate('/weaving/reports?tab=profit', {
              state: buildWeavingRouteState('/weaving/dashboard'),
            });
          }}
        />
      )}
    </div>
  );
};

export default WeavingDashboardPage;
