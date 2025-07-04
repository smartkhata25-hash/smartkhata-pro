// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

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
import AgingReport from './pages/AgingReport';
import InventoryPage from './pages/InventoryPage';
import SalesPage from './pages/SalesPage'; // ✅ Sales
import SuppliersPage from './pages/SuppliersPage'; // 🆕 Supplier Page import
import InvoiceForm from './components/InvoiceForm'; // ✅ New import for create-sale
import SupplierLedgerPage from './pages/SupplierLedgerPage';
import ProductLedgerPage from './pages/ProductLedgerPage'; // ✅ Product Ledger Page
import AccountDetailPage from './pages/AccountDetailPage';

/* 🆕 Purchase Invoice Page */
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';

/* ✅ Pay Bill Components */
import PayBillForm from './components/PayBillForm'; // ✅ نیا فارم
import PayBillList from './components/PayBillList'; // ✅ لسٹ ویو

/* ✅ Receive Payment Components */
import ReceivePaymentForm from './components/ReceivePaymentForm'; // ✅ نیا فارم
import ReceivePaymentList from './components/ReceivePaymentList'; // ✅ لسٹ ویو

/* ✅ ✅ ✅ Expense Components ✅ ✅ ✅ */
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';

import SalesInvoiceList from './components/SalesInvoiceList';

/* 🔒 */
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        {/* 🔓 Public */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 🔒 Protected */}
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
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute>
              <ChartOfAccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/journal-entries"
          element={
            <ProtectedRoute>
              <JournalEntriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trial-balance"
          element={
            <ProtectedRoute>
              <TrialBalancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ledger"
          element={
            <ProtectedRoute>
              <GeneralLedgerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/income-statement"
          element={
            <ProtectedRoute>
              <IncomeStatementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute>
              <SuppliersPage />
            </ProtectedRoute>
          }
        />

        {/* 🆕 Supplier Ledger Route */}
        <Route
          path="/supplier-ledger/:id"
          element={
            <ProtectedRoute>
              <SupplierLedgerPage />
            </ProtectedRoute>
          }
        />

        {/* Customer Ledger */}
        <Route
          path="/customer-ledger/:customerId"
          element={
            <ProtectedRoute>
              <CustomerLedgerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customer-ledger"
          element={
            <ProtectedRoute>
              <CustomerLedgerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/cash"
          element={
            <ProtectedRoute>
              <AccountDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts/bank"
          element={
            <ProtectedRoute>
              <AccountDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Reports & Inventory */}
        <Route
          path="/aging-report"
          element={
            <ProtectedRoute>
              <AgingReport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <InventoryPage />
            </ProtectedRoute>
          }
        />

        {/* Sales & Invoicing */}
        <Route
          path="/sales"
          element={
            <ProtectedRoute>
              <SalesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales-invoices"
          element={
            <ProtectedRoute>
              <SalesInvoiceList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-sale"
          element={
            <ProtectedRoute>
              <InvoiceForm />
            </ProtectedRoute>
          }
        />

        {/* ✅ 🆕 Product Ledger Route */}
        <Route
          path="/product-ledger/:productId"
          element={
            <ProtectedRoute>
              <ProductLedgerPage />
            </ProtectedRoute>
          }
        />

        {/* ✅ 🆕 Purchase Invoice Route */}
        <Route
          path="/purchase-invoice"
          element={
            <ProtectedRoute>
              <PurchaseInvoicePage />
            </ProtectedRoute>
          }
        />

        {/* ✅ Pay Bill Module Routes */}
        <Route
          path="/pay-bills"
          element={
            <ProtectedRoute>
              <PayBillList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay-bills/new"
          element={
            <ProtectedRoute>
              <PayBillForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay-bills/edit/:id"
          element={
            <ProtectedRoute>
              <PayBillForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay-bill"
          element={
            <ProtectedRoute>
              <PayBillForm />
            </ProtectedRoute>
          }
        />

        {/* ✅ ✅ ✅ Receive Payment Module Routes ✅ ✅ ✅ */}
        <Route
          path="/receive-payments"
          element={
            <ProtectedRoute>
              <ReceivePaymentList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receive-payments/new"
          element={
            <ProtectedRoute>
              <ReceivePaymentForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receive-payments/edit/:id"
          element={
            <ProtectedRoute>
              <ReceivePaymentForm />
            </ProtectedRoute>
          }
        />

        {/* ✅ ✅ ✅ Expense Module Routes ✅ ✅ ✅ */}
        <Route
          path="/expenses"
          element={
            <ProtectedRoute>
              <ExpenseList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-expense"
          element={
            <ProtectedRoute>
              <ExpenseForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit-expense/:id"
          element={
            <ProtectedRoute>
              <ExpenseForm />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
