import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';
import BalanceBreakdownModal from '../components/BalanceBreakdownModal';
const baseUrl = process.env.REACT_APP_API_BASE_URL;

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

const StatCard = ({ label, value, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full p-3 rounded-lg text-sm font-medium border border-gray-200 text-left transition ${
      onClick
        ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200'
        : 'cursor-default'
    } ${color}`}
  >
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>

      {onClick && <span className="text-xs font-semibold opacity-70">View Details →</span>}
    </div>

    <div className="text-lg font-bold mt-1">
      Rs.{' '}
      {Number(value || 0).toLocaleString('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}
    </div>
  </button>
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
  const canViewRightPanel = hasPermission('dashboard.right_panel');

  const [summary, setSummary] = useState({
    totalReceivable: 0,
    totalPayable: 0,
    receivableDetails: [],
    payableDetails: [],
  });

  const [alerts, setAlerts] = useState({
    lowStock: 0,
    overdueInvoices: 0,
    pendingPayments: 0,
  });

  // ✅ receivable یا payable Modal
  const [breakdownType, setBreakdownType] = useState(null);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // ✅ Modal کی Row سے متعلقہ Ledger کھولیں
  const handleOpenLedger = useCallback(
    (item) => {
      if (!item?.entityId) {
        return;
      }

      // Modal پہلے بند کریں
      setBreakdownType(null);

      if (item.entityType === 'customer') {
        navigate(`/customer-ledger/${item.entityId}`);
        return;
      }

      if (item.entityType === 'supplier') {
        navigate(`/supplier-ledger/${item.entityId}`);
        return;
      }

      if (item.entityType === 'party') {
        navigate(`/party-ledger/${item.entityId}`);
      }
    },
    [navigate]
  );
  // ✅ stable fetch function (no warning)
  const fetchData = useCallback(async () => {
    if (!canViewRightPanel) {
      return;
    }

    try {
      const [summaryRes, alertsRes] = await Promise.all([
        axios.get(`${baseUrl}/api/dashboard-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),

        axios.get(`${baseUrl}/api/dashboard-alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setSummary(summaryRes.data);
      setAlerts(alertsRes.data?.summary || {});
    } catch (err) {
      console.error(t('alerts.panelLoadError'), err);
    }
  }, [token, canViewRightPanel]);

  // ✅ auto + initial load
  useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!canViewRightPanel) {
    return null;
  }
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
          onClick={() => setBreakdownType('receivable')}
        />

        <StatCard
          label={t('payables')}
          value={summary.totalPayable}
          color="bg-red-50 text-red-600"
          onClick={() => setBreakdownType('payable')}
        />
      </Section>

      {/* 🔥 SMART ALERTS (LIVE) */}
      <Section title={t('smartAlerts')}>
        <AlertCard
          title={t('lowStock')}
          count={alerts.lowStock}
          color="bg-red-50 text-red-600"
          onClick={() => navigate('/inventory?lowstock=true')}
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

      {/* ✅ RECEIVABLE / PAYABLE BREAKDOWN MODAL */}
      <BalanceBreakdownModal
        isOpen={Boolean(breakdownType)}
        onClose={() => setBreakdownType(null)}
        type={breakdownType || 'receivable'}
        items={
          breakdownType === 'payable'
            ? summary.payableDetails || []
            : summary.receivableDetails || []
        }
        total={
          breakdownType === 'payable' ? summary.totalPayable || 0 : summary.totalReceivable || 0
        }
        onOpenLedger={handleOpenLedger}
      />
    </div>
  );
};

export default RightPanel;
