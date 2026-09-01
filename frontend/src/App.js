// src/App.js
import React, { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

import { getCurrentLanguage } from './i18n/i18n';
import { navigationService } from './utils/navigationService';
import { MODULE_KEYS } from './utils/moduleConfig';

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
const WhatsAppSettingsPage = lazy(() => import('./pages/WhatsAppSettingsPage'));
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
const TravelDashboardPage = lazy(() => import('./pages/travel/TravelDashboardPage'));
const TravelBusinessValuePage = lazy(() => import('./pages/travel/TravelBusinessValuePage'));
const TravelReportsPage = lazy(() => import('./pages/travel/TravelReportsPage'));
const TravelExpensesPage = lazy(() => import('./pages/travel/TravelExpensesPage'));
const TravelBookingsPage = lazy(() => import('./pages/travel/TravelBookingsPage'));
const TravelBookingFormPage = lazy(() => import('./pages/travel/TravelBookingFormPage'));
const TravelBookingDetailPage = lazy(() => import('./pages/travel/TravelBookingDetailPage'));
const TravelRefundsPage = lazy(() => import('./pages/travel/TravelRefundsPage'));
const TravelRefundFormPage = lazy(() => import('./pages/travel/TravelRefundFormPage'));
const TravelRefundDetailPage = lazy(() => import('./pages/travel/TravelRefundDetailPage'));
const TravelersPage = lazy(() => import('./pages/travel/TravelersPage'));
const TravelServicesPage = lazy(() => import('./pages/travel/TravelServicesPage'));
const TravelHotelsPage = lazy(() => import('./pages/travel/TravelHotelsPage'));
const TravelAirlinesPage = lazy(() => import('./pages/travel/TravelAirlinesPage'));
const TravelAirportsPage = lazy(() => import('./pages/travel/TravelAirportsPage'));
const TravelTripPlannerPage = lazy(() => import('./pages/travel/TravelTripPlannerPage'));
const TravelUmrahCalculatorPage = lazy(() => import('./pages/travel/TravelUmrahCalculatorPage'));
const TravelCustomersPage = lazy(() => import('./pages/travel/TravelCustomersPage'));
const TravelVendorsPage = lazy(() => import('./pages/travel/TravelVendorsPage'));
const TravelPaymentHistoryPage = lazy(() => import('./pages/travel/TravelPaymentHistoryPage'));
const TravelReceivePaymentPage = lazy(() => import('./pages/travel/TravelReceivePaymentPage'));
const TravelVendorPaymentPage = lazy(() => import('./pages/travel/TravelVendorPaymentPage'));
const TravelVendorReturnsPage = lazy(() => import('./pages/travel/TravelVendorReturnsPage'));
const TravelVendorReturnDetailPage = lazy(
  () => import('./pages/travel/TravelVendorReturnDetailPage')
);
const TravelSettingsPage = lazy(() => import('./pages/travel/TravelSettingsPage'));

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

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';

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

  useEffect(() => {
    const handleNumberWheel = (event) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        target.blur();
      }
    };

    const handleNumberArrowKeys = (event) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener('wheel', handleNumberWheel, true);
    document.addEventListener('keydown', handleNumberArrowKeys, true);

    return () => {
      document.removeEventListener('wheel', handleNumberWheel, true);
      document.removeEventListener('keydown', handleNumberArrowKeys, true);
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
              path="/travel/dashboard"
              element={
                <PermissionRoute permission="travel.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelDashboardPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/reports"
              element={
                <PermissionRoute permission="travel.reports" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelReportsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/business-value"
              element={
                <PermissionRoute permission="business_value.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelBusinessValuePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/expenses"
              element={
                <PermissionRoute permission="expenses.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelExpensesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/expenses/new"
              element={
                <PermissionRoute permission="expenses.create" moduleKey={MODULE_KEYS.TRAVEL}>
                  <ExpenseForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/expenses/:id/edit"
              element={
                <PermissionRoute permission="expenses.edit" moduleKey={MODULE_KEYS.TRAVEL}>
                  <ExpenseForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/bookings"
              element={
                <PermissionRoute permission="travel.bookings.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelBookingsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/bookings/new"
              element={
                <PermissionRoute permission="travel.bookings.create" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelBookingFormPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/bookings/:id"
              element={
                <PermissionRoute permission="travel.bookings.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelBookingDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/bookings/:id/edit"
              element={
                <PermissionRoute permission="travel.bookings.edit" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelBookingFormPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/refunds"
              element={
                <PermissionRoute permission="travel.bookings.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelRefundsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/refunds/new"
              element={
                <PermissionRoute permission="travel.bookings.edit" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelRefundFormPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/refunds/:id"
              element={
                <PermissionRoute permission="travel.bookings.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelRefundDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/travelers"
              element={
                <PermissionRoute permission="travel.travelers.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelersPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/services"
              element={
                <PermissionRoute permission="travel.services.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelServicesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/hotels"
              element={
                <PermissionRoute permission="travel.hotels.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelHotelsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/airlines"
              element={
                <PermissionRoute permission="travel.airlines.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelAirlinesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/airports"
              element={
                <PermissionRoute permission="travel.airports.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelAirportsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/trip-planner"
              element={
                <PermissionRoute
                  anyPermissions={['travel.bookings.create', 'travel.bookings.view']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelTripPlannerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/umrah-calculator"
              element={
                <PermissionRoute
                  anyPermissions={['travel.bookings.create', 'travel.bookings.view']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelUmrahCalculatorPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/customers"
              element={
                <PermissionRoute
                  anyPermissions={['travel.bookings.view', 'travel.customers', 'travel.payments']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelCustomersPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/vendors"
              element={
                <PermissionRoute permission="travel.vendors.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelVendorsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/payments/receive"
              element={
                <PermissionRoute
                  anyPermissions={[
                    'travel.bookings.view',
                    'travel.bookings.edit',
                    'travel.payments',
                  ]}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelReceivePaymentPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/payments/received"
              element={
                <PermissionRoute
                  anyPermissions={['travel.bookings.view', 'travel.payments']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelPaymentHistoryPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/vendor-payments/new"
              element={
                <PermissionRoute
                  anyPermissions={[
                    'travel.vendors.view',
                    'travel.vendors.manage',
                    'travel.payments',
                  ]}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelVendorPaymentPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/payments/vendors"
              element={
                <PermissionRoute
                  anyPermissions={['travel.vendors.view', 'travel.payments']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelPaymentHistoryPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/vendor-returns"
              element={
                <PermissionRoute
                  anyPermissions={['travel.vendors.view', 'travel.vendors.manage']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelVendorReturnsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/vendor-returns/new"
              element={
                <PermissionRoute permission="travel.vendors.manage" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelVendorReturnsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/vendor-returns/:id"
              element={
                <PermissionRoute
                  anyPermissions={['travel.vendors.view', 'travel.vendors.manage']}
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <TravelVendorReturnDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/accounts"
              element={
                <PermissionRoute permission="accounts.view" moduleKey={MODULE_KEYS.TRAVEL}>
                  <ChartOfAccountsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/accounts/cash"
              element={
                <PermissionRoute
                  permission="accounts.view_transactions"
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <AccountDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/accounts/bank"
              element={
                <PermissionRoute
                  permission="accounts.view_transactions"
                  moduleKey={MODULE_KEYS.TRAVEL}
                >
                  <AccountDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/travel/settings"
              element={
                <PermissionRoute permission="travel.settings" moduleKey={MODULE_KEYS.TRAVEL}>
                  <TravelSettingsPage />
                </PermissionRoute>
              }
            />

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
              path="/travel/activity-log"
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
                <PermissionRoute permission="reports.monthly_sales" moduleKey={MODULE_KEYS.TRADING}>
                  <MonthlySalesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/stock-value-report"
              element={
                <PermissionRoute permission="reports.stock_value" moduleKey={MODULE_KEYS.TRADING}>
                  <StockValueReportPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/product-performance"
              element={
                <PermissionRoute
                  permission="reports.product_performance"
                  moduleKey={MODULE_KEYS.TRADING}
                >
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
                <PermissionRoute
                  anyPermissions={['products.view', 'inventory.view']}
                  moduleKey={MODULE_KEYS.TRADING}
                >
                  <InventoryPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/stock-history"
              element={
                <PermissionRoute
                  permission="inventory.view_history"
                  moduleKey={MODULE_KEYS.TRADING}
                >
                  <StockHistoryPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/inventory-adjust"
              element={
                <PermissionRoute permission="inventory.adjust" moduleKey={MODULE_KEYS.TRADING}>
                  <InventoryAdjustPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/inventory-adjust-list"
              element={
                <PermissionRoute
                  permission="inventory.view_history"
                  moduleKey={MODULE_KEYS.TRADING}
                >
                  <InventoryAdjustListPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/categories"
              element={
                <PermissionRoute
                  permission="inventory.manage_categories"
                  moduleKey={MODULE_KEYS.TRADING}
                >
                  <CategoryManagement />
                </PermissionRoute>
              }
            />

            <Route
              path="/product-ledger/:productId"
              element={
                <PermissionRoute permission="products.view" moduleKey={MODULE_KEYS.TRADING}>
                  <ProductLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/product-ledger"
              element={
                <PermissionRoute permission="products.view" moduleKey={MODULE_KEYS.TRADING}>
                  <ProductLedgerPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/add-product"
              element={
                <PermissionRoute permission="products.create" moduleKey={MODULE_KEYS.TRADING}>
                  <ProductForm />
                </PermissionRoute>
              }
            />

            <Route
              path="/sales"
              element={
                <PermissionRoute permission="sales.create" moduleKey={MODULE_KEYS.TRADING}>
                  <SalesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/create-sale"
              element={
                <PermissionRoute permission="sales.create" moduleKey={MODULE_KEYS.TRADING}>
                  <SalesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/sales-invoices"
              element={
                <PermissionRoute permission="sales.view" moduleKey={MODULE_KEYS.TRADING}>
                  <SalesInvoiceList />
                </PermissionRoute>
              }
            />

            <Route
              path="/refunds"
              element={
                <PermissionRoute permission="refunds.view" moduleKey={MODULE_KEYS.TRADING}>
                  <RefundInvoiceList />
                </PermissionRoute>
              }
            />

            <Route
              path="/refunds/new"
              element={
                <PermissionRoute permission="refunds.create" moduleKey={MODULE_KEYS.TRADING}>
                  <RefundPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/refunds/edit/:id"
              element={
                <PermissionRoute permission="refunds.edit" moduleKey={MODULE_KEYS.TRADING}>
                  <RefundPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-invoice"
              element={
                <PermissionRoute permission="purchases.create" moduleKey={MODULE_KEYS.TRADING}>
                  <PurchaseInvoicePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-invoice/:id"
              element={
                <PermissionRoute permission="purchases.edit" moduleKey={MODULE_KEYS.TRADING}>
                  <PurchaseInvoicePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-invoices"
              element={
                <PermissionRoute permission="purchases.view" moduleKey={MODULE_KEYS.TRADING}>
                  <PurchaseInvoiceList />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-returns"
              element={
                <PermissionRoute permission="purchase_returns.view" moduleKey={MODULE_KEYS.TRADING}>
                  <PurchaseReturnList />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-returns/new"
              element={
                <PermissionRoute
                  permission="purchase_returns.create"
                  moduleKey={MODULE_KEYS.TRADING}
                >
                  <PurchaseReturnPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/purchase-returns/edit/:id"
              element={
                <PermissionRoute permission="purchase_returns.edit" moduleKey={MODULE_KEYS.TRADING}>
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
              path="/whatsapp-settings"
              element={
                <PermissionRoute permission="settings.print">
                  <WhatsAppSettingsPage />
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
