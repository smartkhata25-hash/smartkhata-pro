const JournalEntry = require("../models/JournalEntry");

exports.getIncomeStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user?.id || req.userId;

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "startDate and endDate are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Fetch journal entries for period
    const entries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
      date: { $gte: start, $lte: end },
    }).populate("lines.account");

    // ===============================
    // Totals
    // ===============================
    let sales = 0;
    let salesReturn = 0;
    let netSales = 0;

    let cogs = 0;
    let grossProfit = 0;

    let operatingExpenses = 0;
    let netProfit = 0;

    // Breakdowns
    const revenueBreakdown = {};
    const cogsBreakdown = {};
    const expenseBreakdown = {};

    // ===============================
    // Process journal lines
    // ===============================
    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const account = line.account;
        if (!account) return;

        const amount = Number(line.amount || 0);

        // -------------------------------
        // Revenue (Income accounts)
        // -------------------------------
        if (account.type === "Income") {
          if (line.type === "credit") {
            sales += amount;
            revenueBreakdown[account.name] =
              (revenueBreakdown[account.name] || 0) + amount;
          } else if (line.type === "debit") {
            salesReturn += amount;
            revenueBreakdown[account.name] =
              (revenueBreakdown[account.name] || 0) - amount;
          }
        }

        // -------------------------------
        // COGS (Expense with code COGS)
        // -------------------------------
        if (
          account.type === "Expense" &&
          account.code === "COGS" &&
          line.type === "debit"
        ) {
          cogs += amount;
          cogsBreakdown[account.name] =
            (cogsBreakdown[account.name] || 0) + amount;
        }

        // -------------------------------
        // Operating Expenses (all other expenses)
        // -------------------------------
        if (
          account.type === "Expense" &&
          account.code !== "COGS" &&
          line.type === "debit"
        ) {
          operatingExpenses += amount;
          expenseBreakdown[account.name] =
            (expenseBreakdown[account.name] || 0) + amount;
        }
      });
    });

    // ===============================
    // Final calculations
    // ===============================
    netSales = sales - salesReturn;
    grossProfit = netSales - cogs;
    netProfit = grossProfit - operatingExpenses;

    // ===============================
    // Response
    // ===============================
    res.status(200).json({
      period: {
        startDate,
        endDate,
      },

      revenue: {
        sales,
        salesReturn,
        netSales,
        breakdown: Object.keys(revenueBreakdown).map((name) => ({
          accountName: name,
          amount: revenueBreakdown[name],
        })),
      },

      cogs: {
        total: cogs,
        breakdown: Object.keys(cogsBreakdown).map((name) => ({
          accountName: name,
          amount: cogsBreakdown[name],
        })),
      },

      grossProfit,

      operatingExpenses: {
        total: operatingExpenses,
        breakdown: Object.keys(expenseBreakdown).map((name) => ({
          accountName: name,
          amount: expenseBreakdown[name],
        })),
      },

      netProfit,
      status: netProfit >= 0 ? "profit" : "loss",
    });
  } catch (error) {
    console.error("Income Statement Error:", error);
    res.status(500).json({
      message: "Failed to generate income statement",
      error: error.message,
    });
  }
};

// ======================================
// 📊 Month vs Month Income Comparison
// ======================================
exports.getMonthVsMonthIncome = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({
        message: "year is required (e.g. 2026)",
      });
    }

    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year}-12-31`);

    const entries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
      date: { $gte: start, $lte: end },
    }).populate("lines.account");

    // 🧺 Month container
    const months = {};

    entries.forEach((entry) => {
      const monthKey = entry.date.toISOString().slice(0, 7); // YYYY-MM

      if (!months[monthKey]) {
        months[monthKey] = {
          sales: 0,
          cogs: 0,
          profit: 0,
        };
      }

      entry.lines.forEach((line) => {
        const acc = line.account;
        if (!acc) return;

        const amount = Number(line.amount || 0);

        // 🟢 Income Handling (Sales & Sales Return)

        if (acc.type === "Income") {
          // Normal Sale (credit)
          if (line.type === "credit") {
            months[monthKey].sales += amount;
            months[monthKey].profit += amount;
          }

          // Sales Return (debit)
          else if (line.type === "debit") {
            months[monthKey].sales -= amount; // reduce sales
            months[monthKey].profit -= amount; // reduce profit
          }
        }

        // 🔴 COGS
        if (
          acc.type === "Expense" &&
          acc.code === "COGS" &&
          line.type === "debit"
        ) {
          months[monthKey].cogs += amount;
          months[monthKey].profit -= amount;
        }
      });
    });

    res.json({
      year,
      months: Object.keys(months)
        .sort()
        .map((m) => ({
          month: m,
          sales: months[m].sales,
          cogs: months[m].cogs,
          profit: months[m].profit,
        })),
    });
  } catch (error) {
    console.error("Month vs Month Error:", error);
    res.status(500).json({
      message: "Failed to generate month comparison",
      error: error.message,
    });
  }
};
