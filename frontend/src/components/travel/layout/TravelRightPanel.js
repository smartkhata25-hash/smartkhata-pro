import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaChevronDown,
  FaChevronUp,
  FaExternalLinkAlt,
  FaMoneyBillWave,
  FaPlaneDeparture,
  FaSyncAlt,
  FaUsers,
} from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import { formatDateWithOptionalTime } from '../../../utils/localDateTime';
import { buildTravelRouteState } from '../../../utils/travelContext';
import BalanceBreakdownModal from '../../BalanceBreakdownModal';

import {
  EMPTY_TRAVEL_DASHBOARD_SUMMARY,
  travelRightPanelSections,
  travelToneClasses,
} from '../dashboard/travelDashboardConfig';

const appendQuery = (path, params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  return queryString ? `${path}?${queryString}` : path;
};

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatPanelValue = (value, format) => {
  const safeValue = safeNumber(value);

  if (format === 'currency') {
    return `${t('currency.rs')} ${safeValue.toLocaleString('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  return safeValue.toLocaleString('en-GB');
};

const normalizeBreakdownItems = (records = [], defaultEntityType) => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((item) => {
      const amount = safeNumber(
        item?.amount ??
          item?.balance ??
          item?.currentBalance ??
          item?.currentReceivable ??
          item?.currentPayable ??
          item?.receivable ??
          item?.payable
      );

      return {
        ...item,
        entityId:
          item?.entityId ||
          item?.customerId ||
          item?.partyId ||
          item?.supplierId ||
          item?.vendorId ||
          item?._id ||
          '',
        accountId: item?.accountId || '',
        entityType: item?.entityType || defaultEntityType,
        name: item?.name || item?.customerName || item?.supplierName || item?.vendorName || '-',
        amount: Math.abs(amount),
      };
    })
    .filter((item) => item.entityId && item.amount > 0);
};

const TravelBalanceCard = ({ type, value, onClick }) => {
  const isReceivable = type === 'receivable';

  const Icon = isReceivable ? FaUsers : FaMoneyBillWave;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        isReceivable
          ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-white focus-visible:outline-amber-400'
          : 'border-rose-200 bg-gradient-to-br from-rose-50 via-red-50 to-white focus-visible:outline-rose-400'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${
              isReceivable
                ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                : 'bg-gradient-to-br from-rose-500 to-red-600'
            }`}
          >
            <Icon aria-hidden="true" className="text-sm" />
          </span>

          <span
            className={`text-sm font-extrabold ${
              isReceivable ? 'text-amber-800' : 'text-rose-800'
            }`}
          >
            {isReceivable ? t('receivables') : t('payables')}
          </span>
        </div>

        <FaExternalLinkAlt
          aria-hidden="true"
          className={`flex-shrink-0 text-xs ${isReceivable ? 'text-amber-600' : 'text-rose-600'}`}
        />
      </div>

      <div
        className={`mt-3 text-xl font-extrabold ${
          isReceivable ? 'text-amber-700' : 'text-rose-700'
        }`}
      >
        {formatPanelValue(value, 'currency')}
      </div>
    </button>
  );
};

const TravelPanelSection = ({ section, summary, onOpen }) => {
  const [open, setOpen] = useState(true);

  const Icon = section.icon;

  const tone = travelToneClasses[section.tone] || travelToneClasses.neutral;

  const ToggleIcon = open ? FaChevronUp : FaChevronDown;

  const upcomingBookings = Array.isArray(summary[section.listKey]) ? summary[section.listKey] : [];

  const renderMetricRows = () => (
    <div className="space-y-2">
      {(section.items || []).map((item) => {
        const itemTone = travelToneClasses[item.tone] || travelToneClasses.neutral;

        const ItemIcon = item.icon || Icon;

        const canOpen = Boolean(item.route);

        const Container = canOpen ? 'button' : 'div';

        return (
          <Container
            key={item.key}
            type={canOpen ? 'button' : undefined}
            onClick={canOpen ? () => onOpen(item.route, item.filter) : undefined}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left ${
              itemTone.rowClass
            } ${canOpen ? 'transition hover:-translate-y-0.5 hover:shadow-sm' : ''}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ring-1 ${itemTone.iconClass}`}
              >
                <ItemIcon aria-hidden="true" className="text-xs" />
              </span>

              <span className="text-xs font-bold text-slate-600">{t(item.labelKey)}</span>
            </span>

            <span className="shrink-0 text-sm font-extrabold text-slate-950">
              {formatPanelValue(summary[item.key], item.format)}
            </span>
          </Container>
        );
      })}
    </div>
  );

  const renderUpcomingRows = () => {
    if (!section.listKey) {
      return null;
    }

    if (upcomingBookings.length === 0) {
      return (
        <div className={`rounded-lg border border-dashed px-3 py-4 text-center ${tone.rowClass}`}>
          <p className="text-xs font-bold text-slate-600">
            {t('travel.dashboard.empty.noUpcomingTravel')}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {upcomingBookings.slice(0, 3).map((booking) => (
          <button
            key={booking._id}
            type="button"
            onClick={() => onOpen(`/travel/bookings/${booking._id}`)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left ${tone.rowClass} transition hover:-translate-y-0.5 hover:shadow-sm`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-slate-950">
                  {booking.invoiceNumber || booking.bookingNumber || '-'}
                </p>

                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                  {booking.customer?.name || t('travel.fields.customer')}
                </p>
              </div>

              <span className="shrink-0 text-[11px] font-bold text-slate-600">
                {formatDateWithOptionalTime(booking.travelStartDate)}
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderAccountGroups = () => (
    <div className="space-y-2">
      {(section.accountGroups || []).map((group) => {
        const accounts = Array.isArray(summary[group.key]) ? summary[group.key] : [];

        if (accounts.length === 0) {
          return null;
        }

        return (
          <div key={group.key} className="rounded-lg border border-slate-100 bg-white/80 p-2">
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-normal text-slate-400">
              {t(group.titleKey)}
            </p>

            <div className="space-y-1.5">
              {accounts.slice(0, 3).map((account) => (
                <button
                  key={account._id}
                  type="button"
                  onClick={() =>
                    onOpen(group.route, {
                      moduleScope: 'travel',
                      accountId: account._id,
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold text-slate-700 transition hover:bg-cyan-50"
                >
                  <span className="min-w-0 truncate">{account.name || account.code || '-'}</span>

                  <span className="shrink-0 text-slate-950">
                    {formatPanelValue(account.balance, 'currency')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className={`overflow-hidden rounded-lg border ${tone.borderClass} bg-white shadow-sm`}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className={`flex w-full items-center justify-between gap-3 bg-gradient-to-r ${tone.surfaceClass} px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${tone.iconClass}`}
          >
            <Icon aria-hidden="true" />
          </span>

          <span className="text-sm font-bold text-slate-800">{t(section.titleKey)}</span>
        </span>

        <ToggleIcon className="flex-shrink-0 text-xs text-slate-500" aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {renderMetricRows()}
          {renderUpcomingRows()}
          {renderAccountGroups()}
        </div>
      )}
    </section>
  );
};

const TravelRightPanel = ({
  summary = EMPTY_TRAVEL_DASHBOARD_SUMMARY,
  loading = false,
  reminderSummary = null,
  onOpenReminderCenter = null,
  onRefresh = null,
}) => {
  const navigate = useNavigate();

  const [breakdownType, setBreakdownType] = useState(null);

  const normalizedSummary = useMemo(
    () => ({
      ...EMPTY_TRAVEL_DASHBOARD_SUMMARY,
      ...summary,
    }),
    [summary]
  );

  const visibleSections = useMemo(
    () =>
      (travelRightPanelSections || [])
        .map((section) => ({
          ...section,
          items: (section.items || []).filter(
            (item) =>
              !['customerDue', 'vendorPayable', 'totalReceivable', 'totalPayable'].includes(
                item.key
              )
          ),
        }))
        .filter(
          (section) =>
            (section.items || []).length > 0 ||
            Boolean(section.listKey) ||
            (section.accountGroups || []).length > 0
        ),
    []
  );

  /*
   * Different backend versions may use slightly different detail keys.
   * This safely supports all common shapes without breaking the panel.
   */
  const receivableDetails = useMemo(() => {
    const source =
      normalizedSummary.receivableDetails ||
      normalizedSummary.customerReceivableDetails ||
      normalizedSummary.customerDueDetails ||
      normalizedSummary.receivables ||
      [];

    return normalizeBreakdownItems(source, 'customer');
  }, [normalizedSummary]);

  const payableDetails = useMemo(() => {
    const source =
      normalizedSummary.payableDetails ||
      normalizedSummary.vendorPayableDetails ||
      normalizedSummary.supplierPayableDetails ||
      normalizedSummary.payables ||
      [];

    return normalizeBreakdownItems(source, 'supplier');
  }, [normalizedSummary]);

  const receivableTotal = safeNumber(
    normalizedSummary.totalReceivable ?? normalizedSummary.customerDue ?? 0
  );

  const payableTotal = safeNumber(
    normalizedSummary.totalPayable ?? normalizedSummary.vendorPayable ?? 0
  );

  const openPath = (route, filter = {}) => {
    if (!route) {
      return;
    }

    navigate(appendQuery(route, filter), {
      state: buildTravelRouteState('/travel/dashboard'),
    });
  };

  const handleOpenLedger = (item) => {
    if (!item?.entityId) {
      return;
    }

    setBreakdownType(null);

    const routeState = buildTravelRouteState('/travel/dashboard');

    if (item.entityType === 'customer') {
      navigate(`/customer-ledger/${item.entityId}?moduleScope=travel`, {
        state: routeState,
      });
      return;
    }

    if (item.entityType === 'party') {
      navigate(`/party-ledger/${item.entityId}?moduleScope=travel`, {
        state: routeState,
      });
      return;
    }

    if (item.entityType === 'supplier' || item.entityType === 'vendor') {
      navigate(`/supplier-ledger/${item.entityId}?moduleScope=travel`, {
        state: routeState,
      });
    }
  };

  return (
    <>
      <aside className="travel-right-panel h-full overflow-y-auto border-l border-slate-200 bg-gradient-to-b from-slate-50 via-white to-cyan-50/60 p-4 shadow-lg">
        <div className="mb-4 rounded-xl border border-cyan-100 bg-gradient-to-r from-white via-sky-50/70 to-cyan-50 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-sm">
              <FaPlaneDeparture aria-hidden="true" />
            </span>

            <button
              type="button"
              onClick={() =>
                openPath('/travel/reports', {
                  view: 'overview',
                })
              }
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-cyan-100 bg-white/90 px-3 py-2 text-xs font-extrabold text-cyan-800 transition hover:bg-white hover:shadow-sm"
            >
              <FaExternalLinkAlt aria-hidden="true" className="text-[10px]" />

              <span>Overview Report</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                title={t('travel.common.refresh')}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-100 bg-white text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:w-9"
              >
                <FaSyncAlt
                  aria-hidden="true"
                  className={loading ? 'animate-spin text-xs' : 'text-xs'}
                />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3">
          <TravelBalanceCard
            type="receivable"
            value={receivableTotal}
            onClick={() => setBreakdownType('receivable')}
          />

          <TravelBalanceCard
            type="payable"
            value={payableTotal}
            onClick={() => setBreakdownType('payable')}
          />
        </div>

        <div className="space-y-3">
          {visibleSections.map((section) => (
            <TravelPanelSection
              key={section.key}
              section={section}
              summary={normalizedSummary}
              onOpen={openPath}
            />
          ))}
        </div>
      </aside>

      <BalanceBreakdownModal
        isOpen={Boolean(breakdownType)}
        onClose={() => setBreakdownType(null)}
        type={breakdownType || 'receivable'}
        items={breakdownType === 'payable' ? payableDetails : receivableDetails}
        total={breakdownType === 'payable' ? payableTotal : receivableTotal}
        onOpenLedger={handleOpenLedger}
      />
    </>
  );
};

export default TravelRightPanel;
