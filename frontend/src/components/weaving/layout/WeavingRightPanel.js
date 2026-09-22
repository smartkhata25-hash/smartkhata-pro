import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaChevronDown,
  FaChevronUp,
  FaExternalLinkAlt,
  FaIndustry,
  FaSpinner,
  FaSyncAlt,
} from 'react-icons/fa';

import { t } from '../../../i18n/i18n';
import { getAccounts } from '../../../services/accountService';
import { getEmployeeSummary } from '../../../services/employeeService';
import { getOutstanding, getSizingStock } from '../../../services/weavingCommercialService';
import { getFabricStock } from '../../../services/weavingFoldingService';
import { getWeavingPayrollSummary } from '../../../services/weavingPayrollService';
import { getWeavingDashboardSummary } from '../../../services/weavingReportService';
import { hasAnyPermission, hasPermission } from '../../../utils/permissionHelper';
import { buildWeavingRouteState } from '../../../utils/weavingContext';
import BalanceBreakdownModal from '../../BalanceBreakdownModal';
import {
  EMPTY_WEAVING_DASHBOARD_SUMMARY,
  weavingRightPanelSections,
  weavingToneClasses,
} from '../dashboard/weavingDashboardConfig';

const EMPTY_VALUE = '\u2014';
const WEAVING_MODULE_SCOPE = 'weaving';
const BANK_ACCOUNT_CATEGORIES = new Set(['bank', 'online', 'cheque', 'wallet']);

const appendQuery = (path, params = {}) => {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });

  const queryString = query.toString();

  if (!queryString) {
    return path;
  }

  return `${path}${path.includes('?') ? '&' : '?'}${queryString}`;
};

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatCompactNumber = (value) =>
  safeNumber(value).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatPanelValue = (value, format) => {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE;
  }

  if (format === 'currency') {
    return `${t('currency.rs')} ${formatCompactNumber(value)}`;
  }

  if (format === 'kg') {
    return `${formatCompactNumber(value)} KG`;
  }

  if (format === 'meters') {
    return `${formatCompactNumber(value)} ${t('weaving.panel.meterUnit')}`;
  }

  return formatCompactNumber(value);
};

const hasConfigAccess = (config = {}) => {
  if (config.permission && !hasPermission(config.permission)) {
    return false;
  }

  if (
    Array.isArray(config.anyPermissions) &&
    config.anyPermissions.length > 0 &&
    !hasAnyPermission(config.anyPermissions)
  ) {
    return false;
  }

  return true;
};

const normalizePartyRows = (records = []) => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((party) => ({
      entityId: party?._id || party?.entityId || '',
      entityType: 'party',
      name: party?.name || '-',
      amount: Math.abs(safeNumber(party?.amount ?? party?.balance)),
    }))
    .filter((party) => party.entityId && party.amount > 0);
};

const normalizeAccountRows = (accounts = [], categoryMatcher) => {
  if (!Array.isArray(accounts)) {
    return [];
  }

  return accounts
    .filter((account) => categoryMatcher(String(account?.category || '').trim().toLowerCase()))
    .map((account) => ({
      ...account,
      balance: safeNumber(account?.balance),
    }))
    .filter((account) => account._id);
};

const sumAmounts = (records = [], field = 'amount') =>
  records.reduce((sum, row) => sum + safeNumber(row?.[field]), 0);

const WeavingPanelSection = ({ section, summary, loading, onBreakdown, onOpen }) => {
  const [open, setOpen] = useState(true);
  const SectionIcon = section.icon || FaIndustry;
  const tone = weavingToneClasses[section.tone] || weavingToneClasses.production;
  const ToggleIcon = open ? FaChevronUp : FaChevronDown;

  const renderValue = (item) => {
    const value = summary[item.key];

    if (loading && (value === null || value === undefined)) {
      return <FaSpinner aria-hidden="true" className="animate-spin text-xs text-slate-500" />;
    }

    return formatPanelValue(value, item.format);
  };

  const renderMetricRows = () => (
    <div className="space-y-2">
      {(section.items || []).map((item) => {
        const itemTone = weavingToneClasses[item.tone] || weavingToneClasses.production;
        const ItemIcon = item.icon || SectionIcon;
        const canOpen = Boolean(item.route || item.breakdownType);
        const Container = canOpen ? 'button' : 'div';

        return (
          <Container
            key={item.key}
            type={canOpen ? 'button' : undefined}
            onClick={
              canOpen
                ? () =>
                    item.breakdownType
                      ? onBreakdown(item.breakdownType)
                      : onOpen(item.route, item.filter)
                : undefined
            }
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
              {renderValue(item)}
            </span>
          </Container>
        );
      })}
    </div>
  );

  const renderAccountGroups = () => (
    <div className="space-y-2">
      {(section.accountGroups || []).map((group) => {
        const accounts = Array.isArray(summary[group.key]) ? summary[group.key] : [];

        if (!accounts.length) {
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
                  title={t('weaving.panel.viewDetails')}
                  onClick={() =>
                    onOpen(group.route, {
                      moduleScope: WEAVING_MODULE_SCOPE,
                      accountId: account._id,
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold text-slate-700 transition hover:bg-teal-50"
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
        className={`flex w-full items-center justify-between gap-3 bg-gradient-to-r ${tone.surfaceClass} px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${tone.iconClass}`}
          >
            <SectionIcon aria-hidden="true" />
          </span>

          <span className="text-sm font-bold text-slate-800">{t(section.titleKey)}</span>
        </span>

        <ToggleIcon className="flex-shrink-0 text-xs text-slate-500" aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          {renderMetricRows()}
          {renderAccountGroups()}
        </div>
      )}
    </section>
  );
};

const WeavingRightPanel = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ ...EMPTY_WEAVING_DASHBOARD_SUMMARY });
  const [loading, setLoading] = useState(false);
  const [breakdownType, setBreakdownType] = useState(null);

  const visibleSections = useMemo(
    () =>
      (weavingRightPanelSections || [])
        .map((section) => ({
          ...section,
          items: (section.items || []).filter(hasConfigAccess),
          accountGroups: (section.accountGroups || []).filter(hasConfigAccess),
        }))
        .filter((section) => (section.items || []).length || (section.accountGroups || []).length),
    []
  );

  const loadPanelData = useCallback(async ({ forceRefresh = false } = {}) => {
    const requests = [];

    if (hasPermission('weaving.counterparties.view')) {
      requests.push({
        key: 'outstanding',
        load: getOutstanding,
      });
    }

    if (hasPermission('payroll.view')) {
      requests.push({
        key: 'employeeSummary',
        load: () => getEmployeeSummary({ moduleScope: WEAVING_MODULE_SCOPE }),
      });

      requests.push({
        key: 'payrollSummary',
        load: getWeavingPayrollSummary,
      });
    }

    if (hasPermission('accounts.view')) {
      requests.push({
        key: 'accounts',
        load: () => getAccounts({ forceRefresh, moduleScope: WEAVING_MODULE_SCOPE }),
      });
    }

    if (hasAnyPermission(['weaving.reports.view', 'weaving.reports.production'])) {
      requests.push({
        key: 'operations',
        load: getWeavingDashboardSummary,
      });
    }

    if (hasPermission('weaving.sizing.view_material_ledger')) {
      requests.push({
        key: 'sizingStock',
        load: getSizingStock,
      });
    }

    if (hasPermission('weaving.fabric_stock.view')) {
      requests.push({
        key: 'fabricStock',
        load: getFabricStock,
      });
    }

    if (!requests.length) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const results = await Promise.allSettled(requests.map((request) => request.load()));

      setSummary((previous) => {
        const next = { ...previous };

        results.forEach((result, index) => {
          if (result.status !== 'fulfilled') {
            return;
          }

          const key = requests[index].key;
          const value = result.value;

          if (key === 'outstanding') {
            const partyReceivableDetails = normalizePartyRows(value?.receivables);
            const partyPayableDetails = normalizePartyRows(value?.payables);

            next.partyReceivableDetails = partyReceivableDetails;
            next.partyPayableDetails = partyPayableDetails;
            next.partyReceivable = sumAmounts(partyReceivableDetails);
            next.partyPayable = sumAmounts(partyPayableDetails);
          }

          if (key === 'employeeSummary') {
            next.employeeRecoverable = safeNumber(value?.totalRecoverable);
            next.employeePayable = safeNumber(value?.totalPayable);
          }

          if (key === 'payrollSummary') {
            next.salaryDue = safeNumber(value?.remaining);
          }

          if (key === 'accounts') {
            const cashAccounts = normalizeAccountRows(
              value,
              (category) => category === 'cash'
            );
            const bankAccounts = normalizeAccountRows(value, (category) =>
              BANK_ACCOUNT_CATEGORIES.has(category)
            );

            next.cashAccounts = cashAccounts;
            next.bankAccounts = bankAccounts;
            next.cashInHand = sumAmounts(cashAccounts, 'balance');
            next.bankBalance = sumAmounts(bankAccounts, 'balance');
          }

          if (key === 'operations') {
            next.productionMeters = safeNumber(value?.productionMeters);
          }

          if (key === 'sizingStock') {
            next.sizingStockKg = Array.isArray(value)
              ? value.reduce((sum, row) => sum + safeNumber(row?.balanceKg), 0)
              : 0;
          }

          if (key === 'fabricStock') {
            next.fabricStockMeter = safeNumber(value?.totals?.meter);
          }
        });

        const employeeRecoverable = safeNumber(next.employeeRecoverable);
        const employeePayable = safeNumber(next.employeePayable);

        next.receivable = safeNumber(next.partyReceivable) + employeeRecoverable;
        next.payable = safeNumber(next.partyPayable) + employeePayable;

        next.receivableDetails = [...(next.partyReceivableDetails || [])];
        next.payableDetails = [...(next.partyPayableDetails || [])];

        if (employeeRecoverable > 0) {
          next.receivableDetails.push({
            entityId: 'weaving-employee-recoverable',
            entityType: 'employee',
            name: t('weaving.employeeFinance.totalRecoverable'),
            amount: employeeRecoverable,
          });
        }

        if (employeePayable > 0) {
          next.payableDetails.push({
            entityId: 'weaving-employee-payable',
            entityType: 'employee',
            name: t('weaving.panel.employeePayable'),
            amount: employeePayable,
          });
        }

        return next;
      });
    } catch (error) {
      console.error('Weaving right panel load failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPanelData();
  }, [loadPanelData]);

  const openPath = (route, filter = {}) => {
    if (!route) return;

    navigate(appendQuery(route, filter), {
      state: buildWeavingRouteState('/weaving/dashboard'),
    });
  };

  const handleOpenLedger = (item) => {
    if (!item?.entityId) {
      return;
    }

    const activeBreakdownType = breakdownType;

    setBreakdownType(null);

    const routeState = buildWeavingRouteState('/weaving/dashboard');

    if (item.entityType === 'party') {
      const query = new URLSearchParams({ partyId: item.entityId });

      navigate(`/weaving/party-ledger?${query.toString()}`, {
        state: routeState,
      });
      return;
    }

    if (item.entityType === 'employee') {
      navigate(activeBreakdownType === 'payable' ? '/weaving/payroll' : '/weaving/employee-finance', {
        state: routeState,
      });
    }
  };

  return (
    <>
      <aside className="h-full overflow-y-auto border-l border-slate-200 bg-gradient-to-b from-slate-50 via-white to-emerald-50/60 p-4 shadow-lg">
        <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-r from-white via-emerald-50/70 to-teal-50 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-teal-700 text-white shadow-sm">
              <FaIndustry aria-hidden="true" />
            </span>

            <button
              type="button"
              onClick={() => openPath('/weaving/reports')}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-100 bg-white/90 px-3 py-2 text-xs font-extrabold text-emerald-800 transition hover:bg-white hover:shadow-sm"
            >
              <FaExternalLinkAlt aria-hidden="true" className="text-[10px]" />
              <span className="truncate">{t('weaving.panel.overview')}</span>
            </button>

            <button
              type="button"
              onClick={() => loadPanelData({ forceRefresh: true })}
              disabled={loading}
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-white text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:w-9"
            >
              <FaSyncAlt aria-hidden="true" className={loading ? 'animate-spin text-xs' : 'text-xs'} />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {visibleSections.map((section) => (
            <WeavingPanelSection
              key={section.key}
              section={section}
              summary={summary}
              loading={loading}
              onBreakdown={setBreakdownType}
              onOpen={openPath}
            />
          ))}
        </div>
      </aside>

      <BalanceBreakdownModal
        isOpen={Boolean(breakdownType)}
        onClose={() => setBreakdownType(null)}
        type={breakdownType || 'receivable'}
        items={breakdownType === 'payable' ? summary.payableDetails : summary.receivableDetails}
        total={breakdownType === 'payable' ? summary.payable : summary.receivable}
        onOpenLedger={handleOpenLedger}
      />
    </>
  );
};

export default WeavingRightPanel;
