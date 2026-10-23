import {
  FaBuilding,
  FaChartBar,
  FaChartPie,
  FaFileInvoiceDollar,
  FaHandHoldingUsd,
  FaMoneyCheckAlt,
  FaReceipt,
  FaTruck,
  FaUsers,
} from 'react-icons/fa';

import { MODULE_KEYS } from '../../../utils/moduleConfig';

export const installmentsDashboardItem = Object.freeze({
  key: 'installmentsDashboard',
  to: '/installments/dashboard',
  labelKey: 'installments.sidebar.dashboard',
  icon: FaChartPie,
  module: MODULE_KEYS.INSTALLMENTS,
  permission: 'installments.view',
  implemented: true,
});

export const installmentsSidebarItems = Object.freeze([
  installmentsDashboardItem,
  {
    key: 'installmentsMembers',
    to: '/installments/members',
    labelKey: 'installments.sidebar.membersCompact',
    icon: FaUsers,
    module: MODULE_KEYS.INSTALLMENTS,
    permission: 'installments.members.view',
    implemented: true,
  },
  { key: 'installmentsSuppliers', to: '/installments/suppliers', labelKey: 'installments.sidebar.suppliers', icon: FaTruck, module: MODULE_KEYS.INSTALLMENTS, permission: 'installments.suppliers.view', implemented: true },
  { key: 'installmentsCommittees', to: '/installments/committees', labelKey: 'installments.sidebar.committees', icon: FaBuilding, module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.committees.view', 'installments.committees.manage'], implemented: true },
  { key: 'installmentsInvoices', to: '/installments/invoices', labelKey: 'installments.sidebar.invoices', icon: FaFileInvoiceDollar, module: MODULE_KEYS.INSTALLMENTS, permission: 'installments.invoices.view', implemented: true },
  { key: 'installmentsPayments', to: '/installments/payments', labelKey: 'installments.sidebar.payments', icon: FaHandHoldingUsd, module: MODULE_KEYS.INSTALLMENTS, permission: 'installments.payments.receive', implemented: true },
  { key: 'installmentsAccounts', to: '/installments/accounts', labelKey: 'installments.sidebar.accounts', icon: FaMoneyCheckAlt, module: MODULE_KEYS.INSTALLMENTS, permission: 'installments.accounts.view', implemented: true },
  { key: 'installmentsExpenses', to: '/installments/expenses', labelKey: 'installments.sidebar.expenses', icon: FaReceipt, module: MODULE_KEYS.INSTALLMENTS, permission: 'installments.expenses.view', implemented: true },
  { key: 'installmentsReports', to: '/installments/reports', labelKey: 'installments.sidebar.reports', icon: FaChartBar, module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.reports.profit', 'installments.reports.collections', 'installments.reports.expenses', 'installments.reports.receivables'], implemented: true },
]);

export const installmentsTopMenuConfig = Object.freeze([
  {
    key: 'dashboard',
    label: 'installments.sidebar.dashboard',
    path: '/installments/dashboard',
    module: MODULE_KEYS.INSTALLMENTS,
    permission: 'installments.view',
    implemented: true,
  },
  {
    key: 'members',
    label: 'installments.header.membersCompact',
    activePaths: ['/installments/members'],
    module: MODULE_KEYS.INSTALLMENTS,
    anyPermissions: ['installments.members.view', 'installments.members.create', 'installments.members.view_ledger', 'installments.payments.view_history'],
    sections: [{ title: 'installments.nav.members', items: [
      { label: 'installments.nav.allMembers', path: '/installments/members', permission: 'installments.members.view' },
      { label: 'installments.nav.addMember', path: '/installments/members?new=1', permission: 'installments.members.create' },
      { label: 'installments.nav.memberLedger', path: '/installments/members?view=ledger', permission: 'installments.members.view_ledger' },
      { label: 'installments.nav.memberReceipts', path: '/installments/payments/history?type=receipts', permission: 'installments.payments.view_history' },
    ] }],
    implemented: true,
  },
  { key: 'suppliers', label: 'installments.header.suppliers', activePaths: ['/installments/suppliers'], module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.suppliers.view', 'installments.suppliers.create', 'installments.suppliers.ledger.view', 'installments.payments.pay_supplier', 'installments.payments.view_history'], sections: [{ title: 'installments.nav.suppliers', items: [
    { label: 'installments.nav.allSuppliers', path: '/installments/suppliers', permission: 'installments.suppliers.view' },
    { label: 'installments.nav.addSupplier', path: '/installments/suppliers?new=1', permission: 'installments.suppliers.create' },
    { label: 'installments.nav.supplierLedger', path: '/installments/suppliers?view=ledger', permission: 'installments.suppliers.ledger.view' },
    { label: 'installments.payments.tabs.payBill', path: '/installments/payments/pay-bill', permission: 'installments.payments.pay_supplier' },
    { label: 'installments.nav.supplierPayments', path: '/installments/payments/history?type=suppliers', permission: 'installments.payments.view_history' },
  ] }], implemented: true },
  { key: 'committees', label: 'installments.sidebar.committees', activePaths: ['/installments/committees'], module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.committees.view', 'installments.committees.manage', 'installments.committees.create', 'installments.payments.view_collections', 'installments.payments.return_savings', 'installments.payments.view_history'], sections: [{ title: 'installments.nav.committees', items: [
    { label: 'installments.nav.allCommittees', path: '/installments/committees', anyPermissions: ['installments.committees.view', 'installments.committees.manage'] },
    { label: 'installments.nav.newCommittee', path: '/installments/committees?new=1', anyPermissions: ['installments.committees.create', 'installments.committees.manage'] },
    { label: 'installments.payments.tabs.collections', path: '/installments/collections/today', permission: 'installments.payments.view_collections' },
    { label: 'installments.payments.tabs.memberPayout', path: '/installments/payments?mode=payout', permission: 'installments.payments.return_savings' },
    { label: 'installments.nav.memberPayoutHistory', path: '/installments/payments/history?type=payouts', permission: 'installments.payments.view_history' },
  ] }], implemented: true },
  { key: 'invoices', label: 'installments.header.invoices', activePaths: ['/installments/invoices'], module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.invoices.view', 'installments.invoices.create'], sections: [{ title: 'installments.nav.invoices', items: [
    { label: 'installments.nav.allInvoices', path: '/installments/invoices', permission: 'installments.invoices.view' },
    { label: 'installments.nav.newInvoice', path: '/installments/invoices/new', permission: 'installments.invoices.create' },
  ] }], implemented: true },
  { key: 'payments', label: 'installments.header.payments', activePaths: ['/installments/payments', '/installments/collections'], module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.payments.receive', 'installments.payments.view_collections', 'installments.payments.pay_supplier', 'installments.payments.return_savings', 'installments.payments.view_history'], sections: [
    { title: 'installments.nav.paymentActions', items: [
      { label: 'installments.payments.tabs.receive', path: '/installments/payments/receive', permission: 'installments.payments.receive' },
      { label: 'installments.payments.tabs.collections', path: '/installments/collections/today', permission: 'installments.payments.view_collections' },
      { label: 'installments.payments.tabs.payBill', path: '/installments/payments/pay-bill', permission: 'installments.payments.pay_supplier' },
      { label: 'installments.payments.tabs.memberPayout', path: '/installments/payments?mode=payout', permission: 'installments.payments.return_savings' },
    ] },
    { title: 'installments.nav.paymentHistory', items: [
      { label: 'installments.nav.customerReceiptsList', path: '/installments/payments/history?type=receipts', permission: 'installments.payments.view_history' },
      { label: 'installments.nav.supplierPaymentsList', path: '/installments/payments/history?type=suppliers', permission: 'installments.payments.view_history' },
      { label: 'installments.nav.memberPayoutHistory', path: '/installments/payments/history?type=payouts', permission: 'installments.payments.view_history' },
      { label: 'installments.nav.allPaymentHistory', path: '/installments/payments/history', permission: 'installments.payments.view_history' },
    ] },
  ], implemented: true },
  { key: 'more', label: 'installments.nav.more', align: 'end', activePaths: ['/installments/accounts', '/installments/expenses', '/installments/reports'], module: MODULE_KEYS.INSTALLMENTS, anyPermissions: ['installments.accounts.view', 'installments.accounts.view_transactions', 'installments.expenses.view', 'installments.expenses.create', 'installments.reports.profit', 'installments.reports.collections', 'installments.reports.expenses', 'installments.reports.receivables'], sections: [
    { title: 'installments.sidebar.accounts', items: [
      { label: 'installments.nav.allAccounts', path: '/installments/accounts', permission: 'installments.accounts.view' },
      { label: 'installments.nav.cashTransactions', path: '/installments/accounts/cash', permission: 'installments.accounts.view_transactions' },
      { label: 'installments.nav.bankTransactions', path: '/installments/accounts/bank', permission: 'installments.accounts.view_transactions' },
    ] },
    { title: 'installments.sidebar.expenses', items: [
      { label: 'installments.nav.expenseList', path: '/installments/expenses', permission: 'installments.expenses.view' },
      { label: 'installments.nav.addExpense', path: '/installments/expenses/new', permission: 'installments.expenses.create' },
      { label: 'installments.reports.expensesReport', path: '/installments/reports?tab=expenses', permission: 'installments.reports.expenses' },
    ] },
    { title: 'installments.sidebar.reports', items: [
      { label: 'installments.reports.profitReport', path: '/installments/reports?tab=profit', permission: 'installments.reports.profit' },
      { label: 'installments.reports.collectionReport', path: '/installments/reports?tab=collections', permission: 'installments.reports.collections' },
      { label: 'installments.reports.receivablesPayables', path: '/installments/reports?tab=balances', permission: 'installments.reports.receivables' },
      { label: 'installments.reports.savingsReport', path: '/installments/reports?tab=savings', permission: 'installments.reports.receivables' },
    ] },
  ], implemented: true },
]);

