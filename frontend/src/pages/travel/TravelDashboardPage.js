import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { FaPlaneDeparture, FaSyncAlt } from 'react-icons/fa';

import TravelQuickAction from '../../components/travel/dashboard/TravelQuickAction';
import TravelSummaryCard from '../../components/travel/dashboard/TravelSummaryCard';
import {
  EMPTY_TRAVEL_DASHBOARD_SUMMARY,
  travelFinancialSummaryCards,
  travelOperationalSummaryCards,
  travelQuickActions,
} from '../../components/travel/dashboard/travelDashboardConfig';
import { t } from '../../i18n/i18n';
import { fetchTravelDashboardSummary } from '../../services/travelMasterService';
import { hasAnyPermission, hasPermission } from '../../utils/permissionHelper';
import TravelProfitSummaryModal from '../../components/travel/reports/TravelProfitSummaryModal';

const formatDashboardValue = (value, format) => {
  const safeValue = Number(value || 0);

  if (format === 'currency') {
    return `${t('currency.rs')} ${safeValue.toLocaleString('en-GB')}`;
  }

  return safeValue.toLocaleString('en-GB');
};

const renderSummaryCards = (
  cards,
  summary,
  onCardClick,
  reminderSummary = null,
  onOpenReminderCenter = null
) => (
  <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
    {cards.map((card) => (
      <TravelSummaryCard
        key={card.key}
        card={card}
        value={formatDashboardValue(summary[card.key], card.format)}
        onCardClick={onCardClick}
        reminderSummary={card.key === 'upcomingDepartures' ? reminderSummary : null}
        onOpenReminderCenter={card.key === 'upcomingDepartures' ? onOpenReminderCenter : null}
      />
    ))}
  </div>
);

const TravelDashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const outletContext = useOutletContext() || {};
  const fetchTravelDashboardSummaryFromLayout = outletContext.fetchTravelDashboardSummary;
  const layoutTravelDashboardSummary = outletContext.travelDashboardSummary;
  const layoutTravelDashboardSummaryLoading = outletContext.travelDashboardSummaryLoading;
  const layoutTravelDashboardSummaryLoadedAt = outletContext.travelDashboardSummaryLoadedAt;
  const travelReminderSummary = outletContext.travelReminderSummary || {};
  const openTravelReminderCenter = outletContext.openTravelReminderCenter;
  const [summary, setSummary] = useState(EMPTY_TRAVEL_DASHBOARD_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const activeLoadRef = useRef(true);
  const handledRefreshSignalRef = useRef('');

  const loadSummary = useCallback(
    async (options = {}) => {
      try {
        setLoading(true);
        setPageError('');

        const data = fetchTravelDashboardSummaryFromLayout
          ? await fetchTravelDashboardSummaryFromLayout({
              forceRefresh: Boolean(options.forceRefresh),
            })
          : await fetchTravelDashboardSummary({
              forceRefresh: Boolean(options.forceRefresh),
            });

        if (activeLoadRef.current) {
          setSummary({
            ...EMPTY_TRAVEL_DASHBOARD_SUMMARY,
            ...(data || {}),
          });
        }
      } catch (error) {
        console.error('Travel dashboard summary load failed:', error);

        if (activeLoadRef.current) {
          setPageError(t('travel.dashboard.loadFailed'));
        }
      } finally {
        if (activeLoadRef.current) {
          setLoading(false);
        }
      }
    },
    [fetchTravelDashboardSummaryFromLayout]
  );

  useEffect(() => {
    activeLoadRef.current = true;

    const refreshSignal =
      location.state?.refreshTravelDashboard || location.state?.travelDashboardRefreshAt || '';
    const shouldForceRefresh = Boolean(refreshSignal);
    const signalKey = shouldForceRefresh ? `${location.key}:${refreshSignal}` : location.key;

    if (shouldForceRefresh && handledRefreshSignalRef.current === signalKey) {
      return () => {
        activeLoadRef.current = false;
      };
    }

    if (shouldForceRefresh) {
      handledRefreshSignalRef.current = signalKey;
    }

    if (
      !shouldForceRefresh &&
      fetchTravelDashboardSummaryFromLayout &&
      layoutTravelDashboardSummaryLoadedAt
    ) {
      return () => {
        activeLoadRef.current = false;
      };
    }

    loadSummary({ forceRefresh: shouldForceRefresh });

    return () => {
      activeLoadRef.current = false;
    };
  }, [
    fetchTravelDashboardSummaryFromLayout,
    layoutTravelDashboardSummaryLoadedAt,
    loadSummary,
    location.key,
    location.state?.refreshTravelDashboard,
    location.state?.travelDashboardRefreshAt,
  ]);

  const quickActions = useMemo(
    () =>
      travelQuickActions.map((action) => ({
        ...action,
        disabled:
          action.disabled ||
          (action.permission ? !hasPermission(action.permission) : false) ||
          (action.anyPermissions ? !hasAnyPermission(action.anyPermissions) : false),
      })),
    []
  );

  const openSummaryCard = (card) => {
    if (card.key === 'netProfit') {
      setProfitModalOpen(true);
      return;
    }

    if (!card.route) return;

    const query = new URLSearchParams(card.filter || {}).toString();

    navigate(query ? `${card.route}?${query}` : card.route);
  };

  const displaySummary = useMemo(
    () => ({
      ...EMPTY_TRAVEL_DASHBOARD_SUMMARY,
      ...summary,
      ...(layoutTravelDashboardSummary || {}),
    }),
    [layoutTravelDashboardSummary, summary]
  );
  const displayLoading = loading || Boolean(layoutTravelDashboardSummaryLoading);

  return (
    <div className="travel-dashboard-shell min-h-full min-w-0 space-y-4 overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-3 sm:p-4 md:p-5 lg:p-6">
      <header className="overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
        <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
        <div className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-blue-700 text-base text-white shadow-sm shadow-cyan-200 ring-1 ring-cyan-200">
              <FaPlaneDeparture aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <h1 className="text-xl font-extrabold leading-tight text-slate-950 md:text-2xl">
                {t('travel.dashboard.title')}
              </h1>
              <p className="mt-0.5 text-sm font-semibold text-slate-500">
                {t('travel.dashboard.compactSubtitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadSummary({ forceRefresh: true })}
              disabled={displayLoading}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-extrabold text-cyan-800 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <FaSyncAlt aria-hidden="true" className={displayLoading ? 'animate-spin' : ''} />
              {displayLoading ? t('travel.common.loading') : t('travel.common.refresh')}
            </button>
            <span className="inline-flex w-fit rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800">
              {`${t('travel.dashboard.liveDataBadge')}: ${Number(displaySummary.totalBookings || 0).toLocaleString('en-GB')}`}
            </span>
          </div>
        </div>
      </header>

      {pageError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      <section className="space-y-3" aria-label={t('travel.dashboard.sections.operationalSummary')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
            {t('travel.dashboard.sections.operationalSummary')}
          </h2>
        </div>

        {renderSummaryCards(
          travelOperationalSummaryCards,
          displaySummary,
          openSummaryCard,
          travelReminderSummary,
          openTravelReminderCenter
        )}
      </section>

      <section className="space-y-3" aria-label={t('travel.dashboard.sections.financialSummary')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
            {t('travel.dashboard.sections.financialSummary')}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {travelFinancialSummaryCards.map((card) => (
            <TravelSummaryCard
              key={card.key}
              card={card}
              value={formatDashboardValue(displaySummary[card.key], card.format)}
              onCardClick={openSummaryCard}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
            {t('travel.dashboard.sections.quickActions')}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 md:grid-cols-3">
          {quickActions.map((action) => (
            <TravelQuickAction key={action.key} action={action} />
          ))}
        </div>
      </section>

      <TravelProfitSummaryModal
        isOpen={profitModalOpen}
        onClose={() => setProfitModalOpen(false)}
        data={displaySummary}
      />
    </div>
  );
};

export default TravelDashboardPage;
