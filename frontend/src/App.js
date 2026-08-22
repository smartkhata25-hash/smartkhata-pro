// src/App.js
import React, { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

import { getCurrentLanguage } from './i18n/i18n';
import { navigationService } from './utils/navigationService';

import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';
import MainLayout from './layout/MainLayout';
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const PersonalInfoForm = lazy(() => import('./pages/PersonalInfoForm'));
const BusinessInfoForm = lazy(() => import('./pages/BusinessInfoForm'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ChartOfAccountsPage = lazy(() => import('./pages/ChartOfAccountsPage'));
const JournalEntriesPage = lazy(() => import('./pages/JournalEntriesPage'));
const TrialBalancePage = lazy(() => import('./pages/TrialBalancePage'));
const GeneralLedgerPage = lazy(() => import('./pages/GeneralLedgerPage'));
const IncomeStatementPage = lazy(() => import('./pages/IncomeStatementPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerLedgerPage = lazy(() => import('./pages/CustomerLedgerPage'));
const CustomerDetailLedgerPage = lazy(() => import('./pages/CustomerDetailLedgerPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const SupplierLedgerPage = lazy(() => import('./pages/SupplierLedgerPage'));
const SupplierDetailLedgerPage = lazy(() => import('./pages/SupplierDetailLedgerPage'));
const PartiesPage = lazy(() => import('./pages/PartiesPage'));
const PartyLedgerPage = lazy(() => import('./pages/PartyLedgerPage'));
const PartyDetailLedgerPage = lazy(() => import('./pages/PartyDetailLedgerPage'));
const AgingReport = lazy(() => import('./pages/AgingReport'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const StockHistoryPage = lazy(() => import('./pages/StockHistoryPage'));
const InventoryAdjustListPage = lazy(() => import('./pages/InventoryAdjustListPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const ProductLedgerPage = lazy(() => import('./pages/ProductLedgerPage'));
const AccountDetailPage = lazy(() => import('./pages/AccountDetailPage'));
const CashFlowPage = lazy(() => import('./pages/CashFlowPage'));
const MonthlySalesPage = lazy(() => import('./pages/MonthlySalesPage'));
const StockValueReportPage = lazy(() => import('./pages/StockValueReportPage'));
const ProductPerformancePage = lazy(() => import('./pages/ProductPerformancePage'));
const BusinessValuePage = lazy(() => import('./pages/BusinessValuePage'));
const CategoryManagement = lazy(() => import('./pages/CategoryManagement'));
const InventoryAdjustPage = lazy(() => import('./pages/InventoryAdjustPage'));
const PurchaseInvoicePage = lazy(() => import('./pages/PurchaseInvoicePage'));
const PurchaseReturnPage = lazy(() => import('./pages/PurchaseReturnPage'));
const RefundPage = lazy(() => import('./pages/RefundPage'));
const PrintSettingsPage = lazy(() => import('./pages/PrintSettingsPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));
const PrintInvoicePage = lazy(() => import('./pages/PrintInvoicePage'));
const InviteUser = lazy(() => import('./pages/InviteUser'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AdminDevices = lazy(() => import('./pages/AdminDevices'));
const LockScreen = lazy(() => import('./pages/LockScreen'));
const SetPinPage = lazy(() => import('./pages/SetPinPage'));
const ChangePinPage = lazy(() => import('./pages/ChangePinPage'));
const StaffManagementPage = lazy(() => import('./pages/StaffManagementPage'));
const StaffFormPage = lazy(() => import('./pages/StaffFormPage'));
const StaffPermissionsPage = lazy(() => import('./pages/StaffPermissionsPage'));
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'));
const ImportDataPage = lazy(() => import('./pages/ImportDataPage'));

const SalesInvoiceList = lazy(() => import('./components/SalesInvoiceList'));
const PurchaseInvoiceList = lazy(() => import('./components/PurchaseInvoiceList'));
const PurchaseReturnList = lazy(() => import('./components/PurchaseReturnList'));
const PayBillList = lazy(() => import('./components/PayBillList'));
const ReceivePaymentList = lazy(() => import('./components/ReceivePaymentList'));
const RefundInvoiceList = lazy(() => import('./components/RefundInvoiceList'));
const ExpenseList = lazy(() => import('./components/ExpenseList'));

const ProductForm = lazy(() => import('./components/ProductForm'));
const PayBillForm = lazy(() => import('./components/PayBillForm'));
const ReceivePaymentForm = lazy(() => import('./components/ReceivePaymentForm'));
const ExpenseForm = lazy(() => import('./components/ExpenseForm'));

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

  useEffect(() => {
    let currentRow = null;

    const handleClick = (event) => {
      const row = event.target.closest('tbody tr');

      if (!row) return;

      if (currentRow) {
        currentRow.classList.remove('active-row');
      }

      row.classList.add('active-row');
      currentRow = row;
    };

    const handleKeyDown = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      const rows = document.querySelectorAll('tbody tr');

      if (!rows.length) return;

      let index = Array.from(rows).indexOf(currentRow);

      if (index === -1) {
        index = 0;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        index = index + 1 < rows.length ? index + 1 : 0;
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        index = index - 1 >= 0 ? index - 1 : rows.length - 1;
      } else {
        return;
      }

      const nextRow = rows[index];

      if (!nextRow) return;

      if (currentRow) {
        currentRow.classList.remove('active-row');
      }

      nextRow.classList.add('active-row');
      nextRow.scrollIntoView({ block: 'nearest' });
      currentRow = nextRow;
    };

    document.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleAppClose = () => {
      const userId = localStorage.getItem('userId');

      if (userId) {
        localStorage.setItem(`isUnlocked_${userId}`, 'false');
      }
    };

    window.addEventListener('beforeunload', handleAppClose);

    return () => {
      window.removeEventListener('beforeunload', handleAppClose);
    };
  }, []);

  return (
    <Router>
      <NavigationTracker />

      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center text-gray-500">
            Loading...
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/invite" element={<InviteUser />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/lock" element={<LockScreen onUnlock={() => window.location.reload()} />} />

          <Route
            path="/set-pin"
            element={
              <ProtectedRoute>
                <SetPinPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/change-pin"
            element={
              <ProtectedRoute>
                <ChangePinPage />
              </ProtectedRoute>
            }
          />

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

          <Route
            path="/personal-info"
            element={
              <ProtectedRoute>
                <PermissionRoute ownerOnly>
                  <PersonalInfoForm />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/business-info"
            element={
              <ProtectedRoute>
                <PermissionRoute ownerOnly>
                  <BusinessInfoForm />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route
              path="/import"
              element={
                <PermissionRoute permission="settings.import">
                  <ImportDataPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/staff"
              element={
                <PermissionRoute ownerOnly>
                  <StaffManagementPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/staff/new"
              element={
                <PermissionRoute ownerOnly>
                  <StaffFormPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/staff/:id/edit"
              element={
                <PermissionRoute ownerOnly>
                  <StaffFormPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/staff/:id/permissions"
              element={
                <PermissionRoute ownerOnly>
                  <StaffPermissionsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/activity-log"
              element={
                <PermissionRoute ownerOnly>
                  <ActivityLogPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/accounts"
              element={
                <PermissionRoute permission="accounts.view">
                  <ChartOfAccountsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/accounts/cash"
              element={
                <PermissionRoute permission="accounts.view_transactions">
                  <AccountDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/accounts/bank"
              element={
                <PermissionRoute permission="accounts.view_transactions">
                  <AccountDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/journal-entries"
              element={
                <PermissionRoute permission="journal.view">
                  <JournalEntriesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/ledger"
              element={
                <PermissionRoute permission="reports.general_ledger">
                  <GeneralLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/ledger/:accountId"
              element={
                <PermissionRoute permission="reports.general_ledger">
                  <GeneralLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/trial-balance"
              element={
                <PermissionRoute permission="reports.trial_balance">
                  <TrialBalancePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/income-statement"
              element={
                <PermissionRoute permission="reports.income_statement">
                  <IncomeStatementPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/customers"
              element={
                <PermissionRoute permission="customers.view">
                  <CustomersPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/customer-ledger/:customerId/detail"
              element={
                <PermissionRoute permission="customers.view_ledger">
                  <CustomerDetailLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/customer-detail-ledger"
              element={
                <PermissionRoute permission="customers.view_ledger">
                  <CustomerDetailLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/customer-ledger/:customerId"
              element={
                <PermissionRoute permission="customers.view_ledger">
                  <CustomerLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/customer-ledger"
              element={
                <PermissionRoute permission="customers.view_ledger">
                  <CustomerLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/suppliers"
              element={
                <PermissionRoute permission="suppliers.view">
                  <SuppliersPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/supplier-ledger/:supplierId/detail"
              element={
                <PermissionRoute permission="suppliers.view_ledger">
                  <SupplierDetailLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/supplier-detail-ledger"
              element={
                <PermissionRoute permission="suppliers.view_ledger">
                  <SupplierDetailLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/supplier-ledger/:supplierId"
              element={
                <PermissionRoute permission="suppliers.view_ledger">
                  <SupplierLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/supplier-ledger"
              element={
                <PermissionRoute permission="suppliers.view_ledger">
                  <SupplierLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/parties"
              element={
                <PermissionRoute permission="parties.view">
                  <PartiesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/party-ledger/:partyId/detail"
              element={
                <PermissionRoute permission="parties.view_ledger">
                  <PartyDetailLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/party-detail-ledger"
              element={
                <PermissionRoute permission="parties.view_ledger">
                  <PartyDetailLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/party-ledger/:partyId"
              element={
                <PermissionRoute permission="parties.view_ledger">
                  <PartyLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/party-ledger"
              element={
                <PermissionRoute permission="parties.view_ledger">
                  <PartyLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/aging-report"
              element={
                <PermissionRoute permission="reports.aging">
                  <AgingReport />
                </PermissionRoute>
              }
            />

            <Route
              path="/cashflow"
              element={
                <PermissionRoute permission="reports.cash_flow">
                  <CashFlowPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/monthly-sales"
              element={
                <PermissionRoute permission="reports.monthly_sales">
                  <MonthlySalesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/stock-value-report"
              element={
                <PermissionRoute permission="reports.stock_value">
                  <StockValueReportPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/product-performance"
              element={
                <PermissionRoute permission="reports.product_performance">
                  <ProductPerformancePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/business-value"
              element={
                <PermissionRoute permission="business_value.view">
                  <BusinessValuePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/inventory"
              element={
                <PermissionRoute anyPermissions={['products.view', 'inventory.view']}>
                  <InventoryPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/stock-history"
              element={
                <PermissionRoute permission="inventory.view_history">
                  <StockHistoryPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/inventory-adjust"
              element={
                <PermissionRoute permission="inventory.adjust">
                  <InventoryAdjustPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/inventory-adjust-list"
              element={
                <PermissionRoute permission="inventory.view_history">
                  <InventoryAdjustListPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/categories"
              element={
                <PermissionRoute permission="inventory.manage_categories">
                  <CategoryManagement />
                </PermissionRoute>
              }
            />

            <Route
              path="/product-ledger/:productId"
              element={
                <PermissionRoute permission="products.view">
                  <ProductLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/product-ledger"
              element={
                <PermissionRoute permission="products.view">
                  <ProductLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/add-product"
              element={
                <PermissionRoute permission="products.create">
                  <ProductForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/sales"
              element={
                <PermissionRoute permission="sales.create">
                  <SalesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/create-sale"
              element={
                <PermissionRoute permission="sales.create">
                  <SalesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/sales-invoices"
              element={
                <PermissionRoute permission="sales.view">
                  <SalesInvoiceList />
                </PermissionRoute>
              }
            />

            <Route
              path="/refunds"
              element={
                <PermissionRoute permission="refunds.view">
                  <RefundInvoiceList />
                </PermissionRoute>
              }
            />

            <Route
              path="/refunds/new"
              element={
                <PermissionRoute permission="refunds.create">
                  <RefundPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/refunds/edit/:id"
              element={
                <PermissionRoute permission="refunds.edit">
                  <RefundPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-invoice"
              element={
                <PermissionRoute permission="purchases.create">
                  <PurchaseInvoicePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-invoice/:id"
              element={
                <PermissionRoute permission="purchases.edit">
                  <PurchaseInvoicePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-invoices"
              element={
                <PermissionRoute permission="purchases.view">
                  <PurchaseInvoiceList />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-returns"
              element={
                <PermissionRoute permission="purchase_returns.view">
                  <PurchaseReturnList />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-returns/new"
              element={
                <PermissionRoute permission="purchase_returns.create">
                  <PurchaseReturnPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-returns/edit/:id"
              element={
                <PermissionRoute permission="purchase_returns.edit">
                  <PurchaseReturnPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/receive-payments"
              element={
                <PermissionRoute permission="receive_payments.view">
                  <ReceivePaymentList />
                </PermissionRoute>
              }
            />

            <Route
              path="/receive-payments/new"
              element={
                <PermissionRoute permission="receive_payments.create">
                  <ReceivePaymentForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/receive-payments/edit/:id"
              element={
                <PermissionRoute permission="receive_payments.edit">
                  <ReceivePaymentForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/pay-bills"
              element={
                <PermissionRoute permission="pay_bills.view">
                  <PayBillList />
                </PermissionRoute>
              }
            />

            <Route
              path="/pay-bills/new"
              element={
                <PermissionRoute permission="pay_bills.create">
                  <PayBillForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/pay-bills/edit/:id"
              element={
                <PermissionRoute permission="pay_bills.edit">
                  <PayBillForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/expenses"
              element={
                <PermissionRoute permission="expenses.view">
                  <ExpenseList />
                </PermissionRoute>
              }
            />

            <Route
              path="/add-expense"
              element={
                <PermissionRoute permission="expenses.create">
                  <ExpenseForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/edit-expense/:id"
              element={
                <PermissionRoute permission="expenses.edit">
                  <ExpenseForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/print-settings"
              element={
                <PermissionRoute permission="settings.print">
                  <PrintSettingsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/backup"
              element={
                <PermissionRoute permission="settings.backup">
                  <BackupPage />
                </PermissionRoute>
              }
            />
          </Route>

          <Route
            path="/print/:type/preview"
            element={
              <ProtectedRoute>
                <PrintInvoicePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/print/:type/:id"
            element={
              <ProtectedRoute>
                <PrintInvoicePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
