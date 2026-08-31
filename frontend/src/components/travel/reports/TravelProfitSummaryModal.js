import React, { useEffect, useRef, useState } from 'react';
import {
  FaChartLine,
  FaCoins,
  FaFileInvoiceDollar,
  FaPlane,
  FaReceipt,
  FaWallet,
} from 'react-icons/fa';

import { fetchTravelReportSummary } from '../../../services/travelMasterService';

import TravelProfitDetailDrawer from './TravelProfitDetailDrawer';

const EMPTY_SUMMARY = Object.freeze({
  currency: 'PKR',
  totals: {
    grossSales: 0,
    discounts: 0,
    grossRefunds: 0,
    customerPenalties: 0,
    netRevenue: 0,
    originalTravelCost: 0,
    vendorRecoveries: 0,
    vendorReturns: 0,
    netTravelCost: 0,
    grossProfit: 0,
    travelExpenses: 0,
    netProfit: 0,
  },
  revenueBreakdown: {},
  costBreakdown: {},
  expenses: {
    total: 0,
    breakdown: [],
  },
  servicePerformance: [],
  customServicePerformance: [],
});

const PRESET_OPTIONS = [
  {
    value: 'all_time',
    label: 'All Time',
  },
  {
    value: 'today',
    label: 'Today',
  },
  {
    value: 'yesterday',
    label: 'Yesterday',
  },
  {
    value: 'this_week',
    label: 'This Week',
  },
  {
    value: 'this_month',
    label: 'This Month',
  },
  {
    value: 'this_year',
    label: 'This Year',
  },
  {
    value: 'custom',
    label: 'Custom Dates',
  },
];

const getSafeNumber = (value) => {
  const number = Number(value || 0);

  return Number.isFinite(number) ? number : 0;
};

const formatMoney = (value) =>
  getSafeNumber(value).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const TravelProfitSummaryModal = ({ isOpen, onClose, data = null }) => {
  const requestIdRef = useRef(0);

  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [loading, setLoading] = useState(false);

  const [quickFilter, setQuickFilter] = useState('this_month');

  const [startDate, setStartDate] = useState('');

  const [endDate, setEndDate] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [drawerType, setDrawerType] = useState('');

  const [drawerTitle, setDrawerTitle] = useState('');

  const [drawerData, setDrawerData] = useState([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!data) {
      return;
    }

    setSummary((previous) => ({
      ...previous,
      totals: {
        ...previous.totals,

        netRevenue: getSafeNumber(data.netTravelRevenue ?? data.netRevenue ?? data.totalSales),

        netTravelCost: getSafeNumber(data.netTravelCost),

        grossProfit: getSafeNumber(data.grossProfit),

        travelExpenses: getSafeNumber(data.travelExpenses),

        netProfit: getSafeNumber(data.netProfit),
      },
    }));
  }, [data, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDrawerOpen(false);
      setDrawerType('');
      setDrawerTitle('');
      setDrawerData([]);

      return;
    }

    if (quickFilter === 'custom' && (!startDate || !endDate)) {
      return;
    }

    const requestId = ++requestIdRef.current;

    const loadSummary = async () => {
      try {
        setLoading(true);

        const response = await fetchTravelReportSummary(
          {
            preset: quickFilter,

            ...(quickFilter === 'custom'
              ? {
                  startDate,
                  endDate,
                }
              : {}),
          },
          {
            forceRefresh: false,
          }
        );

        if (requestId !== requestIdRef.current) {
          return;
        }

        setSummary({
          ...EMPTY_SUMMARY,
          ...(response || {}),

          totals: {
            ...EMPTY_SUMMARY.totals,
            ...(response?.totals || {}),
          },

          revenueBreakdown: {
            ...(response?.revenueBreakdown || {}),
          },

          costBreakdown: {
            ...(response?.costBreakdown || {}),
          },

          expenses: {
            ...EMPTY_SUMMARY.expenses,
            ...(response?.expenses || {}),
          },

          servicePerformance: Array.isArray(response?.servicePerformance)
            ? response.servicePerformance
            : [],

          customServicePerformance: Array.isArray(response?.customServicePerformance)
            ? response.customServicePerformance
            : [],
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        console.error('Travel profit summary load failed:', error);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    loadSummary();
  }, [isOpen, quickFilter, startDate, endDate]);

  useEffect(() => {
    setDrawerOpen(false);
    setDrawerType('');
    setDrawerTitle('');
    setDrawerData([]);
  }, [quickFilter, startDate, endDate]);

  if (!isOpen) {
    return null;
  }

  const totals = summary.totals || {};

  const openDrawer = (type) => {
    let title = '';

    let rows = [];

    if (type === 'sales') {
      title = 'Sales Breakdown';

      rows = [
        {
          key: 'grossSales',
          label: 'Gross Sales',
          amount: totals.grossSales,
        },
        {
          key: 'discounts',
          label: 'Discounts',
          amount: totals.discounts,
        },
        {
          key: 'refunds',
          label: 'Refunds',
          amount: totals.grossRefunds,
        },
        {
          key: 'penalties',
          label: 'Customer Penalties',
          amount: totals.customerPenalties,
        },
        {
          key: 'netRevenue',
          label: 'Total Sales',
          amount: totals.netRevenue,
          highlight: true,
        },
      ];
    }

    if (type === 'cost') {
      title = 'Travel Cost Breakdown';

      rows = [
        {
          key: 'originalCost',
          label: 'Original Travel Cost',
          amount: totals.originalTravelCost,
        },
        {
          key: 'vendorRecoveries',
          label: 'Vendor Recoveries',
          amount: totals.vendorRecoveries,
        },
        {
          key: 'vendorReturns',
          label: 'Vendor Returns',
          amount: totals.vendorReturns,
        },
        {
          key: 'netTravelCost',
          label: 'Travel Cost',
          amount: totals.netTravelCost,
          highlight: true,
        },
      ];
    }

    if (type === 'expense') {
      title = 'Expense Breakdown';

      rows = Array.isArray(summary.expenses?.breakdown) ? summary.expenses.breakdown : [];
    }

    if (type === 'services') {
      title = 'Service Profitability';

      rows = Array.isArray(summary.servicePerformance) ? summary.servicePerformance : [];
    }

    setDrawerTitle(title);
    setDrawerType(type);
    setDrawerData(rows);
    setDrawerOpen(true);
  };

  const clearFilters = () => {
    setQuickFilter('this_month');
    setStartDate('');
    setEndDate('');

    setDrawerOpen(false);
    setDrawerType('');
    setDrawerTitle('');
    setDrawerData([]);
  };

  const SummaryRow = ({
    label,
    value,
    icon: Icon,
    tone = 'neutral',
    clickable = false,
    onClick = null,
  }) => {
    const toneClasses = {
      sales: {
        icon: 'bg-blue-100 text-blue-700',
        value: 'text-blue-700',
        hover: 'hover:bg-blue-50',
      },

      cost: {
        icon: 'bg-amber-100 text-amber-700',
        value: 'text-amber-700',
        hover: 'hover:bg-amber-50',
      },

      profit: {
        icon: 'bg-emerald-100 text-emerald-700',
        value: getSafeNumber(value) >= 0 ? 'text-emerald-700' : 'text-rose-700',
        hover: 'hover:bg-emerald-50',
      },

      expense: {
        icon: 'bg-rose-100 text-rose-700',
        value: 'text-rose-600',
        hover: 'hover:bg-rose-50',
      },

      service: {
        icon: 'bg-violet-100 text-violet-700',
        value: getSafeNumber(value) >= 0 ? 'text-violet-700' : 'text-rose-700',
        hover: 'hover:bg-violet-50',
      },

      neutral: {
        icon: 'bg-slate-100 text-slate-700',
        value: 'text-slate-900',
        hover: 'hover:bg-slate-50',
      },
    };

    const currentTone = toneClasses[tone] || toneClasses.neutral;

    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={clickable ? onClick : undefined}
        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-1 py-3.5 text-left transition ${
          clickable ? `${currentTone.hover} cursor-pointer` : 'cursor-default'
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${currentTone.icon}`}
          >
            <Icon aria-hidden="true" className="text-sm" />
          </span>

          <span className="text-sm font-bold text-slate-600">{label}</span>
        </span>

        <span className={`shrink-0 text-sm font-extrabold ${currentTone.value}`}>
          Rs. {formatMoney(value)}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-emerald-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-sm">
                  <FaPlaneDepartureIcon />
                </span>

                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-slate-900">Profit Summary</h2>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-600 transition hover:bg-slate-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="space-y-3 px-5 pt-4">
            <select
              value={quickFilter}
              onChange={(event) => {
                const value = event.target.value;

                setQuickFilter(value);

                if (value !== 'custom') {
                  setStartDate('');
                  setEndDate('');
                }
              }}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            >
              {PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {quickFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />

                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">
                {loading ? 'Refreshing profit data...' : 'Click a row to view details'}
              </p>

              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="px-5 pb-5 pt-3">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <SummaryRow
                label="Total Sales"
                value={totals.netRevenue}
                icon={FaFileInvoiceDollar}
                tone="sales"
                clickable
                onClick={() => openDrawer('sales')}
              />

              <SummaryRow
                label="Travel Cost"
                value={totals.netTravelCost}
                icon={FaReceipt}
                tone="cost"
                clickable
                onClick={() => openDrawer('cost')}
              />

              <SummaryRow
                label="Gross Profit"
                value={totals.grossProfit}
                icon={FaChartLine}
                tone="profit"
              />

              <SummaryRow
                label="Expenses"
                value={totals.travelExpenses}
                icon={FaWallet}
                tone="expense"
                clickable
                onClick={() => openDrawer('expense')}
              />

              <SummaryRow
                label="Net Profit"
                value={totals.netProfit}
                icon={FaCoins}
                tone="profit"
              />

              <SummaryRow
                label="Service Profitability"
                value={totals.grossProfit}
                icon={FaPlane}
                tone="service"
                clickable
                onClick={() => openDrawer('services')}
              />
            </div>
          </div>
        </div>
      </div>

      <TravelProfitDetailDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerType('');
          setDrawerTitle('');
          setDrawerData([]);
        }}
        title={drawerTitle}
        type={drawerType}
        data={drawerData}
        currency={summary.currency || 'PKR'}
      />
    </>
  );
};

const FaPlaneDepartureIcon = () => <FaPlane aria-hidden="true" />;

export default TravelProfitSummaryModal;
