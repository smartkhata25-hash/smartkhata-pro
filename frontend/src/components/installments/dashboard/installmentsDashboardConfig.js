import {
  FaChartLine,
  FaCheckCircle,
  FaClock,
  FaCoins,
  FaFileInvoiceDollar,
  FaHandHoldingUsd,
  FaShoppingBag,
  FaWallet,
  FaUserPlus,
  FaTruck,
} from 'react-icons/fa';

export const installmentsSummaryCards = Object.freeze([
  { key: 'expectedCollection', permission: 'installments.payments.view_collections', icon: FaClock, gradient: 'from-[#0756c7] via-[#0787db] to-[#20c7d9]', glow: 'bg-cyan-200/30' },
  { key: 'received', permission: 'installments.reports.collections', icon: FaCheckCircle, gradient: 'from-[#047857] via-[#079c83] to-[#16bfc2]', glow: 'bg-emerald-200/30' },
  { key: 'overdue', permission: 'installments.reports.collections', icon: FaClock, gradient: 'from-[#be123c] via-[#e02f52] to-[#f97345]', glow: 'bg-rose-200/30' },
  { key: 'customerReceivables', permission: 'installments.reports.receivables', icon: FaHandHoldingUsd, gradient: 'from-[#c26a05] via-[#e9900a] to-[#f45d4d]', glow: 'bg-amber-100/30' },
  { key: 'supplierPayables', permission: 'installments.reports.receivables', icon: FaWallet, gradient: 'from-[#6d28d9] via-[#9238cf] to-[#d63f79]', glow: 'bg-fuchsia-200/25' },
  { key: 'committeeSavings', permission: 'installments.reports.receivables', icon: FaCoins, gradient: 'from-[#3730a3] via-[#305bd6] to-[#08a9c4]', glow: 'bg-cyan-200/25' },
  { key: 'totalSales', permission: 'installments.reports.profit', icon: FaShoppingBag, gradient: 'from-[#1438a6] via-[#4354d7] to-[#7c3fd1]', glow: 'bg-indigo-200/30' },
  { key: 'netProfit', permission: 'installments.reports.profit', icon: FaChartLine, gradient: 'from-[#047857] via-[#0b9c76] to-[#6847c7]', glow: 'bg-violet-200/25' },
]);

export const installmentsQuickActions = Object.freeze([
  { key: 'addMember', icon: FaUserPlus, enabled: true, path: '/installments/members?new=1', permission: 'installments.members.create', tone: 'from-blue-50 to-cyan-50', iconTone: 'from-blue-600 to-cyan-500' },
  { key: 'addSupplier', icon: FaTruck, enabled: true, path: '/installments/suppliers?new=1', permission: 'installments.suppliers.create', tone: 'from-violet-50 to-fuchsia-50', iconTone: 'from-violet-600 to-fuchsia-500' },
  { key: 'newInvoice', icon: FaFileInvoiceDollar, enabled: true, path: '/installments/invoices/new', permission: 'installments.invoices.create', tone: 'from-amber-50 to-orange-50', iconTone: 'from-amber-600 to-orange-500' },
  { key: 'receivePayment', icon: FaHandHoldingUsd, enabled: true, path: '/installments/payments/receive', permission: 'installments.payments.receive', tone: 'from-emerald-50 to-teal-50', iconTone: 'from-emerald-600 to-teal-500' },
]);

