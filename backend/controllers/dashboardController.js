const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");
const { recalculateAllUserAccounts } = require("../utils/accountHelper");

// ✅ Dashboard Summary - Final Optimized
const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ Recalculate balances before showing dashboard
    await recalculateAllUserAccounts(userId);

    const entries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
    }).populate("lines.account");

    let totalSales = 0;
    let totalExpenses = 0;
    let totalCash = 0;
    let totalBank = 0;

    entries.forEach((entry) => {
      const isSaleInvoice = entry.sourceType === "sale_invoice";

      entry.lines.forEach((line) => {
        const acc = line.account;
        if (!acc || !acc.type) return;

        const type = acc.type.toLowerCase();
        const category = acc.category?.toLowerCase?.() || "";

        // ✅ Main Sales
        if (type === "income" && line.type === "credit") {
          totalSales += line.amount;
        }

        // 🟡 Fallback: Receivable in case income entry missed
        else if (
          type === "receivable" &&
          isSaleInvoice &&
          line.type === "debit"
        ) {
          totalSales += line.amount;
        }

        // ✅ Expenses
        if (type === "expense" && line.type === "debit") {
          totalExpenses += line.amount;
        }

        // ✅ Cash
        if (category === "cash") {
          totalCash += line.type === "credit" ? line.amount : -line.amount;
        }

        // ✅ Bank
        if (category === "bank") {
          totalBank += line.type === "credit" ? line.amount : -line.amount;
        }
      });
    });

    res.json({
      totalSales: Number(totalSales.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      totalCash: Number(totalCash.toFixed(2)),
      totalBank: Number(totalBank.toFixed(2)),
    });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};

const getMonthlySales = async (req, res) => {
  res.json([]); // future
};

const getMonthlyCashFlow = async (req, res) => {
  res.json({ inflow: [], outflow: [] }); // future
};

module.exports = {
  getDashboardSummary,
  getMonthlySales,
  getMonthlyCashFlow,
};
