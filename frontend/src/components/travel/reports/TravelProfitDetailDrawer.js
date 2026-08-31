import React, { useMemo } from 'react';
import {
  FaChartLine,
  FaFileInvoiceDollar,
  FaPlane,
  FaReceipt,
  FaTimes,
  FaWallet,
} from 'react-icons/fa';

const getSafeNumber = (value) => {
  const number = Number(value || 0);

  return Number.isFinite(number) ? number : 0;
};

const formatMoney = (value) =>
  `Rs. ${getSafeNumber(value).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatPercent = (value) =>
  `${getSafeNumber(value).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;

const DRAWER_CONFIG = Object.freeze({
  sales: {
    icon: FaFileInvoiceDollar,
    iconClass: 'bg-blue-100 text-blue-700',
    accentClass: 'from-blue-500 to-indigo-600',
  },

  cost: {
    icon: FaReceipt,
    iconClass: 'bg-amber-100 text-amber-700',
    accentClass: 'from-amber-500 to-orange-600',
  },

  expense: {
    icon: FaWallet,
    iconClass: 'bg-rose-100 text-rose-700',
    accentClass: 'from-rose-500 to-red-600',
  },

  services: {
    icon: FaPlane,
    iconClass: 'bg-violet-100 text-violet-700',
    accentClass: 'from-violet-500 to-purple-600',
  },

  default: {
    icon: FaChartLine,
    iconClass: 'bg-slate-100 text-slate-700',
    accentClass: 'from-slate-500 to-slate-700',
  },
});

const EmptyState = () => (
  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-400">
      <FaChartLine aria-hidden="true" />
    </div>

    <p className="mt-4 text-sm font-extrabold text-slate-700">No data found</p>

    <p className="mt-1 text-xs font-semibold text-slate-500">
      No records are available for the selected period.
    </p>
  </div>
);

const SalesCostTable = ({ data = [], type }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-4 py-3 text-left font-extrabold text-slate-700">
                Description
              </th>

              <th className="border border-slate-200 px-4 py-3 text-right font-extrabold text-slate-700">
                Amount
              </th>
            </tr>
          </thead>

          <tbody>
            {data.map((row, index) => {
              const amount = getSafeNumber(row.amount);

              const isHighlight = Boolean(row.highlight);

              return (
                <tr
                  key={row.key || index}
                  className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                    isHighlight ? 'bg-slate-50' : 'bg-white'
                  }`}
                >
                  <td
                    className={`border-x border-slate-100 px-4 py-3 ${
                      isHighlight ? 'font-extrabold text-slate-950' : 'font-semibold text-slate-700'
                    }`}
                  >
                    {row.label || '-'}
                  </td>

                  <td
                    className={`border-x border-slate-100 px-4 py-3 text-right font-extrabold ${
                      isHighlight
                        ? type === 'sales'
                          ? 'text-blue-700'
                          : 'text-amber-700'
                        : amount < 0
                          ? 'text-rose-700'
                          : 'text-slate-800'
                    }`}
                  >
                    {formatMoney(amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExpenseTable = ({ data = [] }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState />;
  }

  const total = data.reduce((sum, row) => sum + getSafeNumber(row.amount ?? row.total), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-4 py-3 text-left font-extrabold text-slate-700">
                Expense
              </th>

              <th className="border border-slate-200 px-4 py-3 text-left font-extrabold text-slate-700">
                Code
              </th>

              <th className="border border-slate-200 px-4 py-3 text-center font-extrabold text-slate-700">
                Entries
              </th>

              <th className="border border-slate-200 px-4 py-3 text-right font-extrabold text-slate-700">
                Amount
              </th>
            </tr>
          </thead>

          <tbody>
            {data.map((row, index) => (
              <tr
                key={row.accountId || row.key || index}
                className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50 hover:bg-rose-50/40"
              >
                <td className="border-x border-slate-100 px-4 py-3 font-bold text-slate-800">
                  {row.accountName || row.title || row.label || 'Expense'}
                </td>

                <td className="border-x border-slate-100 px-4 py-3 font-semibold text-slate-600">
                  {row.accountCode || row.code || '-'}
                </td>

                <td className="border-x border-slate-100 px-4 py-3 text-center font-semibold text-slate-700">
                  {getSafeNumber(row.count).toLocaleString('en-GB')}
                </td>

                <td className="border-x border-slate-100 px-4 py-3 text-right font-extrabold text-rose-600">
                  {formatMoney(row.amount ?? row.total)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot className="sticky bottom-0 bg-rose-50">
            <tr>
              <td
                colSpan={3}
                className="border-t-2 border-rose-200 px-4 py-3 text-right font-extrabold text-slate-800"
              >
                Total Expenses
              </td>

              <td className="border-t-2 border-rose-200 px-4 py-3 text-right font-black text-rose-700">
                {formatMoney(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

const ServiceProfitabilityTable = ({ data = [] }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-3 py-3 text-left font-extrabold text-slate-700">
                Service
              </th>

              <th className="border border-slate-200 px-3 py-3 text-center font-extrabold text-slate-700">
                Invoices
              </th>

              <th className="border border-slate-200 px-3 py-3 text-right font-extrabold text-slate-700">
                Sales
              </th>

              <th className="border border-slate-200 px-3 py-3 text-right font-extrabold text-slate-700">
                Refunds
              </th>

              <th className="border border-slate-200 px-3 py-3 text-right font-extrabold text-slate-700">
                Net Sales
              </th>

              <th className="border border-slate-200 px-3 py-3 text-right font-extrabold text-slate-700">
                Travel Cost
              </th>

              <th className="border border-slate-200 px-3 py-3 text-right font-extrabold text-slate-700">
                Profit
              </th>

              <th className="border border-slate-200 px-3 py-3 text-right font-extrabold text-slate-700">
                Margin
              </th>
            </tr>
          </thead>

          <tbody>
            {data.map((row, index) => {
              const profit = getSafeNumber(row.grossProfit);
              const margin = getSafeNumber(row.marginPct);

              return (
                <tr
                  key={row.key || row.serviceId || index}
                  className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50 hover:bg-violet-50/40"
                >
                  <td className="border-x border-slate-100 px-3 py-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-900">
                        {row.label || row.serviceName || 'Travel Service'}
                      </p>

                      {row.itemType && (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          {String(row.itemType)
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (char) => char.toUpperCase())}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="border-x border-slate-100 px-3 py-3 text-center font-bold text-slate-700">
                    {getSafeNumber(row.invoiceCount).toLocaleString('en-GB')}
                  </td>

                  <td className="border-x border-slate-100 px-3 py-3 text-right font-bold text-blue-700">
                    {formatMoney(row.grossSales)}
                  </td>

                  <td className="border-x border-slate-100 px-3 py-3 text-right font-bold text-rose-600">
                    {formatMoney(row.refunds)}
                  </td>

                  <td className="border-x border-slate-100 px-3 py-3 text-right font-bold text-cyan-700">
                    {formatMoney(row.netSales)}
                  </td>

                  <td className="border-x border-slate-100 px-3 py-3 text-right font-bold text-amber-700">
                    {formatMoney(row.netCost)}
                  </td>

                  <td
                    className={`border-x border-slate-100 px-3 py-3 text-right font-black ${
                      profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatMoney(profit)}
                  </td>

                  <td
                    className={`border-x border-slate-100 px-3 py-3 text-right font-extrabold ${
                      margin >= 0 ? 'text-violet-700' : 'text-rose-700'
                    }`}
                  >
                    {formatPercent(margin)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TravelProfitDetailDrawer = ({
  isOpen,
  onClose,
  title = '',
  type = 'sales',
  data = [],
  loading = false,
}) => {
  const config = DRAWER_CONFIG[type] || DRAWER_CONFIG.default;

  const Icon = config.icon;

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  if (!isOpen) {
    return null;
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" />

            <p className="mt-3 text-sm font-bold text-slate-500">Loading details...</p>
          </div>
        </div>
      );
    }

    if (type === 'expense') {
      return <ExpenseTable data={safeData} />;
    }

    if (type === 'services') {
      return <ServiceProfitabilityTable data={safeData} />;
    }

    if (type === 'sales' || type === 'cost') {
      return <SalesCostTable data={safeData} type={type} />;
    }

    return <EmptyState />;
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed right-0 top-0 z-[90] flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl sm:w-[760px] lg:w-[900px]">
        <div className={`h-1 w-full bg-gradient-to-r ${config.accentClass}`} />

        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base shadow-sm ${config.iconClass}`}
            >
              <Icon aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold text-slate-900">
                {title || 'Profit Details'}
              </h2>

              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Travel financial drill-down
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            aria-label="Close"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-slate-50/40 p-3 sm:p-5">{renderContent()}</div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <p className="text-xs font-semibold text-slate-500">
            {safeData.length.toLocaleString('en-GB')} record
            {safeData.length === 1 ? '' : 's'}
          </p>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-900"
          >
            Close
          </button>
        </footer>
      </div>
    </>
  );
};

export default TravelProfitDetailDrawer;
