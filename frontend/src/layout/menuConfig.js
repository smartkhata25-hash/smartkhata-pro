const menuConfig = [
  {
    label: 'sales',
    sections: [
      {
        title: 'menu.create',
        items: [
          { label: 'sales.newInvoice', path: '/sales' },
          { label: 'saleRefund', path: '/refunds/new' },
        ],
      },
      {
        title: 'menu.manage',
        items: [
          { label: 'sales.invoiceList', path: '/sales-invoices' },
          { label: 'refund.list', path: '/refunds' },
        ],
      },
    ],
  },

  {
    label: 'purchases',
    sections: [
      {
        title: 'menu.create',
        items: [
          { label: 'purchase.invoice', path: '/purchase-invoice' },
          { label: 'purchase.newReturn', path: '/purchase-returns/new' },
        ],
      },
      {
        title: 'menu.manage',
        items: [
          { label: 'purchase.invoiceList', path: '/purchase-invoices' },
          { label: 'purchase.returnList', path: '/purchase-returns' },
        ],
      },
    ],
  },

  {
    label: 'items',
    path: '/inventory',
  },

  {
    label: 'customers',
    sections: [
      {
        title: 'menu.manageCustomers',
        items: [
          { label: 'addCustomer', path: '/customers?new=true' },
          { label: 'customers', path: '/customers' },
        ],
      },
      {
        title: 'reports',
        items: [
          { label: 'ledger.customerLedger', path: '/customer-ledger' },
          { label: 'ledger.customerDetailed', path: '/customer-detail-ledger' },
          { label: 'reports.dueOnly', path: '/aging-report' },
        ],
      },
    ],
  },

  {
    label: 'suppliers',
    sections: [
      {
        title: 'menu.manageSuppliers',
        items: [
          { label: 'addSupplier', path: '/suppliers?new=true' },
          { label: 'supplier.allSuppliers', path: '/suppliers' },
        ],
      },
      {
        title: 'reports',
        items: [
          { label: 'ledger.supplierLedger', path: '/supplier-ledger' },
          { label: 'ledger.supplierDetailed', path: '/supplier-detail-ledger' },
        ],
      },
    ],
  },

  {
    label: 'parties',
    sections: [
      {
        title: 'menu.manage',
        items: [
          { label: 'party.addParty', path: '/parties?new=true' },
          { label: 'party.allParties', path: '/parties' },
        ],
      },
      {
        title: 'reports',
        items: [
          { label: 'party.ledger', path: '/party-ledger' },
          { label: 'party.detailedLedger', path: '/party-detail-ledger' },
        ],
      },
    ],
  },

  {
    label: 'inventory',
    sections: [
      {
        title: 'menu.stock',
        items: [
          { label: 'inventory.product', path: '/inventory' },
          { label: 'inventory.addProduct', path: '/inventory?new=true' },
          { label: 'inventory.bulkImport', path: '/inventory?bulk=true' },
          { label: 'inventory.stockHistory', path: '/stock-history' },
          { label: 'inventory.adjust', path: '/inventory-adjust' },
        ],
      },
      {
        title: 'menu.setup',
        items: [{ label: 'inventory.categoryManagement', path: '/categories' }],
      },
    ],
  },

  {
    label: 'menu.expenses',
    sections: [
      {
        title: 'menu.create',
        items: [{ label: 'expense.add', path: '/add-expense' }],
      },
      {
        title: 'menu.manage',
        items: [{ label: 'expense.list', path: '/expenses' }],
      },
    ],
  },

  {
    label: 'accounts',
    sections: [
      {
        title: 'menu.setup',
        items: [{ label: 'accounts.chart', path: '/accounts' }],
      },
      {
        title: 'menu.entries',
        items: [{ label: 'accounts.journal', path: '/journal-entries' }],
      },
    ],
  },

  {
    label: 'reports',
    sections: [
      {
        title: 'menu.financialReports',
        items: [
          { label: 'reports.trialBalance', path: '/trial-balance' },
          { label: 'ledger.generalLedger', path: '/ledger' },
          { label: 'reports.incomeStatement', path: '/income-statement' },
        ],
      },
      {
        title: 'menu.analytics',
        items: [
          { label: 'dashboard.monthlyCashFlow', path: '/cashflow' },
          { label: 'dashboard.monthlySales', path: '/monthly-sales' },
          { label: 'stockValueReport', path: '/stock-value-report' },
          {
            label: 'productPerformance.menuLabel',
            path: '/product-performance',
          },
        ],
      },
    ],
  },

  {
    label: 'banking',
    sections: [
      {
        title: 'menu.transactions',
        items: [
          { label: 'receivePayment', path: '/receive-payments/new' },
          { label: 'payment.payments', path: '/receive-payments' },
          { label: 'payBill', path: '/pay-bills/new' },
          { label: 'payment.payBillList', path: '/pay-bills' },
        ],
      },
    ],
  },
];

export default menuConfig;
