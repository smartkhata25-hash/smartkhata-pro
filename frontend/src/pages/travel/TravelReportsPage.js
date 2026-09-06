import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FaChartBar,
  FaChartLine,
  FaMoneyBillWave,
  FaPlaneDeparture,
  FaSyncAlt,
} from 'react-icons/fa';

import TravelProfitSummaryModal from '../../components/travel/reports/TravelProfitSummaryModal';
import { t } from '../../i18n/i18n';
import { fetchTravelReportSummary } from '../../services/travelMasterService';
import { getLocalDateInputValue } from '../../utils/localDateTime';

import {
  TravelActionButton,
  TravelFilterSelect,
  TravelMasterPageFrame,
  TravelMasterToolbar,
  formatTravelMoney,
} from '../../components/travel/master/TravelMasterUI';

const PRESET_OPTIONS = Object.freeze([
  {
    value: 'all_time',
    labelKey: 'travel.reports.presets.allTime',
  },
  {
    value: 'today',
    labelKey: 'travel.reports.presets.today',
  },
  {
    value: 'yesterday',
    labelKey: 'travel.reports.presets.yesterday',
  },
  {
    value: 'this_week',
    labelKey: 'travel.reports.presets.thisWeek',
  },
  {
    value: 'this_month',
    labelKey: 'travel.reports.presets.thisMonth',
  },
  {
    value: 'this_year',
    labelKey: 'travel.reports.presets.thisYear',
  },
  {
    value: 'custom',
    labelKey: 'travel.reports.presets.custom',
  },
]);

const REPORT_VIEW_OPTIONS = Object.freeze([
  {
    value: 'overview',
    labelKey: 'travel.reports.tabs.overview',
  },
  {
    value: 'profit',
    labelKey: 'travel.reports.tabs.profit',
  },
  {
    value: 'sales',
    labelKey: 'travel.reports.tabs.sales',
  },
  {
    value: 'receivables',
    labelKey: 'travel.reports.tabs.receivables',
  },
  {
    value: 'payables',
    labelKey: 'travel.reports.tabs.payables',
  },
  {
    value: 'refunds',
    labelKey: 'travel.reports.tabs.refunds',
  },
  {
    value: 'payments',
    labelKey: 'travel.reports.tabs.payments',
  },
]);

const REPORT_VIEW_VALUES = new Set(REPORT_VIEW_OPTIONS.map((option) => option.value));

const EMPTY_REPORT = Object.freeze({
  currency: 'PKR',

  filters: {
    preset: 'all_time',
    startDate: '',
    endDate: '',
    hasDateRange: false,
  },

  totals: {},

  charts: {
    revenueProfitTrend: [],
    serviceSales: [],
    cashMovement: [],
  },
});

const getFiltersFromParams = (searchParams) => {
  const preset = searchParams.get('preset') || 'all_time';

  return {
    preset: PRESET_OPTIONS.some((item) => item.value === preset) ? preset : 'all_time',

    startDate: searchParams.get('startDate') || '',

    endDate: searchParams.get('endDate') || '',
  };
};

const getReportViewFromParams = (searchParams) => {
  const view = searchParams.get('view') || 'overview';

  return REPORT_VIEW_VALUES.has(view) ? view : 'overview';
};

const compactMoney = (value) =>
  Number(value || 0).toLocaleString('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

const EmptyChart = ({ message }) => (
  <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
      <FaChartLine aria-hidden="true" />
    </span>

    <p className="mt-3 text-sm font-bold text-slate-600">{message}</p>
  </div>
);

const ChartCard = ({ title, subtitle, icon: Icon, children }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50 px-4 py-3">
      <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
        <Icon aria-hidden="true" />
      </span>

      <div className="min-w-0">
        <h2 className="text-sm font-extrabold text-slate-900 md:text-base">{title}</h2>

        {subtitle && <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p>}
      </div>
    </div>

    <div className="p-3 md:p-4">{children}</div>
  </section>
);

const MetricCard = ({ label, value, currency = 'PKR', isCount = false, tone = 'cyan' }) => {
  const toneClasses = {
    cyan: 'border-cyan-100 bg-cyan-50/70 text-cyan-800',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-800',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-800',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-800',
    violet: 'border-violet-100 bg-violet-50/70 text-violet-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  };

  return (
    <div
      className={`rounded-xl border px-3 py-3 shadow-sm ${toneClasses[tone] || toneClasses.cyan}`}
    >
      <p className="text-[11px] font-extrabold uppercase text-slate-500">{label}</p>

      <p className="mt-1 truncate text-lg font-black">
        {isCount ? Number(value || 0).toLocaleString('en-GB') : formatTravelMoney(value, currency)}
      </p>
    </div>
  );
};

const MetricGrid = ({ children }) => (
  <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</section>
);

const ReportTable = ({ columns, rows, emptyMessage }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    {rows.length === 0 ? (
      <div className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
        {emptyMessage}
      </div>
    ) : (
      <div className="overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs font-extrabold uppercase text-slate-600">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`border border-slate-300 px-3 py-3 ${column.className || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row._id || row.customerId || row.vendorId || index}
                className="odd:bg-white even:bg-slate-50/50"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`border border-slate-200 px-3 py-2.5 align-top ${
                      column.cellClassName || ''
                    }`}
                  >
                    {column.render ? column.render(row) : row[column.key] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const TravelReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => getFiltersFromParams(searchParams), [searchParams]);

  const activeReportView = useMemo(() => getReportViewFromParams(searchParams), [searchParams]);

  const [report, setReport] = useState(EMPTY_REPORT);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [profitModalOpen, setProfitModalOpen] = useState(false);

  const currency = report.currency || 'PKR';

  const updateParams = useCallback(
    (updates = {}) => {
      const nextParams = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          nextParams.delete(key);
        } else {
          nextParams.set(key, value);
        }
      });

      setSearchParams(nextParams, {
        replace: true,
      });
    },
    [searchParams, setSearchParams]
  );

  const changePreset = (preset) => {
    if (preset === 'custom') {
      const today = getLocalDateInputValue();

      updateParams({
        preset,
        startDate: filters.startDate || today,
        endDate: filters.endDate || today,
      });

      return;
    }

    updateParams({
      preset,
      startDate: '',
      endDate: '',
    });
  };

  const changeReportView = (view) => {
    updateParams({
      view,
    });
  };

  const loadReport = useCallback(
    async (options = {}) => {
      try {
        setLoading(true);
        setPageError('');

        const payload = await fetchTravelReportSummary(
          {
            preset: filters.preset,

            ...(filters.preset === 'custom'
              ? {
                  startDate: filters.startDate,
                  endDate: filters.endDate,
                }
              : {}),
          },

          {
            forceRefresh: Boolean(options.forceRefresh),
          }
        );

        setReport({
          ...EMPTY_REPORT,
          ...(payload || {}),

          filters: {
            ...EMPTY_REPORT.filters,
            ...(payload?.filters || {}),
          },

          totals: {
            ...(payload?.totals || {}),
          },

          charts: {
            ...EMPTY_REPORT.charts,
            ...(payload?.charts || {}),
          },
        });
      } catch (error) {
        console.error('Travel report load failed:', error);
        setPageError(t('travel.reports.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [filters.endDate, filters.preset, filters.startDate]
  );

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const charts = report.charts || {};

  const revenueProfitTrend = Array.isArray(charts.revenueProfitTrend)
    ? charts.revenueProfitTrend
    : [];

  const serviceSales = Array.isArray(charts.serviceSales) ? charts.serviceSales : [];

  const cashMovement = Array.isArray(charts.cashMovement) ? charts.cashMovement : [];

  const businessValue = report.businessValue || {};
  const totals = report.totals || {};
  const revenueBreakdown = report.revenueBreakdown || {};
  const costBreakdown = report.costBreakdown || {};
  const refunds = report.refunds || {};
  const payments = report.payments || {};
  const receivables = report.receivables || {};
  const payables = report.payables || {};

  const refundTrend = Array.isArray(charts.refundTrend) ? charts.refundTrend : [];

  const receivablePayable = Array.isArray(charts.receivablePayable) ? charts.receivablePayable : [];

  const receivableRows = Array.isArray(receivables.customers) ? receivables.customers : [];

  const payableRows = Array.isArray(payables.vendors) ? payables.vendors : [];

  const refundRows = Array.isArray(refunds.recent) ? refunds.recent : [];

  const hasRevenueTrend = revenueProfitTrend.length > 0;
  const hasServiceSales = serviceSales.length > 0;

  const hasCashMovement = cashMovement.some((row) => Number(row.amount || 0) !== 0);

  const hasReceivablePayable = receivablePayable.some((row) => Number(row.amount || 0) !== 0);

  const hasRefundTrend = refundTrend.some((row) => Number(row.refunds || 0) !== 0);

  const periodText = report.filters?.hasDateRange
    ? `${report.filters.startDate} - ${report.filters.endDate}`
    : t('travel.reports.presets.allTime');

  const renderMoney = (value, className = 'text-slate-700') => (
    <span className={`font-black ${className}`}>{formatTravelMoney(value, currency)}</span>
  );

  const profitSummaryAction = (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setProfitModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <FaChartLine aria-hidden="true" />
        Profit Summary
      </button>
    </div>
  );

  const businessValueLink = (
    <Link
      to="/travel/business-value"
      className="flex flex-col gap-3 rounded-xl border border-cyan-200 bg-white px-4 py-3 shadow-sm transition hover:border-cyan-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700">
          <FaChartBar aria-hidden="true" />
        </span>

        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-slate-900">
            {t('travel.reports.businessValue.title')}
          </span>

          <span className="block truncate text-xs font-semibold text-slate-500">
            {t('travel.reports.businessValue.subtitle')}
          </span>
        </span>
      </span>

      <span className="text-left sm:text-right">
        <span className="block text-lg font-black text-cyan-800">
          {formatTravelMoney(businessValue.netBusinessValue || 0, currency)}
        </span>

        <span className="text-xs font-bold text-cyan-600">
          {t('travel.reports.businessValue.open')}
        </span>
      </span>
    </Link>
  );

  const revenueProfitChart = (
    <ChartCard
      title={t('travel.reports.charts.revenueProfit')}
      subtitle="See how travel sales and gross profit are moving"
      icon={FaChartLine}
    >
      {!hasRevenueTrend ? (
        <EmptyChart message="No sales or profit data found for this period" />
      ) : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueProfitTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="period"
                tick={{
                  fontSize: 11,
                }}
              />

              <YAxis
                tickFormatter={compactMoney}
                width={65}
                tick={{
                  fontSize: 11,
                }}
              />

              <Tooltip formatter={(value) => formatTravelMoney(value, currency)} />

              <Legend />

              <Line
                type="monotone"
                dataKey="netRevenue"
                name={t('travel.reports.metrics.netRevenue')}
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
              />

              <Line
                type="monotone"
                dataKey="grossProfit"
                name={t('travel.reports.metrics.grossProfit')}
                stroke="#059669"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );

  const serviceSalesChart = (
    <ChartCard
      title={t('travel.reports.sections.servicePerformance')}
      subtitle={t('travel.reports.sections.servicePerformanceSubtitle')}
      icon={FaPlaneDeparture}
    >
      {!hasServiceSales ? (
        <EmptyChart message="No service sales data found" />
      ) : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serviceSales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 10,
                }}
                interval={0}
              />

              <YAxis
                tickFormatter={compactMoney}
                width={65}
                tick={{
                  fontSize: 11,
                }}
              />

              <Tooltip formatter={(value) => formatTravelMoney(value, currency)} />

              <Legend />

              <Bar
                dataKey="netSales"
                name={t('travel.reports.metrics.netSales')}
                fill="#0891b2"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );

  const cashMovementChart = (
    <ChartCard
      title={t('travel.reports.sections.cashMovement')}
      subtitle={t('travel.reports.sections.cashMovementSubtitle')}
      icon={FaMoneyBillWave}
    >
      {!hasCashMovement ? (
        <EmptyChart message="No cash movement found for this period" />
      ) : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashMovement}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 11,
                }}
              />

              <YAxis
                tickFormatter={compactMoney}
                width={65}
                tick={{
                  fontSize: 11,
                }}
              />

              <Tooltip formatter={(value) => formatTravelMoney(value, currency)} />

              <Legend />

              <Bar
                dataKey="amount"
                name={t('travel.reports.metrics.amount')}
                fill="#7c3aed"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );

  const receivablePayableChart = (
    <ChartCard
      title={t('travel.reports.charts.receivablePayable')}
      subtitle="Current customer and vendor balance position"
      icon={FaChartBar}
    >
      {!hasReceivablePayable ? (
        <EmptyChart message="No receivable or payable balances found" />
      ) : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={receivablePayable}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 11,
                }}
              />

              <YAxis
                tickFormatter={compactMoney}
                width={65}
                tick={{
                  fontSize: 11,
                }}
              />

              <Tooltip formatter={(value) => formatTravelMoney(value, currency)} />

              <Bar
                dataKey="amount"
                name={t('travel.reports.metrics.amount')}
                fill="#0891b2"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );

  const refundTrendChart = (
    <ChartCard
      title={t('travel.reports.charts.refundTrend')}
      subtitle={t('travel.reports.sections.refundsSubtitle')}
      icon={FaChartLine}
    >
      {!hasRefundTrend ? (
        <EmptyChart message="No refund data found for this period" />
      ) : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={refundTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="period"
                tick={{
                  fontSize: 11,
                }}
              />

              <YAxis
                tickFormatter={compactMoney}
                width={65}
                tick={{
                  fontSize: 11,
                }}
              />

              <Tooltip formatter={(value) => formatTravelMoney(value, currency)} />

              <Legend />

              <Bar
                dataKey="refunds"
                name={t('travel.reports.metrics.grossRefunds')}
                fill="#e11d48"
                radius={[5, 5, 0, 0]}
              />

              <Bar
                dataKey="penalties"
                name={t('travel.reports.metrics.customerPenalties')}
                fill="#f59e0b"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );

  const activeReportContent = (() => {
    if (activeReportView === 'profit') {
      return (
        <div className="space-y-4">
          {profitSummaryAction}

          <MetricGrid>
            <MetricCard
              label={t('travel.reports.cards.netRevenue')}
              value={totals.netRevenue}
              currency={currency}
              tone="cyan"
            />

            <MetricCard
              label={t('travel.reports.cards.travelCost')}
              value={totals.netTravelCost}
              currency={currency}
              tone="amber"
            />

            <MetricCard
              label={t('travel.reports.cards.grossProfit')}
              value={totals.grossProfit}
              currency={currency}
              tone="emerald"
            />

            <MetricCard
              label={t('travel.reports.cards.expenses')}
              value={totals.travelExpenses}
              currency={currency}
              tone="rose"
            />

            <MetricCard
              label={t('travel.reports.cards.netProfit')}
              value={totals.netProfit}
              currency={currency}
              tone="violet"
            />

            <MetricCard
              label={t('travel.reports.table.invoices')}
              value={totals.invoiceCount}
              isCount
              tone="slate"
            />
          </MetricGrid>

          {revenueProfitChart}
          {serviceSalesChart}
        </div>
      );
    }

    if (activeReportView === 'sales') {
      return (
        <div className="space-y-4">
          <MetricGrid>
            <MetricCard
              label={t('travel.reports.metrics.grossSales')}
              value={revenueBreakdown.grossSales}
              currency={currency}
              tone="cyan"
            />

            <MetricCard
              label={t('travel.reports.metrics.discounts')}
              value={revenueBreakdown.discounts}
              currency={currency}
              tone="amber"
            />

            <MetricCard
              label={t('travel.reports.metrics.grossRefunds')}
              value={revenueBreakdown.grossRefunds}
              currency={currency}
              tone="rose"
            />

            <MetricCard
              label={t('travel.reports.metrics.customerPenalties')}
              value={revenueBreakdown.customerPenalties}
              currency={currency}
              tone="violet"
            />

            <MetricCard
              label={t('travel.reports.metrics.netRevenue')}
              value={revenueBreakdown.netRevenue}
              currency={currency}
              tone="emerald"
            />

            <MetricCard
              label={t('travel.reports.table.invoices')}
              value={totals.invoiceCount}
              isCount
              tone="slate"
            />
          </MetricGrid>

          {revenueProfitChart}
          {serviceSalesChart}
        </div>
      );
    }

    if (activeReportView === 'receivables') {
      return (
        <div className="space-y-4">
          <MetricGrid>
            <MetricCard
              label={t('travel.reports.cards.customerReceivables')}
              value={receivables.totalReceivable}
              currency={currency}
              tone="amber"
            />

            <MetricCard
              label="Customer Credit"
              value={receivables.totalCredit}
              currency={currency}
              tone="cyan"
            />
          </MetricGrid>

          {receivablePayableChart}

          <ReportTable
            rows={receivableRows}
            emptyMessage="No customer receivable rows found"
            columns={[
              {
                key: 'customer',
                label: 'Customer',
                className: 'w-[24%]',
                render: (row) => row.customer?.name || '-',
              },
              {
                key: 'invoiceCount',
                label: t('travel.reports.table.invoices'),
                className: 'w-[12%]',
              },
              {
                key: 'invoiceAmount',
                label: t('travel.reports.metrics.netSales'),
                className: 'w-[16%]',
                render: (row) => renderMoney(row.invoiceAmount, 'text-cyan-700'),
              },
              {
                key: 'payments',
                label: t('travel.reports.metrics.received'),
                className: 'w-[16%]',
                render: (row) => renderMoney(row.payments, 'text-emerald-700'),
              },
              {
                key: 'refundCredit',
                label: t('travel.reports.metrics.refundCredit'),
                className: 'w-[16%]',
                render: (row) => renderMoney(row.refundCredit, 'text-rose-700'),
              },
              {
                key: 'currentDue',
                label: t('travel.reports.cards.customerReceivables'),
                className: 'w-[16%]',
                render: (row) => renderMoney(row.currentDue, 'text-amber-700'),
              },
            ]}
          />
        </div>
      );
    }

    if (activeReportView === 'payables') {
      return (
        <div className="space-y-4">
          <MetricGrid>
            <MetricCard
              label={t('travel.reports.cards.vendorPayables')}
              value={payables.totalPayable}
              currency={currency}
              tone="rose"
            />

            <MetricCard
              label="Vendor Credit"
              value={payables.totalCredit}
              currency={currency}
              tone="cyan"
            />

            <MetricCard
              label={t('travel.reports.metrics.travelCost')}
              value={costBreakdown.netTravelCost}
              currency={currency}
              tone="amber"
            />
          </MetricGrid>

          {receivablePayableChart}

          <ReportTable
            rows={payableRows}
            emptyMessage="No vendor payable rows found"
            columns={[
              {
                key: 'vendor',
                label: 'Vendor',
                className: 'w-[24%]',
                render: (row) => row.vendor?.name || '-',
              },
              {
                key: 'costs',
                label: t('travel.reports.metrics.costs'),
                className: 'w-[19%]',
                render: (row) => renderMoney(row.costs, 'text-amber-700'),
              },
              {
                key: 'payments',
                label: t('travel.reports.metrics.vendorPayments'),
                className: 'w-[19%]',
                render: (row) => renderMoney(row.payments, 'text-emerald-700'),
              },
              {
                key: 'recoveriesReturns',
                label: t('travel.reports.metrics.recoveriesReturns'),
                className: 'w-[19%]',
                render: (row) => renderMoney(row.recoveriesReturns, 'text-cyan-700'),
              },
              {
                key: 'currentPayable',
                label: t('travel.reports.cards.vendorPayables'),
                className: 'w-[19%]',
                render: (row) => renderMoney(row.currentPayable, 'text-rose-700'),
              },
            ]}
          />
        </div>
      );
    }

    if (activeReportView === 'refunds') {
      return (
        <div className="space-y-4">
          <MetricGrid>
            <MetricCard
              label={t('travel.reports.tabs.refunds')}
              value={refunds.totals?.count}
              isCount
              tone="slate"
            />

            <MetricCard
              label={t('travel.reports.metrics.grossRefunds')}
              value={refunds.totals?.grossRefund}
              currency={currency}
              tone="rose"
            />

            <MetricCard
              label={t('travel.reports.metrics.customerPenalties')}
              value={refunds.totals?.customerPenalties}
              currency={currency}
              tone="amber"
            />

            <MetricCard
              label={t('travel.reports.metrics.customerRefund')}
              value={refunds.totals?.customerRefund}
              currency={currency}
              tone="cyan"
            />

            <MetricCard
              label={t('travel.reports.metrics.paidBack')}
              value={refunds.totals?.paidBack}
              currency={currency}
              tone="emerald"
            />

            <MetricCard
              label={t('travel.reports.metrics.vendorRecoveries')}
              value={refunds.totals?.vendorRecovery}
              currency={currency}
              tone="violet"
            />
          </MetricGrid>

          {refundTrendChart}

          <ReportTable
            rows={refundRows}
            emptyMessage="No recent refunds found"
            columns={[
              {
                key: 'refundNumber',
                label: 'Refund No',
                className: 'w-[16%]',
              },
              {
                key: 'originalInvoiceNumber',
                label: 'Invoice',
                className: 'w-[16%]',
              },
              {
                key: 'customer',
                label: 'Customer',
                className: 'w-[22%]',
                render: (row) => row.customer?.name || '-',
              },
              {
                key: 'grossRefund',
                label: t('travel.reports.metrics.grossRefunds'),
                className: 'w-[16%]',
                render: (row) => renderMoney(row.grossRefund, 'text-rose-700'),
              },
              {
                key: 'paidBack',
                label: t('travel.reports.metrics.paidBack'),
                className: 'w-[15%]',
                render: (row) => renderMoney(row.paidBack, 'text-emerald-700'),
              },
              {
                key: 'outstandingCustomerCredit',
                label: t('travel.reports.metrics.outstandingCredit'),
                className: 'w-[15%]',
                render: (row) => renderMoney(row.outstandingCustomerCredit, 'text-amber-700'),
              },
            ]}
          />
        </div>
      );
    }

    if (activeReportView === 'payments') {
      return (
        <div className="space-y-4">
          <MetricGrid>
            <MetricCard
              label={t('travel.reports.cards.received')}
              value={payments.receivedTotal}
              currency={currency}
              tone="emerald"
            />

            <MetricCard
              label={t('travel.reports.cards.vendorPayments')}
              value={payments.vendorPaymentTotal}
              currency={currency}
              tone="rose"
            />

            <MetricCard
              label={t('travel.reports.metrics.refundPaid')}
              value={payments.refundPaidTotal}
              currency={currency}
              tone="amber"
            />

            <MetricCard
              label={t('travel.reports.metrics.vendorReturnCashReceived')}
              value={payments.vendorReturnReceiptTotal}
              currency={currency}
              tone="cyan"
            />

            <MetricCard
              label={t('travel.reports.metrics.travelExpensePaid')}
              value={payments.travelExpensePaidTotal}
              currency={currency}
              tone="violet"
            />

            <MetricCard
              label={t('travel.reports.metrics.employeeCashIn')}
              value={payments.employeeCashInTotal}
              currency={currency}
              tone="emerald"
            />

            <MetricCard
              label={t('travel.reports.metrics.employeeCashOut')}
              value={payments.employeeCashOutTotal}
              currency={currency}
              tone="rose"
            />

            <MetricCard
              label={t('travel.reports.metrics.netCashMovement')}
              value={payments.netCashMovement}
              currency={currency}
              tone="slate"
            />
          </MetricGrid>

          {cashMovementChart}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {profitSummaryAction}
        {businessValueLink}
        {revenueProfitChart}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {serviceSalesChart}
          {cashMovementChart}
        </div>
      </div>
    );
  })();

  return (
    <TravelMasterPageFrame
      titleKey="travel.reports.title"
      actions={
        <TravelActionButton
          icon={FaSyncAlt}
          variant="secondary"
          onClick={() =>
            loadReport({
              forceRefresh: true,
            })
          }
          disabled={loading}
        >
          {loading ? t('travel.common.loading') : t('travel.common.refresh')}
        </TravelActionButton>
      }
      filters={
        <TravelMasterToolbar className="lg:flex-wrap">
          <div className="flex w-full flex-wrap gap-1.5">
            {REPORT_VIEW_OPTIONS.map((option) => {
              const active = activeReportView === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => changeReportView(option.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-extrabold transition ${
                    active
                      ? 'border-cyan-600 bg-cyan-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-cyan-50 hover:text-cyan-700'
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>

          <TravelFilterSelect
            value={filters.preset}
            onChange={changePreset}
            options={PRESET_OPTIONS}
            className="w-full sm:w-48"
          />

          {filters.preset === 'custom' && (
            <>
              <input
                type="date"
                value={filters.startDate}
                max={filters.endDate || undefined}
                onChange={(event) =>
                  updateParams({
                    startDate: event.target.value,
                  })
                }
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />

              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate || undefined}
                onChange={(event) =>
                  updateParams({
                    endDate: event.target.value,
                  })
                }
                className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </>
          )}

          <span className="inline-flex h-10 items-center rounded-lg border border-cyan-100 bg-cyan-50 px-3 text-xs font-extrabold text-cyan-800">
            {periodText}
          </span>
        </TravelMasterToolbar>
      }
    >
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setProfitModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <FaChartLine aria-hidden="true" />
          Profit Summary
        </button>
      </div>

      {pageError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {pageError}
        </div>
      )}

      {activeReportContent}

      <TravelProfitSummaryModal
        isOpen={profitModalOpen}
        onClose={() => setProfitModalOpen(false)}
        data={report.totals}
      />
    </TravelMasterPageFrame>
  );
};

export default TravelReportsPage;
