import {
  FaBook,
  FaChartPie,
  FaClipboardList,
  FaCog,
  FaCubes,
  FaFileInvoiceDollar,
  FaProjectDiagram,
  FaRulerCombined,
  FaShoppingCart,
  FaUsers,
  FaWarehouse,
  FaWallet,
} from 'react-icons/fa';

import { MODULE_KEYS } from '../../../utils/moduleConfig';

const payrollPermissions = ['payroll.view', 'payroll.create', 'payroll.edit', 'payroll.pay'];
const attendancePermissions = [
  'weaving.attendance.view',
  'weaving.attendance.manage',
  'weaving.attendance.override',
];
const reportsPermissions = [
  'payroll.view',
  'weaving.reports.view',
  'weaving.reports.production',
  'weaving.reports.stock',
  'weaving.reports.sales',
  'weaving.reports.profit',
  'weaving.looms.view_performance',
];

export const weavingDashboardItem = Object.freeze({
  key: 'weavingDashboard',
  to: '/weaving/dashboard',
  labelKey: 'weaving.nav.dashboard',
  icon: FaChartPie,
  module: MODULE_KEYS.WEAVING,
  permission: 'weaving.view',
  implemented: true,
});

export const weavingSidebarItems = Object.freeze([
  { key: 'weavingParties', to: '/weaving/parties', labelKey: 'weaving.sidebar.parties', icon: FaUsers, module: MODULE_KEYS.WEAVING, permission: 'weaving.counterparties.view', implemented: true },
  { key: 'weavingPurchase', to: '/weaving/purchase', labelKey: 'weaving.sidebar.purchase', icon: FaShoppingCart, module: MODULE_KEYS.WEAVING, permission: 'weaving.purchases.view', implemented: true },
  { key: 'weavingPayments', to: '/weaving/payments', labelKey: 'weaving.sidebar.payments', icon: FaWallet, module: MODULE_KEYS.WEAVING, permission: 'weaving.payments.view', implemented: true },
  { key: 'weavingSalesSettlement', to: '/weaving/sales-settlement', labelKey: 'weaving.sidebar.salesSettlement', icon: FaFileInvoiceDollar, module: MODULE_KEYS.WEAVING, permission: 'weaving.sales.view', implemented: true },
  { key: 'weavingYarnStock', to: '/weaving/yarn-stock', labelKey: 'weaving.sidebar.yarnStock', icon: FaCubes, module: MODULE_KEYS.WEAVING, permission: 'weaving.yarn_stock.view', implemented: true },
  { key: 'weavingSizing', to: '/weaving/sizing', labelKey: 'weaving.sidebar.sizing', icon: FaRulerCombined, module: MODULE_KEYS.WEAVING, permission: 'weaving.sizing.view', implemented: true },
  { key: 'weavingBeams', to: '/weaving/beams', labelKey: 'weaving.sidebar.beams', icon: FaProjectDiagram, module: MODULE_KEYS.WEAVING, permission: 'weaving.beams.view', implemented: true },
  { key: 'weavingFoldingQuality', to: '/weaving/folding-quality', labelKey: 'weaving.sidebar.foldingQuality', icon: FaClipboardList, module: MODULE_KEYS.WEAVING, permission: 'weaving.folding.view', implemented: true },
  { key: 'weavingFabricStock', to: '/weaving/fabric-stock', labelKey: 'weaving.sidebar.fabricStock', icon: FaWarehouse, module: MODULE_KEYS.WEAVING, permission: 'weaving.fabric_stock.view', implemented: true },
  { key: 'weavingAccounts', to: '/weaving/accounts', labelKey: 'weaving.sidebar.accounts', icon: FaBook, module: MODULE_KEYS.WEAVING, permission: 'accounts.view', implemented: true },
  { key: 'weavingSettings', to: '/weaving/settings', labelKey: 'weaving.sidebar.settings', icon: FaCog, module: MODULE_KEYS.WEAVING, permission: 'weaving.settings.manage', implemented: true },
]);

const partyView = 'weaving.counterparties.view';
const partyLedger = 'weaving.counterparties.view_ledger';
const paymentView = 'weaving.payments.view';
const mastersView = 'weaving.masters.view';
const contractsView = 'weaving.contracts.view';

export const weavingSearchConfig = Object.freeze([
  { terms: ['yarn master'], path: '/weaving/forms?tab=yarn', permission: mastersView },
  { terms: ['fabric quality'], path: '/weaving/forms?tab=fabric', permission: mastersView },
  { terms: ['loom master'], path: '/weaving/forms?tab=loom', permission: mastersView },
  { terms: ['sales contract'], path: '/weaving/forms?tab=sales', permission: contractsView },
  { terms: ['purchase contract'], path: '/weaving/forms?tab=purchase', permission: contractsView },
  { terms: ['master forms', 'masters', 'forms'], path: '/weaving/forms', anyPermissions: [mastersView, contractsView] },
  { terms: ['customers', 'customer'], path: '/weaving/parties?tab=customer', permission: partyView },
  { terms: ['suppliers', 'supplier'], path: '/weaving/parties?tab=supplier', permission: partyView },
  { terms: ['parties', 'party'], path: '/weaving/parties?tab=both', permission: partyView },
  { terms: ['employees', 'employee'], path: '/weaving/employees', permission: 'employees.view' },
  { terms: ['payroll', 'salary'], path: '/weaving/payroll', anyPermissions: payrollPermissions },
  { terms: ['payments', 'payment'], path: '/weaving/payments', permission: paymentView },
  { terms: ['purchase'], path: '/weaving/purchase', permission: 'weaving.purchases.view' },
  { terms: ['kacchi'], path: '/weaving/sales-settlement?tab=kacchi', permission: 'weaving.sales.view' },
  { terms: ['pakki'], path: '/weaving/sales-settlement?tab=pakki', permission: 'weaving.sales.view' },
  { terms: ['sales settlement', 'sales'], path: '/weaving/sales-settlement', permission: 'weaving.sales.view' },
  { terms: ['yarn stock'], path: '/weaving/yarn-stock', permission: 'weaving.yarn_stock.view' },
  { terms: ['fabric stock'], path: '/weaving/fabric-stock', permission: 'weaving.fabric_stock.view' },
  { terms: ['sizing'], path: '/weaving/sizing', permission: 'weaving.sizing.view' },
  { terms: ['beams', 'beam', 'knotting'], path: '/weaving/beams', permission: 'weaving.beams.view' },
  { terms: ['folding'], path: '/weaving/folding-quality', permission: 'weaving.folding.view' },
  { terms: ['loom performance'], path: '/weaving/looms', anyPermissions: ['weaving.reports.view', 'weaving.looms.view_performance'] },
  { terms: ['production'], path: '/weaving/production', anyPermissions: ['weaving.reports.view', 'weaving.reports.production'] },
  { terms: ['general ledger'], path: '/weaving/general-ledger', permission: 'reports.general_ledger' },
  { terms: ['journal'], path: '/weaving/journal-entries', permission: 'journal.view' },
  { terms: ['business value'], path: '/weaving/business-value', permission: 'business_value.view' },
  { terms: ['accounts', 'account'], path: '/weaving/accounts', permission: 'accounts.view' },
  { terms: ['expenses', 'expense'], path: '/weaving/expenses', permission: 'expenses.view' },
  { terms: ['profit analysis', 'profit'], path: '/weaving/reports?tab=profit', permission: 'weaving.reports.profit' },
  { terms: ['reports', 'report'], path: '/weaving/reports', anyPermissions: reportsPermissions },
  { terms: ['dashboard'], path: '/weaving/dashboard', permission: 'weaving.view' },
]);

export const weavingTopMenuConfig = Object.freeze([
  {
    label: 'weaving.nav.dashboard',
    path: '/weaving/dashboard',
    module: MODULE_KEYS.WEAVING,
    permission: 'weaving.view',
  },
  {
    label: 'weaving.nav.parties',
    module: MODULE_KEYS.WEAVING,
    sections: [
      {
        title: 'weaving.nav.customers',
        items: [
          { label: 'weaving.nav.customerList', path: '/weaving/parties?tab=customer', permission: partyView },
          { label: 'weaving.nav.addCustomer', path: '/weaving/parties?tab=customer&new=1', allPermissions: [partyView, 'weaving.counterparties.create'] },
          { label: 'weaving.nav.customerPartyLedger', path: '/weaving/party-ledger', permission: partyLedger },
          { label: 'weaving.nav.receivePayment', path: '/weaving/payments?tab=receive', allPermissions: [paymentView, 'weaving.payments.create'] },
        ],
      },
      {
        title: 'weaving.nav.suppliers',
        items: [
          { label: 'weaving.nav.supplierList', path: '/weaving/parties?tab=supplier', permission: partyView },
          { label: 'weaving.nav.addSupplier', path: '/weaving/parties?tab=supplier&new=1', allPermissions: [partyView, 'weaving.counterparties.create'] },
          { label: 'weaving.nav.supplierPartyLedger', path: '/weaving/party-ledger', permission: partyLedger },
          { label: 'weaving.nav.payBill', path: '/weaving/payments?tab=pay', allPermissions: [paymentView, 'weaving.payments.create'] },
        ],
      },
      {
        title: 'weaving.nav.parties',
        items: [
          { label: 'weaving.nav.allParties', path: '/weaving/parties?tab=both', permission: partyView },
          { label: 'weaving.nav.addParty', path: '/weaving/parties?tab=both&new=1', allPermissions: [partyView, 'weaving.counterparties.create'] },
          { label: 'weaving.nav.sizingParties', path: '/weaving/parties?tab=sizing', permission: partyView },
          { label: 'weaving.nav.partyLedger', path: '/weaving/party-ledger', permission: partyLedger },
        ],
      },
      {
        title: 'weaving.nav.payments',
        items: [
          { label: 'weaving.nav.receivePayment', path: '/weaving/payments?tab=receive', allPermissions: [paymentView, 'weaving.payments.create'] },
          { label: 'weaving.nav.payBill', path: '/weaving/payments?tab=pay', allPermissions: [paymentView, 'weaving.payments.create'] },
          { label: 'weaving.nav.paymentHistory', path: '/weaving/payments?tab=history', permission: paymentView },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.employees',
    module: MODULE_KEYS.WEAVING,
    sections: [
      {
        title: 'weaving.nav.employees',
        items: [
          { label: 'weaving.nav.employeeList', path: '/weaving/employees', permission: 'employees.view' },
          { label: 'weaving.nav.addEmployee', path: '/weaving/employees/new', permission: 'employees.create' },
        ],
      },
      {
        title: 'weaving.nav.attendance',
        items: [
          { label: 'weaving.sidebar.attendance', path: '/weaving/attendance', anyPermissions: attendancePermissions },
        ],
      },
      {
        title: 'weaving.nav.payrollFinance',
        items: [
          { label: 'weaving.sidebar.payroll', path: '/weaving/payroll', anyPermissions: payrollPermissions },
          { label: 'weaving.sidebar.employeeFinance', path: '/weaving/employee-finance', anyPermissions: payrollPermissions },
          { label: 'weaving.sidebar.employeeLedgers', path: '/weaving/employee-ledgers', permission: 'employees.view_ledger' },
        ],
      },
      {
        title: 'weaving.nav.reports',
        items: [
          { label: 'weaving.operationalReports.salaryClosingSheet', path: '/weaving/reports?tab=salary', permission: 'payroll.view' },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.commercial',
    module: MODULE_KEYS.WEAVING,
    sections: [
      {
        title: 'weaving.nav.purchase',
        items: [
          { label: 'weaving.sidebar.purchase', path: '/weaving/purchase', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.yarnPurchase', path: '/weaving/purchase?tab=yarn', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.fabricPurchase', path: '/weaving/purchase?tab=fabric', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.generalPurchase', path: '/weaving/purchase?tab=general', permission: 'weaving.purchases.view' },
        ],
      },
      {
        title: 'weaving.nav.sales',
        items: [
          { label: 'weaving.sidebar.salesSettlement', path: '/weaving/sales-settlement', permission: 'weaving.sales.view' },
          { label: 'weaving.sales.kacchi', path: '/weaving/sales-settlement?tab=kacchi', permission: 'weaving.sales.view' },
          { label: 'weaving.sales.pakki', path: '/weaving/sales-settlement?tab=pakki', permission: 'weaving.sales.view' },
          { label: 'weaving.nav.readyToInvoice', path: '/weaving/sales-settlement?tab=ready', permission: 'weaving.sales.view' },
          { label: 'weaving.nav.directSale', path: '/weaving/sales-settlement?tab=invoices&new=direct', allPermissions: ['weaving.sales.view', 'weaving.sales.create'] },
          { label: 'weaving.nav.salesHistory', path: '/weaving/sales-settlement?tab=invoices', permission: 'weaving.sales.view' },
          { label: 'weaving.sales.pending', path: '/weaving/sales-settlement?tab=pending', permission: 'weaving.sales.view' },
          { label: 'weaving.sales.receipts', path: '/weaving/sales-settlement?tab=receipts', permission: 'weaving.sales.view' },
        ],
      },
      {
        title: 'weaving.nav.payments',
        items: [
          { label: 'weaving.nav.receivePayment', path: '/weaving/payments?tab=receive', allPermissions: [paymentView, 'weaving.payments.create'] },
          { label: 'weaving.nav.payBill', path: '/weaving/payments?tab=pay', allPermissions: [paymentView, 'weaving.payments.create'] },
          { label: 'weaving.nav.paymentHistory', path: '/weaving/payments?tab=history', permission: paymentView },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.banking',
    module: MODULE_KEYS.WEAVING,
    permission: paymentView,
    sections: [
      {
        title: 'weaving.nav.banking',
        items: [
          { label: 'weaving.nav.receivePayment', path: '/weaving/payments?tab=receive', allPermissions: [paymentView, 'weaving.payments.create'] },
          { label: 'weaving.nav.payBill', path: '/weaving/payments?tab=pay', allPermissions: [paymentView, 'weaving.payments.create'] },
          { label: 'weaving.nav.receivePaymentList', path: '/weaving/payments?tab=history&type=receive', permission: paymentView },
          { label: 'weaving.nav.payBillList', path: '/weaving/payments?tab=history&type=pay', permission: paymentView },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.purchase',
    module: MODULE_KEYS.WEAVING,
    permission: 'weaving.purchases.view',
    sections: [
      {
        title: 'weaving.nav.newPurchase',
        items: [
          { label: 'weaving.nav.yarnPurchase', path: '/weaving/purchase?tab=yarn', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.fabricPurchase', path: '/weaving/purchase?tab=fabric', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.generalPurchase', path: '/weaving/purchase?tab=general', permission: 'weaving.purchases.view' },
        ],
      },
      {
        title: 'weaving.nav.purchaseLists',
        items: [
          { label: 'weaving.nav.allPurchaseList', path: '/weaving/purchase?view=list', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.yarnPurchaseList', path: '/weaving/purchase?view=list&type=yarn', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.fabricPurchaseList', path: '/weaving/purchase?view=list&type=fabric', permission: 'weaving.purchases.view' },
          { label: 'weaving.nav.generalPurchaseList', path: '/weaving/purchase?view=list&type=general', permission: 'weaving.purchases.view' },
        ],
      },
    ],
  },
  {
    label: 'weaving.sidebar.sizing',
    module: MODULE_KEYS.WEAVING,
    permission: 'weaving.sizing.view',
    sections: [
      {
        title: 'weaving.sidebar.sizing',
        items: [
          { label: 'Yarn Issue', path: '/weaving/sizing?tab=issue', permission: 'weaving.sizing.view' },
          { label: 'Sizing Receiving', path: '/weaving/sizing?tab=receiving', permission: 'weaving.sizing.view' },
        ],
      },
      {
        title: 'Lists',
        items: [
          { label: 'Combined Receiving List', path: '/weaving/sizing?tab=list&type=combined', permission: 'weaving.sizing.view' },
          { label: 'Yarn Issue List', path: '/weaving/sizing?tab=list&type=issue', permission: 'weaving.sizing.view' },
          { label: 'Sizing Receiving List', path: '/weaving/sizing?tab=list&type=receipt', permission: 'weaving.sizing.view' },
          { label: 'Yarn Return List', path: '/weaving/sizing?tab=list&type=return', permission: 'weaving.sizing.view' },
          { label: 'Sizing Bill List', path: '/weaving/sizing?tab=list&type=bill', permission: 'weaving.sizing.view' },
        ],
      },
      {
        title: 'Reports',
        items: [
          { label: 'Stock at Sizing', path: '/weaving/sizing?tab=stock', permission: 'weaving.sizing.view_material_ledger' },
          { label: 'Material Ledger', path: '/weaving/sizing?tab=ledger', permission: 'weaving.sizing.view_material_ledger' },
          { label: 'Sizing Party Ledger', path: '/weaving/party-ledger?type=sizing', permission: partyLedger },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.production',
    module: MODULE_KEYS.WEAVING,
    sections: [
      {
        title: 'weaving.nav.production',
        items: [
          { label: 'weaving.sidebar.sizing', path: '/weaving/sizing', permission: 'weaving.sizing.view' },
          { label: 'weaving.sidebar.beams', path: '/weaving/beams', permission: 'weaving.beams.view' },
          { label: 'weaving.sidebar.foldingQuality', path: '/weaving/folding-quality', permission: 'weaving.folding.view' },
          { label: 'weaving.nav.productionOverview', path: '/weaving/production', anyPermissions: ['weaving.reports.view', 'weaving.reports.production'] },
          { label: 'weaving.operationalReports.loomPerformance', path: '/weaving/looms', anyPermissions: ['weaving.reports.view', 'weaving.looms.view_performance'] },
        ],
      },
      {
        title: 'weaving.nav.stock',
        items: [
          { label: 'weaving.sidebar.yarnStock', path: '/weaving/yarn-stock', permission: 'weaving.yarn_stock.view' },
          { label: 'weaving.sidebar.fabricStock', path: '/weaving/fabric-stock', permission: 'weaving.fabric_stock.view' },
          { label: 'weaving.nav.fabricTransfer', path: '/weaving/fabric-stock?action=transfer', allPermissions: ['weaving.fabric_stock.view', 'weaving.fabric_stock.transfer'] },
          { label: 'weaving.nav.yarnTransfer', path: '/weaving/yarn-stock?action=transfer', allPermissions: ['weaving.yarn_stock.view', 'weaving.yarn_stock.transfer'] },
          { label: 'weaving.nav.rewinderRecovery', path: '/weaving/yarn-stock?action=recovery', allPermissions: ['weaving.yarn_stock.view', 'weaving.yarn_stock.rewinder_recovery'] },
          { label: 'weaving.nav.weftConsumption', path: '/weaving/yarn-stock?action=consumption', allPermissions: ['weaving.yarn_stock.view', 'weaving.yarn_stock.consume'] },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.masterForms',
    module: MODULE_KEYS.WEAVING,
    anyPermissions: [mastersView, contractsView],
    sections: [
      {
        title: 'weaving.nav.mastersCreate',
        items: [
          { label: 'weaving.nav.allMasterForms', path: '/weaving/forms', anyPermissions: [mastersView, contractsView] },
          { label: 'weaving.operations.yarnMaster', path: '/weaving/forms?tab=yarn', permission: mastersView },
          { label: 'weaving.operations.fabricQuality', path: '/weaving/forms?tab=fabric', permission: mastersView },
          { label: 'weaving.operations.loomMaster', path: '/weaving/forms?tab=loom', permission: mastersView },
          { label: 'weaving.operations.salesContract', path: '/weaving/forms?tab=sales', permission: contractsView },
          { label: 'weaving.operations.purchaseContract', path: '/weaving/forms?tab=purchase', permission: contractsView },
        ],
      },
      {
        title: 'weaving.nav.masterLists',
        items: [
          { label: 'weaving.nav.yarnList', path: '/weaving/forms?tab=yarn&view=list', permission: mastersView },
          { label: 'weaving.nav.fabricQualityList', path: '/weaving/forms?tab=fabric&view=list', permission: mastersView },
          { label: 'weaving.nav.loomList', path: '/weaving/forms?tab=loom&view=list', permission: mastersView },
          { label: 'weaving.nav.salesContractList', path: '/weaving/forms?tab=sales&view=list', permission: contractsView },
          { label: 'weaving.nav.purchaseContractList', path: '/weaving/forms?tab=purchase&view=list', permission: contractsView },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.finance',
    module: MODULE_KEYS.WEAVING,
    sections: [
      {
        title: 'weaving.nav.accounts',
        items: [
          { label: 'weaving.sidebar.accounts', path: '/weaving/accounts', permission: 'accounts.view' },
          { label: 'weaving.nav.handCash', path: '/weaving/accounts/cash', permission: 'accounts.view_transactions' },
          { label: 'weaving.nav.bank', path: '/weaving/accounts/bank', permission: 'accounts.view_transactions' },
        ],
      },
      {
        title: 'weaving.nav.accounting',
        items: [
          { label: 'weaving.sidebar.expenses', path: '/weaving/expenses', permission: 'expenses.view' },
          { label: 'weaving.sidebar.journalEntries', path: '/weaving/journal-entries', permission: 'journal.view' },
          { label: 'weaving.sidebar.generalLedger', path: '/weaving/general-ledger', permission: 'reports.general_ledger' },
        ],
      },
      {
        title: 'weaving.nav.business',
        items: [
          { label: 'businessValue.menuLabel', path: '/weaving/business-value', permission: 'business_value.view' },
        ],
      },
    ],
  },
  {
    label: 'weaving.nav.reports',
    module: MODULE_KEYS.WEAVING,
    anyPermissions: reportsPermissions,
    sections: [
      {
        title: 'weaving.nav.reports',
        items: [
          { label: 'weaving.operationalReports.salaryClosingSheet', path: '/weaving/reports?tab=salary', permission: 'payroll.view' },
          { label: 'weaving.operationalReports.productionReport', path: '/weaving/reports?tab=production', anyPermissions: ['weaving.reports.view', 'weaving.reports.production'] },
          { label: 'weaving.operationalReports.loomPerformance', path: '/weaving/reports?tab=looms', anyPermissions: ['weaving.reports.view', 'weaving.looms.view_performance'] },
          { label: 'weaving.operationalReports.qualityProduction', path: '/weaving/reports?tab=quality', anyPermissions: ['weaving.reports.view', 'weaving.reports.production'] },
          { label: 'weaving.operationalReports.fabricStockReport', path: '/weaving/reports?tab=stock', anyPermissions: ['weaving.reports.view', 'weaving.reports.stock'] },
          { label: 'weaving.operationalReports.salesConversion', path: '/weaving/reports?tab=sales', anyPermissions: ['weaving.reports.view', 'weaving.reports.sales'] },
          { label: 'weaving.operationalReports.pendingRejection', path: '/weaving/reports?tab=rejection', anyPermissions: ['weaving.reports.view', 'weaving.reports.sales'] },
          { label: 'weaving.nav.profitAnalysis', path: '/weaving/reports?tab=profit', permission: 'weaving.reports.profit' },
        ],
      },
    ],
  },
]);
