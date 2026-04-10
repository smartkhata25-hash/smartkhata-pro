import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const Section = ({ title, children }) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-5 border rounded-lg bg-white shadow-sm">
      <div
        className="flex justify-between items-center px-3 py-2 cursor-pointer bg-gray-50"
        onClick={() => setOpen(!open)}
      >
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</span>
        <span className="text-sm">{open ? '▾' : '▸'}</span>
      </div>

      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
  <div className={`p-3 rounded-lg text-sm font-medium border border-gray-200 ${color}`}>
    <div>{label}</div>
    <div className="text-lg font-bold mt-1">Rs. {Number(value || 0).toLocaleString()}</div>
  </div>
);

const AlertCard = ({ title, count, color, onClick }) => (
  <div
    onClick={onClick}
    className={`p-3 rounded-lg text-sm font-medium border border-gray-200 cursor-pointer hover:shadow transition flex justify-between items-center ${color}`}
  >
    <span>{title}</span>
    <span className="font-bold">{count}</span>
  </div>
);

const RightPanel = () => {
  const [summary, setSummary] = useState({});
  const [alerts, setAlerts] = useState({
    lowStock: 0,
    overdueInvoices: 0,
    pendingPayments: 0,
  });

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // ✅ stable fetch function (no warning)
  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, alertsRes] = await Promise.all([
        axios.get(`/api/dashboard-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`/api/dashboard-alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setSummary(summaryRes.data);
      setAlerts(alertsRes.data.summary);
    } catch (err) {
      console.error(t('alerts.panelLoadError'), err);
    }
  }, [token]);

  // ✅ auto + initial load
  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="h-full bg-white border-l border-gray-200 p-5 shadow-lg overflow-y-auto">
      {/* 🔄 Refresh Button */}
      <div className="flex justify-end mb-3">
        <button
          onClick={fetchData}
          className="text-xs px-3 py-1 rounded-full border border-gray-300 bg-white hover:bg-gray-100"
        >
          🔄 {t('common.refresh')}
        </button>
      </div>

      {/* 🔹 Financial Position */}
      <Section title={t('financialPosition')}>
        <StatCard
          label={t('receivables')}
          value={summary.totalReceivable}
          color="bg-yellow-50 text-yellow-700"
        />
        <StatCard
          label={t('payables')}
          value={summary.totalPayable}
          color="bg-red-50 text-red-600"
        />
      </Section>

      {/* 🔥 SMART ALERTS (LIVE) */}
      <Section title={t('smartAlerts')}>
        <AlertCard
          title={t('lowStock')}
          count={alerts.lowStock}
          color="bg-red-50 text-red-600"
          onClick={() => navigate('/inventory')}
        />

        <AlertCard
          title={t('overdueInvoices')}
          count={alerts.overdueInvoices}
          color="bg-yellow-50 text-yellow-700"
          onClick={() => navigate('/sales-invoices?filter=overdue')}
        />

        <AlertCard
          title={t('pendingPayments')}
          count={alerts.pendingPayments}
          color="bg-purple-50 text-purple-600"
          onClick={() => navigate('/sales-invoices?filter=pending')}
        />
      </Section>
    </div>
  );
};

export default RightPanel;
