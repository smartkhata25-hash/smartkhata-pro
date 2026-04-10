// src/App.js
import React from 'react';
import { useEffect } from 'react';
import { getCurrentLanguage } from './i18n/i18n';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { navigationService } from './utils/navigationService';

/* 🔑 Pages */
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PersonalInfoForm from './pages/PersonalInfoForm';
import BusinessInfoForm from './pages/BusinessInfoForm';
import DashboardPage from './pages/DashboardPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import JournalEntriesPage from './pages/JournalEntriesPage';
import TrialBalancePage from './pages/TrialBalancePage';
import GeneralLedgerPage from './pages/GeneralLedgerPage';
import IncomeStatementPage from './pages/IncomeStatementPage';
import CustomersPage from './pages/CustomersPage';
import CustomerLedgerPage from './pages/CustomerLedgerPage';
import CustomerDetailLedgerPage from './pages/CustomerDetailLedgerPage';
import SuppliersPage from './pages/SuppliersPage';
import SupplierLedgerPage from './pages/SupplierLedgerPage';
import SupplierDetailLedgerPage from './pages/SupplierDetailLedgerPage';
import AgingReport from './pages/AgingReport';
import InventoryPage from './pages/InventoryPage';
import StockHistoryPage from './pages/StockHistoryPage';
import SalesPage from './pages/SalesPage';
import ProductLedgerPage from './pages/ProductLedgerPage';
import AccountDetailPage from './pages/AccountDetailPage';
import CashFlowPage from './pages/CashFlowPage';
import MonthlySalesPage from './pages/MonthlySalesPage';
import CategoryManagement from './pages/CategoryManagement';
import InventoryAdjustPage from './pages/InventoryAdjustPage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import PurchaseReturnPage from './pages/PurchaseReturnPage';
import RefundPage from './pages/RefundPage';
import PrintSettingsPage from './pages/PrintSettingsPage';
import BackupPage from './pages/BackupPage';
import PrintInvoicePage from './pages/PrintInvoicePage';
import InviteUser from './pages/InviteUser';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDevices from './pages/AdminDevices';

/* 📋 Lists */
import SalesInvoiceList from './components/SalesInvoiceList';
import PurchaseInvoiceList from './components/PurchaseInvoiceList';
import PurchaseReturnList from './components/PurchaseReturnList';
import PayBillList from './components/PayBillList';
import ReceivePaymentList from './components/ReceivePaymentList';
import RefundInvoiceList from './components/RefundInvoiceList';
import ExpenseList from './components/ExpenseList';

/* 📝 Forms */
import ProductForm from './components/ProductForm';
import PayBillForm from './components/PayBillForm';
import ReceivePaymentForm from './components/ReceivePaymentForm';
import ExpenseForm from './components/ExpenseForm';
import ImportDataPage from './pages/ImportDataPage';

/* 🔒 */
import ProtectedRoute from './components/ProtectedRoute';

/* 🆕 Layout */
import MainLayout from './layout/MainLayout';

function NavigationTracker() {
  const location = useLocation();

  useEffect(() => {
    navigationService.push(location.pathname);
  }, [location.pathname]);

  return null;
}

function App() {
  useEffect(() => {
    const lang = getCurrentLanguage();

    if (lang === 'ur') {
      document.body.classList.add('urdu-mode');
    } else {
      document.body.classList.remove('urdu-mode');
    }
  }, []);

  return (
    <Router>
      <NavigationTracker />
      <Routes>
        {/* 🔓 Public Routes */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite" element={<InviteUser />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/admin/devices"
          element={
            <ProtectedRoute>
              <AdminDevices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/invite"
          element={
            <ProtectedRoute>
              <InviteUser />
            </ProtectedRoute>
          }
        />

        {/* 🔒 Setup (No Layout) */}
        <Route
          path="/personal-info"
          element={
            <ProtectedRoute>
              <PersonalInfoForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/business-info"
          element={
            <ProtectedRoute>
              <BusinessInfoForm />
            </ProtectedRoute>
          }
        />

        {/* 🔒 Protected Layout Routes */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/import" element={<ImportDataPage />} />

          {/* Accounts */}
          <Route path="/accounts" element={<ChartOfAccountsPage />} />
          <Route path="/accounts/cash" element={<AccountDetailPage />} />
          <Route path="/accounts/bank" element={<AccountDetailPage />} />

          {/* Journal */}
          <Route path="/journal-entries" element={<JournalEntriesPage />} />
          <Route path="/ledger" element={<GeneralLedgerPage />} />
          <Route path="/ledger/:accountId" element={<GeneralLedgerPage />} />
          <Route path="/trial-balance" element={<TrialBalancePage />} />
          <Route path="/income-statement" element={<IncomeStatementPage />} />

          {/* Customers */}
          <Route path="/customers" element={<CustomersPage />} />

          {/* 🔥 CUSTOMER LEDGER ROUTES */}
          <Route
            path="/customer-ledger/:customerId/detail"
            element={<CustomerDetailLedgerPage />}
          />
          <Route path="/customer-detail-ledger" element={<CustomerDetailLedgerPage />} />
          <Route path="/customer-ledger/:customerId" element={<CustomerLedgerPage />} />
          <Route path="/customer-ledger" element={<CustomerLedgerPage />} />

          {/* Suppliers */}
          <Route path="/suppliers" element={<SuppliersPage />} />

          {/* 🔥 SUPPLIER LEDGER ROUTES */}
          <Route
            path="/supplier-ledger/:supplierId/detail"
            element={<SupplierDetailLedgerPage />}
          />
          <Route path="/supplier-detail-ledger" element={<SupplierDetailLedgerPage />} />
          <Route path="/supplier-ledger/:supplierId" element={<SupplierLedgerPage />} />
          <Route path="/supplier-ledger" element={<SupplierLedgerPage />} />

          {/* Reports */}
          <Route path="/aging-report" element={<AgingReport />} />
          <Route path="/cashflow" element={<CashFlowPage />} />
          <Route path="/monthly-sales" element={<MonthlySalesPage />} />

          {/* Inventory */}
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/stock-history" element={<StockHistoryPage />} />
          <Route path="/inventory-adjust" element={<InventoryAdjustPage />} />
          <Route path="/categories" element={<CategoryManagement />} />
          <Route path="/product-ledger/:productId" element={<ProductLedgerPage />} />
          <Route path="/product-ledger" element={<ProductLedgerPage />} />
          <Route path="/add-product" element={<ProductForm />} />

          {/* Sales */}
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/create-sale" element={<SalesPage />} />
          <Route path="/sales-invoices" element={<SalesInvoiceList />} />
          <Route path="/refunds" element={<RefundInvoiceList />} />
          <Route path="/refunds/new" element={<RefundPage />} />
          <Route path="/refunds/edit/:id" element={<RefundPage />} />

          {/* Purchases */}
          <Route path="/purchase-invoice" element={<PurchaseInvoicePage />} />
          <Route path="/purchase-invoice/:id" element={<PurchaseInvoicePage />} />
          <Route path="/purchase-invoices" element={<PurchaseInvoiceList />} />
          <Route path="/purchase-returns" element={<PurchaseReturnList />} />
          <Route path="/purchase-returns/new" element={<PurchaseReturnPage />} />
          <Route path="/purchase-returns/edit/:id" element={<PurchaseReturnPage />} />

          {/* Banking */}
          <Route path="/receive-payments" element={<ReceivePaymentList />} />
          <Route path="/receive-payments/new" element={<ReceivePaymentForm />} />
          <Route path="/receive-payments/edit/:id" element={<ReceivePaymentForm />} />
          <Route path="/pay-bills" element={<PayBillList />} />
          <Route path="/pay-bills/new" element={<PayBillForm />} />
          <Route path="/pay-bills/edit/:id" element={<PayBillForm />} />

          {/* Expenses */}
          <Route path="/expenses" element={<ExpenseList />} />
          <Route path="/print-settings" element={<PrintSettingsPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/add-expense" element={<ExpenseForm />} />
          <Route path="/edit-expense/:id" element={<ExpenseForm />} />
        </Route>
        <Route
          path="/print/:type/:id"
          element={
            <ProtectedRoute>
              <PrintInvoicePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/print/preview"
          element={
            <ProtectedRoute>
              <PrintInvoicePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
