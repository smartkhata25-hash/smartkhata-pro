require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const profitRoutes = require("./routes/profitRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Static folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/invite", require("./routes/inviteRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/accounts", require("./routes/accountRoutes"));
app.use("/api/journal", require("./routes/journalEntryRoutes"));

app.use("/api/customers", require("./routes/customerRoutes"));
app.use("/api/customer-ledger", require("./routes/ledgerRoutes"));
app.use("/api/suppliers", require("./routes/supplierRoutes"));
app.use("/api/parties", require("./routes/partyRoutes"));
app.use("/api/travel/travelers", require("./routes/travelTravelerRoutes"));
app.use(
  "/api/travel/service-categories",
  require("./routes/travelServiceCategoryRoutes"),
);
app.use("/api/travel/services", require("./routes/travelServiceRoutes"));
app.use("/api/travel/hotels", require("./routes/travelHotelRoutes"));

app.use("/api/travel/airlines", require("./routes/travelAirlineRoutes"));

app.use("/api/travel/airports", require("./routes/travelAirportRoutes"));
app.use("/api/travel/parties", require("./routes/travelPartyRoutes"));

app.use(
  "/api/travel/currency-settings",

  require("./routes/travelCurrencyRoutes"),
);
app.use("/api", require("./routes/travelDashboardRoutes"));
app.use("/api/travel/bookings", require("./routes/travelBookingRoutes"));
app.use("/api/travel/print", require("./routes/travelPrintRoutes"));
app.use("/api/travel/refunds", require("./routes/travelRefundRoutes"));
app.use("/api/travel/payments", require("./routes/travelPaymentRoutes"));
app.use("/api/travel/reminders", require("./routes/travelReminderRoutes"));
app.use("/api/travel/reports", require("./routes/travelReportRoutes"));
app.use(
  "/api/travel/vendor-returns",
  require("./routes/travelVendorReturnRoutes"),
);
app.use("/api/party-ledger", require("./routes/partyLedgerRoutes"));
app.use("/api/aging", require("./routes/agingRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));

app.use("/api/expense-titles", require("./routes/expenseTitleRoutes"));

app.use("/api/invoices", require("./routes/invoiceRoutes"));
app.use("/api/refunds", require("./routes/refundRoutes"));
app.use("/api/purchase-returns", require("./routes/purchaseRefundRoutes"));

app.use(
  "/api/inventory-transactions",
  require("./routes/inventoryTransactionRoutes"),
);

app.use("/api/purchase-invoices", require("./routes/purchaseInvoiceRoutes"));
app.use("/api/supplier-ledger", require("./routes/supplierLedgerRoutes"));
app.use("/api", require("./routes/dashboardRoutes"));
app.use("/api/profit", profitRoutes);
app.use("/api", require("./routes/stockValueRoutes"));

app.use(
  "/api/business-asset-categories",
  require("./routes/businessAssetCategoryRoutes"),
);

app.use("/api/business-assets", require("./routes/businessAssetRoutes"));

app.use(
  "/api/business-liabilities",
  require("./routes/businessLiabilityRoutes"),
);

app.use(
  "/api/business-receivable-loans",
  require("./routes/businessReceivableLoanRoutes"),
);

app.use("/api/business-value", require("./routes/businessValueRoutes"));

app.use(
  "/api/product-performance",
  require("./routes/productPerformanceRoutes"),
);

app.use("/api/pay-bill", require("./routes/payBillRoutes"));
app.use("/api/receive-payments", require("./routes/receivePaymentRoutes"));
app.use("/api/product-ledger", require("./routes/productLedgerRoutes"));
app.use("/api/expense", require("./routes/expenseRoutes"));
app.use("/api/backup", require("./routes/backupRoutes"));
app.use("/api/import", require("./routes/importRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/activities", require("./routes/activityRoutes"));

app.use("/api", require("./routes/salesHistoryRoutes"));
app.use("/api/print-settings", require("./routes/printSettingRoutes"));
app.use("/api/whatsapp-templates", require("./routes/whatsAppTemplateRoutes"));
app.use("/api/print", require("./routes/printRoutes"));
app.use("/api/print", require("./routes/ledgerPrintRoutes"));

module.exports = app;
