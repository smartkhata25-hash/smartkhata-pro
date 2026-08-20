import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProfitSummaryModal from '../components/profit/ProfitSummaryModal';
import { t } from '../i18n/i18n';
import PermissionGuard from '../components/PermissionGuard';
import { hasPermission } from '../utils/permissionHelper';

const DashboardPage = () => {
  const navigate = useNavigate();

  const canViewSummaryCards = hasPermission('dashboard.summary_cards');

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🔥 separate state for mobile & desktop
  const [showCards, setShowCards] = useState(() => {
    const key = isMobile ? 'showDashboardCards_mobile' : 'showDashboardCards_desktop';
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [summary, setSummary] = useState({
    totalSales: 0,
    totalExpenses: 0,
    totalCash: 0,
    totalBank: 0,
  });
  const [showProfitModal, setShowProfitModal] = useState(false);

  const [profitData, setProfitData] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState('month');

  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    const key = isMobile ? 'showDashboardCards_mobile' : 'showDashboardCards_desktop';
    localStorage.setItem(key, JSON.stringify(showCards));
  }, [showCards, isMobile]);

  const fetchSummary = useCallback(
    async ({ forceRefresh = false } = {}) => {
      if (!canViewSummaryCards) {
        return;
      }

      try {
        setSummaryLoading(true);

        const token = localStorage.getItem('token');
        const baseUrl = process.env.REACT_APP_API_BASE_URL;

        let startDate = '';
        let endDate = '';

        const year = selectedYear;

        const formatDate = (date) => {
          const dateYear = date.getFullYear();
          const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
          const dateDay = String(date.getDate()).padStart(2, '0');

          return `${dateYear}-${dateMonth}-${dateDay}`;
        };

        if (filterType === 'today') {
          const today = new Date();
          const todayDate = formatDate(today);

          startDate = `${todayDate}T00:00:00.000+05:00`;
          endDate = `${todayDate}T23:59:59.999+05:00`;
        }

        if (filterType === 'month') {
          const firstDay = new Date(year, selectedMonth, 1);
          const lastDay = new Date(year, selectedMonth + 1, 0);

          startDate = `${formatDate(firstDay)}T00:00:00.000+05:00`;
          endDate = `${formatDate(lastDay)}T23:59:59.999+05:00`;
        }

        if (filterType === 'year') {
          startDate = `${year}-01-01T00:00:00.000+05:00`;
          endDate = `${year}-12-31T23:59:59.999+05:00`;
        }

        const params = new URLSearchParams();

        if (filterType !== 'all' && startDate && endDate) {
          params.set('filterType', filterType);
          params.set('startDate', startDate);
          params.set('endDate', endDate);
        }

        if (forceRefresh) {
          params.set('refresh', 'true');
        }

        const queryString = params.toString();

        const url = `${baseUrl}/api/dashboard-summary${queryString ? `?${queryString}` : ''}`;

        const res = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setSummary(res.data);
      } catch (err) {
        console.error(t('alerts.dashboardSummaryFetchError'), err);
      } finally {
        setSummaryLoading(false);
      }
    },
    [canViewSummaryCards, selectedMonth, selectedYear, filterType]
  );

  useEffect(() => {
    const sessionKey = 'dashboard_summary_loaded_this_session';

    const alreadyLoadedThisSession = sessionStorage.getItem(sessionKey) === 'true';

    fetchSummary({
      forceRefresh: !alreadyLoadedThisSession,
    }).then(() => {
      sessionStorage.setItem(sessionKey, 'true');
    });
  }, [fetchSummary]);

  return (
    <div className="space-y-10">
      {/* Page Title + Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          {t('dashboard')}
        </h1>

        {canViewSummaryCards && (
          <div className="flex items-center gap-2">
            {/* 🔄 Manual Refresh */}
            <button
              type="button"
              onClick={() => fetchSummary({ forceRefresh: true })}
              disabled={summaryLoading}
              className="text-xs md:text-sm px-3 rounded-full
bg-white/80 backdrop-blur-md border border-gray-300
shadow-sm hover:shadow-md hover:bg-gray-100
transition-all duration-200
font-medium h-[36px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {summaryLoading ? 'Refreshing...' : '🔄 Refresh'}
            </button>

            {/* 👁 Toggle */}
            <button
              onClick={() => setShowCards((prev) => !prev)}
              className="text-xs md:text-sm px-3 rounded-full 
bg-white/80 backdrop-blur-md border border-gray-300 
shadow-sm hover:shadow-md hover:bg-gray-100 
transition-all duration-200 
font-medium h-[36px]"
            >
              {showCards ? 'Hide' : 'Show'}
            </button>

            {/* 📅 Month Dropdown */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs md:text-sm px-3 rounded-full border border-gray-300 bg-white h-[36px]"
            >
              <option value="today">Today</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="all">Total</option>
            </select>
            {filterType === 'month' && (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="text-xs md:text-sm px-3 rounded-full border border-gray-300 bg-white h-[36px]"
              >
                {[
                  'Jan',
                  'Feb',
                  'Mar',
                  'Apr',
                  'May',
                  'Jun',
                  'Jul',
                  'Aug',
                  'Sep',
                  'Oct',
                  'Nov',
                  'Dec',
                ].map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            {filterType === 'year' && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="text-xs md:text-sm px-3 rounded-full border border-gray-300 bg-white h-[36px]"
              >
                {[2023, 2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {canViewSummaryCards && showCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <DashboardCard
            title={t('totalSales')}
            value={summary.totalSales}
            accent="bg-blue-500"
            onClick={() => navigate('/sales-invoices')}
          />

          <DashboardCard
            title={t('totalExpenses')}
            value={summary.totalExpenses}
            accent="bg-red-500"
            onClick={() => navigate('/expenses')}
          />

          <DashboardCard
            title={t('handCash')}
            value={summary.totalCash}
            accent="bg-green-500"
            onClick={() => navigate('/accounts/cash')}
          />

          <DashboardCard
            title={t('bankAccounts')}
            value={summary.totalBank}
            accent="bg-indigo-500"
            onClick={() => navigate('/accounts/bank')}
          />
          <DashboardCard
            title={t('netProfit')}
            value={summary.netProfit}
            accent={summary.netProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}
            onClick={() => {
              setProfitData(summary);
              setShowProfitModal(true);
            }}
          />
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-6 bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
          {t('quickActions')}
        </h2>

        <div className="grid grid-cols-3 gap-3">
          <QuickAction
            label={t('items')}
            icon="📦"
            gradient="from-slate-600 via-slate-500 to-slate-700"
            onClick={() => navigate('/inventory')}
          />

          <QuickAction
            label={t('customers')}
            icon="👥"
            gradient="from-cyan-600 via-sky-500 to-cyan-600"
            onClick={() => navigate('/customers')}
          />

          <QuickAction
            label={t('suppliers')}
            icon="🏪"
            gradient="from-pink-600 via-rose-500 to-pink-600"
            onClick={() => navigate('/suppliers')}
          />

          <PermissionGuard permission="sales.create">
            <QuickAction
              label={t('saleInvoice')}
              icon="📄"
              gradient="from-emerald-600 via-emerald-500 to-green-600"
              onClick={() => navigate('/sales')}
            />
          </PermissionGuard>

          <PermissionGuard permission="purchases.create">
            <QuickAction
              label={t('purchaseInvoice')}
              icon="🧾"
              gradient="from-blue-600 via-indigo-500 to-indigo-600"
              onClick={() => navigate('/purchase-invoice')}
            />
          </PermissionGuard>

          <PermissionGuard permission="receive_payments.create">
            <QuickAction
              label={t('receivePayment')}
              icon="💰"
              gradient="from-teal-600 via-cyan-500 to-cyan-600"
              onClick={() => navigate('/receive-payments/new')}
            />
          </PermissionGuard>

          <PermissionGuard permission="pay_bills.create">
            <QuickAction
              label={t('payBill')}
              icon="💳"
              gradient="from-orange-600 via-amber-500 to-orange-600"
              onClick={() => navigate('/pay-bills/new')}
            />
          </PermissionGuard>

          <QuickAction
            label={t('saleRefund')}
            icon="↩"
            gradient="from-red-600 via-rose-500 to-red-600"
            onClick={() => navigate('/refunds/new')}
          />

          <QuickAction
            label={t('purchaseReturn')}
            icon="📦"
            gradient="from-purple-600 via-violet-500 to-purple-600"
            onClick={() => navigate('/purchase-returns/new')}
          />
        </div>
      </div>

      {/* ✅ PROFIT SUMMARY MODAL */}

      <ProfitSummaryModal
        isOpen={showProfitModal}
        onClose={() => setShowProfitModal(false)}
        data={profitData}
      />
    </div>
  );
};

/* Dashboard Card */

const DashboardCard = ({ title, value, onClick, accent }) => {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-200 overflow-hidden"
    >
      <div className={`h-1 ${accent}`}></div>

      <div className="p-5">
        <h4 className="text-sm text-gray-500 font-medium">{title}</h4>

        <p className="mt-2 text-2xl font-bold text-gray-800">
          {t('currency.rs')} {Number(value || 0).toFixed(0)}
        </p>
      </div>
    </div>
  );
};

/* Quick Action */

const QuickAction = ({ label, onClick, icon, gradient }) => {
  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl p-3 cursor-pointer
        transition-all duration-300
        hover:-translate-y-1 hover:shadow-xl
        bg-gradient-to-br ${gradient}
        shadow-md min-h-[110px]
      `}
    >
      <div className="flex flex-col items-center justify-center space-y-2 h-full">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center
          text-lg text-white bg-white/20 backdrop-blur-md shadow-md"
        >
          {icon}
        </div>

        <div className="text-xs font-semibold text-white text-center leading-tight">{label}</div>
      </div>
    </div>
  );
};

export default DashboardPage;
