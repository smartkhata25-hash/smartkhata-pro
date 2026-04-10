import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { t } from '../i18n/i18n';

const DashboardPage = () => {
  const navigate = useNavigate();

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
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState('month');

  useEffect(() => {
    const key = isMobile ? 'showDashboardCards_mobile' : 'showDashboardCards_desktop';
    localStorage.setItem(key, JSON.stringify(showCards));
  }, [showCards, isMobile]);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = process.env.REACT_APP_API_BASE_URL;

        let startDate = '';
        let endDate = '';

        const year = selectedYear;

        if (filterType === 'month') {
          startDate = new Date(year, selectedMonth, 1).toISOString();
          endDate = new Date(year, selectedMonth + 1, 0).toISOString();
        }

        if (filterType === 'year') {
          startDate = new Date(year, 0, 1).toISOString();
          endDate = new Date(year, 11, 31).toISOString();
        }

        if (filterType === 'all') {
          startDate = '';
          endDate = '';
        }

        let url = `${baseUrl}/api/dashboard-summary`;

        if (startDate && endDate) {
          url += `?startDate=${startDate}&endDate=${endDate}`;
        }

        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSummary(res.data);
      } catch (err) {
        console.error(t('alerts.dashboardSummaryFetchError'), err);
      }
    };

    fetchSummary();
  }, [selectedMonth, selectedYear, filterType]);

  return (
    <div className="space-y-10">
      {/* Page Title + Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">{t('dashboard')}</h1>

        {/* 👁 Toggle Button */}
        <div className="flex items-center gap-2">
          {/* 👁 Toggle */}
          <button
            onClick={() => setShowCards((prev) => !prev)}
            className="text-xs md:text-sm px-3 py-1.5 rounded-full 
bg-white/80 backdrop-blur-md border border-gray-300 
shadow-sm hover:shadow-md hover:bg-gray-100 
transition-all duration-200 
font-medium"
          >
            {showCards ? 'Hide' : 'Show'}
          </button>

          {/* 📅 Month Dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs md:text-sm px-3 py-1.5 rounded-full border border-gray-300 bg-white"
          >
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="all">Total</option>
          </select>
          {filterType === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-xs md:text-sm px-3 py-1.5 rounded-full border border-gray-300 bg-white"
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
              className="text-xs md:text-sm px-3 py-1.5 rounded-full border border-gray-300 bg-white"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {showCards && (
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
            onClick={() => {}}
          />
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-6">{t('quickActions')}</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
          <QuickAction
            label={t('saleInvoice')}
            icon="📄"
            gradient="from-emerald-600 via-emerald-500 to-green-600"
            onClick={() => navigate('/sales')}
          />

          <QuickAction
            label={t('purchaseInvoice')}
            icon="🧾"
            gradient="from-blue-600 via-indigo-500 to-indigo-600"
            onClick={() => navigate('/purchase-invoice')}
          />

          <QuickAction
            label={t('receivePayment')}
            icon="💰"
            gradient="from-teal-600 via-cyan-500 to-cyan-600"
            onClick={() => navigate('/receive-payments/new')}
          />

          <QuickAction
            label={t('payBill')}
            icon="💳"
            gradient="from-orange-600 via-amber-500 to-orange-600"
            onClick={() => navigate('/pay-bills/new')}
          />

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
        rounded-2xl p-6 cursor-pointer
        transition-all duration-300
        hover:-translate-y-1 hover:shadow-2xl
        bg-gradient-to-br ${gradient}
        shadow-lg
      `}
    >
      <div className="flex flex-col items-center justify-center space-y-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center
          text-2xl text-white bg-white/20 backdrop-blur-md shadow-lg"
        >
          {icon}
        </div>

        <div className="text-sm font-semibold text-white text-center">{label}</div>
      </div>
    </div>
  );
};

export default DashboardPage;
