const express = require("express");
const cors = require("cors");
const path = require("path");

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

app.use("/api/pay-bill", require("./routes/payBillRoutes"));
app.use("/api/receive-payments", require("./routes/receivePaymentRoutes"));
app.use("/api/product-ledger", require("./routes/productLedgerRoutes"));
app.use("/api/expense", require("./routes/expenseRoutes"));
app.use("/api/backup", require("./routes/backupRoutes"));
app.use("/api/import", require("./routes/importRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));

app.use("/api", require("./routes/salesHistoryRoutes"));
app.use("/api/print-settings", require("./routes/printSettingRoutes"));
app.use("/api/print", require("./routes/printRoutes"));
app.use("/api/print", require("./routes/ledgerPrintRoutes"));

module.exports = app;
