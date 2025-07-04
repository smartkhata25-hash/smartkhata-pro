import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import en from '../locales/en';
import MonthlySalesChart from '../components/MonthlySalesChart';
import CashFlowChart from '../components/CashFlowChart';

const DashboardPage = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState({
    totalSales: 0,
    totalExpenses: 0,
    totalCash: 0,
    totalBank: 0,
  });

  const [showDropdown, setShowDropdown] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showSalesChart, setShowSalesChart] = useState(false);
  const [showCashChart, setShowCashChart] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const token = localStorage.getItem('token');
        const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const res = await axios.get(`${baseUrl}/api/dashboard-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSummary(res.data);
      } catch (err) {
        console.error('Dashboard summary fetch error:', err);
      }
    };

    fetchSummary();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/login');
  };

  return (
    <div style={{ padding: '20px', position: 'relative' }}>
      {/* 🔴 Logout Button */}
      <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
        <button
          onClick={handleLogout}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '5px',
          }}
        >
          {en.logout}
        </button>
      </div>

      <h1>{en.dashboardTitle}</h1>
      <p>{en.dashboardSubtitle}</p>
      {/* 📦 Summary Boxes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '60px' }}>
        <SummaryCard
          label="Total Sales"
          value={`Rs. ${(summary.totalSales || 0).toFixed(2)}`}
          onClick={() => navigate('/sales-invoices')}
          bg="#fde2e2"
        />

        <SummaryCard
          label={en.totalExpenses}
          value={summary.totalExpenses}
          onClick={() => navigate('/add-expense')}
          bg="#fbeae9"
        />
        <SummaryCard
          label="💵 Hand Cash"
          value={summary.totalCash}
          onClick={() => navigate('/accounts/cash')}
          bg="#e2f7e9"
        />
        <SummaryCard
          label="🏦 Bank Accounts"
          value={summary.totalBank}
          onClick={() => navigate('/accounts/bank')}
          bg="#e2f0fb"
        />
        <SummaryCard
          label="👥 Customers"
          value="Manage your customers"
          onClick={() => navigate('/customers')}
          bg="#d1ecf1"
        />
        <SummaryCard
          label="🚚 Suppliers"
          value="Manage your suppliers"
          onClick={() => navigate('/suppliers')}
          bg="#f0fce5"
        />
        <SummaryCard
          label="📦 Sales & Invoicing"
          value="Create and manage invoices"
          onClick={() => navigate('/sales')}
          bg="#e2e3f3"
        />
        <SummaryCard
          label="📥 Purchase Invoice"
          value="Add new purchase bills"
          onClick={() => navigate('/purchase-invoice')}
          bg="#fff3cd"
        />
        <SummaryCard
          label="📤 Pay Bills"
          value="Manage outgoing payments"
          onClick={() => navigate('/pay-bills/new')}
          bg="#fbeae9"
        />
        <SummaryCard
          label="💸 Receive Payments"
          value="Manage incoming payments"
          onClick={() => navigate('/receive-payments/new')}
          bg="#e9fbe9"
        />
      </div>

      {/* 📂 Dropdown Menus */}
      <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
        <DropdownMenu
          title="📁 Accounting Tools"
          isOpen={showDropdown}
          setOpen={setShowDropdown}
          items={[
            { label: en.chartOfAccounts, path: '/accounts' },
            { label: en.journalEntries, path: '/journal-entries' },
            { label: en.trialBalance, path: '/trial-balance' },
            { label: en.generalLedger, path: '/ledger' },
            { label: en.incomeStatement, path: '/income-statement' },
            { label: '📦 Inventory Management', path: '/inventory' },
            { label: '💰 Receive Payments List', path: '/receive-payments' },
            { label: '🧾 Pay Bill List', path: '/pay-bills' },
            { label: '📉 Expense List', path: '/expenses' },
          ]}
        />

        <DropdownMenu
          title="📊 Visual Reports"
          isOpen={showCharts}
          setOpen={setShowCharts}
          items={[
            {
              label: '📈 Monthly Sales Chart',
              action: () => setShowSalesChart(!showSalesChart),
            },
            {
              label: '💸 Cash Flow Chart',
              action: () => setShowCashChart(!showCashChart),
            },
            {
              label: '📊 Aging Report',
              path: '/aging-report',
            },
          ]}
        />
      </div>

      {/* 📉 Chart Displays */}
      {showSalesChart && <MonthlySalesChart />}
      {showCashChart && <CashFlowChart />}
    </div>
  );
};

const SummaryCard = ({ label, value, onClick, bg }) => (
  <div
    onClick={onClick}
    style={{
      ...boxStyle,
      backgroundColor: bg || '#f2f2f2',
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    <h3>{label}</h3>
    <p>{typeof value === 'number' ? `Rs. ${value.toFixed(0)}` : value}</p>
  </div>
);

const DropdownMenu = ({ title, items, isOpen, setOpen }) => {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => setOpen(!isOpen)} style={menuButton}>
        {title} ▼
      </button>
      {isOpen && (
        <div style={dropdownStyle}>
          {items.map((item, idx) => (
            <p
              key={idx}
              style={dropdownItem}
              onClick={() => {
                if (item.path) navigate(item.path);
                else if (item.action) item.action();
              }}
            >
              {item.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

// ✅ Styles
const boxStyle = {
  flex: '1 1 200px',
  padding: '20px',
  borderRadius: '10px',
  boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
};

const menuButton = {
  padding: '10px 15px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '5px',
};

const dropdownStyle = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #ccc',
  padding: '10px',
  borderRadius: '5px',
  marginTop: '10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const dropdownItem = {
  cursor: 'pointer',
  padding: '5px 0',
  fontSize: '16px',
};

export default DashboardPage;
