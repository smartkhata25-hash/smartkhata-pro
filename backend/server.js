const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();
const app = express();

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Static Folder for Uploads (for images/attachments)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// ✅ Routes Mapping
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/accounts", require("./routes/accountRoutes"));
app.use("/api/journal", require("./routes/journalEntryRoutes"));

app.use("/api/customers", require("./routes/customerRoutes")); // ✅ Customer Module
app.use("/api/customer-ledger", require("./routes/ledgerRoutes"));
app.use("/api/suppliers", require("./routes/supplierRoutes")); // ✅ Supplier Module
app.use("/api/aging", require("./routes/agingRoutes")); // ✅ Aging Report
app.use("/api/products", require("./routes/productRoutes")); // ✅ Inventory Module
app.use("/api/invoices", require("./routes/invoiceRoutes")); // ✅ Sales Invoice Module
app.use(
  "/api/inventory-transactions",
  require("./routes/inventoryTransactionRoutes")
); // ✅ Inventory In/Out
app.use("/api/purchase-invoices", require("./routes/purchaseInvoiceRoutes")); // ✅ Purchase Invoice Module

app.use("/api/supplier-ledger", require("./routes/supplierLedgerRoutes")); // ✅ Supplier Ledger Route
app.use("/api", require("./routes/dashboardRoutes")); // ✅ Dashboard Route

// ✅ Pay Bill Route
const payBillRoutes = require("./routes/payBillRoutes");
app.use("/api/pay-bill", payBillRoutes);

// ✅ ✅ ✅ Receive Payment Route ✅ ✅ ✅
const receivePaymentRoutes = require("./routes/receivePaymentRoutes");
app.use("/api/receive-payments", receivePaymentRoutes);

// ✅ ✅ ✅ Product Ledger Route ✅ ✅ ✅
app.use("/api/product-ledger", require("./routes/productLedgerRoutes")); // ✅ Product Ledger Module

// ✅ ✅ ✅ Expense Route ✅ ✅ ✅
const expenseRoutes = require("./routes/expenseRoutes");
app.use("/api/expense", expenseRoutes); // ✅ Expense Module Route

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
